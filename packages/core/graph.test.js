import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSkillsGraph,
  buildAdjacencyList,
  chooseGraphLayout,
  buildCytoscapeStyles,
  createCytoscapeConfig,
  TYPE_TO_SHAPE,
  FV_COLORS,
} from './graph.js';

describe('buildSkillsGraph', () => {
  it('builds a graph from skill entries', () => {
    const skills = [
      { name: 'a', type: 'skill', related: ['b'] },
      { name: 'b', type: 'skill', related: [] },
    ];
    const graph = buildSkillsGraph(skills);
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].source, 'a');
    assert.equal(graph.edges[0].target, 'b');
    assert.equal(graph.edges[0].kind, 'related');
  });

  it('creates ghost nodes for unresolved targets', () => {
    const skills = [{ name: 'a', type: 'skill', related: ['nonexistent'] }];
    const graph = buildSkillsGraph(skills);
    const ghost = graph.nodes.find((n) => n.isGhost);
    assert.ok(ghost, 'Expected a ghost node');
    assert.ok(ghost.id.startsWith('unresolved:'));
  });

  it('creates script nodes for script edges', () => {
    const skills = [{ name: 'a', type: 'skill', scripts: ['scripts/helper.sh'] }];
    const graph = buildSkillsGraph(skills);
    const scriptNode = graph.nodes.find((n) => n.type === 'script');
    assert.ok(scriptNode);
    assert.equal(scriptNode.label, 'helper.sh');
  });

  it('handles MOC flag', () => {
    const skills = [{ name: 'index', moc: true }];
    const graph = buildSkillsGraph(skills);
    assert.equal(graph.nodes[0].type, 'moc');
    assert.equal(graph.nodes[0].shape, TYPE_TO_SHAPE.moc);
  });

  it('detects and condenses cycles', () => {
    const skills = [
      { name: 'a', type: 'skill', related: ['b'] },
      { name: 'b', type: 'skill', related: ['a'] },
    ];
    const graph = buildSkillsGraph(skills);
    assert.ok(graph.cycles.length > 0, 'Should detect a cycle');
    const cycleNode = graph.nodes.find((n) => n.type === 'cycle');
    assert.ok(cycleNode, 'Should have a cycle supernode');
  });

  it('skips cycle condensation when disabled', () => {
    const skills = [
      { name: 'a', type: 'skill', related: ['b'] },
      { name: 'b', type: 'skill', related: ['a'] },
    ];
    const graph = buildSkillsGraph(skills, { condenseCycles: false });
    assert.equal(graph.cycles.length, 0);
    assert.ok(!graph.nodes.find((n) => n.type === 'cycle'));
  });

  it('handles empty input', () => {
    const graph = buildSkillsGraph([]);
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.edges.length, 0);
  });

  it('handles wiki-link edges', () => {
    const skills = [
      { name: 'a', type: 'skill', wikiLinks: ['b'] },
      { name: 'b', type: 'skill' },
    ];
    const graph = buildSkillsGraph(skills);
    const wikiEdge = graph.edges.find((e) => e.kind === 'wiki');
    assert.ok(wikiEdge);
    assert.equal(wikiEdge.source, 'a');
    assert.equal(wikiEdge.target, 'b');
  });

  it('populates meta counts', () => {
    const skills = [
      { name: 'x', related: ['y'] },
      { name: 'y' },
    ];
    const graph = buildSkillsGraph(skills);
    assert.equal(graph.meta.nodeCount, 2);
    assert.equal(graph.meta.edgeCount, 1);
    assert.equal(typeof graph.meta.cycleCount, 'number');
  });
});

describe('buildAdjacencyList', () => {
  it('builds adjacency buckets from nodes and edges', () => {
    const nodes = [
      { id: 'a', type: 'skill', isGhost: false },
      { id: 'b', type: 'skill', isGhost: false },
    ];
    const edges = [{ id: 'a=>b::related', source: 'a', target: 'b', kind: 'related' }];
    const adj = buildAdjacencyList(nodes, edges);
    assert.deepEqual(adj.a.related, ['b']);
    assert.deepEqual(adj.a.all, ['b']);
    assert.deepEqual(adj.b.all, []);
  });

  it('excludes ghost nodes by default', () => {
    const nodes = [
      { id: 'a', type: 'skill', isGhost: false },
      { id: 'ghost:b', type: 'unresolved', isGhost: true },
    ];
    const edges = [];
    const adj = buildAdjacencyList(nodes, edges);
    assert.ok(!('ghost:b' in adj));
  });

  it('includes ghost nodes when option set', () => {
    const nodes = [
      { id: 'a', type: 'skill', isGhost: false },
      { id: 'ghost:b', type: 'unresolved', isGhost: true },
    ];
    const edges = [];
    const adj = buildAdjacencyList(nodes, edges, { includeGhost: true });
    assert.ok('ghost:b' in adj);
  });
});

describe('chooseGraphLayout', () => {
  it('returns breadthfirst for small graphs', () => {
    const graph = { nodes: new Array(10), edges: new Array(8) };
    const layout = chooseGraphLayout(graph);
    assert.equal(layout.name, 'breadthfirst');
  });

  it('returns dagre for dense graphs', () => {
    const graph = { nodes: new Array(150), edges: new Array(200) };
    const layout = chooseGraphLayout(graph);
    assert.equal(layout.name, 'dagre');
  });
});

describe('buildCytoscapeStyles', () => {
  it('returns an array of style objects', () => {
    const styles = buildCytoscapeStyles();
    assert.ok(Array.isArray(styles));
    assert.ok(styles.length > 0);
    const nodeStyle = styles.find((s) => s.selector === 'node');
    assert.ok(nodeStyle);
  });
});

describe('createCytoscapeConfig', () => {
  it('creates a full Cytoscape config', () => {
    const graph = buildSkillsGraph([{ name: 'a' }, { name: 'b', related: ['a'] }]);
    const config = createCytoscapeConfig(graph);
    assert.ok(config.elements);
    assert.ok(config.elements.nodes.length > 0);
    assert.ok(config.style);
    assert.ok(config.layout);
    assert.equal(typeof config.minZoom, 'number');
  });
});

describe('FV_COLORS', () => {
  it('has expected color keys', () => {
    assert.ok(FV_COLORS.primary);
    assert.ok(FV_COLORS.accent);
    assert.ok(FV_COLORS.background);
    assert.ok(FV_COLORS.selected);
  });
});
