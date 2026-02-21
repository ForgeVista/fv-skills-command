use serde_json::Value;
use tauri::{AppHandle, Manager};

const THEME_FILE_NAME: &str = "theme.config.json";

#[tauri::command]
pub async fn save_theme_config(app: AppHandle, theme: Value) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    let target_path = app_data_dir.join(THEME_FILE_NAME);
    let payload = serde_json::to_string_pretty(&theme).map_err(|error| error.to_string())?;
    std::fs::write(&target_path, payload).map_err(|error| error.to_string())?;

    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn load_theme_config(app: AppHandle) -> Result<Option<Value>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let target_path = app_data_dir.join(THEME_FILE_NAME);

    if !target_path.exists() {
        return Ok(None);
    }

    let raw = std::fs::read_to_string(&target_path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<Value>(&raw).map_err(|error| error.to_string())?;
    Ok(Some(parsed))
}
