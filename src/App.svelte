<script>
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import Sidebar from './components/Sidebar.svelte';
  import MarkdownView from './components/MarkdownView.svelte';
  import DetailPanel from './components/DetailPanel.svelte';
  import GraphView from './components/GraphView.svelte';
  import DiffViewer from './components/DiffViewer.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import SettingsTab from './components/SettingsTab.svelte';
  import ChangeStreamSidebar from './components/ChangeStreamSidebar.svelte';
  import { store } from './lib/store.js';

  const TABS = [
    { id: 'graph',    label: 'Graph',    key: '1', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { id: 'files',    label: 'Files',    key: '2', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6' },
    { id: 'git',      label: 'Git',      key: '3', icon: 'M6 3v12 M18 9a3 3 0 100-6 3 3 0 000 6z M6 21a3 3 0 100-6 3 3 0 000 6z M18 9a9 9 0 01-9 9' },
    { id: 'settings', label: 'Settings', key: '4', icon: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M12 8a4 4 0 100 8 4 4 0 000-8z' },
  ];

  /** Map digit keys to tab IDs for Cmd/Ctrl+1..4 shortcuts. */
  const KEY_TO_TAB = { '1': 'graph', '2': 'files', '3': 'git', '4': 'settings' };

  /** Detect macOS for shortcut label (Cmd vs Ctrl). */
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modLabel = isMac ? '\u2318' : 'Ctrl+';

  function handleKeydown(event) {
    if (!(event.metaKey || event.ctrlKey)) return;
    const tabId = KEY_TO_TAB[event.key];
    if (tabId) {
      event.preventDefault();
      store.setActiveTab(tabId);
    }
  }

  let diffViewer = {
    open: false,
    sha: '',
    filePath: null,
  };

  // Git tab state from ChangeStreamSidebar — drives main panel empty states.
  let gitState = { trackedPath: '', isGitRepo: true, loading: false, error: '', commitCount: 0 };

  function handleGitState(event) {
    gitState = event.detail;
  }

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
  $: activeTab = $store.activeTab;

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

<svelte:window on:keydown={handleKeydown} />

<main class="app" data-theme="dark">
  <!-- Header -->
  <header class="app-header">
    <div class="header-left">
      <img src="/assets/fv-logo.svg" alt="FV" class="logo" />
      <h1>{$store.appName}</h1>
    </div>
    <div class="header-controls">
      <input
        type="text"
        placeholder="Search skills..."
        bind:value={$store.searchQuery}
        class="search-input"
      />
      <button on:click={() => store.openFolder()} class="btn btn-primary">Open Folder</button>
    </div>
  </header>

  <div class="app-body">
    <!-- Left Rail: Icon Tab Navigation -->
    <nav class="tab-rail" role="tablist" aria-label="Main navigation">
      {#each TABS as tab (tab.id)}
        <button
          class="tab-btn"
          class:active={activeTab === tab.id}
          on:click={() => store.setActiveTab(tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls="panel-{tab.id}"
          title="{tab.label} ({modLabel}{tab.key})"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
            <path d={tab.icon} />
          </svg>
          <span class="tab-label">{tab.label}</span>
        </button>
      {/each}
    </nav>

    <!-- Main Content Area -->
    <div class="main-content" role="tabpanel" id="panel-{activeTab}">
      {#if activeTab === 'graph'}
        <div class="panel-graph">
          <Sidebar mode="graph" on:openDiff={handleOpenDiff} />
          <div class="graph-main">
            <GraphView />
          </div>
        </div>
      {:else if activeTab === 'files'}
        <div class="panel-files">
          <Sidebar mode="files" />
          <MarkdownView />
          <DetailPanel />
        </div>
      {:else if activeTab === 'git'}
        <div class="panel-git">
          <ChangeStreamSidebar
            on:openDiff={handleOpenDiff}
            on:gitState={handleGitState}
          />
          <div class="git-main">
            {#if diffViewer.open}
              <DiffViewer
                open={true}
                repoPath={repoPath}
                sha={diffViewer.sha}
                filePath={diffViewer.filePath}
                on:close={closeDiffViewer}
              />
            {:else if !gitState.trackedPath}
              <div class="git-empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="git-empty-icon"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                <p class="git-empty-heading">No folder open</p>
                <p class="git-empty-text">Open a skills folder to browse its commit history and diffs.</p>
              </div>
            {:else if !gitState.isGitRepo}
              <div class="git-empty-state">
                <!-- Git branch icon — signals "version control" context -->
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="git-empty-icon" aria-hidden="true">
                  <circle cx="18" cy="5" r="3"/>
                  <circle cx="6" cy="12" r="3"/>
                  <circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                <p class="git-empty-heading">This folder is not a git repository</p>
                <p class="git-empty-text">
                  Git history tracking lets you see changes to your skills over time.
                </p>
                <p class="git-empty-hint">
                  Run <code>git init</code> in your skills folder to start tracking changes.
                </p>
              </div>
            {:else if gitState.commitCount === 0}
              <div class="git-empty-state">
                <!-- Timeline / commit node icon — signals "empty history" -->
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="git-empty-icon" aria-hidden="true">
                  <line x1="6" y1="3" x2="6" y2="21"/>
                  <circle cx="6" cy="12" r="3" fill="#F7931A" stroke="#F7931A"/>
                  <line x1="6" y1="12" x2="14" y2="12"/>
                  <line x1="14" y1="8" x2="14" y2="16"/>
                  <polyline points="11 5 14 8 17 5"/>
                  <polyline points="11 19 14 16 17 19"/>
                </svg>
                <p class="git-empty-heading">No commits yet</p>
                <p class="git-empty-text">
                  Start by creating your first skill file, then commit it to begin tracking history.
                </p>
              </div>
            {:else}
              <div class="placeholder">
                <p class="placeholder-text">Select a commit to view its diff.</p>
              </div>
            {/if}
          </div>
        </div>
      {:else if activeTab === 'settings'}
        <div class="panel-settings">
          <SettingsTab repoRoot={repoPath} />
        </div>
      {/if}
    </div>
  </div>

  <!-- Diff modal (available from any tab for deep-linking) -->
  {#if diffViewer.open && activeTab !== 'git'}
    <DiffViewer
      open={diffViewer.open}
      repoPath={repoPath}
      sha={diffViewer.sha}
      filePath={diffViewer.filePath}
      on:close={closeDiffViewer}
    />
  {/if}
</main>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0D0D0D;
    color: #FFFFFF;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 400;
  }

  /* ── Header ──────────────────────────────────────────────── */

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #141414;
    border-bottom: 1px solid #2A2A2A;
    flex-shrink: 0;
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
    font-weight: 700;
    margin: 0;
    color: #FFFFFF;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search-input {
    background: #1A1A1A;
    border: 1px solid #2A2A2A;
    color: #FFFFFF;
    padding: 6px 12px;
    border-radius: 4px;
    font-family: inherit;
    font-size: 13px;
    width: 200px;
  }

  .search-input::placeholder {
    color: #666666;
  }

  .search-input:focus {
    outline: none;
    border-color: #F7931A;
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
    background: #F7931A;
    color: #0D0D0D;
    font-weight: 600;
  }

  .btn-primary:hover {
    background: #FFa940;
  }

  /* ── Body: Rail + Content ────────────────────────────────── */

  .app-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Tab Rail ────────────────────────────────────────────── */

  .tab-rail {
    display: flex;
    flex-direction: column;
    width: 64px;
    min-width: 64px;
    background: #111111;
    border-right: 1px solid #2A2A2A;
    padding: 8px 0;
    gap: 4px;
    flex-shrink: 0;
  }

  .tab-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px 4px;
    background: none;
    border: none;
    border-left: 3px solid transparent;
    color: #666666;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    font-family: inherit;
  }

  .tab-btn:hover {
    color: #AAAAAA;
  }

  .tab-btn.active {
    color: #F7931A;
    border-left-color: #F7931A;
  }

  .tab-icon {
    width: 22px;
    height: 22px;
  }

  .tab-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* ── Main Content ────────────────────────────────────────── */

  .main-content {
    flex: 1;
    overflow: hidden;
    display: flex;
  }

  /* Tab panels — all use flex row layout */
  .panel-graph,
  .panel-files,
  .panel-git,
  .panel-settings {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .graph-main {
    flex: 1;
    overflow: hidden;
  }

  .git-main {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    background: #0D0D0D;
  }

  .placeholder-text {
    color: #666666;
    font-size: 14px;
  }

  /* ── Git Tab Empty States ──────────────────────────────── */

  .git-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 1;
    background: #0D0D0D;
    text-align: center;
    padding: 40px;
  }

  .git-empty-icon {
    width: 52px;
    height: 52px;
    color: #444444;
    margin-bottom: 4px;
  }

  .git-empty-heading {
    color: #CCCCCC;
    font-size: 15px;
    font-weight: 600;
    margin: 0;
  }

  .git-empty-text {
    color: #666666;
    font-size: 13px;
    line-height: 1.6;
    margin: 0;
    max-width: 380px;
  }

  .git-empty-hint {
    color: #555555;
    font-size: 12px;
    line-height: 1.5;
    margin: 0;
    max-width: 380px;
    padding: 10px 14px;
    background: rgba(247, 147, 26, 0.06);
    border: 1px solid rgba(247, 147, 26, 0.18);
    border-radius: 6px;
  }

  .git-empty-hint code {
    background: rgba(247, 147, 26, 0.15);
    border-radius: 3px;
    color: #F7931A;
    font-family: inherit;
    font-size: 12px;
    padding: 1px 5px;
  }

  .git-empty-text code {
    background: rgba(247, 147, 26, 0.12);
    border-radius: 3px;
    color: #F7931A;
    font-family: inherit;
    font-size: 13px;
    padding: 2px 6px;
  }
</style>
