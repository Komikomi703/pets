use crate::{model::*, storage::Store};
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

pub type Shared = Arc<Mutex<Runtime>>;

/// Read the OS window rather than returning a default or a queued movement target.
/// Keep the runtime's fractional coordinates for smooth movement; this is a read.
pub fn desktop_position(app: &AppHandle, shared: &Shared) -> Result<Desktop, String> {
    let window = app
        .get_webview_window("pet")
        .ok_or("ペットのウィンドウがありません。")?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("画面の作業領域を取得できませんでした。")?;
    let area = monitor.work_area();
    let mut desktop = lock(shared).desktop.clone();
    desktop.x = position.x as f64;
    desktop.y = position.y as f64;
    desktop.width = size.width as f64;
    desktop.height = size.height as f64;
    desktop.scale = scale;
    desktop.work_area = Rect {
        x: area.position.x as f64,
        y: area.position.y as f64,
        width: area.size.width as f64,
        height: area.size.height as f64,
    };
    Ok(desktop)
}
pub struct Press {
    cursor: Point,
    offset: Point,
    threshold: f64,
    moved: bool,
}
pub struct Runtime {
    pub snapshot: Snapshot,
    pub desktop: Desktop,
    pub mask: HitMask,
    pub velocity: f64,
    pub cat_state: String,
    pub last_frame: Instant,
    pub press: Option<Press>,
    pub menu_open: bool,
    pub dirty: bool,
    pub changed: Instant,
    pub last_save: Instant,
    pub read_only: bool,
    pub stop: bool,
    pub last_action: Option<(String, Instant)>,
    pub store: Store,
}
impl Runtime {
    pub fn new(store: Store) -> Self {
        let loaded = store.load();
        let now = Instant::now();
        Self {
            snapshot: Snapshot {
                data: loaded.data,
                revision: 0,
                visible: true,
                save_error: None,
                warning: loaded.warning,
            },
            desktop: Desktop::default(),
            mask: HitMask::default(),
            velocity: 0.,
            cat_state: "idle".into(),
            last_frame: now,
            press: None,
            menu_open: false,
            dirty: false,
            changed: now,
            last_save: now,
            read_only: loaded.read_only,
            stop: false,
            last_action: None,
            store,
        }
    }
    pub fn changed(&mut self) {
        self.snapshot.data.remember_character();
        self.snapshot.revision += 1;
        self.dirty = true;
        self.changed = Instant::now();
    }
    pub fn action(&mut self, action: &str) -> Result<Snapshot, String> {
        if !["pet", "feed", "play"].contains(&action) {
            return Err("不明な操作です。".into());
        }
        if self.snapshot.data.settings.focus_mode {
            return Err("作業に集中モードを解除すると、お世話できます。".into());
        }
        if self.press.is_some() {
            return Err("猫を下ろしてからお世話してください。".into());
        }
        if let Some((_, t)) = &self.last_action {
            if t.elapsed() < Duration::from_secs(4) {
                // Direct touch can interrupt feeding/playing without farming care values.
                if action == "pet" && self.snapshot.data.settings.character == "gugugaga" {
                    return Ok(self.snapshot.clone());
                }
                return Err("いまの反応が終わるまで、少し待ってください。".into());
            }
        }
        self.last_action = Some((action.to_string(), Instant::now()));
        self.snapshot.data.needs.action(action);
        self.changed();
        Ok(self.snapshot.clone())
    }
    pub fn begin_press(&mut self) {
        if self.menu_open || self.snapshot.data.settings.focus_mode || !self.snapshot.visible {
            return;
        }
        let d = &self.desktop;
        self.press = Some(Press {
            cursor: d.cursor,
            offset: Point {
                x: (d.cursor.x - d.x) / d.width,
                y: (d.cursor.y - d.y) / d.height,
            },
            threshold: 6. * d.scale,
            moved: false,
        });
        self.desktop.pressed = true;
        self.velocity = 0.;
    }
    pub fn end_press(&mut self) -> bool {
        let click = self.press.take().is_some_and(|p| !p.moved);
        self.desktop.dragging = false;
        self.desktop.pressed = false;
        self.velocity = 0.;
        self.persist_position();
        click
    }
    pub fn persist_position(&mut self) {
        let d = &self.desktop;
        self.snapshot.data.position = Some(SavedPosition {
            x: d.x,
            y: d.y,
            monitor: None,
        });
        self.changed();
    }
}
fn lock(shared: &Shared) -> std::sync::MutexGuard<'_, Runtime> {
    shared.lock().unwrap_or_else(|e| e.into_inner())
}
pub fn emit_snapshot(app: &AppHandle, shared: &Shared) {
    let value = lock(shared).snapshot.clone();
    let _ = app.emit("snapshot", value);
}
pub fn act(app: &AppHandle, shared: &Shared, action: &str) -> Result<Snapshot, String> {
    let snapshot = { lock(shared).action(action)? };
    let _ = app.emit("snapshot", &snapshot);
    let _ = app.emit_to(
        "pet",
        "pet-action",
        serde_json::json!({"action": action, "character": snapshot.data.settings.character}),
    );
    Ok(snapshot)
}
pub fn finish_press(app: &AppHandle, shared: &Shared) {
    let click = { lock(shared).end_press() };
    if click {
        let character = lock(shared).snapshot.data.settings.character.clone();
        if character == "gugugaga" {
            let _ = app.emit_to(
                "pet",
                "pet-action",
                serde_json::json!({"action": "poke", "character": character}),
            );
        }
        let _ = act(app, shared, "pet");
    }
}
#[derive(Clone)]
struct Screen {
    area: Rect,
    scale: f64,
}
fn screens(app: &AppHandle) -> Vec<Screen> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let a = m.work_area();
            Screen {
                area: Rect {
                    x: a.position.x as f64,
                    y: a.position.y as f64,
                    width: a.size.width as f64,
                    height: a.size.height as f64,
                },
                scale: m.scale_factor(),
            }
        })
        .collect()
}
fn select(screens: &[Screen], point: Point) -> Option<Screen> {
    screens
        .iter()
        .find(|s| s.area.contains(point))
        .or_else(|| {
            screens.iter().min_by(|a, b| {
                let distance = |s: &Screen| {
                    let c = s.area.clamp(point, 0., 0.);
                    (c.x - point.x).powi(2) + (c.y - point.y).powi(2)
                };
                distance(a).total_cmp(&distance(b))
            })
        })
        .cloned()
}
pub fn place(app: &AppHandle, shared: &Shared, rescue: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("pet")
        .ok_or("猫のウィンドウがありません。")?;
    let monitors = screens(app);
    if monitors.is_empty() {
        return Err("画面の作業領域を取得できませんでした。".into());
    }
    let (saved, size) = {
        let r = lock(shared);
        (
            r.snapshot.data.position.clone(),
            r.snapshot.data.settings.render_size(),
        )
    };
    let primary = app
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| {
            let p = m.position();
            select(
                &monitors,
                Point {
                    x: p.x as f64 + 10.,
                    y: p.y as f64 + 10.,
                },
            )
        })
        .unwrap_or_else(|| monitors[0].clone());
    let screen = if !rescue {
        saved
            .as_ref()
            .and_then(|p| {
                select(
                    &monitors,
                    Point {
                        x: p.x + 128. * size,
                        y: p.y + 112. * size,
                    },
                )
            })
            .unwrap_or(primary)
    } else {
        primary
    };
    let w = 256. * size * screen.scale;
    let h = 224. * size * screen.scale;
    let point = if !rescue {
        saved.map(|p| Point { x: p.x, y: p.y })
    } else {
        None
    }
    .unwrap_or(Point {
        x: screen.area.x + screen.area.width - w - 48. * screen.scale,
        y: screen.area.y + screen.area.height - h,
    });
    let point = screen.area.clamp(point, w, h);
    window
        .set_size(tauri::PhysicalSize::new(w.round() as u32, h.round() as u32))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(point.x as i32, point.y as i32))
        .map_err(|e| e.to_string())?;
    {
        let mut r = lock(shared);
        r.desktop.x = point.x;
        r.desktop.y = point.y;
        r.desktop.width = w;
        r.desktop.height = h;
        r.desktop.scale = screen.scale;
        r.desktop.work_area = screen.area;
        r.velocity = 0.;
        r.press = None;
        r.desktop.dragging = false;
        r.desktop.pressed = false;
        r.persist_position();
    }
    Ok(())
}
pub fn save(shared: &Shared) -> Result<(), String> {
    // Only the native loop calls this during normal operation; shutdown first stops it.
    let (dir, mut data, revision, read_only) = {
        let r = lock(shared);
        (
            r.store.directory.clone(),
            r.snapshot.data.clone(),
            r.snapshot.revision,
            r.read_only,
        )
    };
    if read_only {
        return Ok(());
    }
    data.saved_at = now_ms();
    let result = Store::new(dir).save(&data);
    let mut r = lock(shared);
    match &result {
        Ok(()) => {
            if r.snapshot.revision == revision {
                r.dirty = false;
            }
            r.snapshot.data.saved_at = data.saved_at;
            r.snapshot.save_error = None;
        }
        Err(e) => {
            r.snapshot.save_error = Some(format!(
            "保存できませんでした。空き容量とアクセス権を確認してください。再試行します。 ({e})"
        ))
        }
    }
    r.last_save = Instant::now();
    result
}
#[cfg(windows)]
fn left_down() -> Option<bool> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    // Only the left-button state is observed; no keyboard input is captured.
    Some(unsafe { GetAsyncKeyState(VK_LBUTTON as i32) } < 0)
}
#[cfg(not(windows))]
fn left_down() -> Option<bool> {
    None
}

