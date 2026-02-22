<script>
  import { createEventDispatcher } from 'svelte';
  import ChangeStreamSidebar from './ChangeStreamSidebar.svelte';
  import { store } from '../lib/store.js';

  const TYPE_ICONS = {
    moc: '\u{1F5FA}\uFE0F',
    skill: '\u{1F6E0}\uFE0F',
    subagent: '\u{1F916}',
    hook: '\u{1FA9D}',
    command: '\u26A1',
    script: '\u{1F4DC}',
  };

  const dispatch = createEventDispatcher();

  $: skills = $store.skills || [];
  $: activeTab = $store.activeTab;
  $: query = ($store.searchQuery || '').toLowerCase();
  $: filters = $store.typeFilters;

  $: filtered = skills.filter((s) => {
    if (query && !s.name.toLowerCase().includes(query)) return false;
    if (filters.size > 0 && !filters.has(s.type || 'skill')) return false;
    return true;
  });

  $: fileFiltered = skills.filter((s) => {
    const source = (s.relativePath || s.path || s.name || '').toLowerCase();
    return !query || source.includes(query);
  });

  $: fileRows = buildFileRows(fileFiltered);
  $: sidebarTitle = activeTab === 'files' ? 'Files' : 'Skills';
  $: sidebarCount = activeTab === 'files' ? fileFiltered.length : filtered.length;

  function handleOpenDiff(event) {
    dispatch('openDiff', event.detail);
  }

  function normalizePath(value) {
    return String(value || '').replace(/\\/g, '/');
  }

  function rowPath(skill) {
    return normalizePath(skill.relativePath || skill.path || skill.name || '');
  }

  function buildFileRows(input) {
    const rows = [];
    const seenDirectories = new Set();
    const sorted = [...input].sort((a, b) => rowPath(a).localeCompare(rowPath(b)));

    for (const skill of sorted) {
      const segments = rowPath(skill).split('/').filter(Boolean);
      if (segments.length === 0) {
        rows.push({
          kind: 'file',
          key: `file:${skill.id}`,
          skillId: skill.id,
          label: skill.name || 'Untitled',
          fullPath: skill.path || '',
          depth: 0,
        });
        continue;
      }

      let prefix = '';
      for (let i = 0; i < segments.length - 1; i++) {
        prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
        if (seenDirectories.has(prefix)) continue;
        seenDirectories.add(prefix);
        rows.push({
          kind: 'dir',
          key: `dir:${prefix}`,
          label: segments[i],
          depth: i,
        });
      }

      rows.push({
        kind: 'file',
        key: `file:${skill.id}`,
        skillId: skill.id,
        label: segments[segments.length - 1],
        fullPath: rowPath(skill),
        depth: Math.max(0, segments.length - 1),
      });
    }

    return rows;
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <span class="sidebar-title">{sidebarTitle}</span>
    <span class="skill-count">{sidebarCount}</span>
  </div>

  {#if activeTab === 'files'}
    <nav class="skill-list file-tree">
      {#if fileRows.length === 0}
        <p class="empty-message">No markdown files found.</p>
      {:else}
        {#each fileRows as row (row.key)}
          {#if row.kind === 'dir'}
            <div class="tree-dir" style={`padding-left: ${14 + row.depth * 14}px`}>
              <span class="tree-caret">/</span>
              <span class="tree-name">{row.label}</span>
            </div>
          {:else}
            <button
              class="tree-file"
              class:active={$store.selectedSkillId === row.skillId}
              style={`padding-left: ${14 + row.depth * 14}px`}
              on:click={() => store.selectSkill(row.skillId)}
              title={row.fullPath}
            >
              <span class="tree-ext">md</span>
              <span class="tree-name">{row.label}</span>
            </button>
          {/if}
        {/each}
      {/if}
    </nav>
  {:else}
    <div class="sidebar-sections">
      <nav class="skill-list">
        {#each filtered as skill (skill.id)}
          <button
            class="skill-item"
            class:active={$store.selectedSkillId === skill.id}
            class:deprecated={skill.status === 'deprecated'}
            on:click={() => store.selectSkill(skill.id)}
          >
            <span class="skill-icon">{TYPE_ICONS[skill.type] || TYPE_ICONS.skill}</span>
            <span class="skill-name">{skill.name}</span>
            {#if skill.status === 'beta'}
              <span class="badge badge-beta">beta</span>
            {/if}
          </button>
        {/each}
      </nav>

      <ChangeStreamSidebar on:openDiff={handleOpenDiff} />
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    width: 24%;
    min-width: 200px;
    max-width: 320px;
    background: var(--sv-color-bg-sidebar, #001824);
    border-right: 1px solid var(--sv-color-border, #708090);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-sections {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--sv-color-border, #708090);
  }

  .sidebar-title {
    font-weight: var(--sv-font-weight-heading, 700);
    font-size: 14px;
  }

  .skill-count {
    font-size: 12px;
    color: var(--sv-color-text-muted, #708090);
  }

  .skill-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;
  }

  .file-tree {
    padding: 8px 0;
  }

  .empty-message {
    color: var(--sv-color-text-muted, #708090);
    font-size: 12px;
    margin: 0;
    padding: 12px 16px;
  }

  .tree-dir {
    align-items: center;
    color: var(--sv-color-text-muted, #708090);
    display: flex;
    font-size: 12px;
    gap: 8px;
    padding-bottom: 4px;
    padding-top: 4px;
  }

  .tree-file {
    align-items: center;
    background: none;
    border: none;
    color: var(--sv-color-text-secondary, #B0B7BC);
    cursor: pointer;
    display: flex;
    font-family: inherit;
    font-size: 12px;
    gap: 8px;
    padding-bottom: 6px;
    padding-right: 10px;
    padding-top: 6px;
    text-align: left;
    width: 100%;
  }

  .tree-file:hover {
    background: var(--sv-color-bg-surface, #0d2d3d);
    color: var(--sv-color-hover, #66B2DD);
  }

  .tree-file.active {
    background: var(--sv-color-bg-surface, #0d2d3d);
    border-left: 3px solid var(--sv-color-accent, #F7931A);
    color: #F7931A;
  }

  .tree-caret {
    color: #5f7080;
    font-size: 11px;
    width: 10px;
  }

  .tree-ext {
    border: 1px solid #405060;
    border-radius: 3px;
    color: #8ea3b7;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.4px;
    padding: 1px 4px;
    text-transform: uppercase;
  }

  .tree-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 16px;
    background: none;
    border: none;
    color: var(--sv-color-text-secondary, #B0B7BC);
    font-family: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .skill-item:hover {
    background: var(--sv-color-bg-surface, #0d2d3d);
    color: var(--sv-color-hover, #66B2DD);
  }

  .skill-item.active {
    background: var(--sv-color-bg-surface, #0d2d3d);
    color: var(--sv-color-primary, #0076B6);
    border-left: 3px solid var(--sv-color-accent, #F7931A);
  }

  .skill-item.deprecated {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .skill-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .skill-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .badge-beta {
    background: var(--sv-color-accent, #F7931A);
    color: #000;
  }
</style>
