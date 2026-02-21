<script>
  import { onMount, onDestroy } from 'svelte';
  import { store } from '../lib/store.js';

  // Cytoscape will be imported dynamically when this component mounts
  let container;
  let cy = null;

  onMount(async () => {
    // Dynamic import keeps Cytoscape out of initial bundle for pages that don't use it
    const { default: cytoscape } = await import('cytoscape');
    const { buildSkillsGraph, createCytoscapeConfig } = await import('../../packages/core/graph.js');

    const graph = buildSkillsGraph($store.skills);
    const config = createCytoscapeConfig(graph, {
      container,
    });

    cy = cytoscape({
      ...config,
      container,
    });

    cy.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id();
      if (!nodeId.startsWith('unresolved:') && !nodeId.startsWith('script:') && !nodeId.startsWith('cycle:')) {
        store.selectSkill(nodeId);
      }
    });
  });

  onDestroy(() => {
    if (cy) {
      cy.destroy();
      cy = null;
    }
  });
</script>

<section class="graph-view" bind:this={container}></section>

<style>
  .graph-view {
    flex: 1;
    min-height: 300px;
    background: var(--sv-color-bg-app, #002336);
  }
</style>
