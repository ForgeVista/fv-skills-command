<script>
  import { store } from '../lib/store.js';

  $: skills = $store.skills || [];
  $: selectedId = $store.selectedSkillId;
  $: folderPath = $store.folderPath || '';
  $: query = ($store.searchQuery || '').toLowerCase();

  // Build tree structure from skill paths
  $: tree = buildTree(skills, folderPath, query);

  // Track expanded directories
  let expanded = new Set();

  function buildTree(skills, rootPath, filter) {
    const root = { name: folderPath ? folderPath.split('/').pop() || 'Skills' : 'Skills', children: {}, files: [] };

    for (const skill of skills) {
      if (filter && !skill.name.toLowerCase().includes(filter)) continue;

      // Derive relative path from skill.path
      let relPath = skill.path || '';
      if (rootPath && relPath.startsWith(rootPath)) {
        relPath = relPath.slice(rootPath.length);
        if (relPath.startsWith('/') || relPath.startsWith('\\')) relPath = relPath.slice(1);
      }

      const parts = relPath.replace(/\\/g, '/').split('/');
      const fileName = parts.pop() || skill.name;

      // Walk tree to correct directory
      let node = root;
      let pathSoFar = '';
      for (const dir of parts) {
        pathSoFar += (pathSoFar ? '/' : '') + dir;
        if (!node.children[dir]) {
          node.children[dir] = { name: dir, path: pathSoFar, children: {}, files: [] };
        }
        node = node.children[dir];
      }

      node.files.push({
        id: skill.id,
        name: skill.name,
        fileName,
        type: skill.type || (skill.frontmatter?.type) || 'skill',
        status: skill.status || (skill.frontmatter?.status) || '',
      });
    }

    return root;
  }

  function toggleDir(path) {
    if (expanded.has(path)) {
      expanded.delete(path);
    } else {
      expanded.add(path);
    }
    expanded = new Set(expanded); // trigger reactivity
  }

  function isExpanded(path) {
    return expanded.has(path);
  }

  // Expand all directories initially when tree changes
  $: if (tree) {
    expandAll(tree, '');
  }

  function expandAll(node, prefix) {
    const dirs = Object.keys(node.children);
    for (const dir of dirs) {
      const path = node.children[dir].path || ((prefix ? prefix + '/' : '') + dir);
      expanded.add(path);
      expandAll(node.children[dir], path);
    }
    expanded = new Set(expanded);
  }

  const TYPE_ICONS = {
    moc: '\u{1F5FA}\uFE0F',
    skill: '\u{1F6E0}\uFE0F',
    subagent: '\u{1F916}',
    hook: '\u{1FA9D}',
    command: '\u26A1',
    script: '\u{1F4DC}',
  };

  function fileIcon(type) {
    return TYPE_ICONS[type] || TYPE_ICONS.skill;
  }

  $: dirCount = Object.keys(tree.children).length;
  $: totalFiles = countFiles(tree);

  function countFiles(node) {
    let count = node.files.length;
    for (const key of Object.keys(node.children)) {
      count += countFiles(node.children[key]);
    }
    return count;
  }
</script>

