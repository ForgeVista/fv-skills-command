<!--
  SettingsTab.svelte — Inline settings tab panel (not a modal).

  Three sections:
  1. HEALTH: HealthReport display via packages/core
  2. FOLDER CONFIG: current path, change folder, skill count
  3. AUTOGIT / THEMING: change-tracking toggle, interval, excludes, desktop theming
-->
<script>
  import { invoke } from '@tauri-apps/api/core';
  import { runDesktopHealthChecks } from '../lib/desktop-health.js';
  import { store } from '../lib/store.js';

  export let repoRoot = '';

  // ---- Health state ----
  let healthLoading = false;
  let healthError = '';
  /** @type {import('@forgevista/skills-core/health').HealthReport|null} */
  let healthReport = null;

  // ---- Autogit state ----
  let enabled = true;
  let intervalSeconds = 60;
  let exclude = ['node_modules', '.git', 'dist', 'build', 'target', '.next'];
  let newExcludeEntry = '';
  let saving = false;
  let saveError = '';
  let loadError = '';

  const INTERVAL_STEPS = [
    { value: 30, label: '30 s' },
    { value: 60, label: '1 min' },
    { value: 300, label: '5 min' },
  ];
  let intervalStep = 1;

  // ---- Theming state ----
  let accentColor = '#F7931A';
  let fontFamily = 'JetBrains Mono';

  // ---- Reload when repoRoot changes ----
  let loadedRepoRoot = '';
  $: if (repoRoot && repoRoot !== loadedRepoRoot) {
    loadedRepoRoot = repoRoot;
    loadHealthReport();
    loadConfig();
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

  async function loadConfig() {
    loadError = '';
    try {
      const cfg = await invoke('get_autogit_config', { repoRoot });
      enabled = cfg.enabled ?? true;
      intervalSeconds = cfg.interval_seconds ?? 60;
      exclude = Array.isArray(cfg.exclude) ? [...cfg.exclude] : [];
      const closest = INTERVAL_STEPS.reduce((prev, cur, i) =>
        Math.abs(cur.value - intervalSeconds) < Math.abs(INTERVAL_STEPS[prev].value - intervalSeconds) ? i : prev,
        0
      );
      intervalStep = closest;
    } catch {
      // Config not available (web context or first run) — keep defaults.
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

  async function saveConfig() {
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
    } catch (err) {
      saveError = `Failed to save: ${err?.message ?? err}`;
    } finally {
      saving = false;
    }
  }

  /** @param {'pass'|'warn'|'fail'} status */
  function statusLabel(status) {
    if (status === 'pass') return 'Healthy';
    if (status === 'warn') return 'Needs attention';
    return 'Action required';
  }

  /** @param {'pass'|'warn'|'fail'} status */
  function statusIcon(status) {
    if (status === 'pass') return '\u2713';
    if (status === 'warn') return '!';
    return '\u2717';
  }
</script>

<div class="settings-tab">
  <div class="settings-scroll">
    <h2 class="settings-title">Settings</h2>

    <!-- ═══════════════════════════════════════════════════════
         SECTION 1: Health Report
         ═══════════════════════════════════════════════════════ -->
    <section class="section">
      <div class="section-header">
        <h3 class="section-title">Repository Health</h3>
        <button class="refresh-btn" on:click={loadHealthReport} disabled={healthLoading || !repoRoot}>
          {healthLoading ? 'Checking\u2026' : 'Recheck'}
        </button>
      </div>

      {#if !repoRoot}
        <p class="hint">Open a folder to run health checks.</p>
      {:else if healthError}
        <p class="hint error-text">{healthError}</p>
      {:else if healthLoading}
        <p class="hint">Running health checks\u2026</p>
      {:else if healthReport}
        <div class="health-overall">
          <span class="health-pill health-{healthReport.overall}">
            {statusIcon(healthReport.overall)} {statusLabel(healthReport.overall)}
          </span>
          <span class="health-count">{healthReport.results.length} checks</span>
        </div>

        <ul class="health-list">
          {#each healthReport.results as result}
            <li class="health-item health-item-{result.status}">
              <span class="health-icon">{statusIcon(result.status)}</span>
              <div class="health-detail">
                <span class="health-rule">{result.ruleId}</span>
                <span class="health-msg">{result.message}</span>
                {#if result.cta}
                  <span class="health-cta">{result.cta}</span>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">Health checks haven't run yet.</p>
      {/if}
    </section>

    <!-- ═══════════════════════════════════════════════════════
         SECTION 2: Folder Configuration
         ═══════════════════════════════════════════════════════ -->
    <section class="section">
      <h3 class="section-title">Folder Configuration</h3>

      <div class="field">
        <span class="field-label">Current folder</span>
        <code class="folder-path">{repoRoot || 'No folder selected'}</code>
      </div>

      <div class="field">
        <span class="field-label">Skills loaded</span>
        <span class="field-value-inline">{$store.skills?.length ?? 0}</span>
      </div>

      <button class="btn btn-secondary" on:click={() => store.openFolder()}>
        Change Folder
      </button>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         SECTION 3: Change Tracking + Theming
         ═══════════════════════════════════════════════════════ -->
    <section class="section">
      <h3 class="section-title">Change Tracking</h3>

      {#if loadError}
        <p class="hint error-text">{loadError}</p>
      {/if}

      <!-- Enabled toggle -->
      <div class="field">
        <label class="field-label" for="autogit-enabled">Enable autogit tracking</label>
        <label class="toggle" for="autogit-enabled">
          <input id="autogit-enabled" type="checkbox" bind:checked={enabled} />
          <span class="toggle-track"><span class="toggle-thumb" /></span>
          <span class="toggle-text">{enabled ? 'On' : 'Off'}</span>
        </label>
        <p class="hint">Automatically commits file changes to a local shadow branch.</p>
      </div>

      <!-- Commit interval -->
      <div class="field">
        <label class="field-label" for="commit-interval">
          Commit interval
          <span class="field-value-accent">{INTERVAL_STEPS[intervalStep].label}</span>
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
      </div>

      <!-- Excluded dirs -->
      <div class="field">
        <span class="field-label">Excluded paths</span>
        <p class="hint">Directories to skip during change tracking.</p>
        <ul class="exclude-list">
          {#each exclude as entry}
            <li class="exclude-item">
              <span class="exclude-name">{entry}</span>
              <button class="remove-btn" on:click={() => removeExclude(entry)} aria-label="Remove {entry}">
                \u2715
              </button>
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
          <button class="btn btn-small" on:click={addExclude}>Add</button>
        </div>
      </div>

      {#if saveError}
        <p class="hint error-text">{saveError}</p>
      {/if}

      <button class="btn btn-primary" on:click={saveConfig} disabled={saving || !repoRoot}>
        {saving ? 'Saving\u2026' : 'Save Settings'}
      </button>
    </section>

    <!-- Desktop Theming (cosmetic, desktop-only) -->
    <section class="section">
      <h3 class="section-title">Appearance</h3>

      <div class="field">
        <label class="field-label" for="accent-color">Accent color</label>
        <div class="color-row">
          <input id="accent-color" type="color" bind:value={accentColor} class="color-picker" />
          <code class="color-code">{accentColor}</code>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="font-select">Font family</label>
        <select id="font-select" bind:value={fontFamily} class="select-input">
          <option value="JetBrains Mono">JetBrains Mono</option>
          <option value="Fira Code">Fira Code</option>
          <option value="SF Mono">SF Mono</option>
          <option value="Menlo">Menlo</option>
          <option value="Consolas">Consolas</option>
        </select>
      </div>
    </section>
  </div>
</div>

<style>
  .settings-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #0D0D0D;
  }

  .settings-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
    max-width: 640px;
  }

  .settings-title {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 24px 0;
    color: #FFFFFF;
  }

  /* ── Sections ──────────────────────────────── */

  .section {
    margin-bottom: 28px;
    padding-bottom: 24px;
    border-bottom: 1px solid #2A2A2A;
  }

  .section:last-child {
    border-bottom: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #CCCCCC;
    margin: 0 0 12px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-header .section-title {
    margin-bottom: 0;
  }

  /* ── Health Report ─────────────────────────── */

  .health-overall {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .health-pill {
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 12px;
  }

  .health-pass {
    background: rgba(52, 199, 89, 0.15);
    border: 1px solid rgba(52, 199, 89, 0.4);
    color: #75f2a1;
  }

  .health-warn {
    background: rgba(247, 147, 26, 0.15);
    border: 1px solid rgba(247, 147, 26, 0.4);
    color: #ffc375;
  }

  .health-fail {
    background: rgba(255, 107, 107, 0.15);
    border: 1px solid rgba(255, 107, 107, 0.4);
    color: #ff9a9a;
  }

  .health-count {
    font-size: 12px;
    color: #666666;
  }

  .health-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .health-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 4px;
    background: #141414;
    border: 1px solid #2A2A2A;
  }

  .health-item-pass { border-left: 3px solid #34c759; }
  .health-item-warn { border-left: 3px solid #F7931A; }
  .health-item-fail { border-left: 3px solid #ff6b6b; }

  .health-icon {
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
    width: 16px;
    text-align: center;
  }

  .health-item-pass .health-icon { color: #34c759; }
  .health-item-warn .health-icon { color: #F7931A; }
  .health-item-fail .health-icon { color: #ff6b6b; }

  .health-detail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .health-rule {
    font-size: 11px;
    font-weight: 600;
    color: #888888;
    text-transform: uppercase;
  }

  .health-msg {
    font-size: 13px;
    color: #CCCCCC;
  }

  .health-cta {
    font-size: 11px;
    color: #F7931A;
  }

  .refresh-btn {
    background: none;
    border: 1px solid #2A2A2A;
    color: #F7931A;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 4px;
  }

  .refresh-btn:disabled {
    color: #555555;
    cursor: default;
  }

  .refresh-btn:hover:not(:disabled) {
    background: rgba(247, 147, 26, 0.1);
  }

  /* ── Fields ────────────────────────────────── */

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .field-label {
    font-size: 13px;
    font-weight: 600;
    color: #CCCCCC;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .field-value-inline {
    font-size: 14px;
    color: #FFFFFF;
    font-weight: 500;
  }

  .field-value-accent {
    font-size: 12px;
    color: #F7931A;
  }

  .folder-path {
    font-size: 12px;
    color: #888888;
    background: #141414;
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid #2A2A2A;
    word-break: break-all;
  }

  .hint {
    font-size: 12px;
    color: #666666;
    margin: 0;
  }

  .error-text {
    color: #ff6b6b;
  }

  /* ── Toggle ────────────────────────────────── */

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
    background: #333333;
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
    color: #888888;
    min-width: 20px;
  }

  /* ── Range slider ──────────────────────────── */

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
    color: #666666;
  }

  /* ── Exclude list ──────────────────────────── */

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
    background: #141414;
    border: 1px solid #2A2A2A;
    border-radius: 4px;
    padding: 4px 10px;
  }

  .exclude-name {
    font-size: 12px;
    color: #AAAAAA;
    font-family: monospace;
  }

  .remove-btn {
    background: none;
    border: none;
    color: #666666;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .remove-btn:hover {
    background: rgba(255, 0, 0, 0.15);
    color: #ff6b6b;
  }

  .add-exclude {
    display: flex;
    gap: 8px;
  }

  .text-input {
    flex: 1;
    background: #141414;
    border: 1px solid #2A2A2A;
    color: #FFFFFF;
    padding: 5px 10px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
  }

  .text-input:focus {
    outline: none;
    border-color: #F7931A;
  }

  /* ── Theming ───────────────────────────────── */

  .color-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .color-picker {
    width: 36px;
    height: 28px;
    padding: 0;
    border: 1px solid #2A2A2A;
    border-radius: 4px;
    background: none;
    cursor: pointer;
  }

  .color-code {
    font-size: 12px;
    color: #888888;
  }

  .select-input {
    background: #141414;
    border: 1px solid #2A2A2A;
    color: #FFFFFF;
    padding: 6px 10px;
    border-radius: 4px;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .select-input:focus {
    outline: none;
    border-color: #F7931A;
  }

  /* ── Buttons ───────────────────────────────── */

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
    color: #0D0D0D;
    font-weight: 600;
  }

  .btn-primary:hover:not(:disabled) {
    background: #FFa940;
  }

  .btn-secondary {
    background: #1A1A1A;
    color: #AAAAAA;
    border-color: #2A2A2A;
  }

  .btn-secondary:hover {
    background: #222222;
  }

  .btn-small {
    background: #1A1A1A;
    color: #AAAAAA;
    border-color: #2A2A2A;
    padding: 4px 12px;
    font-size: 12px;
  }

  .btn-small:hover {
    background: #222222;
  }
</style>
