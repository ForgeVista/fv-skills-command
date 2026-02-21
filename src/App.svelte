<script>
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import Sidebar from './components/Sidebar.svelte';
  import MarkdownView from './components/MarkdownView.svelte';
  import DetailPanel from './components/DetailPanel.svelte';
  import GraphView from './components/GraphView.svelte';
  import DiffViewer from './components/DiffViewer.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import { store } from './lib/store.js';

  let viewMode = 'split'; // 'split' | 'graph'
  let settingsOpen = false;
  let diffViewer = {
    open: false,
    sha: '',
    filePath: null,
  };

  onMount(() => {
    let unlisten = null;

    (async () => {
      try {
        unlisten = await listen('file-changed', (event) => {
          console.debug('[file-changed]', event.payload);
        });
      } catch {
        // Web build has no Tauri event bridge; ignore.
      }
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  });

  $: repoPath = $store.folderPath || deriveRepoPath($store.skills || []);

  function handleOpenDiff(event) {
    diffViewer = {
      open: true,
      sha: event.detail?.sha || '',
      filePath: event.detail?.filePath || null,
    };
  }

  function closeDiffViewer() {
    diffViewer = { open: false, sha: '', filePath: null };
  }

  function deriveRepoPath(skills) {
    const firstPath = skills?.[0]?.path;
    if (!firstPath || typeof firstPath !== 'string') return '';
    const normalized = firstPath.replace(/\\/g, '/');
    const index = normalized.lastIndexOf('/');
    if (index <= 0) return '';
    return normalized.slice(0, index);
  }
</script>

<main class="app" data-theme="dark">
  <header class="app-header">
    <div class="header-left">
      <img src="/assets/fv-logo.svg" alt="FV" class="logo" />
      <h1>{$store.appName}</h1>
    </div>
    <div class="header-controls">
      <button on:click={() => store.openFolder()} class="btn btn-primary">Open Folder</button>
      <input
        type="text"
        placeholder="Search skills..."
        bind:value={$store.searchQuery}
        class="search-input"
      />
      <button
        on:click={() => viewMode = viewMode === 'split' ? 'graph' : 'split'}
        class="btn btn-secondary"
      >
        {viewMode === 'split' ? 'Graph' : 'Split'}
      </button>
      <button
        on:click={() => settingsOpen = true}
        class="btn btn-secondary"
        aria-label="Open autogit settings"
        title="Change tracking settings"
      >
        ⚙
      </button>
    </div>
  </header>

  <div class="app-body">
    <Sidebar on:openDiff={handleOpenDiff} />

    {#if viewMode === 'split'}
      <MarkdownView />
      <DetailPanel />
    {:else}
      <GraphView />
    {/if}
  </div>

  <DiffViewer
    open={diffViewer.open}
    repoPath={repoPath}
    sha={diffViewer.sha}
    filePath={diffViewer.filePath}
    on:close={closeDiffViewer}
  />

  <SettingsPanel
    open={settingsOpen}
    repoRoot={repoPath}
    on:close={() => settingsOpen = false}
  />
</main>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--sv-color-bg-app, #002336);
    color: var(--sv-color-text-primary, #FFFFFF);
    font-family: var(--sv-font-family, 'JetBrains Mono', monospace);
    font-weight: var(--sv-font-weight-body, 400);
  }

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: var(--sv-color-bg-surface, #0d2d3d);
    border-bottom: 1px solid var(--sv-color-border, #708090);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo {
    height: 28px;
    width: auto;
  }

  .header-left h1 {
    font-size: 16px;
    font-weight: var(--sv-font-weight-heading, 700);
    margin: 0;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search-input {
    background: var(--sv-color-bg-app, #002336);
    border: 1px solid var(--sv-color-border, #708090);
    color: var(--sv-color-text-primary, #FFFFFF);
    padding: 6px 12px;
    border-radius: 4px;
    font-family: inherit;
    font-size: 13px;
    width: 200px;
  }

  .btn {
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid transparent;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-primary {
    background: var(--sv-color-primary, #0076B6);
    color: #FFFFFF;
  }

  .btn-secondary {
    background: var(--sv-color-bg-surface, #0d2d3d);
    color: var(--sv-color-text-secondary, #B0B7BC);
    border-color: var(--sv-color-border, #708090);
  }

  .app-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
</style>