<aside class="file-tree">
  <div class="file-tree-header">
    <span class="file-tree-title">Files</span>
    <span class="file-count">{totalFiles}</span>
  </div>

  <nav class="tree-list">
    {#if totalFiles === 0}
      <div class="tree-empty">
        <p>No skill files found.</p>
        <p class="tree-empty-hint">Open a folder containing markdown skill files.</p>
      </div>
    {:else}
      <!-- Root-level files -->
      {#each tree.files as file (file.id)}
        <button
          class="tree-file"
          class:active={selectedId === file.id}
          on:click={() => store.selectSkill(file.id)}
        >
          <span class="file-icon">{fileIcon(file.type)}</span>
          <span class="file-name">{file.name}</span>
          {#if file.status === 'beta'}
            <span class="badge">beta</span>
          {/if}
        </button>
      {/each}

      <!-- Directory nodes -->
      {#each Object.entries(tree.children).sort((a, b) => a[0].localeCompare(b[0])) as [dirName, dirNode] (dirName)}
        {@const dirPath = dirNode.path || dirName}
        {@const open = isExpanded(dirPath)}
        <div class="tree-dir">
          <button class="tree-dir-header" on:click={() => toggleDir(dirPath)}>
            <span class="dir-chevron">{open ? '\u25BC' : '\u25B6'}</span>
            <span class="dir-icon">📁</span>
            <span class="dir-name">{dirName}</span>
            <span class="dir-count">{countFiles(dirNode)}</span>
          </button>

          {#if open}
            <div class="tree-dir-children">
              <!-- Nested directories -->
              {#each Object.entries(dirNode.children).sort((a, b) => a[0].localeCompare(b[0])) as [subDirName, subDirNode] (subDirName)}
                {@const subPath = subDirNode.path || (dirPath + '/' + subDirName)}
                {@const subOpen = isExpanded(subPath)}
                <div class="tree-dir">
                  <button class="tree-dir-header" on:click={() => toggleDir(subPath)}>
                    <span class="dir-chevron">{subOpen ? '\u25BC' : '\u25B6'}</span>
                    <span class="dir-icon">📁</span>
                    <span class="dir-name">{subDirName}</span>
                    <span class="dir-count">{countFiles(subDirNode)}</span>
                  </button>
                  {#if subOpen}
                    <div class="tree-dir-children">
                      {#each subDirNode.files as file (file.id)}
                        <button
                          class="tree-file"
                          class:active={selectedId === file.id}
                          on:click={() => store.selectSkill(file.id)}
                        >
                          <span class="file-icon">{fileIcon(file.type)}</span>
                          <span class="file-name">{file.name}</span>
                          {#if file.status === 'beta'}
                            <span class="badge">beta</span>
                          {/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}

              <!-- Files in this directory -->
              {#each dirNode.files as file (file.id)}
                <button
                  class="tree-file"
                  class:active={selectedId === file.id}
                  on:click={() => store.selectSkill(file.id)}
                >
                  <span class="file-icon">{fileIcon(file.type)}</span>
                  <span class="file-name">{file.name}</span>
                  {#if file.status === 'beta'}
                    <span class="badge">beta</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </nav>
</aside>

<style>
  .file-tree {
    width: 24%;
    min-width: 200px;
    max-width: 320px;
    background: #111111;
    border-right: 1px solid #2A2A2A;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .file-tree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #2A2A2A;
  }

  .file-tree-title {
    font-weight: 700;
    font-size: 14px;
    color: #FFFFFF;
  }

  .file-count {
    font-size: 12px;
    color: #666666;
  }

  .tree-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .tree-empty {
    padding: 32px 16px;
    text-align: center;
    color: #666666;
    font-size: 13px;
  }

  .tree-empty-hint {
    font-size: 12px;
    color: #444444;
    margin-top: 4px;
  }

  /* ── Directory Nodes ──────────────────────────────── */

  .tree-dir {
    margin: 0;
  }

  .tree-dir-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: #CCCCCC;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }

  .tree-dir-header:hover {
    background: #1A1A1A;
  }

  .dir-chevron {
    font-size: 9px;
    flex-shrink: 0;
    width: 12px;
    color: #666666;
  }

  .dir-icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  .dir-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .dir-count {
    font-size: 11px;
    color: #555555;
    flex-shrink: 0;
  }

  .tree-dir-children {
    padding-left: 16px;
  }

  /* ── File Items ───────────────────────────────────── */

  .tree-file {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 16px;
    background: none;
    border: none;
    border-left: 3px solid transparent;
    color: #AAAAAA;
    font-family: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .tree-file:hover {
    background: #1A1A1A;
    color: #CCCCCC;
  }

  .tree-file.active {
    background: #1A1A1A;
    color: #F7931A;
    border-left-color: #F7931A;
  }

  .file-icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: #F7931A;
    color: #000;
    flex-shrink: 0;
    font-weight: 600;
  }
</style>
