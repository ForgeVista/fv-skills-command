use notify_debouncer_full::notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, DebouncedEvent};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

const SHADOW_BRANCH: &str = "autogit/tracking";
const SHADOW_REF: &str = "refs/heads/autogit/tracking";
const AUTOGIT_INDEX_PATH: &str = ".git/autogit-index";
const AUTOGIT_CONFIG_FILE: &str = ".autogit.json";
const AUTOGIT_LOG_FILE: &str = ".autogit.log";
const DEBOUNCE_SECONDS: u64 = 5;

// Error recovery parameters
const LOCK_FILE_MAX_RETRIES: u32 = 5;
const LOCK_FILE_RETRY_SLEEP_SECS: u64 = 2;
const COMMIT_MAX_RETRIES: u32 = 3;
const COMMIT_RETRY_SLEEP_SECS: u64 = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutogitConfig {
    pub interval_seconds: u64,
    pub exclude: Vec<String>,
    pub enabled: bool,
}

impl Default for AutogitConfig {
    fn default() -> Self {
        Self {
            interval_seconds: 60,
            exclude: vec![
                "node_modules".to_string(),
                ".git".to_string(),
                "dist".to_string(),
                "build".to_string(),
                "target".to_string(),
                ".next".to_string(),
            ],
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AutogitDaemonStatus {
    pub running: bool,
    pub repo_root: Option<String>,
    pub watch_path: Option<String>,
    pub commits_written: u64,
    pub last_commit: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Default)]
struct RuntimeState {
    commits_written: u64,
    last_commit: Option<String>,
    last_error: Option<String>,
}

struct AutogitDaemonHandle {
    repo_root: PathBuf,
    watch_path: PathBuf,
    stop_tx: Sender<()>,
    join_handle: JoinHandle<()>,
    runtime_state: Arc<Mutex<RuntimeState>>,
}

#[derive(Default)]
pub struct AutogitDaemonManager {
    inner: Mutex<Option<AutogitDaemonHandle>>,
}

#[tauri::command]
pub async fn start_autogit_daemon(
    state: State<'_, AutogitDaemonManager>,
    watch_path: String,
) -> Result<AutogitDaemonStatus, String> {
    let normalized_watch_path = normalize_watch_path(&watch_path)?;
    let repo_root = find_git_root(&normalized_watch_path).ok_or_else(|| {
        format!(
            "No git repository found from {}",
            normalized_watch_path.display()
        )
    })?;

    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "autogit daemon state lock poisoned".to_string())?;
    if let Some(handle) = guard.as_ref() {
        return Ok(status_from_handle(handle, true));
    }

    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let runtime_state = Arc::new(Mutex::new(RuntimeState::default()));

    let thread_repo_root = repo_root.clone();
    let thread_watch_path = normalized_watch_path.clone();
    let thread_runtime_state = Arc::clone(&runtime_state);
    let join_handle = thread::spawn(move || {
        run_autogit_daemon(
            thread_repo_root,
            thread_watch_path,
            stop_rx,
            thread_runtime_state,
        )
    });

    let handle = AutogitDaemonHandle {
        repo_root,
        watch_path: normalized_watch_path,
        stop_tx,
        join_handle,
        runtime_state,
    };
    let status = status_from_handle(&handle, true);
    *guard = Some(handle);
    Ok(status)
}

#[tauri::command]
pub async fn stop_autogit_daemon(
    state: State<'_, AutogitDaemonManager>,
) -> Result<AutogitDaemonStatus, String> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "autogit daemon state lock poisoned".to_string())?;

    let Some(handle) = guard.take() else {
        return Ok(AutogitDaemonStatus {
            running: false,
            repo_root: None,
            watch_path: None,
            commits_written: 0,
            last_commit: None,
            last_error: None,
        });
    };

    let _ = handle.stop_tx.send(());
    let _ = handle.join_handle.join();
    Ok(status_from_parts(
        false,
        Some(&handle.repo_root),
        Some(&handle.watch_path),
        &handle.runtime_state,
    ))
}

