use notify_debouncer_full::notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, DebouncedEvent};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{Emitter, State, Window};

const WATCH_DEBOUNCE_SECONDS: u64 = 2;

#[derive(Debug, Clone, Serialize)]
pub struct FileChangedPayload {
    pub path: String,
    pub event_type: String,
}

struct DirectoryWatcherHandle {
    stop_tx: Sender<()>,
    join_handle: JoinHandle<()>,
}

#[derive(Default)]
pub struct DirectoryWatcherManager {
    watchers: Mutex<HashMap<String, DirectoryWatcherHandle>>,
}

#[tauri::command]
pub async fn watch_directory(
    window: Window,
    state: State<'_, DirectoryWatcherManager>,
    path: String,
) -> Result<String, String> {
    let watch_path = normalize_watch_path(&path)?;
    stop_watcher_for_label(&state, window.label());

    let window_clone = window.clone();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let join_handle =
        thread::spawn(move || run_directory_watcher(window_clone, watch_path, stop_rx));

    let label = window.label().to_string();
    let mut guard = state
        .watchers
        .lock()
        .map_err(|_| "watcher state lock poisoned".to_string())?;
    guard.insert(
        label,
        DirectoryWatcherHandle {
            stop_tx,
            join_handle,
        },
    );

    Ok("watcher_started".to_string())
}

#[tauri::command]
pub async fn unwatch_directory(
    window: Window,
    state: State<'_, DirectoryWatcherManager>,
) -> Result<String, String> {
    stop_watcher_for_label(&state, window.label());
    Ok("watcher_stopped".to_string())
}

pub fn cleanup_window_watcher(state: &DirectoryWatcherManager, window_label: &str) {
    stop_watcher_for_label_raw(state, window_label);
}

fn stop_watcher_for_label(state: &State<'_, DirectoryWatcherManager>, window_label: &str) {
    stop_watcher_for_label_raw(state, window_label);
}

fn stop_watcher_for_label_raw(state: &DirectoryWatcherManager, window_label: &str) {
    let handle = match state.watchers.lock() {
        Ok(mut guard) => guard.remove(window_label),
        Err(_) => None,
    };

    if let Some(handle) = handle {
        let _ = handle.stop_tx.send(());
        let _ = handle.join_handle.join();
    }
}

fn run_directory_watcher(window: Window, watch_path: PathBuf, stop_rx: Receiver<()>) {
    let (event_tx, event_rx) = mpsc::channel::<DebounceEventResult>();
    let mut debouncer = match new_debouncer(
        Duration::from_secs(WATCH_DEBOUNCE_SECONDS),
        None,
        move |result| {
            let _ = event_tx.send(result);
        },
    ) {
        Ok(debouncer) => debouncer,
        Err(error) => {
            let _ = window.emit(
                "file-changed",
                FileChangedPayload {
                    path: watch_path.to_string_lossy().to_string(),
                    event_type: format!("watcher-error: {}", error),
                },
            );
            return;
        }
    };

    if let Err(error) = debouncer.watch(&watch_path, RecursiveMode::Recursive) {
        let _ = window.emit(
            "file-changed",
            FileChangedPayload {
                path: watch_path.to_string_lossy().to_string(),
                event_type: format!("watcher-error: {}", error),
            },
        );
        return;
    }

    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }

        match event_rx.recv_timeout(Duration::from_millis(500)) {
            Ok(Ok(events)) => {
                let payloads = collect_changed_payloads(events);
                for payload in payloads {
                    if window.emit("file-changed", payload).is_err() {
                        return;
                    }
                }
            }
            Ok(Err(errors)) => {
                let message = errors
                    .into_iter()
                    .map(|error| error.to_string())
                    .collect::<Vec<_>>()
                    .join("; ");

                if window
                    .emit(
                        "file-changed",
                        FileChangedPayload {
                            path: watch_path.to_string_lossy().to_string(),
                            event_type: format!("watcher-error: {}", message),
                        },
                    )
                    .is_err()
                {
                    return;
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

fn collect_changed_payloads(events: Vec<DebouncedEvent>) -> Vec<FileChangedPayload> {
    let mut dedupe = HashSet::new();
    let mut payloads = Vec::new();

    for debounced in events {
        let event_type = normalize_event_type(&debounced.event.kind);
        for event_path in debounced.event.paths {
            if should_ignore_path(&event_path) {
                continue;
            }

            let path_str = event_path.to_string_lossy().to_string();
            let key = format!("{}::{}", event_type, path_str);
            if dedupe.insert(key) {
                payloads.push(FileChangedPayload {
                    path: path_str,
                    event_type: event_type.to_string(),
                });
            }
        }
    }

    payloads
}

fn normalize_event_type(kind: &notify_debouncer_full::notify::EventKind) -> &'static str {
    match kind {
        notify_debouncer_full::notify::EventKind::Create(_) => "create",
        notify_debouncer_full::notify::EventKind::Modify(_) => "modify",
        notify_debouncer_full::notify::EventKind::Remove(_) => "remove",
        notify_debouncer_full::notify::EventKind::Access(_) => "access",
        _ => "other",
    }
}

fn normalize_watch_path(raw: &str) -> Result<PathBuf, String> {
    let input = PathBuf::from(raw);
    if !input.exists() {
        return Err(format!("watch path does not exist: {}", raw));
    }

    let directory = if input.is_file() {
        input
            .parent()
            .ok_or_else(|| format!("unable to derive parent directory for {}", raw))?
            .to_path_buf()
    } else {
        input
    };

    std::fs::canonicalize(directory).map_err(|error| error.to_string())
}

fn should_ignore_path(path: &Path) -> bool {
    if path.components().any(|component| {
        if let Component::Normal(value) = component {
            value == ".git"
        } else {
            false
        }
    }) {
        return true;
    }

    false
}
