use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillEntry {
    pub path: String,
    pub name: String,
    pub frontmatter: Option<serde_json::Value>,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub skills: Vec<SkillEntry>,
    pub skipped: usize,
    pub errors: usize,
}

fn extract_frontmatter(content: &str) -> (Option<serde_json::Value>, &str) {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return (None, content);
    }

    let after_first = &trimmed[3..];
    if let Some(end_idx) = after_first.find("\n---") {
        let yaml_str = &after_first[..end_idx];
        let body_start = end_idx + 4; // skip "\n---"
        let body = after_first[body_start..].trim_start_matches('\n');

        match serde_yaml::from_str::<serde_yaml::Value>(yaml_str) {
            Ok(yaml_val) => {
                let json_val = serde_json::to_value(&yaml_val).unwrap_or(serde_json::Value::Null);
                (Some(json_val), body)
            }
            Err(_) => (None, content), // malformed YAML — skip frontmatter silently
        }
    } else {
        (None, content)
    }
}

fn derive_name(frontmatter: &Option<serde_json::Value>, file_stem: &str) -> String {
    if let Some(fm) = frontmatter {
        if let Some(name) = fm.get("name").and_then(|v| v.as_str()) {
            if !name.trim().is_empty() {
                return name.trim().to_string();
            }
        }
    }
    file_stem.to_string()
}

#[tauri::command]
pub async fn scan_folder(folder_path: String) -> Result<ScanResult, String> {
    let path = Path::new(&folder_path);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", folder_path));
    }

    let mut skills = Vec::new();
    let mut skipped = 0usize;
    let mut errors = 0usize;

    for entry in WalkDir::new(path).follow_links(true).into_iter() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => {
                errors += 1;
                continue;
            }
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let file_path = entry.path();
        let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "md" {
            skipped += 1;
            continue;
        }

        let content = match std::fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => {
                errors += 1;
                continue;
            }
        };

        let (frontmatter, body) = extract_frontmatter(&content);

        // Skip files with no frontmatter (resilience rule)
        if frontmatter.is_none() {
            skipped += 1;
            continue;
        }

        let file_stem = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");

        let name = derive_name(&frontmatter, file_stem);

        skills.push(SkillEntry {
            path: file_path.to_string_lossy().to_string(),
            name,
            frontmatter,
            body: body.to_string(),
        });
    }

    Ok(ScanResult {
        skills,
        skipped,
        errors,
    })
}

#[tauri::command]
pub async fn read_skill_file(file_path: String) -> Result<SkillEntry, String> {
    let path = Path::new(&file_path);
    if !path.is_file() {
        return Err(format!("Not a file: {}", file_path));
    }

    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let (frontmatter, body) = extract_frontmatter(&content);
    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    let name = derive_name(&frontmatter, file_stem);

    Ok(SkillEntry {
        path: file_path,
        name,
        frontmatter,
        body: body.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_frontmatter_valid() {
        let content = "---\nname: test-skill\ntype: skill\n---\n# Body\nHello";
        let (fm, body) = extract_frontmatter(content);
        assert!(fm.is_some());
        assert_eq!(fm.unwrap()["name"], "test-skill");
        assert!(body.starts_with("# Body"));
    }

    #[test]
    fn test_extract_frontmatter_none() {
        let content = "# Just a heading\nNo frontmatter here.";
        let (fm, body) = extract_frontmatter(content);
        assert!(fm.is_none());
        assert_eq!(body, content);
    }

    #[test]
    fn test_derive_name_from_frontmatter() {
        let fm = serde_json::json!({"name": "my-skill"});
        assert_eq!(derive_name(&Some(fm), "fallback"), "my-skill");
    }

    #[test]
    fn test_derive_name_fallback() {
        assert_eq!(derive_name(&None, "file-stem"), "file-stem");
    }
}
