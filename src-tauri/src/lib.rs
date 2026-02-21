mod fs_scan;
mod graph_builder;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            fs_scan::scan_folder,
            fs_scan::read_skill_file,
            graph_builder::build_graph,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