#[tauri::command]
pub async fn autogit_daemon_status(
    state: State<'_, AutogitDaemonManager>,
) -> Result<AutogitDaemonStatus, String> {
    let guard = state
        .inner
        .lock()
        .map_err(|_| "autogit daemon state lock poisoned".to_string())?;

    let Some(handle) = guard.as_ref() else {
        return Ok(AutogitDaemonStatus {
            running: false,
            repo_root: None,
            watch_path: None,
            commits_written: 0,
            last_commit: None,
            last_error: None,
        });
    };

    Ok(status_from_handle(handle, true))
}

// ---------------------------------------------------------------------------
// Tauri commands — config read/write
// ---------------------------------------------------------------------------

/// Return the `.autogit.json` config for a repo.
///
/// If no config file exists a default is created and returned.
#[tauri::command]
pub async fn get_autogit_config(repo_root: String) -> Result<AutogitConfig, String> {
    load_or_create_config(&PathBuf::from(repo_root))
}

/// Persist a new `.autogit.json` for a repo.
///
/// The running daemon will detect the file change via the filesystem watcher
/// and hot-reload the updated exclude list and enabled flag automatically.
/// A change to `interval_seconds` takes effect on the next daemon start.
#[tauri::command]
pub async fn set_autogit_config(
    repo_root: String,
    config: AutogitConfig,
) -> Result<AutogitConfig, String> {
    save_autogit_config(&PathBuf::from(repo_root), &config)?;
    Ok(config)
}

// ---------------------------------------------------------------------------
// Internal status helpers
// ---------------------------------------------------------------------------

fn status_from_handle(handle: &AutogitDaemonHandle, running: bool) -> AutogitDaemonStatus {
    status_from_parts(
        running,
        Some(&handle.repo_root),
        Some(&handle.watch_path),
        &handle.runtime_state,
    )
}

fn status_from_parts(
    running: bool,
    repo_root: Option<&Path>,
    watch_path: Option<&Path>,
    runtime_state: &Arc<Mutex<RuntimeState>>,
) -> AutogitDaemonStatus {
    let runtime = runtime_state.lock().ok();
    AutogitDaemonStatus {
        running,
        repo_root: repo_root.map(|path| path.to_string_lossy().to_string()),
        watch_path: watch_path.map(|path| path.to_string_lossy().to_string()),
        commits_written: runtime.as_ref().map(|s| s.commits_written).unwrap_or(0),
        last_commit: runtime.as_ref().and_then(|s| s.last_commit.clone()),
        last_error: runtime.as_ref().and_then(|s| s.last_error.clone()),
    }
}

fn normalize_watch_path(raw: &str) -> Result<PathBuf, String> {
    let input = PathBuf::from(raw);
    if !input.exists() {
        return Err(format!("Watch path does not exist: {}", raw));
    }

    let directory = if input.is_file() {
        input
            .parent()
            .ok_or_else(|| format!("Unable to derive parent directory for {}", raw))?
            .to_path_buf()
    } else {
        input
    };

    std::fs::canonicalize(directory).map_err(|error| error.to_string())
}

fn find_git_root(start: &Path) -> Option<PathBuf> {
    let mut cursor = Some(start.to_path_buf());
    while let Some(path) = cursor {
        if path.join(".git").exists() {
            return Some(path);
        }
        cursor = path.parent().map(|parent| parent.to_path_buf());
    }
    None
}

