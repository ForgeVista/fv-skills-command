<script>
  import { store } from '../lib/store.js';

  $: selectedId = $store.selectedSkillId;
  $: skill = ($store.skills || []).find((s) => s.id === selectedId);
  $: frontmatter = skill?.frontmatter || {};
  $: steps = frontmatter.steps || [];
  $: related = frontmatter.related || [];
  $: tags = frontmatter.tags || [];

  let expandedStep = null;

  function toggleStep(index) {
    expandedStep = expandedStep === index ? null : index;
  }
</script>

<aside class="detail-panel">
  {#if skill}
    <div class="detail-header">
      <h3>{skill.name}</h3>
      <span class="type-badge type-{frontmatter.type || 'skill'}">{frontmatter.type || 'skill'}</span>
    </div>

    {#if frontmatter.description}
      <p class="description">{frontmatter.description}</p>
    {/if}

    <div class="meta-section">
      {#if frontmatter.category}
        <div class="meta-row">
          <span class="meta-label">Category</span>
          <span class="meta-value">{frontmatter.category}</span>
        </div>
      {/if}

      {#if frontmatter.status}
        <div class="meta-row">
          <span class="meta-label">Status</span>
          <span class="meta-value status-{frontmatter.status}">{frontmatter.status}</span>
        </div>
      {/if}

      {#if frontmatter.version}
        <div class="meta-row">
          <span class="meta-label">Version</span>
          <span class="meta-value">{frontmatter.version}</span>
        </div>
      {/if}
    </div>

    {#if tags.length > 0}
      <div class="tags-section">
        {#each tags as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    {/if}

    {#if related.length > 0}
      <div class="related-section">
        <h4>Related</h4>
        {#each related as rel}
          <button class="related-link" on:click={() => store.selectSkill(rel)}>
            {rel}
          </button>
        {/each}
      </div>
    {/if}

    {#if steps.length > 0}
      <div class="steps-section">
        <h4>Steps</h4>
        {#each steps as step, i}
          <div class="step">
            <button class="step-header" on:click={() => toggleStep(i)}>
              <span class="step-chevron">{expandedStep === i ? '\u25BC' : '\u25B6'}</span>
              <span>{step.name}</span>
            </button>
            {#if expandedStep === i && step.dof}
              <div class="dof-list">
                {#each step.dof as option, j}
                  <button
                    class="dof-chip"
                    class:active={$store.activeDofs.has(`${i}:${j}`)}
                    on:click={() => store.toggleDof(i, j)}
                  >
                    {option}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <p class="empty-state">No skill selected.</p>
  {/if}
</aside>

<style>
  .detail-panel {
    width: 26%;
    min-width: 220px;
    max-width: 360px;
    background: var(--sv-color-bg-surface, #0d2d3d);
    padding: 16px;
    overflow-y: auto;
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .detail-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: var(--sv-font-weight-heading, 700);
  }

  .type-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 8px;
    background: var(--sv-color-primary, #0076B6);
    color: #FFF;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .type-badge.type-moc {
    background: var(--sv-color-accent, #F7931A);
    color: #000;
  }

  .description {
    font-size: 13px;
    color: var(--sv-color-text-secondary, #B0B7BC);
    margin-bottom: 16px;
    line-height: 1.5;
  }

  .meta-section {
    margin-bottom: 16px;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 12px;
  }

  .meta-label {
    color: var(--sv-color-text-muted, #708090);
  }

  .meta-value {
    color: var(--sv-color-text-secondary, #B0B7BC);
  }

  .status-stable { color: #4CAF50; }
  .status-beta { color: var(--sv-color-accent, #F7931A); }
  .status-deprecated { color: var(--sv-color-warning, #FF5722); }

  .tags-section {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 16px;
  }

  .tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--sv-color-bg-app, #002336);
    color: var(--sv-color-text-muted, #708090);
    border: 1px solid var(--sv-color-border, #708090);
  }

  h4 {
    font-size: 13px;
    font-weight: var(--sv-font-weight-heading, 700);
    margin: 0 0 8px;
    color: var(--sv-color-text-secondary, #B0B7BC);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .related-section {
    margin-bottom: 16px;
  }

  .related-link {
    display: block;
    background: none;
    border: none;
    color: var(--sv-color-primary, #0076B6);
    font-family: inherit;
    font-size: 13px;
    padding: 4px 0;
    cursor: pointer;
    text-align: left;
  }

  .related-link:hover {
    color: var(--sv-color-hover, #66B2DD);
  }

  .steps-section {
    margin-bottom: 16px;
  }

  .step {
    margin-bottom: 4px;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 0;
    background: none;
    border: none;
    color: var(--sv-color-text-primary, #FFFFFF);
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }

  .step-chevron {
    font-size: 10px;
    flex-shrink: 0;
    width: 12px;
  }

  .dof-list {
    padding: 4px 0 8px 18px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .dof-chip {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 12px;
    background: var(--sv-color-bg-app, #002336);
    color: var(--sv-color-text-secondary, #B0B7BC);
    border: 1px solid var(--sv-color-border, #708090);
    cursor: pointer;
    font-family: inherit;
  }

  .dof-chip.active {
    background: var(--sv-color-accent, #F7931A);
    color: #000;
    border-color: var(--sv-color-accent, #F7931A);
  }

  .empty-state {
    color: var(--sv-color-text-muted, #708090);
    text-align: center;
    padding: 40px 0;
  }
</style>
