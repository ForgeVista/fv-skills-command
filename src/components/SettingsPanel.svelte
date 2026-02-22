<!--
  SettingsPanel.svelte — Desktop autogit configuration panel.

  Shows autogit enabled toggle, commit interval, and excluded dirs.
  Reads/writes .autogit.json via get_autogit_config / set_autogit_config
  Tauri commands. The running daemon hot-reloads exclude and enabled changes.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { runDesktopHealthChecks } from '../lib/desktop-health.js';

  export let open = false;
  export let repoRoot = '';

  const dispatch = createEventDispatcher();

  // ---- state ----
  let enabled = true;
  let intervalSeconds = 60;
  let exclude = ['node_modules', '.git', 'dist', 'build', 'target', '.next'];
  let newExcludeEntry = '';
  let saving = false;
  let saveError = '';
  let loadError = '';
  let healthLoading = false;
  let healthError = '';
  let healthReport = null;
  let loadedRepoRoot = '';

  // Interval slider steps (seconds)
  const INTERVAL_STEPS = [
    { value: 30, label: '30 s' },
    { value: 60, label: '1 min' },
    { value: 300, label: '5 min' },
  ];
  let intervalStep = 1; // index into INTERVAL_STEPS

  // ---- load config when panel opens ----
  $: if (open && repoRoot && repoRoot !== loadedRepoRoot) {
    loadedRepoRoot = repoRoot;
    loadConfig();
    loadHealthReport();
  }

  $: if (!open) {
    loadedRepoRoot = '';
  }

  async function loadConfig() {
    loadError = '';
    try {
      const cfg = await invoke('get_autogit_config', { repoRoot });
      enabled = cfg.enabled ?? true;
      intervalSeconds = cfg.interval_seconds ?? 60;
      exclude = Array.isArray(cfg.exclude) ? [...cfg.exclude] : [];
      // Snap slider to nearest step
      const closest = INTERVAL_STEPS.reduce((prev, cur, i) =>
        Math.abs(cur.value - intervalSeconds) < Math.abs(INTERVAL_STEPS[prev].value - intervalSeconds) ? i : prev,
        0
      );
      intervalStep = closest;
    } catch (err) {
      loadError = `Failed to load config: ${err?.message ?? err}`;
    }
  }

  async function loadHealthReport() {
    healthLoading = true;
    healthError = '';
    healthReport = null;

    try {
      healthReport = await runDesktopHealthChecks(repoRoot);
    } catch (err) {
      healthError = `Failed to run health checks: ${err?.message ?? err}`;
    } finally {
      healthLoading = false;
    }
  }

  function onIntervalStepChange(event) {
    intervalStep = parseInt(event.target.value, 10);
    intervalSeconds = INTERVAL_STEPS[intervalStep].value;
  }

  function addExclude() {
    const trimmed = newExcludeEntry.trim();
    if (trimmed && !exclude.includes(trimmed)) {
      exclude = [...exclude, trimmed];
    }
    newExcludeEntry = '';
  }

  function removeExclude(entry) {
    exclude = exclude.filter((e) => e !== entry);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      dispatch('close');
    }
  }

  async function save() {
    saving = true;
    saveError = '';
    try {
      await invoke('set_autogit_config', {
        repoRoot,
        config: {
          enabled,
          interval_seconds: intervalSeconds,
          exclude,
        },
      });
      dispatch('close');
    } catch (err) {
      saveError = `Failed to save: ${err?.message ?? err}`;
    } finally {
      saving = false;
    }
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="backdrop"
    role="presentation"
    on:click={() => dispatch('close')}
    on:keydown={handleKeydown}
  />

  <!-- Panel -->
  <div class="panel" role="dialog" aria-modal="true" aria-label="Autogit Settings">
    <div class="panel-header">
      <h2>Change Tracking Settings</h2>
      <button class="close-btn" on:click={() => dispatch('close')} aria-label="Close settings">✕</button>
    </div>

    {#if loadError}
      <div class="banner banner-error">{loadError}</div>
    {/if}

    <div class="panel-body">
      <!-- Readiness check -->
      <div class="field">
        <div class="field-label">
          <span>Repository readiness</span>
          <button class="refresh-link" on:click={loadHealthReport} disabled={healthLoading || !repoRoot}>
            {healthLoading ? 'Checking…' : 'Recheck'}
          </button>
        </div>
        {#if healthError}
          <p class="field-hint field-error">{healthError}</p>
        {:else if healthLoading}
          <p class="field-hint">Running readiness checks...</p>
        {:else if healthReport}
          <span class="health-pill health-{healthReport.overall}">
            {healthReport.overall === 'pass' ? 'Ready' : healthReport.overall === 'warn' ? 'Needs attention' : 'Action required'}
          </span>
          <p class="field-hint">{healthReport.results.length} checks completed for this folder.</p>
        {/if}
      </div>

      <!-- Enabled toggle -->
      <div class="field">
        <label class="field-label" for="autogit-enabled">Enable change tracking</label>
        <label class="toggle" for="autogit-enabled">
          <input
            id="autogit-enabled"
            type="checkbox"
            bind:checked={enabled}
          />
          <span class="toggle-track">
            <span class="toggle-thumb" />
          </span>
          <span class="toggle-text">{enabled ? 'On' : 'Off'}</span>
        </label>
        <p class="field-hint">
          When on, every file save is automatically committed to the local shadow branch.
        </p>
      </div>

      <!-- Commit interval -->
      <div class="field">
        <label class="field-label" for="commit-interval">
          Commit interval
          <span class="field-value">{INTERVAL_STEPS[intervalStep].label}</span>
        </label>
        <input
          id="commit-interval"
          type="range"
          min="0"
          max={INTERVAL_STEPS.length - 1}
          step="1"
          value={intervalStep}
          on:input={onIntervalStepChange}
          class="range-slider"
          disabled={!enabled}
        />
        <div class="range-labels" aria-hidden="true">
          {#each INTERVAL_STEPS as step}
            <span>{step.label}</span>
          {/each}
        </div>
        <p class="field-hint">Minimum time between shadow commits. Takes effect on next start.</p>
      </div>

      <!-- Excluded dirs -->
      <div class="field">
        <span class="field-label">Excluded paths</span>
        <p class="field-hint">Files under these directory names are never tracked.</p>
        <ul class="exclude-list">
          {#each exclude as entry}
            <li class="exclude-item">
              <span class="exclude-name">{entry}</span>
              <button
                class="remove-btn"
                on:click={() => removeExclude(entry)}
                aria-label="Remove {entry}"
              >✕</button>
            </li>
          {/each}
        </ul>
        <div class="add-exclude">
          <input
            type="text"
            placeholder="Add path (e.g. .cache)"
            bind:value={newExcludeEntry}
            class="text-input"
            on:keydown={(e) => e.key === 'Enter' && addExclude()}
          />
          <button class="btn btn-secondary" on:click={addExclude}>Add</button>
        </div>
      </div>
    </div>

    {#if saveError}
      <div class="banner banner-error">{saveError}</div>
    {/if}

    <div class="panel-footer">
      <button class="btn btn-secondary" on:click={() => dispatch('close')}>Cancel</button>
      <button class="btn btn-primary" on:click={save} disabled={saving || !repoRoot}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 100;
  }

  .panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 101;
    width: 420px;
    max-width: 92vw;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    background: var(--sv-color-bg-surface, #0d2d3d);
    border: 1px solid var(--sv-color-border, #708090);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--sv-color-border, #708090);
  }

  .panel-header h2 {
    font-size: 15px;
    font-weight: 700;
    margin: 0;
    color: var(--sv-color-text-primary, #fff);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--sv-color-text-muted, #708090);
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--sv-color-text-primary, #fff);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--sv-color-text-primary, #fff);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .field-value {
    color: #F7931A;
    font-size: 12px;
  }

  .refresh-link {
    background: none;
    border: none;
    color: #F7931A;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    padding: 0;
    text-decoration: underline;
  }

  .refresh-link:disabled {
    color: #7e6a4d;
    cursor: default;
    text-decoration: none;
  }

  .field-hint {
    font-size: 11px;
    color: var(--sv-color-text-muted, #708090);
    margin: 0;
  }

  .field-error {
    color: #f88;
  }

  .health-pill {
    border-radius: 999px;
    display: inline-flex;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 10px;
    width: fit-content;
  }

  .health-pass {
    background: rgba(52, 199, 89, 0.2);
    border: 1px solid rgba(52, 199, 89, 0.5);
    color: #75f2a1;
  }

  .health-warn {
    background: rgba(247, 147, 26, 0.2);
    border: 1px solid rgba(247, 147, 26, 0.45);
    color: #ffc375;
  }

  .health-fail {
    background: rgba(255, 107, 107, 0.2);
    border: 1px solid rgba(255, 107, 107, 0.45);
    color: #ff9a9a;
  }

  /* Toggle */
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    width: fit-content;
  }

  .toggle input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 22px;
    background: #304050;
    border-radius: 11px;
    transition: background 0.2s;
  }

  .toggle input:checked ~ .toggle-track {
    background: #F7931A;
  }

  .toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    transition: left 0.2s;
  }

  .toggle input:checked ~ .toggle-track .toggle-thumb {
    left: 21px;
  }

  .toggle-text {
    font-size: 12px;
    color: var(--sv-color-text-secondary, #B0B7BC);
    min-width: 20px;
  }

  /* Range slider */
  .range-slider {
    width: 100%;
    accent-color: #F7931A;
    cursor: pointer;
  }

  .range-slider:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .range-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--sv-color-text-muted, #708090);
  }

  /* Exclude list */
  .exclude-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 140px;
    overflow-y: auto;
  }

  .exclude-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--sv-color-border, #708090);
    border-radius: 4px;
    padding: 4px 10px;
  }

  .exclude-name {
    font-size: 12px;
    color: var(--sv-color-text-secondary, #B0B7BC);
    font-family: monospace;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--sv-color-text-muted, #708090);
    font-size: 12px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .remove-btn:hover {
    background: rgba(255, 0, 0, 0.15);
    color: #f88;
  }

  .add-exclude {
    display: flex;
    gap: 8px;
  }

  .text-input {
    flex: 1;
    background: var(--sv-color-bg-app, #002336);
    border: 1px solid var(--sv-color-border, #708090);
    color: var(--sv-color-text-primary, #fff);
    padding: 5px 10px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
  }

  /* Footer */
  .panel-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--sv-color-border, #708090);
  }

  .btn {
    padding: 6px 16px;
    border-radius: 4px;
    border: 1px solid transparent;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .btn-primary {
    background: #F7931A;
    color: #000;
    font-weight: 600;
  }

  .btn-primary:hover:not(:disabled) {
    background: #e0841a;
  }

  .btn-secondary {
    background: var(--sv-color-bg-app, #002336);
    color: var(--sv-color-text-secondary, #B0B7BC);
    border-color: var(--sv-color-border, #708090);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  /* Banner */
  .banner {
    padding: 8px 20px;
    font-size: 12px;
  }

  .banner-error {
    background: #2b1116;
    color: #f88;
    border-bottom: 1px solid #7b2230;
  }
</style>