fn run_autogit_daemon(
    repo_root: PathBuf,
    watch_path: PathBuf,
    stop_rx: Receiver<()>,
    runtime_state: Arc<Mutex<RuntimeState>>,
) {
    if let Err(error) = ensure_shadow_branch(&repo_root) {
        set_last_error(&runtime_state, error);
        return;
    }

    let mut config = match load_or_create_config(&repo_root) {
        Ok(config) => config,
        Err(error) => {
            set_last_error(&runtime_state, error);
            return;
        }
    };
    let mut last_commit_ts: u64 = 0;
    let mut pending_paths: HashSet<PathBuf> = HashSet::new();

    let (event_tx, event_rx) = mpsc::channel::<DebounceEventResult>();
    let mut debouncer =
        match new_debouncer(Duration::from_secs(DEBOUNCE_SECONDS), None, move |result| {
            let _ = event_tx.send(result);
        }) {
            Ok(debouncer) => debouncer,
            Err(error) => {
                set_last_error(
                    &runtime_state,
                    format!("Failed to create watcher: {}", error),
                );
                return;
            }
        };

    if let Err(error) = debouncer.watch(&watch_path, RecursiveMode::Recursive) {
        set_last_error(
            &runtime_state,
            format!("Failed to watch {}: {}", watch_path.display(), error),
        );
        return;
    }

    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }

        match event_rx.recv_timeout(Duration::from_millis(500)) {
            Ok(Ok(events)) => {
                let config_touched = events_touch_config_file(&repo_root, &events);
                let changed_paths = collect_changed_paths(&repo_root, events, &config.exclude);
                pending_paths.extend(changed_paths);

                if config_touched {
                    match load_or_create_config(&repo_root) {
                        Ok(updated_config) => config = updated_config,
                        Err(error) => set_last_error(&runtime_state, error),
                    }
                }
            }
            Ok(Err(errors)) => {
                let message = errors
                    .into_iter()
                    .map(|error| error.to_string())
                    .collect::<Vec<_>>()
                    .join("; ");
                set_last_error(&runtime_state, format!("Watcher event error: {}", message));
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }

        if !config.enabled {
            pending_paths.clear();
            continue;
        }

        if pending_paths.is_empty() {
            continue;
        }

        let now = current_timestamp_seconds();
        let min_interval = config.interval_seconds.max(1);
        if last_commit_ts > 0 && now.saturating_sub(last_commit_ts) < min_interval {
            continue;
        }

        match commit_with_retry(&repo_root, &pending_paths, &runtime_state) {
            Ok(Some(commit_hash)) => record_commit(&runtime_state, commit_hash),
            Ok(None) => {}
            Err(error) => set_last_error(&runtime_state, error),
        }
        // Always clear pending paths after an attempt (success or exhausted retries)
        // to avoid re-committing the same stale batch on the next interval.
        pending_paths.clear();
        last_commit_ts = now;
    }
}

fn collect_changed_paths(
    repo_root: &Path,
    events: Vec<DebouncedEvent>,
    config_exclude: &[String],
) -> HashSet<PathBuf> {
    let mut changed = HashSet::new();

    for debounced in events {
        for path in debounced.event.paths {
            let Some(relative_path) = make_repo_relative(repo_root, &path) else {
                continue;
            };

            if relative_path.as_os_str().is_empty()
                || should_exclude_path(&relative_path, config_exclude)
            {
                continue;
            }

            changed.insert(relative_path);
        }
    }

    changed
}

fn make_repo_relative(repo_root: &Path, path: &Path) -> Option<PathBuf> {
    if path.is_relative() {
        return Some(path.to_path_buf());
    }

    if let Ok(relative) = path.strip_prefix(repo_root) {
        return Some(relative.to_path_buf());
    }

    if let Ok(canonicalized) = std::fs::canonicalize(path) {
        if let Ok(relative) = canonicalized.strip_prefix(repo_root) {
            return Some(relative.to_path_buf());
        }
    }

    None
}

fn events_touch_config_file(repo_root: &Path, events: &[DebouncedEvent]) -> bool {
    let config_path = repo_root.join(AUTOGIT_CONFIG_FILE);
    events
        .iter()
        .flat_map(|event| event.event.paths.iter())
        .any(|event_path| event_path == &config_path)
}

