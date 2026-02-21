<script>
  import { onDestroy } from 'svelte';
  import { store } from '../lib/store.js';
  import { parseMarkdown } from '../../packages/core/parser.js';
  import { invoke } from '@tauri-apps/api/core';

  let renderToken = 0;
  let renderedHtml = '';
  let isEditing = false;
  let editContent = '';
  let isSaving = false;
  let saveError = '';
  let showSavedToast = false;
  let savedTimer = null;
  let activeId = $store.selectedSkillId;

  onDestroy(() => {
    if (savedTimer) clearTimeout(savedTimer);
  });

  $: allSkills = $store.skills || [];
  $: storeSelectedId = $store.selectedSkillId;

  // Intercept skill switch — check for unsaved changes
  $: if (storeSelectedId !== activeId) {
    if (isEditing && editContent !== (allSkills.find(s => s.id === activeId)?.body || '')) {
      const discard = confirm('You have unsaved changes. Discard and switch?');
      if (discard) {
        isEditing = false;
        saveError = '';
        activeId = storeSelectedId;
      } else {
        store.selectSkill(activeId);
      }
    } else {
      if (isEditing) isEditing = false;
      activeId = storeSelectedId;
    }
  }

  $: skill = allSkills.find((s) => s.id === activeId);

  $: {
    const currentToken = ++renderToken;
    const currentBody = skill?.body || '';

    if (!skill) {
      renderedHtml = '<p class="empty-state">Select a skill from the sidebar.</p>';
    } else {
      parseMarkdown(currentBody, { skills: allSkills })
        .then((result) => {
          if (currentToken !== renderToken) return;
          renderedHtml = result.html || '<p class="empty-state">No content.</p>';
        })
        .catch(() => {
          if (currentToken !== renderToken) return;
          renderedHtml = '<p class="empty-state">Unable to render markdown.</p>';
        });
    }
  }

  $: if (!isEditing) {
    editContent = skill?.body || '';
  }

  function startEditing() {
    if (!skill) return;
    editContent = skill.body || '';
    saveError = '';
    showSavedToast = false;
    isEditing = true;
  }

  function cancelEditing() {
    isEditing = false;
    saveError = '';
    showSavedToast = false;
    editContent = skill?.body || '';
  }

  function handleLinkClick(event) {
    const link = event.target.closest('a.wiki-link--resolved');
    if (!link) return;
    event.preventDefault();
    const skillId = link.dataset.skillId;
    if (skillId) {
      store.selectSkill(skillId);
    }
  }

  async function saveEdits() {
    if (!skill || !skill.path || isSaving) {
      if (skill && !skill.path) saveError = 'Cannot save: missing file path.';
      return;
    }

    isSaving = true;
    saveError = '';

    try {
      await invoke('write_skill_file', {
        filePath: skill.path,
        content: editContent,
      });

      const updatedSkills = allSkills.map((entry) =>
        entry.id === skill.id
          ? {
              ...entry,
              body: editContent,
            }
          : entry
      );

      store.setSkills(updatedSkills);

      const currentToken = ++renderToken;
      const rerendered = await parseMarkdown(editContent, { skills: updatedSkills });
      if (currentToken === renderToken) {
        renderedHtml = rerendered.html || '<p class="empty-state">No content.</p>';
      }

      isEditing = false;
      showSavedToast = true;
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        showSavedToast = false;
      }, 2000);
    } catch (error) {
      // Stay in edit mode so user can fix and retry.
      saveError = String(error || 'Save failed.');
      showSavedToast = false;
    } finally {
      isSaving = false;
    }
  }
</script>

<section class="markdown-view">
  {#if skill}
    <div class="markdown-header">
      <h2>{skill.name}</h2>
      <div class="editor-actions">
        {#if isEditing}
          <button type="button" class="editor-btn editor-btn--cancel" on:click={cancelEditing}>
            Cancel
          </button>
          <button
            type="button"
            class="editor-btn editor-btn--save"
            on:click={saveEdits}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        {:else}
          <button type="button" class="editor-btn editor-btn--edit" on:click={startEditing}>Edit</button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="markdown-body" on:click={handleLinkClick}>
    {#if skill && isEditing}
      <textarea
        class="markdown-editor"
        bind:value={editContent}
        spellcheck="false"
        placeholder="Edit markdown..."
      ></textarea>
      {#if saveError}
        <p class="save-error">{saveError}</p>
      {/if}
    {:else}
      {@html renderedHtml}
    {/if}
  </div>

  {#if showSavedToast}
    <div class="saved-toast">Saved</div>
  {/if}
</section>

<style>
  .markdown-view {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--sv-color-border, #708090);
    position: relative;
  }

  .markdown-header {
    padding: 12px 20px;
    border-bottom: 1px solid var(--sv-color-border, #708090);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .markdown-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: var(--sv-font-weight-heading, 700);
  }

  .editor-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .editor-btn {
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid var(--sv-color-border, #708090);
    background: var(--sv-color-bg-surface, #0d2d3d);
    color: var(--sv-color-text-primary, #ffffff);
    font-family: var(--sv-font-family, 'JetBrains Mono', monospace);
    font-size: 12px;
    cursor: pointer;
  }

  .editor-btn:disabled {
    cursor: wait;
    opacity: 0.8;
  }

  .editor-btn--save {
    background: #f7931a;
    border-color: #f7931a;
    color: #111111;
    font-weight: 700;
  }

  .editor-btn--save:hover:enabled {
    filter: brightness(1.05);
  }

  .markdown-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    line-height: 1.6;
  }

  .markdown-editor {
    width: 100%;
    min-height: 100%;
    resize: none;
    border: 1px solid var(--sv-color-border, #708090);
    border-radius: 6px;
    background: var(--sv-color-bg-app, #002336);
    color: var(--sv-color-text-primary, #ffffff);
    padding: 12px;
    line-height: 1.6;
    font-family: var(--sv-font-family, 'JetBrains Mono', monospace);
    font-size: 13px;
    box-sizing: border-box;
  }

  .save-error {
    margin-top: 8px;
    color: #ff6b6b;
    font-size: 12px;
  }

  .saved-toast {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: #f7931a;
    color: #111111;
    font-weight: 700;
    font-size: 13px;
    padding: 8px 16px;
    border-radius: 6px;
    animation: toast-fade 2s ease-in-out;
    pointer-events: none;
  }

  @keyframes toast-fade {
    0% { opacity: 0; transform: translateY(8px); }
    15% { opacity: 1; transform: translateY(0); }
    85% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-4px); }
  }

  .markdown-body :global(.wiki-link--resolved) {
    color: var(--sv-color-primary, #0076B6);
    text-decoration: underline;
    cursor: pointer;
  }

  .markdown-body :global(.wiki-link--ghost) {
    color: var(--sv-color-text-muted, #708090);
    text-decoration: underline dashed;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .markdown-body :global(.empty-state) {
    color: var(--sv-color-text-muted, #708090);
    text-align: center;
    padding: 40px;
  }

  .markdown-body :global(pre) {
    background: var(--sv-color-bg-sidebar, #001824);
    padding: 12px 16px;
    border-radius: 4px;
    overflow-x: auto;
  }

  .markdown-body :global(code) {
    font-family: var(--sv-font-family, 'JetBrains Mono', monospace);
    font-size: 13px;
  }

  .markdown-body :global(a) {
    color: var(--sv-color-primary, #0076B6);
  }

  .markdown-body :global(a:hover) {
    color: var(--sv-color-hover, #66B2DD);
  }
</style>
