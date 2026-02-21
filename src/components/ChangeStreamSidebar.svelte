<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { store } from '../lib/store.js';

  const dispatch = createEventDispatcher();
  const EMPTY_MESSAGE = 'No changes yet';

  let trackedPath = '';
  let commits = [];
  let loading = false;
  let isGitRepo = true;
  let error = '';
  let unlistenFileChanged = null;
  let expandedSha = null;

  $: nextPath = $store.folderPath || '';
  $: if (nextPath && nextPath !== trackedPath) {
    trackedPath = nextPath;
    startWatchingAndRefresh();
  }

  $: fallbackPath = deriveFallbackPath($store.skills || []);
  $: if (!nextPath && fallbackPath && fallbackPath !== trackedPath) {
    trackedPath = fallbackPath;
    startWatchingAndRefresh();
  }

  onMount(async () => {
    try {
      unlistenFileChanged = await listen('file-changed', () => {
        refreshCommits();
      });
    } catch {
      // Event bridge is unavailable in browser builds.
    }
  });

  onDestroy(() => {
    if (unlistenFileChanged) {
      unlistenFileChanged();
    }
    invoke('unwatch_directory').catch(() => {});
  });

  async function startWatchingAndRefresh() {
    if (!trackedPath) return;
    loading = true;
    error = '';

    try {
      await invoke('watch_directory', { path: trackedPath });
    } catch (watchError) {
      error = String(watchError || 'Failed to start watcher.');
    }

    await refreshCommits();
    loading = false;
  }

  async function refreshCommits() {
    if (!trackedPath) return;
    try {
      const result = await invoke('git_log', {
        repoPath: trackedPath,
        subtreePath: null,
        limit: 150,
      });

      isGitRepo = Boolean(result?.is_git_repo ?? result?.isGitRepo);
      commits = (result?.commits || []).map((commit) => ({
        ...commit,
        files_changed: commit.files_changed || commit.filesChanged || [],
        relativeLabel: toRelativeTime(commit.timestamp),
      }));
    } catch (loadError) {
      error = String(loadError || 'Failed to load commit history.');
      commits = [];
    }
  }

  function toRelativeTime(timestampSeconds) {
    if (!timestampSeconds) return 'just now';
    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestampSeconds);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  }

  function openDiff(commit, targetFilePath = null) {
    dispatch('openDiff', {
      sha: commit.sha,
      filePath: targetFilePath || commit.files_changed[0] || null,
    });
  }

  function toggleExpanded(sha) {
    expandedSha = expandedSha === sha ? null : sha;
  }

  function deriveFallbackPath(skills) {
    const firstPath = skills?.[0]?.path;
    if (!firstPath || typeof firstPath !== 'string') return '';

    const normalized = firstPath.replace(/\\/g, '/');
    const index = normalized.lastIndexOf('/');
    if (index <= 0) return '';
    return normalized.slice(0, index);
  }
</script>

<section class="change-stream">
  <div class="stream-header">
    <span class="stream-title">Change Stream</span>
    <span class="stream-count">{commits.length}</span>
  </div>

  {#if !trackedPath}
    <div class="stream-state">Select a folder to start tracking changes.</div>
  {:else if !isGitRepo}
    <div class="stream-state">Change tracking unavailable (no git repo found).</div>
  {:else if loading}
    <div class="stream-state">Loading changes...</div>
  {:else if error}
    <div class="stream-state stream-error">{error}</div>
  {:else if commits.length === 0}
    <div class="stream-state">{EMPTY_MESSAGE}</div>
  {:else}
    <div class="stream-list">
      {#each commits as commit (commit.sha)}
        <div class="stream-item-wrap">
          <button class="stream-item" on:click={() => toggleExpanded(commit.sha)}>
            <div class="stream-item-top">
              <span class="stream-message">{commit.message || 'autogit commit'}</span>
              <span class="stream-time">{commit.relativeLabel}</span>
            </div>
            <div class="stream-files">
              <span class="stream-file">{commit.files_changed.length} file{commit.files_changed.length === 1 ? '' : 's'}</span>
            </div>
          </button>

          {#if expandedSha === commit.sha}
            <div class="stream-file-list">
              {#if commit.files_changed.length === 0}
                <span class="stream-file muted">No file list</span>
              {:else}
                {#each commit.files_changed as file}
                  <button class="stream-file-button" on:click={() => openDiff(commit, file)}>
                    {file}
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .change-stream {
    border-top: 1px solid var(--sv-color-border, #708090);
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }

  .stream-header {
    align-items: center;
    border-bottom: 1px solid var(--sv-color-border, #708090);
    display: flex;
    justify-content: space-between;
    padding: 10px 16px;
  }

  .stream-title {
    color: var(--sv-color-text-secondary, #b0b7bc);
    font-size: 12px;
    font-weight: var(--sv-font-weight-heading, 700);
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .stream-count {
    color: #f7931a;
    font-size: 11px;
    font-weight: 700;
  }

  .stream-state {
    color: var(--sv-color-text-muted, #708090);
    font-size: 12px;
    padding: 14px 16px;
  }

  .stream-error {
    color: #ff7f7f;
  }

  .stream-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 0;
  }

  .stream-item {
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    color: var(--sv-color-text-secondary, #b0b7bc);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 16px;
    text-align: left;
    width: 100%;
  }

  .stream-item-wrap {
    border-bottom: 1px solid rgba(112, 128, 144, 0.18);
  }

  .stream-item:hover {
    background: var(--sv-color-bg-surface, #0d2d3d);
    border-left-color: #f7931a;
  }

  .stream-item-top {
    align-items: baseline;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  .stream-message {
    color: var(--sv-color-text-primary, #ffffff);
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stream-time {
    color: #f7931a;
    flex-shrink: 0;
    font-size: 11px;
  }

  .stream-files {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .stream-file-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 16px 10px;
  }

  .stream-file-button {
    background: rgba(247, 147, 26, 0.1);
    border: 1px solid rgba(247, 147, 26, 0.35);
    border-radius: 6px;
    color: #ffe4c0;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    padding: 6px 8px;
    text-align: left;
  }

  .stream-file-button:hover {
    background: rgba(247, 147, 26, 0.2);
    border-color: rgba(247, 147, 26, 0.6);
  }

  .stream-file {
    background: rgba(247, 147, 26, 0.12);
    border: 1px solid rgba(247, 147, 26, 0.4);
    border-radius: 999px;
    color: #ffd8aa;
    font-size: 10px;
    line-height: 1;
    padding: 3px 7px;
  }

  .stream-file.muted {
    border-color: var(--sv-color-border, #708090);
    color: var(--sv-color-text-muted, #708090);
  }
</style>
