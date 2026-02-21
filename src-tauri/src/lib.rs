mod autogit;
mod file_watch;
mod fs_scan;
mod git_reader;
mod graph_builder;
mod theme_config;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .manage(autogit::AutogitDaemonManager::default())
        .manage(file_watch::DirectoryWatcherManager::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let state = window.state::<file_watch::DirectoryWatcherManager>();
                file_watch::cleanup_window_watcher(&state, window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            fs_scan::scan_folder,
            fs_scan::scan_folder_index,
            fs_scan::read_skill_file,
            fs_scan::write_skill_file,
            graph_builder::build_graph,
            theme_config::save_theme_config,
            theme_config::load_theme_config,
            autogit::start_autogit_daemon,
            autogit::stop_autogit_daemon,
            autogit::autogit_daemon_status,
            autogit::get_autogit_config,
            autogit::set_autogit_config,
            autogit::detect_git_repo,
            git_reader::git_log,
            git_reader::git_diff,
            file_watch::watch_directory,
            file_watch::unwatch_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
