mod model;
mod runtime;
mod storage;
use model::*;
use runtime::{Runtime, Shared};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt;

struct SettingsGate(Mutex<()>);
struct Worker(Mutex<Option<std::thread::JoinHandle<()>>>);
struct TrayControls {
    menu: Menu<tauri::Wry>,
    visible: MenuItem<tauri::Wry>,
    feed: MenuItem<tauri::Wry>,
    focus: CheckMenuItem<tauri::Wry>,
}
fn lock(state: &Shared) -> std::sync::MutexGuard<'_, Runtime> {
    state.lock().unwrap_or_else(|e| e.into_inner())
}
fn authorized(window: &WebviewWindow) -> Result<(), String> {
    if ["pet", "settings"].contains(&window.label()) {
        Ok(())
    } else {
        Err("この画面からの操作は許可されていません。".into())
    }
}
fn pet_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("pet")
        .ok_or_else(|| "猫のウィンドウがありません。".into())
}
fn sync_tray(app: &AppHandle, shared: &Shared) {
    if let Some(t) = app.try_state::<TrayControls>() {
        let (visible, focus, name) = {
            let r = lock(shared);
            (
                r.snapshot.visible,
                r.snapshot.data.settings.focus_mode,
                r.snapshot.data.settings.display_name().to_string(),
            )
        };
        let _ = t.visible.set_text(if visible {
            format!("{name}を隠す")
        } else {
            format!("{name}を表示")
        });
        let _ = t.focus.set_checked(focus);
        let _ = t.feed.set_enabled(!focus);
    }
}
fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("settings")
        .ok_or("設定画面がありません。")?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
