use crate::model::{now_ms, PetData};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub struct Loaded {
    pub data: PetData,
    pub warning: Option<String>,
    pub read_only: bool,
}
pub struct Store {
    pub directory: PathBuf,
}
impl Store {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }
    fn read(path: &Path) -> Result<PetData, String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        if file.metadata().map_err(|e| e.to_string())?.len() > 64 * 1024 {
            return Err("保存ファイルが大きすぎます。".into());
        }
        let mut text = String::new();
        file.read_to_string(&mut text).map_err(|e| e.to_string())?;
        let mut data: PetData = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        data.validate()?;
        Ok(data)
    }
    pub fn load(&self) -> Loaded {
        let path = self.directory.join("pet.json");
        if !path.exists() {
            // A crash on the very first write can leave a complete temporary file.
            for candidate in ["pet.json.tmp", "pet.backup.json"] {
                if let Ok(data) = Self::read(&self.directory.join(candidate)) {
                    return Loaded {
                        data,
                        warning: Some("前回の保存からデータを復元しました。".into()),
                        read_only: false,
                    };
                }
            }
            return Loaded {
                data: PetData::default(),
                warning: None,
                read_only: false,
            };
        }
        if let Ok(data) = Self::read(&path) {
            return Loaded {
                data,
                warning: None,
                read_only: false,
            };
        }
        // Never overwrite a newer schema with this older application's default data.
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                if value
                    .get("schemaVersion")
                    .and_then(|v| v.as_u64())
                    .is_some_and(|v| v > 2)
                {
                    return Loaded { data: PetData::default(), warning: Some("新しいバージョンの保存データです。元のデータを保護し、今回は保存を停止しています。新しいアプリを使用してください。".into()), read_only: true };
                }
            }
        }
        let preserved = self
            .directory
            .join(format!("pet.corrupt-{}.json", now_ms()));
        if fs::rename(&path, &preserved).is_err() {
            return Loaded { data: PetData::default(), warning: Some("保存データを読めず、元のファイルの保護にも失敗しました。今回は保存を停止しています。".into()), read_only: true };
        }
        let backup = Self::read(&self.directory.join("pet.backup.json"));
        let message = if backup.is_ok() {
            "保存データが破損していたため、前回のバックアップから復元しました。元のファイルは保護されています。"
        } else {
            "保存データが破損していたため、初期状態で起動しました。元のファイルは保護されています。"
        };
        Loaded {
            data: backup.unwrap_or_default(),
            warning: Some(message.into()),
            read_only: false,
        }
    }
    pub fn save(&self, data: &PetData) -> Result<(), String> {
        let mut checked = data.clone();
        checked.validate()?;
        fs::create_dir_all(&self.directory).map_err(|e| e.to_string())?;
        let path = self.directory.join("pet.json");
        let temp = self.directory.join("pet.json.tmp");
        let bytes = serde_json::to_vec_pretty(&checked).map_err(|e| e.to_string())?;
        let mut file = File::create(&temp).map_err(|e| e.to_string())?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        drop(file);
        // Keep the last *valid* version. An invalid main file cannot poison recovery.
        if Self::read(&path).is_ok() {
            let backup_temp = self.directory.join("pet.backup.tmp");
            fs::copy(&path, &backup_temp).map_err(|e| e.to_string())?;
            File::options()
                .write(true)
                .open(&backup_temp)
                .and_then(|f| f.sync_all())
                .map_err(|e| e.to_string())?;
            replace(&backup_temp, &self.directory.join("pet.backup.json"))?;
        }
        replace(&temp, &path)?;
        #[cfg(unix)]
        File::open(&self.directory)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
fn replace(from: &Path, to: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };
        let source: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
        let dest: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
        // Both files are in the same application directory (same volume).
        let ok = unsafe {
            MoveFileExW(
                source.as_ptr(),
                dest.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if ok == 0 {
            Err(std::io::Error::last_os_error().to_string())
        } else {
            Ok(())
        }
    }
    #[cfg(not(windows))]
    {
        fs::rename(from, to).map_err(|e| e.to_string())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static ID: AtomicU64 = AtomicU64::new(0);
    fn dir() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "madoneko-test-{}-{}-{}",
            std::process::id(),
            now_ms(),
            ID.fetch_add(1, Ordering::SeqCst)
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn round_trip_and_backup_recover() {
        let p = dir();
        let store = Store::new(p.clone());
        let mut d = PetData::default();
        d.settings.name = "きなこ".into();
        store.save(&d).unwrap();
        assert_eq!(store.load().data.settings.name, "きなこ");
        d.settings.name = "むぎ".into();
        store.save(&d).unwrap();
        fs::write(p.join("pet.json"), "{broken").unwrap();
        let recovered = store.load();
        assert_eq!(recovered.data.settings.name, "きなこ");
        assert!(recovered.warning.is_some());
        assert!(fs::read_dir(&p)
            .unwrap()
            .filter_map(Result::ok)
            .any(|f| f.file_name().to_string_lossy().contains("corrupt")));
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn invalid_values_and_future_schema_preserved() {
        let p = dir();
        let s = Store::new(p.clone());
        let mut d = PetData::default();
        d.needs.energy = -4.;
        assert!(s.save(&d).is_err());
        fs::write(p.join("pet.json"), r#"{"schemaVersion":999}"#).unwrap();
        assert!(s.load().read_only);
        assert!(fs::read_to_string(p.join("pet.json"))
            .unwrap()
            .contains("999"));
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn write_failure_reported() {
        let p = dir();
        let file = p.join("file");
        fs::write(&file, "occupied").unwrap();
        assert!(Store::new(file).save(&PetData::default()).is_err());
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn first_write_interruption_recovers_temp() {
        let p = dir();
        fs::write(
            p.join("pet.json.tmp"),
            serde_json::to_vec(&PetData::default()).unwrap(),
        )
        .unwrap();
        assert!(Store::new(p.clone()).load().warning.is_some());
        fs::remove_dir_all(p).unwrap();
    }
}
