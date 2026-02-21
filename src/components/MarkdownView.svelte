<script>
  import { store } from '../lib/store.js';

  $: selectedId = $store.selectedSkillId;
  $: skill = ($store.skills || []).find((s) => s.id === selectedId);

  // Markdown rendering will be wired to packages/core/parser.js
  // The parseMarkdown() function handles wiki-link resolution, mermaid, etc.
  let renderedHtml = '';

  $: if (skill) {
    // Placeholder — will be replaced with actual parseMarkdown() call
    renderedHtml = `<p>${skill.body || 'No content.'}</p>`;
  } else {
    renderedHtml = '<p class="empty-state">Select a skill from the sidebar.</p>';
  }
</script>

<section class="markdown-view">
  {#if skill}
    <div class="markdown-header">
      <h2>{skill.name}</h2>
    </div>
  {/if}

  <div class="markdown-body">
    {@html renderedHtml}
  </div>
</section>

<style>
  .markdown-view {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--sv-color-border, #708090);
  }

  .markdown-header {
    padding: 12px 20px;
    border-bottom: 1px solid var(--sv-color-border, #708090);
  }

  .markdown-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: var(--sv-font-weight-heading, 700);
  }

  .markdown-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    line-height: 1.6;
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
