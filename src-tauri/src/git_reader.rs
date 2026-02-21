//! git_reader.rs — Desktop git log and diff reader.
//!
//! Reads from the `autogit/tracking` shadow branch for the change-stream
//! sidebar and diff viewer.  Uses CLI bridge (`std::process::Command`) for
//! one-off reads — acceptable per the architecture decision in
//! `reports/desktop-research.md` (daemon path is the high-frequency path
//! where performance matters; viewer reads are user-initiated, once each).
//!
//! Tauri commands exposed:
//!   - `git_log`  → list of commits on autogit/tracking filtered to a subtree
//!   - `git_diff` → unified-diff patch for one commit (or between two commits)

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// One entry in the change-stream timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    /// Full 40-char SHA.
    pub sha: String,
    /// Unix timestamp (seconds since epoch).
    pub timestamp: u64,
    /// ISO-8601 datetime string for display (e.g. "2026-02-21T17:30:00+00:00").
    pub datetime: String,
    /// Short commit message (subject line only).
    pub message: String,
    /// Paths changed in this commit (relative to repo root).
    pub files_changed: Vec<String>,
}

/// Result of a git diff operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    /// Unified diff patch text. Empty when `is_binary` is true.
    pub patch: String,
    /// True when the file is binary and diff is unavailable.
    pub is_binary: bool,
    /// Error message, if the diff command failed.
    pub error: Option<String>,
}

/// Container returned when the viewer queries a path with no git history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogResult {
    /// False when no `.git` was found above the given path.
    pub is_git_repo: bool,
    pub commits: Vec<CommitInfo>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Return the commit log for `autogit/tracking` filtered to `subtree_path`.
///
/// `repo_path`    — absolute path to the git repository root.
/// `subtree_path` — path relative to `repo_path`; `None` means whole repo.
/// `limit`        — maximum number of commits to return (default 100).
///
/// Returns `LogResult { is_git_repo: false, commits: [] }` when no git repo
/// is found above `repo_path`.
#[tauri::command]
pub fn git_log(repo_path: String, subtree_path: Option<String>, limit: Option<usize>) -> LogResult {
    let root = PathBuf::from(&repo_path);

    if !root.join(".git").is_dir() {
        return LogResult {
            is_git_repo: false,
            commits: vec![],
        };
    }

    let cap = limit.unwrap_or(100).min(2000);

    // Separator-trick: inject COMMIT_SEP before each commit's metadata block
    // so the output can be split cleanly, even when file list is empty.
    let mut owned_args = vec![
        "log".to_string(),
        "autogit/tracking".to_string(),
        "--name-only".to_string(),
        format!("-n{}", cap),
        format!("--format=COMMIT_SEP{}%n%H%n%at%n%aI%n%s%n", ""),
    ];

    if let Some(ref sp) = subtree_path {
        if !sp.is_empty() {
            owned_args.push("--".to_string());
            owned_args.push(sp.clone());
        }
    }

    let owned_args_refs: Vec<&str> = owned_args.iter().map(|s| s.as_str()).collect();
    let output = match Command::new("git")
        .current_dir(&root)
        .args(&owned_args_refs)
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[git_log] command error: {e}");
            return LogResult {
                is_git_repo: true,
                commits: vec![],
            };
        }
    };

    if !output.status.success() {
        // autogit/tracking may not exist yet
        return LogResult {
            is_git_repo: true,
            commits: vec![],
        };
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let commits = parse_git_log_output(&text);

    LogResult {
        is_git_repo: true,
        commits,
    }
}

/// Return the unified diff patch for a single commit or between two commits.
///
/// `repo_path`  — absolute path to the repository root.
/// `sha`        — the commit SHA to show (shows `sha^..sha`).
/// `sha2`       — optional second SHA for range diff (`sha..sha2`).
/// `file_path`  — optional file filter (relative to repo root).
#[tauri::command]
pub fn git_diff(
    repo_path: String,
    sha: String,
    sha2: Option<String>,
    file_path: Option<String>,
) -> DiffResult {
    let root = PathBuf::from(&repo_path);

    if !root.join(".git").is_dir() {
        return DiffResult {
            patch: String::new(),
            is_binary: false,
            error: Some("Not a git repository".to_string()),
        };
    }

    // Range: if sha2 is provided use sha..sha2, else sha^..sha
    let range = if let Some(ref s2) = sha2 {
        format!("{sha}..{s2}")
    } else {
        format!("{sha}^..{sha}")
    };

    let mut args = vec!["diff".to_string(), "--unified=3".to_string(), range];

    if let Some(ref fp) = file_path {
        if !fp.is_empty() {
            args.push("--".to_string());
            args.push(fp.clone());
        }
    }

    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = match Command::new("git")
        .current_dir(&root)
        .args(&args_refs)
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return DiffResult {
                patch: String::new(),
                is_binary: false,
                error: Some(format!("git diff failed: {e}")),
            };
        }
    };

    let patch = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Detect binary file indicator in patch output
    let is_binary = patch.contains("Binary files")
        || patch.contains("binary file")
        || patch.is_empty() && stderr.contains("binary");

    if !output.status.success() && !is_binary {
        return DiffResult {
            patch: String::new(),
            is_binary: false,
            error: Some(stderr.trim().to_string()),
        };
    }

    DiffResult {
        patch: if is_binary { String::new() } else { patch },
        is_binary,
        error: None,
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Parse the output of `git log --name-only --format=COMMIT_SEP\n%H\n%at\n%aI\n%s\n`
fn parse_git_log_output(text: &str) -> Vec<CommitInfo> {
    let mut commits = Vec::new();
    // Split on our custom separator line
    let blocks: Vec<&str> = text.split("COMMIT_SEP").collect();

    for block in blocks {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }
        let mut lines = block.lines();
        let sha = lines.next().unwrap_or("").trim().to_string();
        if sha.is_empty() || sha.len() < 7 {
            continue;
        }
        let timestamp_str = lines.next().unwrap_or("").trim();
        let timestamp: u64 = timestamp_str.parse().unwrap_or(0);
        let datetime = lines.next().unwrap_or("").trim().to_string();
        let message = lines.next().unwrap_or("").trim().to_string();

        // Remaining non-empty lines are changed file paths
        let files_changed: Vec<String> = lines
            .filter(|l| !l.trim().is_empty())
            .map(|l| l.trim().to_string())
            .collect();

        commits.push(CommitInfo {
            sha,
            timestamp,
            datetime,
            message,
            files_changed,
        });
    }

    commits
}