pub fn start(app: AppHandle, shared: Shared) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let Some(window) = app.get_webview_window("pet") else {
            return;
        };
        let mut last = Instant::now();
        let mut last_desktop = Instant::now();
        let mut last_needs = Instant::now();
        let mut last_screens = Instant::now();
        let mut monitors = screens(&app);
        let mut ignored: Option<bool> = None;
        loop {
            let (stop, visible) = {
                let r = lock(&shared);
                (r.stop, r.snapshot.visible)
            };
            if stop {
                break;
            }
            let now = Instant::now();
            let elapsed = now.duration_since(last).as_secs_f64();
            last = now;
            let dt = if elapsed > 0.25 { 0. } else { elapsed };
            if last_screens.elapsed() > Duration::from_secs(2) {
                monitors = screens(&app);
                last_screens = now;
            }
            let cursor = if visible {
                app.cursor_position().ok().map(|p| Point { x: p.x, y: p.y })
            } else {
                None
            };
            let button = left_down();
            let mut released = false;
            let mut moved = None;
            let mut resize = None;
            let old_metrics = {
                let r = lock(&shared);
                (r.desktop.width, r.desktop.height, r.desktop.scale)
            };
            let (ignore, desktop, snapshot, save_due) = {
                let mut r = lock(&shared);
                if let Some(c) = cursor {
                    r.desktop.cursor = c;
                }
                let settings = r.snapshot.data.settings.clone();
                if visible {
                    let c = r.desktop.cursor;
                    if r.press.is_some() && button == Some(false) {
                        released = true;
                    }
                    let anchor = r
                        .press
                        .as_ref()
                        .map(|p| {
                            if p.moved {
                                c
                            } else {
                                Point {
                                    x: r.desktop.x + r.desktop.width / 2.,
                                    y: r.desktop.y + r.desktop.height / 2.,
                                }
                            }
                        })
                        .unwrap_or(Point {
                            x: r.desktop.x + r.desktop.width / 2.,
                            y: r.desktop.y + r.desktop.height / 2.,
                        });
                    if let Some(screen) = select(&monitors, anchor) {
                        if (r.desktop.scale - screen.scale).abs() > 0.01 {
                            resize = Some((settings.render_size(), screen.scale));
                        }
                        r.desktop.scale = screen.scale;
                        r.desktop.work_area = screen.area;
                        r.desktop.width = 256. * settings.render_size() * screen.scale;
                        r.desktop.height = 224. * settings.render_size() * screen.scale;
                    }
                    let old = Point {
                        x: r.desktop.x,
                        y: r.desktop.y,
                    };
                    let w = r.desktop.width;
                    let h = r.desktop.height;
                    if let Some(p) = &mut r.press {
                        if ((c.x - p.cursor.x).powi(2) + (c.y - p.cursor.y).powi(2)).sqrt()
                            >= p.threshold
                        {
                            p.moved = true;
                        }
                        if p.moved {
                            let target = Point {
                                x: c.x - p.offset.x * w,
                                y: c.y - p.offset.y * h,
                            };
                            r.desktop.x = target.x;
                            r.desktop.y = target.y;
                            r.desktop.dragging = true;
                        }
                    } else if r.last_frame.elapsed() < Duration::from_millis(500)
                        && !settings.focus_mode
                        && !r.menu_open
                    {
                        r.desktop.x += r.velocity * r.desktop.scale * dt;
                    }
                    // During dragging crossing monitors is allowed; on release fully clamp.
                    if r.press.is_none() || released {
                        let p = r.desktop.work_area.clamp(
                            Point {
                                x: r.desktop.x,
                                y: r.desktop.y,
                            },
                            w,
                            h,
                        );
                        r.desktop.x = p.x;
                        r.desktop.y = p.y;
                    }
                    if old.x.round() != r.desktop.x.round() || old.y.round() != r.desktop.y.round()
                    {
                        moved = Some(Point {
                            x: r.desktop.x,
                            y: r.desktop.y,
                        });
                    }
                }
                let hit = r.mask.hit(
                    (r.desktop.cursor.x - r.desktop.x) / r.desktop.width,
                    (r.desktop.cursor.y - r.desktop.y) / r.desktop.height,
                );
                let ignore =
                    settings.focus_mode || !visible || (!r.menu_open && r.press.is_none() && !hit);
                let desktop = if visible && last_desktop.elapsed() >= Duration::from_millis(100) {
                    last_desktop = now;
                    Some(r.desktop.clone())
                } else {
                    None
                };
                let snapshot = if last_needs.elapsed() >= Duration::from_secs(5) {
                    let seconds = last_needs.elapsed().as_secs_f64();
                    last_needs = now;
                    if visible && seconds < 10. {
                        let state = r.cat_state.clone();
                        r.snapshot.data.needs.tick(seconds / 3., &state);
                        r.snapshot.data.needs.tick(seconds / 3., &state);
                        r.snapshot.data.needs.tick(seconds / 3., &state);
                        r.changed();
                    }
                    let d = &r.desktop;
                    r.snapshot.data.position = Some(SavedPosition {
                        x: d.x,
                        y: d.y,
                        monitor: None,
                    });
                    Some(r.snapshot.clone())
                } else {
                    None
                };
                let due = !r.read_only
                    && r.dirty
                    && r.last_save.elapsed() > Duration::from_secs(3)
                    && (r.changed.elapsed() > Duration::from_secs(2)
                        || r.last_save.elapsed() > Duration::from_secs(30));
                (ignore, desktop, snapshot, due)
            };
            // Never hold the state mutex while dispatching work to the GUI thread.
            if let Some(p) = moved {
                if let Err(e) = window.set_position(PhysicalPosition::new(
                    p.x.round() as i32,
                    p.y.round() as i32,
                )) {
                    let actual = window.outer_position().ok();
                    let mut r = lock(&shared);
                    if let Some(p) = actual {
                        r.desktop.x = p.x as f64;
                        r.desktop.y = p.y as f64;
                    }
                    r.snapshot.warning = Some(format!("猫を移動できませんでした: {e}"));
                }
            }
            if let Some((size, scale)) = resize {
                let result = window.set_size(tauri::PhysicalSize::new(
                    (256. * size * scale).round() as u32,
                    (224. * size * scale).round() as u32,
                ));
                let actual = window.inner_size().ok();
                let actual_scale = window.scale_factor().ok();
                let mut r = lock(&shared);
                if result.is_ok() {
                    if let Some(actual) = actual {
                        r.desktop.width = actual.width as f64;
                        r.desktop.height = actual.height as f64;
                    }
                    r.desktop.scale = actual_scale.unwrap_or(scale);
                } else {
                    r.desktop.width = old_metrics.0;
                    r.desktop.height = old_metrics.1;
                    r.desktop.scale = old_metrics.2;
                    r.snapshot.warning =
                        Some("画面の倍率を反映できませんでした。再試行します。".into());
                }
            }
            if ignored != Some(ignore) && window.set_ignore_cursor_events(ignore).is_ok() {
                ignored = Some(ignore);
            }
            if released {
                finish_press(&app, &shared);
            }
            if desktop.is_some() {
                let d = lock(&shared).desktop.clone();
                let _ = app.emit_to("pet", "desktop", d);
            }
            if let Some(s) = snapshot {
                let _ = app.emit("snapshot", s);
            }
            if save_due {
                let _ = save(&shared);
                emit_snapshot(&app, &shared);
            }
            std::thread::sleep(if visible {
                Duration::from_millis(16)
            } else {
                Duration::from_millis(250)
            });
        }
        let _ = save(&shared);
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn touch_interrupts_food_without_duplicate_care_but_drag_blocks_touch() {
        let store =
            Store::new(std::env::temp_dir().join(format!("madoneko-reaction-{}", now_ms())));
        let mut runtime = Runtime::new(store);
        runtime.snapshot.data.switch_character("gugugaga").unwrap();
        runtime.action("feed").unwrap();
        let before = runtime.snapshot.data.needs.affection;
        let revision = runtime.snapshot.revision;
        for _ in 0..5 {
            assert!(runtime.action("pet").is_ok());
        }
        assert_eq!(runtime.snapshot.data.needs.affection, before);
        assert_eq!(runtime.snapshot.revision, revision);
        assert!(runtime.action("play").is_err());
        runtime.desktop.width = 224.;
        runtime.desktop.height = 196.;
        runtime.desktop.scale = 1.;
        runtime.begin_press();
        assert!(runtime.action("pet").is_err());
        runtime.end_press();
        runtime.snapshot.data.switch_character("cat").unwrap();
        assert!(runtime.action("pet").is_err());
    }
}
