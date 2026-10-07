use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    #[serde(default = "default_character")]
    pub character: String,
    pub name: String,
    pub personality: String,
    pub size: f64,
    pub speed: f64,
    pub sound: bool,
    #[serde(default = "default_volume")]
    pub volume: f64,
    pub always_on_top: bool,
    pub follow_mouse: bool,
    pub autostart: bool,
    pub focus_mode: bool,
}
fn default_character() -> String {
    "cat".into()
}
fn default_volume() -> f64 {
    0.4
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            character: default_character(),
            name: "こむぎ".into(),
            personality: "calm".into(),
            size: 1.,
            speed: 1.,
            sound: false,
            volume: default_volume(),
            always_on_top: true,
            follow_mouse: true,
            autostart: false,
            focus_mode: false,
        }
    }
}
impl Settings {
    pub fn display_name(&self) -> &str {
        if self.character == "gugugaga" {
            "ググガガ"
        } else {
            "猫"
        }
    }
    pub fn render_size(&self) -> f64 {
        self.size
            * if self.character == "gugugaga" {
                0.875
            } else {
                1.
            }
    }
    pub fn validate(&mut self) -> Result<(), String> {
        if !["cat", "gugugaga"].contains(&self.character.as_str()) {
            return Err("キャラクターが正しくありません。".into());
        }
        if !self.volume.is_finite() || !(0.0..=1.0).contains(&self.volume) {
            return Err("音量は0〜100%にしてください。".into());
        }
        self.name = self.name.trim().to_string();
        if self.name.is_empty()
            || self.name.chars().count() > 20
            || self.name.chars().any(char::is_control)
        {
            return Err("名前は1〜20文字で入力してください。".into());
        }
        if !["calm", "affectionate", "energetic"].contains(&self.personality.as_str()) {
            return Err("性格が正しくありません。".into());
        }
        if !self.size.is_finite() || !(0.65..=1.5).contains(&self.size) {
            return Err("大きさは65〜150%にしてください。".into());
        }
        if !self.speed.is_finite() || !(0.4..=1.8).contains(&self.speed) {
            return Err("移動速度が範囲外です。".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Needs {
    pub fullness: f64,
    pub energy: f64,
    pub affection: f64,
}
impl Default for Needs {
    fn default() -> Self {
        Self {
            fullness: 78.,
            energy: 85.,
            affection: 35.,
        }
    }
}
impl Needs {
    pub fn validate(&self) -> Result<(), String> {
        if [self.fullness, self.energy, self.affection]
            .into_iter()
            .any(|v| !v.is_finite() || !(0.0..=100.).contains(&v))
        {
            return Err("育成データの値が不正です。".into());
        }
        Ok(())
    }
    pub fn tick(&mut self, dt: f64, state: &str) {
        let dt = if dt.is_finite() { dt.clamp(0., 2.) } else { 0. };
        self.fullness = (self.fullness - dt / 90.).max(15.);
        self.energy = (self.energy
            + if state == "sleep" {
                dt / 12.
            } else if state == "walk" || state == "play" {
                -dt / 45.
            } else {
                -dt / 240.
            })
        .clamp(10., 100.);
    }
    pub fn action(&mut self, action: &str) {
        match action {
            "feed" => {
                self.fullness = (self.fullness + 22.).min(100.);
                self.affection = (self.affection + 1.).min(100.);
            }
            "play" => {
                self.energy = (self.energy - 3.).max(10.);
                self.affection = (self.affection + 2.).min(100.);
            }
            "pet" => {
                self.affection = (self.affection + 0.8).min(100.);
                self.energy = (self.energy + 0.4).min(100.);
            }
            _ => {}
        }
    }
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
impl Rect {
    pub fn contains(&self, p: Point) -> bool {
        p.x >= self.x && p.y >= self.y && p.x < self.x + self.width && p.y < self.y + self.height
    }
    pub fn clamp(&self, p: Point, w: f64, h: f64) -> Point {
        Point {
            x: p.x.clamp(self.x, self.x + (self.width - w).max(0.)),
            y: p.y.clamp(self.y, self.y + (self.height - h).max(0.)),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavedPosition {
    pub x: f64,
    pub y: f64,
    pub monitor: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetData {
    pub schema_version: u32,
    pub settings: Settings,
    pub needs: Needs,
    #[serde(default)]
    pub profiles: BTreeMap<String, CharacterProfile>,
    pub position: Option<SavedPosition>,
    pub saved_at: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CharacterProfile {
    pub name: String,
    pub needs: Needs,
}
fn default_profiles() -> BTreeMap<String, CharacterProfile> {
    [("cat", "こむぎ"), ("gugugaga", "ググガガ")]
        .into_iter()
        .map(|(id, name)| {
            (
                id.into(),
                CharacterProfile {
                    name: name.into(),
                    needs: Needs::default(),
                },
            )
        })
        .collect()
}
impl Default for PetData {
    fn default() -> Self {
        Self {
            schema_version: 2,
            settings: Settings::default(),
            needs: Needs::default(),
            profiles: default_profiles(),
            position: None,
            saved_at: now_ms(),
        }
    }
}
impl PetData {
    pub fn remember_character(&mut self) {
        self.profiles.insert(
            self.settings.character.clone(),
            CharacterProfile {
                name: self.settings.name.clone(),
                needs: self.needs.clone(),
            },
        );
    }
    pub fn switch_character(&mut self, id: &str) -> Result<(), String> {
        if !["cat", "gugugaga"].contains(&id) {
            return Err("キャラクターが正しくありません。".into());
        }
        self.remember_character();
        let profile = self
            .profiles
            .get(id)
            .ok_or("キャラクターのデータがありません。")?;
        self.settings.name = profile.name.clone();
        self.needs = profile.needs.clone();
        self.settings.character = id.into();
        Ok(())
    }
    pub fn validate(&mut self) -> Result<(), String> {
        if self.schema_version == 1 {
            self.settings.character = "cat".into();
            self.profiles = default_profiles();
            self.schema_version = 2;
        }
        if self.schema_version != 2 {
            return Err("このバージョンでは読めない保存形式です。".into());
        }
        self.settings.validate()?;
        self.needs.validate()?;
        for id in ["cat", "gugugaga"] {
            let profile = self
                .profiles
                .get(id)
                .ok_or("キャラクターの保存データがありません。")?;
            let mut settings = self.settings.clone();
            settings.name = profile.name.clone();
            settings.validate()?;
            profile.needs.validate()?;
        }
        self.remember_character();
        if self.position.as_ref().is_some_and(|p| {
            !p.x.is_finite() || !p.y.is_finite() || p.x.abs() > 1_000_000. || p.y.abs() > 1_000_000.
        }) {
            self.position = None;
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub data: PetData,
    pub revision: u64,
    pub visible: bool,
    pub save_error: Option<String>,
    pub warning: Option<String>,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Desktop {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
    pub work_area: Rect,
    pub cursor: Point,
    pub dragging: bool,
    pub pressed: bool,
}
#[derive(Clone, Deserialize, Default)]
pub struct HitMask {
    pub width: usize,
    pub height: usize,
    pub cells: Vec<u8>,
}
impl HitMask {
    pub fn valid(&self) -> bool {
        self.width == 64
            && self.height == 56
            && self.cells.len() == 64 * 56
            && self.cells.iter().all(|n| *n <= 1)
    }
    pub fn hit(&self, x: f64, y: f64) -> bool {
        if !self.valid() || !(0.0..1.).contains(&x) || !(0.0..1.).contains(&y) {
            return false;
        }
        let i = (y * self.height as f64) as usize * self.width + (x * self.width as f64) as usize;
        self.cells.get(i).is_some_and(|v| *v == 1)
    }
}
#[derive(Deserialize)]
pub struct NativeFrame {
    pub character: String,
    pub velocity: f64,
    pub state: String,
    pub mask: Option<HitMask>,
}
pub const STATES: [&str; 14] = [
    "idle", "walk", "sit", "sleep", "stretch", "groom", "happy", "eat", "play", "dragged", "sulk",
    "land", "wake", "stumble",
];
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migrate_cat_and_restore_independent_profiles() {
        let mut legacy = serde_json::to_value(PetData::default()).unwrap();
        legacy["schemaVersion"] = 1.into();
        legacy["settings"]["name"] = "みけ".into();
        legacy["needs"]["affection"] = 73.into();
        legacy.as_object_mut().unwrap().remove("profiles");
        legacy["settings"]
            .as_object_mut()
            .unwrap()
            .remove("character");
        legacy["settings"].as_object_mut().unwrap().remove("volume");
        let mut data: PetData = serde_json::from_value(legacy).unwrap();
        data.validate().unwrap();
        assert_eq!(data.schema_version, 2);
        for _ in 0..20 {
            data.switch_character("gugugaga").unwrap();
            data.settings.name = "ぐー".into();
            data.needs.fullness = 99.;
            data.switch_character("cat").unwrap();
            assert_eq!(data.settings.name, "みけ");
            assert_eq!(data.needs.affection, 73.);
        }
        data.switch_character("gugugaga").unwrap();
        let mut restored: PetData =
            serde_json::from_slice(&serde_json::to_vec(&data).unwrap()).unwrap();
        restored.validate().unwrap();
        assert_eq!(restored.settings.character, "gugugaga");
        assert_eq!(restored.settings.name, "ぐー");
        assert_eq!(restored.needs.fullness, 99.);
        assert!(!restored.settings.sound);
    }
    #[test]
    fn validation_rejects_untrusted_settings() {
        let mut s = Settings::default();
        s.name = "\n".into();
        assert!(s.validate().is_err());
        s = Settings::default();
        s.speed = f64::NAN;
        assert!(s.validate().is_err());
        s = Settings::default();
        s.personality = "unknown".into();
        assert!(s.validate().is_err());
    }
    #[test]
    fn suspension_does_not_exhaust_cat() {
        let mut n = Needs::default();
        n.tick(8. * 60. * 60., "walk");
        assert!(n.energy > 84.);
        assert!(n.fullness > 77.);
    }
    #[test]
    fn no_offline_punishment_or_death() {
        let mut n = Needs::default();
        for _ in 0..100000 {
            n.tick(2., "walk");
        }
        assert!(n.fullness >= 15. && n.energy >= 10.);
    }
    #[test]
    fn negative_monitor_bounds() {
        let r = Rect {
            x: -1920.,
            y: -200.,
            width: 1920.,
            height: 1040.,
        };
        let p = r.clamp(Point { x: 800., y: -900. }, 384., 336.);
        assert_eq!(p.x, -384.);
        assert_eq!(p.y, -200.);
    }
    #[test]
    fn alpha_hit_excludes_border_and_handles_bad_data() {
        let m = HitMask {
            width: 64,
            height: 56,
            cells: vec![1; 3584],
        };
        assert!(m.hit(0.5, 0.5));
        assert!(!m.hit(-0.1, 0.5));
        assert!(!m.hit(1., 0.5));
        assert!(!HitMask::default().hit(0., 0.));
    }
}
