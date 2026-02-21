use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::fs_scan::SkillEntry;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub node_type: String,
    pub category: Option<String>,
    pub status: Option<String>,
    pub is_moc: bool,
    pub is_ghost: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub kind: String, // "wiki", "related", "scripts"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub node_count: usize,
    pub edge_count: usize,
}

fn get_str(fm: &serde_json::Value, key: &str) -> Option<String> {
    fm.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

fn get_bool(fm: &serde_json::Value, key: &str) -> bool {
    fm.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn get_string_array(fm: &serde_json::Value, key: &str) -> Vec<String> {
    fm.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn normalize_id(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

#[tauri::command]
pub async fn build_graph(skills: Vec<SkillEntry>) -> Result<SkillGraph, String> {
    let mut nodes: Vec<GraphNode> = Vec::new();
    let mut edges: Vec<GraphEdge> = Vec::new();
    let mut known_ids: HashMap<String, bool> = HashMap::new();

    // First pass: create nodes
    for skill in &skills {
        let fm = match &skill.frontmatter {
            Some(fm) => fm,
            None => continue,
        };

        let id = normalize_id(&skill.name);
        if id.is_empty() {
            continue;
        }

        let node_type = get_str(fm, "type").unwrap_or_else(|| "skill".to_string());
        let is_moc = get_bool(fm, "moc");

        nodes.push(GraphNode {
            id: id.clone(),
            label: skill.name.clone(),
            node_type: if is_moc {
                "moc".to_string()
            } else {
                node_type
            },
            category: get_str(fm, "category"),
            status: get_str(fm, "status"),
            is_moc,
            is_ghost: false,
        });

        known_ids.insert(id, true);
    }

    // Second pass: create edges
    for skill in &skills {
        let fm = match &skill.frontmatter {
            Some(fm) => fm,
            None => continue,
        };

        let source_id = normalize_id(&skill.name);
        if source_id.is_empty() {
            continue;
        }

        // related[] → directed edges
        for target_name in get_string_array(fm, "related") {
            let target_id = normalize_id(&target_name);
            if target_id.is_empty() {
                continue;
            }

            // Create ghost node if target unknown
            if !known_ids.contains_key(&target_id) {
                nodes.push(GraphNode {
                    id: target_id.clone(),
                    label: target_name,
                    node_type: "unresolved".to_string(),
                    category: None,
                    status: None,
                    is_moc: false,
                    is_ghost: true,
                });
                known_ids.insert(target_id.clone(), true);
            }

            edges.push(GraphEdge {
                source: source_id.clone(),
                target: target_id,
                kind: "related".to_string(),
            });
        }

        // scripts[] → script edges
        for script_path in get_string_array(fm, "scripts") {
            let script_id = format!("script:{}", script_path.trim());

            if !known_ids.contains_key(&script_id) {
                nodes.push(GraphNode {
                    id: script_id.clone(),
                    label: script_path
                        .rsplit('/')
                        .next()
                        .unwrap_or(&script_path)
                        .to_string(),
                    node_type: "script".to_string(),
                    category: None,
                    status: None,
                    is_moc: false,
                    is_ghost: false,
                });
                known_ids.insert(script_id.clone(), true);
            }

            edges.push(GraphEdge {
                source: source_id.clone(),
                target: script_id,
                kind: "scripts".to_string(),
            });
        }
    }

    let node_count = nodes.len();
    let edge_count = edges.len();

    Ok(SkillGraph {
        nodes,
        edges,
        node_count,
        edge_count,
    })
}
