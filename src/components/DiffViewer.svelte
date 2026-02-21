<script>
  import { createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  export let open = false;
  export let repoPath = '';
  export let sha = '';
  export let filePath = null;

  const dispatch = createEventDispatcher();

  let lastLoadKey = '';
  let loading = false;
  let error = '';
  let isBinary = false;
  let beforeRows = [];
  let afterRows = [];

  $: loadKey = `${open}|${repoPath}|${sha}|${filePath || ''}`;
  $: if (open && repoPath && sha && loadKey !== lastLoadKey) {
    lastLoadKey = loadKey;
    loadDiff();
  }

  async function loadDiff() {
    loading = true;
    error = '';
    isBinary = false;
    beforeRows = [];
    afterRows = [];

    try {
      const result = await invoke('git_diff', {
        repoPath,
        sha,
        filePath,
      });

      isBinary = Boolean(result?.is_binary ?? result?.isBinary);
      if (isBinary) return;

      const patch = result?.patch || '';
      const parsed = parsePatch(patch);
      beforeRows = parsed.before;
      afterRows = parsed.after;
    } catch (loadError) {
      error = String(loadError || 'Failed to load diff.');
    } finally {
      loading = false;
    }
  }

  function parsePatch(patch) {
    const before = [];
    const after = [];
    let beforeLine = 1;
    let afterLine = 1;

    for (const rawLine of patch.split('\n')) {
      if (
        rawLine.startsWith('diff --git') ||
        rawLine.startsWith('index ') ||
        rawLine.startsWith('--- ') ||
        rawLine.startsWith('+++ ')
      ) {
        continue;
      }

      if (rawLine.startsWith('@@')) {
        const match = rawLine.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          beforeLine = Number(match[1]);
          afterLine = Number(match[2]);
        }
        before.push({ lineNumber: '', text: rawLine, kind: 'hunk' });
        after.push({ lineNumber: '', text: rawLine, kind: 'hunk' });
        continue;
      }

      if (rawLine.startsWith('+')) {
        before.push({ lineNumber: '', text: '', kind: 'empty' });
        after.push({
          lineNumber: afterLine,
          text: rawLine.slice(1),
          kind: 'added',
        });
        afterLine += 1;
        continue;
      }

      if (rawLine.startsWith('-')) {
        before.push({
          lineNumber: beforeLine,
          text: rawLine.slice(1),
          kind: 'removed',
        });
        after.push({ lineNumber: '', text: '', kind: 'empty' });
        beforeLine += 1;
        continue;
      }

      if (rawLine.startsWith('\\')) {
        continue;
      }

      const content = rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine;
      before.push({ lineNumber: beforeLine, text: content, kind: 'context' });
      after.push({ lineNumber: afterLine, text: content, kind: 'context' });
      beforeLine += 1;
      afterLine += 1;
    }

    return { before, after };
  }

  function close() {
    dispatch('close');
  }
</script>

{#if open}
  <div class="diff-backdrop" on:click={close}></div>
  <section class="diff-modal" role="dialog" aria-label="Diff Viewer">
    <header class="diff-header">
      <div class="diff-title-wrap">
        <h3>Diff Viewer</h3>
        <p>{filePath || 'selected file'} · {sha.slice(0, 10)}</p>
      </div>
      <button class="close-btn" on:click={close}>Close</button>
    </header>

    {#if loading}
      <div class="diff-state">Loading diff...</div>
    {:else if error}
      <div class="diff-state diff-error">{error}</div>
    {:else if isBinary}
      <div class="diff-state">Binary file changed (cannot show diff).</div>
    {:else}
      <div class="diff-panels">
        <div class="panel">
          <div class="panel-title">Before</div>
          <div class="code-list">
            {#each beforeRows as row}
              <div class="code-row {row.kind}">
                <span class="line-no">{row.lineNumber}</span>
                <span class="code-text">{row.text}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">After</div>
          <div class="code-list">
            {#each afterRows as row}
              <div class="code-row {row.kind}">
                <span class="line-no">{row.lineNumber}</span>
                <span class="code-text">{row.text}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </section>
{/if}

<style>
  .diff-backdrop {
    background: rgba(0, 0, 0, 0.65);
    inset: 0;
    position: fixed;
    z-index: 90;
  }

  .diff-modal {
    background: #021826;
    border: 1px solid #1f3a4a;
    border-radius: 10px;
    bottom: 24px;
    display: flex;
    flex-direction: column;
    left: 24px;
    position: fixed;
    right: 24px;
    top: 24px;
    z-index: 91;
  }

  .diff-header {
    align-items: center;
    border-bottom: 1px solid #1f3a4a;
    display: flex;
    justify-content: space-between;
    padding: 12px 16px;
  }

  .diff-title-wrap h3 {
    color: #ffffff;
    font-size: 15px;
    margin: 0;
  }

  .diff-title-wrap p {
    color: #f7931a;
    font-size: 11px;
    margin: 3px 0 0;
  }

  .close-btn {
    background: #f7931a;
    border: none;
    border-radius: 4px;
    color: #111111;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 10px;
  }

  .diff-state {
    color: #b0b7bc;
    padding: 18px;
  }

  .diff-error {
    color: #ff7f7f;
  }

  .diff-panels {
    display: grid;
    flex: 1;
    gap: 8px;
    grid-template-columns: 1fr 1fr;
    min-height: 0;
    padding: 10px;
  }

  .panel {
    background: #00111a;
    border: 1px solid #1f3a4a;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .panel-title {
    border-bottom: 1px solid #1f3a4a;
    color: #f7931a;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    padding: 8px 10px;
    text-transform: uppercase;
  }

  .code-list {
    flex: 1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    overflow: auto;
  }

  .code-row {
    align-items: stretch;
    display: grid;
    grid-template-columns: 48px 1fr;
    min-height: 20px;
  }

  .line-no {
    border-right: 1px solid #1f3a4a;
    color: #708090;
    padding: 2px 6px;
    text-align: right;
    user-select: none;
  }

  .code-text {
    padding: 2px 8px;
    white-space: pre;
  }

  .code-row.added {
    background: rgba(34, 197, 94, 0.2);
  }

  .code-row.removed {
    background: rgba(239, 68, 68, 0.2);
  }

  .code-row.hunk {
    background: rgba(247, 147, 26, 0.16);
    color: #ffd8aa;
  }

  .code-row.empty {
    background: rgba(255, 255, 255, 0.02);
  }
</style>