fn get_snapshot(window: WebviewWindow, state: State<Shared>) -> Result<Snapshot, String> {
    authorized(&window)?;
    Ok(lock(&state).snapshot.clone())
}
#[tauri::command]
fn get_desktop_pos(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> Result<Desktop, String> {
    authorized(&window)?;
    runtime::desktop_position(&app, &state)
}
// Retain the previous command name for existing native diagnostics.
#[tauri::command]
fn get_desktop(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> Result<Desktop, String> {
    get_desktop_pos(app, window, state)
}
fn apply_settings(
    app: &AppHandle,
    shared: &Shared,
    patch: serde_json::Value,
) -> Result<Snapshot, String> {
    // Serialize complete settings transactions, including fallible OS side effects.
    // Never block the GUI waiting for a concurrent transaction.
    let gate = app.state::<SettingsGate>();
    let _transaction = gate
        .0
        .try_lock()
        .map_err(|_| "設定を反映中です。少し待ってもう一度おためしください。")?;
    let old_data = { lock(shared).snapshot.data.clone() };
    let old = old_data.settings.clone();
    let mut candidate = old_data.clone();
    let object = patch.as_object().ok_or("設定の形式が正しくありません。")?;
    if let Some(character) = object.get("character") {
        candidate.switch_character(
            character
                .as_str()
                .ok_or("キャラクターの形式が正しくありません。")?,
        )?;
    }
    let mut value = serde_json::to_value(&candidate.settings).map_err(|e| e.to_string())?;
    for (key, v) in object {
        if value.get(key).is_none() {
            return Err("不明な設定項目です。".into());
        }
        value[key] = v.clone();
    }
    let mut settings: Settings =
        serde_json::from_value(value).map_err(|_| "設定値の型が正しくありません。")?;
    settings.validate()?;
    let switched = old.character != settings.character;
    candidate.settings = settings.clone();
    candidate.remember_character();
    let window = pet_window(app)?;
    if old.autostart != settings.autostart {
        let result = if settings.autostart {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        result.map_err(|e| format!("自動起動の設定を変更できませんでした: {e}"))?;
    }
    if let Err(e) = window.set_always_on_top(settings.always_on_top) {
        if old.autostart != settings.autostart {
            let _ = if old.autostart {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            };
        }
        return Err(e.to_string());
    }
    {
        let mut r = lock(shared);
        r.snapshot.data = candidate;
        r.velocity = 0.;
        if switched {
            r.mask = HitMask::default();
            r.last_action = None;
            r.cat_state = "idle".into();
        }
        if settings.focus_mode || switched {
            r.press = None;
            r.desktop.dragging = false;
            r.desktop.pressed = false;
        }
        r.changed();
    }
    if (old.render_size() - settings.render_size()).abs() > 0.001 {
        // Preserve the centre of the paws when resizing, in physical screen pixels.
        {
            let mut r = lock(shared);
            let d = &r.desktop;
            let p = SavedPosition {
                x: d.x + d.width / 2. - 128. * settings.render_size() * d.scale,
                y: d.y + d.height * 206. / 224. - 206. * settings.render_size() * d.scale,
                monitor: None,
            };
            r.snapshot.data.position = Some(p);
        }
        if let Err(e) = runtime::place(app, shared, false) {
            {
                let mut r = lock(shared);
                r.snapshot.data = old_data;
                r.changed();
            }
            let _ = window.set_always_on_top(old.always_on_top);
            if old.autostart != settings.autostart {
                let _ = if old.autostart {
                    app.autolaunch().enable()
                } else {
                    app.autolaunch().disable()
                };
            }
            if let Err(restore) = runtime::place(app, shared, false) {
                lock(shared).snapshot.warning = Some(format!(
                    "表示の復旧に失敗しました。トレイから猫を画面内へ戻してください: {restore}"
                ));
            }
            sync_tray(app, shared);
            runtime::emit_snapshot(app, shared);
            return Err(format!(
                "大きさを反映できなかったため、設定を元に戻しました: {e}"
            ));
        }
    }
    sync_tray(app, shared);
    runtime::emit_snapshot(app, shared);
    Ok(lock(shared).snapshot.clone())
}
#[tauri::command]
fn update_settings(
    app: AppHandle,
    window: WebviewWindow,
    state: State<Shared>,
    patch: serde_json::Value,
    expected_character: Option<String>,
) -> Result<Snapshot, String> {
    authorized(&window)?;
    if expected_character.is_some_and(|id| id != lock(&state).snapshot.data.settings.character) {
        return Err("キャラクターを切り替えました。もう一度操作してください。".into());
    }
    apply_settings(&app, &state, patch)
}
#[tauri::command]
fn pet_action(
    app: AppHandle,
    window: WebviewWindow,
    state: State<Shared>,
    action: String,
    expected_character: Option<String>,
) -> Result<Snapshot, String> {
    authorized(&window)?;
    if expected_character.is_some_and(|id| id != lock(&state).snapshot.data.settings.character) {
        return Err("キャラクターを切り替えました。もう一度操作してください。".into());
    }
    runtime::act(&app, &state, &action)
}
#[tauri::command]
fn sync_frame(
    window: WebviewWindow,
    state: State<Shared>,
    frame: NativeFrame,
) -> Result<(), String> {
    if window.label() != "pet" {
        return Err("猫の画面専用の操作です。".into());
    }
    if !frame.velocity.is_finite()
        || frame.velocity.abs() > 300.
        || !STATES.contains(&frame.state.as_str())
    {
        return Err("動作データが範囲外です。".into());
    }
    if frame.mask.as_ref().is_some_and(|m| !m.valid()) {
        return Err("ヒットマスクが不正です。".into());
    }
    let mut r = lock(&state);
    if frame.character != r.snapshot.data.settings.character {
        return Ok(());
    }
    r.velocity = frame.velocity;
    r.cat_state = frame.state;
    r.last_frame = std::time::Instant::now();
    if let Some(mask) = frame.mask {
        r.mask = mask;
    }
    Ok(())
}
#[tauri::command]
fn begin_press(window: WebviewWindow, state: State<Shared>) -> Result<(), String> {
    if window.label() != "pet" {
        return Err("猫の画面専用です。".into());
    }
    lock(&state).begin_press();
    Ok(())
}
#[tauri::command]
fn end_press(app: AppHandle, window: WebviewWindow, state: State<Shared>) -> Result<(), String> {
    if window.label() != "pet" {
        return Err("猫の画面専用です。".into());
    }
    runtime::finish_press(&app, &state);
    Ok(())
}
#[tauri::command]
fn open_settings(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    authorized(&window)?;
    open_settings_window(&app)
}
#[tauri::command]
async fn open_pet_menu(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> Result<(), String> {
    if window.label() != "pet" {
        return Err("猫の画面専用です。".into());
    }
    let menu = app.state::<TrayControls>().menu.clone();
    let shared = state.inner().clone();
    // The Windows popup blocks until dismissed. Let it use the OS menu window,
    // beyond the small transparent pet window, without blocking the IPC thread.
    tauri::async_runtime::spawn_blocking(move || {
        {
            let mut r = lock(&shared);
            if r.menu_open || !r.snapshot.visible || r.snapshot.data.settings.focus_mode {
                return Ok(());
            }
            r.menu_open = true;
            r.press = None;
            r.desktop.pressed = false;
            r.desktop.dragging = false;
            r.velocity = 0.;
        }
        let result = window.popup_menu(&menu).map_err(|e| e.to_string());
        let mut r = lock(&shared);
        r.menu_open = false;
        r.velocity = 0.;
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
fn visibility(app: &AppHandle, shared: &Shared, visible: bool) -> Result<Snapshot, String> {
    let window = pet_window(app)?;
    if visible {
        window.show()
    } else {
        window.hide()
    }
    .map_err(|e| e.to_string())?;
    {
        let mut r = lock(shared);
        r.snapshot.visible = visible;
        r.velocity = 0.;
        r.press = None;
        r.desktop.dragging = false;
        r.desktop.pressed = false;
        r.snapshot.revision += 1;
    }
    sync_tray(app, shared);
    runtime::emit_snapshot(app, shared);
    Ok(lock(shared).snapshot.clone())
}
#[tauri::command]
fn set_visible(
    app: AppHandle,
    window: WebviewWindow,
    state: State<Shared>,
    visible: bool,
) -> Result<Snapshot, String> {
    authorized(&window)?;
    visibility(&app, &state, visible)
}
#[tauri::command]
fn rescue(app: AppHandle, window: WebviewWindow, state: State<Shared>) -> Result<(), String> {
    authorized(&window)?;
    runtime::place(&app, &state, true)?;
    visibility(&app, &state, true)?;
    Ok(())
}
fn request_quit(app: &AppHandle, discard_unsaved: bool) {
    let Some(shared) = app.try_state::<Shared>() else {
        app.exit(0);
        return;
    };
    {
        let mut r = lock(&shared);
        if r.stop {
            return;
        }
        r.stop = true;
        r.persist_position();
    }
    let app = app.clone();
    std::thread::spawn(move || {
        if let Some(worker) = app.try_state::<Worker>() {
            let handle = worker.0.lock().unwrap_or_else(|e| e.into_inner()).take();
            if let Some(handle) = handle {
                let _ = handle.join();
            }
        }
        let shared = app.state::<Shared>();
        let failed = lock(&shared).snapshot.save_error.is_some();
        if failed && !discard_unsaved {
            {
                let mut r = lock(&shared);
                r.stop = false;
                r.snapshot.warning = Some("保存できなかったため終了を中止しました。保存先を確認して再度終了するか、「保存せず終了」を選んでください。".into());
                r.snapshot.revision += 1;
            }
            let handle = runtime::start(app.clone(), shared.inner().clone());
            *app.state::<Worker>()
                .0
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(handle);
            runtime::emit_snapshot(&app, &shared);
            let _ = open_settings_window(&app);
            return;
        }
        app.exit(0);
    });
}
#[tauri::command]
fn quit(
    app: AppHandle,
    window: WebviewWindow,
    discard_unsaved: Option<bool>,
) -> Result<(), String> {
    authorized(&window)?;
    request_quit(&app, discard_unsaved.unwrap_or(false));
    Ok(())
}
fn tray(app: &AppHandle, shared: &Shared) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "visible", "猫を隠す", true, None::<&str>)?;
    let feed = MenuItem::with_id(app, "feed", "ご飯をあげる", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "お世話と設定を開く", true, None::<&str>)?;
    let focus = CheckMenuItem::with_id(
        app,
        "focus",
        "作業に集中モード",
        true,
        lock(shared).snapshot.data.settings.focus_mode,
        None::<&str>,
    )?;
    let rescue = MenuItem::with_id(app, "rescue", "画面内へ戻す", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "quit", "まどねこを終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &feed, &settings, &focus, &rescue, &exit])?;
    app.manage(TrayControls {
        menu: menu.clone(),
        visible: show,
        feed,
        focus,
    });
    sync_tray(app, shared);
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
    TrayIconBuilder::with_id("madoneko")
        .icon(icon)
        .tooltip("まどねこ — 小さな同居人")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let shared = app.state::<Shared>();
            let result: Result<(), String> = match event.id.as_ref() {
                "visible" => {
                    let visible = !lock(&shared).snapshot.visible;
                    visibility(app, &shared, visible).map(|_| ())
                }
                "feed" => runtime::act(app, &shared, "feed").map(|_| ()),
                "settings" => open_settings_window(app),
                "focus" => {
                    let focus = !lock(&shared).snapshot.data.settings.focus_mode;
                    apply_settings(app, &shared, serde_json::json!({"focusMode":focus})).map(|_| ())
                }
                "rescue" => runtime::place(app, &shared, true)
                    .and_then(|_| visibility(app, &shared, true).map(|_| ())),
                "quit" => {
                    request_quit(app, false);
                    Ok(())
                }
                _ => Ok(()),
            };
            if let Err(e) = result {
                lock(&shared).snapshot.warning = Some(e);
                runtime::emit_snapshot(app, &shared);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = open_settings_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
pub fn run() {
    let app = tauri::Builder::default()
        .manage(SettingsGate(Mutex::new(())))
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = open_settings_window(app);
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--autostart"])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            get_desktop_pos,
            get_desktop,
            update_settings,
            pet_action,
            sync_frame,
            begin_press,
            end_press,
            open_pet_menu,
            open_settings,
            set_visible,
            rescue,
            quit
        ])
        .setup(|app| {
            let mut directory = app.path().app_data_dir()?;
            if std::env::args().any(|a| a == "--validation") {
                directory = directory.join("validation");
            }
            let first_run = !directory.join("pet.json").exists();
            let shared: Shared = Arc::new(Mutex::new(Runtime::new(storage::Store::new(directory))));
            if let Ok(enabled) = app.autolaunch().is_enabled() {
                lock(&shared).snapshot.data.settings.autostart = enabled;
            }
            // Commands, worker and tray all use this same Arc<std::sync::Mutex<Runtime>>.
            // Register before ANY WebView starts (including hidden/settings WebViews).
            if !app.manage::<Shared>(shared.clone()) {
                return Err("共有状態が重複して登録されています。".into());
            }
            // Hidden webviews also execute scripts. Create them only after their
            // command state is registered, so startup IPC cannot race setup.
            for config in &app.config().app.windows {
                WebviewWindowBuilder::from_config(app.handle(), config)?.build()?;
            }
            let window = pet_window(app.handle()).map_err(std::io::Error::other)?;
            window.set_always_on_top(lock(&shared).snapshot.data.settings.always_on_top)?;
            window.set_focusable(false)?;
            window.set_ignore_cursor_events(true)?;
            runtime::place(app.handle(), &shared, false).map_err(std::io::Error::other)?;
            tray(app.handle(), &shared)?;
            window.show()?;
            let worker = runtime::start(app.handle().clone(), shared);
            app.manage(Worker(Mutex::new(Some(worker))));
            if first_run && !std::env::args().any(|a| a == "--autostart") {
                let _ = open_settings_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == "settings" {
                    let _ = window.hide();
                } else {
                    let shared = window.app_handle().state::<Shared>();
                    let _ = visibility(window.app_handle(), &shared, false);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("まどねこを起動できませんでした。");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let stopping = app.try_state::<Shared>().is_some_and(|s| lock(&s).stop);
            if !stopping {
                api.prevent_exit();
                request_quit(app, false);
            }
        }
    });
}

#[cfg(test)]
mod startup_tests {
    #[test]
    fn every_webview_waits_for_managed_state() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        for window in config["app"]["windows"].as_array().unwrap() {
            assert_eq!(
                window["create"], false,
                "Even hidden WebViews run IPC before setup when auto-created: {}",
                window["label"]
            );
        }
    }
}
