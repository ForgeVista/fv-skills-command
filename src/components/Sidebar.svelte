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
  $: query = ($store.searchQuery || '').toLowerCase();
  $: filters = $store.typeFilters;

  $: filtered = skills.filter((s) => {
    if (query && !s.name.toLowerCase().includes(query)) return false;
    if (filters.size > 0 && !filters.has(s.type || 'skill')) return false;
    return true;
  });

  function handleOpenDiff(event) {
    dispatch('openDiff', event.detail);
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <span class="sidebar-title">Skills</span>
    <span class="skill-count">{filtered.length}</span>
  </div>

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
