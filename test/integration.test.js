/**
 * Integration test: full pipeline with FDD-like dataset.
 * Exercises schema validation → graph building → cycle detection → adjacency.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFrontmatter, validateSkillSet, isViewerCompatible } from '../packages/core/schema.js';
import { buildSkillsGraph, buildAdjacencyList } from '../packages/core/graph.js';
import { createWikiLinkResolver } from '../packages/core/resolver.js';

// Simulated FDD skill frontmatters (mirrors real migrated data)
const FDD_SKILLS = [
  {
    name: 'target-research',
    type: 'skill',
    category: 'fdd',
    tags: ['pre-engagement', 'research'],
    status: 'stable',
    version: '1.0',
    related: ['early-insights'],
    moc: false,
  },
  {
    name: 'early-insights',
    type: 'skill',
    category: 'fdd',
    tags: ['pre-engagement', 'analysis'],
    status: 'stable',
    version: '1.0',
    related: ['target-research'],
    moc: false,
  },
  {
    name: 'databook-creation',
    type: 'skill',
    category: 'fdd',
    tags: ['databook', 'creation'],
    status: 'stable',
    version: '1.0',
    related: ['databook-source', 'trend-analysis'],
    moc: false,
  },
  {
    name: 'databook-source',
    type: 'skill',
    category: 'fdd',
    tags: ['databook', 'source'],
    status: 'stable',
    version: '1.0',
    related: ['databook-creation'],
    moc: false,
  },
  {
    name: 'trend-analysis',
    type: 'skill',
    category: 'fdd',
    tags: ['analysis', 'trends'],
    status: 'stable',
    version: '1.0',
    related: ['databook-creation', 'ebitda-adjustments'],
    scripts: ['scripts/shared/fdd-context.sh'],
    moc: false,
  },
  {
    name: 'ebitda-adjustments',
    type: 'skill',
    category: 'fdd',
    tags: ['analysis', 'adjustments'],
    status: 'stable',
    version: '1.0',
    related: ['trend-analysis', 'quality-of-revenue', 'diligence-results', 'deliverables-draft'],
    moc: false,
  },
  {
    name: 'quality-of-revenue',
    type: 'skill',
    category: 'fdd',
    tags: ['analysis'],
    status: 'stable',
    version: '1.0',
    related: ['ebitda-adjustments'],
    moc: false,
  },
  {
    name: 'diligence-results',
    type: 'skill',
    category: 'fdd',
    tags: ['synthesis'],
    status: 'stable',
    version: '1.0',
    related: ['ebitda-adjustments', 'deliverables-draft'],
    moc: false,
  },
  {
    name: 'deliverables-draft',
    type: 'skill',
    category: 'fdd',
    tags: ['deliverables'],
    status: 'stable',
    version: '1.0',
    related: ['diligence-results', 'review-predraft-sm', 'analytics-deliverable-items'],
    moc: false,
  },
  {
    name: 'deliverables-final',
    type: 'skill',
    category: 'fdd',
    tags: ['deliverables'],
    status: 'stable',
    version: '1.0',
    related: ['deliverables-draft'],
    moc: false,
  },
  {
    name: 'fdd-index',
    type: 'moc',
    category: 'fdd',
    tags: ['index', 'moc'],
    status: 'stable',
    version: '1.0',
    related: ['target-research', 'early-insights', 'deliverables-final'],
    moc: true,
  },
];

describe('FDD integration: schema validation', () => {
  it('all FDD skills pass validation', () => {
    const result = validateSkillSet(FDD_SKILLS.map((s) => ({ frontmatter: s })));
    assert.equal(result.summary.invalid, 0, `Expected 0 invalid, got ${result.summary.invalid}`);
    assert.equal(result.summary.valid, FDD_SKILLS.length);
  });

  it('all FDD skills are viewer-compatible', () => {
    for (const skill of FDD_SKILLS) {
      assert.ok(isViewerCompatible(skill), `${skill.name} should be viewer-compatible`);
    }
  });

  it('validates individual frontmatter with no errors', () => {
    for (const skill of FDD_SKILLS) {
      const result = validateFrontmatter(skill);
      assert.equal(result.valid, true, `${skill.name}: ${result.errors.join(', ')}`);
    }
  });
});

describe('FDD integration: graph building', () => {
  it('builds graph with correct node count (uncondensed)', () => {
    const graph = buildSkillsGraph(FDD_SKILLS, { condenseCycles: false });
    const realNodes = graph.nodes.filter((n) => !n.isGhost && n.type !== 'script');
    assert.equal(realNodes.length, 11, `Expected 11 real nodes, got ${realNodes.length}`);
  });

  it('condensed graph has fewer nodes due to cycle supernodes', () => {
    const graph = buildSkillsGraph(FDD_SKILLS);
    // Bidirectional links create cycles → supernodes reduce total count
    assert.ok(graph.nodes.length < 11 + 3, 'Condensed should have fewer total nodes than uncondensed');
    assert.ok(graph.cycles.length > 0, 'Should have cycle supernodes');
  });

  it('MOC node has correct type and shape', () => {
    const graph = buildSkillsGraph(FDD_SKILLS);
    const moc = graph.nodes.find((n) => n.id === 'fdd-index');
    assert.ok(moc, 'fdd-index MOC node should exist');
    assert.equal(moc.type, 'moc');
    assert.equal(moc.shape, 'diamond');
  });

  it('creates script node for fdd-context.sh', () => {
    const graph = buildSkillsGraph(FDD_SKILLS, { condenseCycles: false });
    const scriptNode = graph.nodes.find((n) => n.type === 'script');
    assert.ok(scriptNode, 'Should have a script node');
    assert.equal(scriptNode.label, 'fdd-context.sh');
  });

  it('creates edges for related links', () => {
    const graph = buildSkillsGraph(FDD_SKILLS, { condenseCycles: false });
    const relatedEdges = graph.edges.filter((e) => e.kind === 'related');
    assert.ok(relatedEdges.length > 0, 'Should have related edges');

    // trend-analysis → databook-creation edge should exist
    const trendToDatabook = relatedEdges.find(
      (e) => e.source === 'trend-analysis' && e.target === 'databook-creation'
    );
    assert.ok(trendToDatabook, 'trend-analysis → databook-creation edge should exist');
  });

  it('creates script edge from trend-analysis', () => {
    const graph = buildSkillsGraph(FDD_SKILLS, { condenseCycles: false });
    const scriptEdges = graph.edges.filter((e) => e.kind === 'scripts');
    assert.equal(scriptEdges.length, 1);
    assert.equal(scriptEdges[0].source, 'trend-analysis');
  });

  it('creates ghost nodes for unresolved targets', () => {
    const graph = buildSkillsGraph(FDD_SKILLS, { condenseCycles: false });
    const ghosts = graph.nodes.filter((n) => n.isGhost);
    // review-predraft-sm and analytics-deliverable-items are referenced but not in our test set
    assert.ok(ghosts.length >= 2, `Expected >= 2 ghost nodes, got ${ghosts.length}`);
  });

  it('detects cycles in bidirectional links', () => {
    // target-research ↔ early-insights, databook-creation ↔ databook-source, etc.
    const graph = buildSkillsGraph(FDD_SKILLS);
    assert.ok(graph.cycles.length > 0, 'Should detect cycles from bidirectional related links');
  });

  it('provides sorted adjacency list', () => {
    const graph = buildSkillsGraph(FDD_SKILLS, { condenseCycles: false });
    const keys = Object.keys(graph.adjacency);
    const sorted = [...keys].sort();
    assert.deepEqual(keys, sorted, 'Adjacency keys should be sorted');
  });

  it('meta counts are consistent', () => {
    const graph = buildSkillsGraph(FDD_SKILLS);
    assert.equal(graph.meta.nodeCount, graph.nodes.length);
    assert.equal(graph.meta.edgeCount, graph.edges.length);
    assert.equal(graph.meta.cycleCount, graph.cycles.length);
  });
});

describe('FDD integration: resolver', () => {
  it('resolves all internal related targets', () => {
    const resolver = createWikiLinkResolver(FDD_SKILLS);
    const internalTargets = ['early-insights', 'databook-creation', 'trend-analysis', 'ebitda-adjustments'];
    for (const target of internalTargets) {
      const result = resolver.resolve(target);
      assert.equal(result.found, true, `${target} should resolve`);
    }
  });

  it('ghosts external references', () => {
    const resolver = createWikiLinkResolver(FDD_SKILLS);
    const result = resolver.resolve('review-predraft-sm');
    assert.equal(result.found, false);
  });
});