fn should_exclude_path(path: &Path, config_exclude: &[String]) -> bool {
    let component_blacklist = [
        ".git",
        "node_modules",
        "target",
        "dist",
        "build",
        ".next",
        "__pycache__",
    ];

    if path.components().any(|component| {
        if let Component::Normal(value) = component {
            component_blacklist.iter().any(|blocked| value == *blocked)
        } else {
            false
        }
    }) {
        return true;
    }

    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    if file_name == ".DS_Store" || file_name.ends_with(".pyc") || file_name.ends_with(".log") {
        return true;
    }

    let normalized_path = path.to_string_lossy().replace('\\', "/");
    config_exclude.iter().any(|raw| {
        let pattern = raw.trim().replace('\\', "/");
        if pattern.is_empty() {
            return false;
        }

        normalized_path == pattern
            || normalized_path.starts_with(&format!("{}/", pattern))
            || path.components().any(|component| {
                if let Component::Normal(value) = component {
                    value == pattern.as_str()
                } else {
                    false
                }
            })
    })
}

/// Append a timestamped error line to `.autogit.log` in `repo_root`.
fn log_autogit_error(repo_root: &Path, message: &str) {
    use std::io::Write;
    let log_path = repo_root.join(AUTOGIT_LOG_FILE);
    let timestamp = current_timestamp_seconds();
    let line = format!("[{}] ERROR: {}\n", timestamp, message);
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Wait for `.git/index.lock` to disappear (up to LOCK_FILE_MAX_RETRIES × 2 s).
///
/// Returns `true` if the lock was released, `false` if it persisted.
fn wait_for_git_lock(repo_root: &Path) -> bool {
    let lock_path = repo_root.join(".git").join("index.lock");
    for _ in 0..LOCK_FILE_MAX_RETRIES {
        if !lock_path.exists() {
            return true;
        }
        thread::sleep(Duration::from_secs(LOCK_FILE_RETRY_SLEEP_SECS));
    }
    !lock_path.exists()
}

/// Commit with lock-file awareness and retry-on-failure logic.
///
/// 1. If `.git/index.lock` exists, waits up to
///    `LOCK_FILE_MAX_RETRIES × LOCK_FILE_RETRY_SLEEP_SECS` seconds.
/// 2. Attempts `commit_shadow_batch` up to `COMMIT_MAX_RETRIES` times,
///    sleeping `COMMIT_RETRY_SLEEP_SECS` between attempts.
/// 3. Each failure is written to `.autogit.log` with a Unix timestamp.
fn commit_with_retry(
    repo_root: &Path,
    changed_paths: &HashSet<PathBuf>,
    runtime_state: &Arc<Mutex<RuntimeState>>,
) -> Result<Option<String>, String> {
    // Respect any existing lock file before touching the index.
    let lock_path = repo_root.join(".git").join("index.lock");
    if lock_path.exists() {
        if !wait_for_git_lock(repo_root) {
            let msg =
                "git index.lock persists after retries; skipping this commit batch".to_string();
            log_autogit_error(repo_root, &msg);
            return Err(msg);
        }
    }

    let mut last_err = String::new();
    for attempt in 0..COMMIT_MAX_RETRIES {
        match commit_shadow_batch(repo_root, changed_paths) {
            Ok(result) => return Ok(result),
            Err(error) => {
                last_err = error.clone();
                let msg = format!(
                    "commit attempt {}/{} failed: {}",
                    attempt + 1,
                    COMMIT_MAX_RETRIES,
                    error
                );
                log_autogit_error(repo_root, &msg);
                set_last_error(runtime_state, error);
                if attempt + 1 < COMMIT_MAX_RETRIES {
                    thread::sleep(Duration::from_secs(COMMIT_RETRY_SLEEP_SECS));
                }
            }
        }
    }
    Err(last_err)
}

fn save_autogit_config(repo_root: &Path, config: &AutogitConfig) -> Result<(), String> {
    let config_path = repo_root.join(AUTOGIT_CONFIG_FILE);
    let payload = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize autogit config: {e}"))?;
    std::fs::write(&config_path, payload)
        .map_err(|e| format!("Failed to write {}: {e}", AUTOGIT_CONFIG_FILE))
}

fn load_or_create_config(repo_root: &Path) -> Result<AutogitConfig, String> {
    let config_path = repo_root.join(AUTOGIT_CONFIG_FILE);
    if !config_path.exists() {
        let default_config = AutogitConfig::default();
        let payload = serde_json::to_string_pretty(&default_config)
            .map_err(|error| format!("Failed to serialize default autogit config: {}", error))?;
        std::fs::write(&config_path, payload)
            .map_err(|error| format!("Failed to create {}: {}", AUTOGIT_CONFIG_FILE, error))?;
        return Ok(default_config);
    }

    let raw = std::fs::read_to_string(&config_path)
        .map_err(|error| format!("Failed to read {}: {}", AUTOGIT_CONFIG_FILE, error))?;

    let mut config: AutogitConfig = serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse {}: {}", AUTOGIT_CONFIG_FILE, error))?;

    if config.interval_seconds == 0 {
        config.interval_seconds = 1;
    }

    Ok(config)
}

fn commit_shadow_batch(
    repo_root: &Path,
    changed_paths: &HashSet<PathBuf>,
) -> Result<Option<String>, String> {
    ensure_shadow_branch(repo_root)?;

    let index_path = repo_root.join(AUTOGIT_INDEX_PATH);
    let index_env_value = index_path.to_string_lossy().to_string();
    let index_env = [("GIT_INDEX_FILE", index_env_value.as_str())];

    let parent_commit = run_git(repo_root, &["rev-parse", SHADOW_BRANCH], &[])?;
    run_git(repo_root, &["read-tree", SHADOW_BRANCH], &index_env)?;

    for changed_path in changed_paths {
        let relative = changed_path.to_string_lossy().to_string();
        run_git(repo_root, &["add", "-A", "--", &relative], &index_env)?;
    }

    let tree_hash = run_git(repo_root, &["write-tree"], &index_env)?;
    let parent_tree = run_git(
        repo_root,
        &["rev-parse", &format!("{}^{{tree}}", SHADOW_BRANCH)],
        &[],
    )?;

    if tree_hash == parent_tree {
        return Ok(None);
    }

    let timestamp = current_timestamp_seconds();
    let commit_message = format!("autogit: {}", timestamp);
    let author_date = format!("{} +0000", timestamp);
    let commit_hash = run_git(
        repo_root,
        &[
            "commit-tree",
            &tree_hash,
            "-p",
            &parent_commit,
            "-m",
            &commit_message,
        ],
        &[
            ("GIT_AUTHOR_NAME", "autogit"),
            ("GIT_AUTHOR_EMAIL", "autogit@local"),
            ("GIT_COMMITTER_NAME", "autogit"),
            ("GIT_COMMITTER_EMAIL", "autogit@local"),
            ("GIT_AUTHOR_DATE", author_date.as_str()),
            ("GIT_COMMITTER_DATE", author_date.as_str()),
        ],
    )?;

    run_git(
        repo_root,
        &["update-ref", SHADOW_REF, &commit_hash, &parent_commit],
        &[],
    )?;

    Ok(Some(commit_hash))
}

fn ensure_shadow_branch(repo_root: &Path) -> Result<(), String> {
    let branch_exists = git_command_success(
        repo_root,
        &["show-ref", "--verify", "--quiet", SHADOW_REF],
        &[],
    );

    if !branch_exists {
        run_git(repo_root, &["branch", SHADOW_BRANCH, "HEAD"], &[])?;
    }

    // Install/update the pre-push hook on every init call (idempotent).
    install_pre_push_hook(repo_root)?;

    Ok(())
}

/// Install or merge the autogit never-push guard into `.git/hooks/pre-push`.
///
/// The guard rejects any push that includes an `autogit/*` ref.  If a
/// pre-push hook already exists, the guard is appended only when not already
/// present (idempotent).
fn install_pre_push_hook(repo_root: &Path) -> Result<(), String> {
    let hooks_dir = repo_root.join(".git").join("hooks");
    let hook_path = hooks_dir.join("pre-push");

    const GUARD_MARKER: &str = "# autogit-guard";
    const GUARD_BODY: &str = r#"# autogit-guard — never push shadow branches
while IFS=' ' read -r local_ref _local_sha _remote_ref _remote_sha; do
  case "$local_ref" in
    refs/heads/autogit/*)
      echo "ERROR: autogit shadow branches are LOCAL ONLY. Refusing to push: $local_ref" >&2
      exit 1
      ;;
  esac
done
"#;

    // Create hooks dir if it doesn't exist (bare repos, etc.)
    if !hooks_dir.is_dir() {
        std::fs::create_dir_all(&hooks_dir).map_err(|e| format!("create hooks dir: {e}"))?;
    }

    let existing = if hook_path.is_file() {
        std::fs::read_to_string(&hook_path).map_err(|e| format!("read pre-push hook: {e}"))?
    } else {
        String::new()
    };

    // Idempotent: skip if guard already present.
    if existing.contains(GUARD_MARKER) {
        return Ok(());
    }

    let new_content = if existing.is_empty() {
        format!("#!/bin/sh\n{GUARD_BODY}")
    } else {
        format!("{existing}\n{GUARD_BODY}")
    };

    std::fs::write(&hook_path, new_content).map_err(|e| format!("write pre-push hook: {e}"))?;

    // Ensure the hook is executable.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&hook_path)
            .map_err(|e| format!("hook metadata: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&hook_path, perms).map_err(|e| format!("chmod hook: {e}"))?;
    }

    Ok(())
}

fn git_command_success(repo_root: &Path, args: &[&str], envs: &[(&str, &str)]) -> bool {
    let mut command = Command::new("git");
    command.current_dir(repo_root).args(args);
    for (key, value) in envs {
        command.env(key, value);
    }

    command
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn run_git(repo_root: &Path, args: &[&str], envs: &[(&str, &str)]) -> Result<String, String> {
    let mut command = Command::new("git");
    command.current_dir(repo_root).args(args);
    for (key, value) in envs {
        command.env(key, value);
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to execute git {}: {}", args.join(" "), error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "unknown git error".to_string()
        };

        return Err(format!("git {} failed: {}", args.join(" "), detail));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn current_timestamp_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn record_commit(runtime_state: &Arc<Mutex<RuntimeState>>, commit_hash: String) {
    if let Ok(mut state) = runtime_state.lock() {
        state.commits_written += 1;
        state.last_commit = Some(commit_hash);
        state.last_error = None;
    }
}

fn set_last_error(runtime_state: &Arc<Mutex<RuntimeState>>, message: String) {
    if let Ok(mut state) = runtime_state.lock() {
        state.last_error = Some(message);
    }
}

// ---------------------------------------------------------------------------
// Git auto-detection (shared by autogit daemon and viewer API)
// ---------------------------------------------------------------------------

/// Result of walking up the directory tree searching for `.git/`.
#[derive(Debug, Clone, Serialize)]
pub struct GitRepoInfo {
    /// True if a `.git` directory was found anywhere above `entry_path`.
    pub is_git_repo: bool,
    /// Absolute path to the repository root (parent of `.git/`).
    pub repo_root: Option<String>,
    /// `entry_path` expressed relative to `repo_root`.
    pub entry_relative_path: Option<String>,
}

/// Walk up from `entry_path` to locate the nearest `.git/` directory.
///
/// Handles:
/// - Submodules: returns the *innermost* `.git` (nearest to entry_path).
/// - No-git: returns `is_git_repo: false`, both `Option` fields `None`.
/// - File paths: treated as their parent directory.
#[tauri::command]
pub fn detect_git_repo(entry_path: String) -> GitRepoInfo {
    let raw = PathBuf::from(&entry_path);
    // If the path is a file, start the walk from its parent dir.
    let start = if raw.is_file() {
        raw.parent().map(|p| p.to_path_buf()).unwrap_or(raw.clone())
    } else {
        raw.clone()
    };

    match find_git_root(&start) {
        Some(root) => {
            // Make entry_path relative to root; fall back to empty string if
            // it's exactly equal to the root.
            let rel = start
                .strip_prefix(&root)
                .ok()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            GitRepoInfo {
                is_git_repo: true,
                repo_root: Some(root.to_string_lossy().to_string()),
                entry_relative_path: Some(rel),
            }
        }
        None => GitRepoInfo {
            is_git_repo: false,
            repo_root: None,
            entry_relative_path: None,
        },
    }
}
