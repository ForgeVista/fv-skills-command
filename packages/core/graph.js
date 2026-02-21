import { basename } from 'node:path';
import { createWikiLinkResolver, GHOST_PREFIX, normalizeSkillId } from './resolver.js';
import { themeToGraphColors, FV_DEFAULTS } from './theme.js';

/** @deprecated Use themeToGraphColors(theme) for white-label support */
export const FV_COLORS = themeToGraphColors(FV_DEFAULTS);

export const TYPE_TO_SHAPE = {
  skill: 'ellipse',
  subagent: 'round-rectangle',
  hook: 'hexagon',
  command: 'parallelogram',
  moc: 'diamond',
  script: 'rectangle',
  unresolved: 'round-rectangle',
  cycle: 'round-rectangle',
};

const TYPE_TO_COLOR = {
  skill: FV_COLORS.primary,
  subagent: '#6495ED',
  hook: FV_COLORS.steelBlue,
  command: FV_COLORS.lightBlue,
  moc: FV_COLORS.accent,
  script: FV_COLORS.slateGray,
  unresolved: FV_COLORS.slateGray,
  cycle: FV_COLORS.accent,
};

function normalizeType(rawType, moc) {
  if (moc) return 'moc';
  const normalized = normalizeSkillId(rawType || 'skill');

  if (
    normalized === 'skill' ||
    normalized === 'subagent' ||
    normalized === 'hook' ||
    normalized === 'command' ||
    normalized === 'moc' ||
    normalized === 'script'
  ) {
    return normalized;
  }

  return 'skill';
}

function deriveSkillId(raw) {
  return normalizeSkillId(raw.id || raw.name || raw.slug || raw.fileStem || basename(raw.file || raw.path || ''));
}

function deriveLabel(raw, id) {
  return String(raw.name || raw.title || raw.slug || id || 'unknown');
}

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function scriptNodeId(scriptPath) {
  return `script:${String(scriptPath).trim()}`;
}

function toCytoscapeShape(shape) {
  if (shape === 'parallelogram') return 'rhomboid';
  return shape;
}

function upsertNode(nodeMap, node) {
  const existing = nodeMap.get(node.id);
  if (!existing) {
    nodeMap.set(node.id, node);
    return;
  }

  const merged = {
    ...existing,
    ...node,
    members: existing.members || node.members || [],
  };

  const existingIsGhost = Boolean(existing.isGhost);
  const incomingIsGhost = Boolean(node.isGhost);

  if (existingIsGhost && !incomingIsGhost) {
    merged.color = node.color;
    merged.type = node.type;
    merged.label = node.label;
    merged.isGhost = false;
  }

  nodeMap.set(node.id, merged);
}

function addEdge(edgeMap, source, target, kind, extras = {}) {
  if (!source || !target) return;
  const key = `${source}=>${target}::${kind}`;
  if (edgeMap.has(key)) return;

  edgeMap.set(key, {
    id: key,
    source,
    target,
    kind,
    ...extras,
  });
}

function collectKnownSkills(skills) {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    file: skill.file,
    path: skill.path,
    fileStem: skill.fileStem,
    aliases: normalizeArray(skill.aliases),
  }));
}

function parseSkillInput(rawSkills) {
  const parsedSkills = [];

  for (const raw of normalizeArray(rawSkills)) {
    if (!raw || typeof raw !== 'object') continue;

    const id = deriveSkillId(raw);
    if (!id) continue;

    const label = deriveLabel(raw, id);
    const type = normalizeType(raw.type, raw.moc === true);

    parsedSkills.push({
      id,
      name: label,
      type,
      moc: raw.moc === true,
      category: raw.category || null,
      status: raw.status || null,
      file: raw.file || null,
      path: raw.path || null,
      fileStem: raw.fileStem || basename(raw.file || raw.path || '').replace(/\.[^.]+$/, ''),
      related: normalizeArray(raw.related),
      scripts: normalizeArray(raw.scripts),
      wikiLinks: normalizeArray(raw.wikiLinks),
      aliases: normalizeArray(raw.aliases),
    });
  }

  return parsedSkills;
}

function resolveTarget(rawTarget, resolver) {
  const target = String(rawTarget ?? '').trim();
  if (!target) {
    return {
      id: `${GHOST_PREFIX}unknown`,
      found: false,
      matchedBy: 'ghost',
      label: 'unknown',
      raw: target,
    };
  }

  const resolved = resolver.resolve(target);
  return {
    id: resolved.id,
    found: resolved.found,
    matchedBy: resolved.matchedBy,
    label: resolved.displayName || target,
    raw: target,
  };
}

function nodeFromSkill(skill) {
  return {
    id: skill.id,
    label: skill.name,
    type: skill.type,
    shape: TYPE_TO_SHAPE[skill.type] || TYPE_TO_SHAPE.skill,
    color: TYPE_TO_COLOR[skill.type] || TYPE_TO_COLOR.skill,
    category: skill.category,
    status: skill.status,
    moc: skill.moc,
    isGhost: false,
    members: [],
  };
}

function nodeFromGhost(target) {
  return {
    id: target.id,
    label: target.raw || target.label || target.id,
    type: 'unresolved',
    shape: TYPE_TO_SHAPE.unresolved,
    color: TYPE_TO_COLOR.unresolved,
    isGhost: true,
    members: [],
  };
}

function nodeFromScript(scriptPath) {
  const id = scriptNodeId(scriptPath);
  return {
    id,
    label: basename(String(scriptPath)),
    type: 'script',
    shape: TYPE_TO_SHAPE.script,
    color: TYPE_TO_COLOR.script,
    scriptPath: String(scriptPath),
    isGhost: false,
    members: [],
  };
}

function buildCycleAdjacency(nodes, edges) {
  const adjacency = new Map();
  const eligible = new Set();

  for (const node of nodes) {
    if (!node.isGhost && node.type !== 'script' && node.type !== 'cycle') {
      eligible.add(node.id);
      adjacency.set(node.id, []);
    }
  }

  for (const edge of edges) {
    if (!eligible.has(edge.source) || !eligible.has(edge.target)) continue;
    adjacency.get(edge.source).push(edge.target);
  }

  return { adjacency, eligible };
}

function toSortedUnique(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function buildAdjacencyList(nodes = [], edges = [], options = {}) {
  const includeGhost = Boolean(options.includeGhost);
  const includeScripts = Boolean(options.includeScripts);
  const includeCycles = Boolean(options.includeCycles);
  const bucketsByNode = new Map();

  for (const node of nodes) {
    if (!includeGhost && node.isGhost) continue;
    if (!includeScripts && node.type === 'script') continue;
    if (!includeCycles && node.type === 'cycle') continue;

    bucketsByNode.set(node.id, {
      all: [],
      wiki: [],
      related: [],
      scripts: [],
    });
  }

  for (const edge of edges) {
    const sourceBuckets = bucketsByNode.get(edge.source);
    if (!sourceBuckets) continue;

    const kind = edge.kind === 'related' || edge.kind === 'scripts' ? edge.kind : 'wiki';
    sourceBuckets.all.push(edge.target);
    sourceBuckets[kind].push(edge.target);
  }

  const adjacency = {};
  for (const nodeId of Array.from(bucketsByNode.keys()).sort((a, b) => a.localeCompare(b))) {
    const buckets = bucketsByNode.get(nodeId);
    adjacency[nodeId] = {
      all: toSortedUnique(buckets.all),
      wiki: toSortedUnique(buckets.wiki),
      related: toSortedUnique(buckets.related),
      scripts: toSortedUnique(buckets.scripts),
    };
  }

  return adjacency;
}

function tarjanScc(adjacency) {
  const indexByNode = new Map();
  const lowLinkByNode = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let index = 0;

  function strongConnect(node) {
    indexByNode.set(node, index);
    lowLinkByNode.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      if (!indexByNode.has(neighbor)) {
        strongConnect(neighbor);
        lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node), lowLinkByNode.get(neighbor)));
      } else if (onStack.has(neighbor)) {
        lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node), indexByNode.get(neighbor)));
      }
    }

    if (lowLinkByNode.get(node) === indexByNode.get(node)) {
      const component = [];
      while (stack.length > 0) {
        const member = stack.pop();
        onStack.delete(member);
        component.push(member);
        if (member === node) break;
      }
      components.push(component);
    }
  }

  for (const node of adjacency.keys()) {
    if (!indexByNode.has(node)) {
      strongConnect(node);
    }
  }

  return components;
}

function condenseCycles(nodes, edges) {
  const { adjacency } = buildCycleAdjacency(nodes, edges);
  const components = tarjanScc(adjacency);

  const selfLoops = new Set();
  for (const edge of edges) {
    if (edge.source === edge.target) selfLoops.add(edge.source);
  }

  const cycles = components.filter((component) => component.length > 1 || selfLoops.has(component[0]));
  if (cycles.length === 0) {
    return {
      nodes,
      edges,
      cycles: [],
      cycleLookup: new Map(),
    };
  }

  const memberToCycle = new Map();
  const cycleNodes = [];

  cycles.forEach((members, index) => {
    const cycleId = `cycle:${index + 1}`;
    const label = `cycle(${members.length})`;

    cycleNodes.push({
      id: cycleId,
      label,
      type: 'cycle',
      shape: TYPE_TO_SHAPE.cycle,
      color: TYPE_TO_COLOR.cycle,
      isGhost: false,
      members: [...members].sort(),
      cycleSize: members.length,
    });

    for (const member of members) {
      memberToCycle.set(member, cycleId);
    }
  });

  const condensedNodes = nodes.filter((node) => !memberToCycle.has(node.id));
  condensedNodes.push(...cycleNodes);

  const condensedEdgeMap = new Map();
  for (const edge of edges) {
    const source = memberToCycle.get(edge.source) || edge.source;
    const target = memberToCycle.get(edge.target) || edge.target;
    if (source === target) continue;

    addEdge(condensedEdgeMap, source, target, edge.kind, {
      collapsedFrom: edge.id,
    });
  }

  return {
    nodes: condensedNodes,
    edges: Array.from(condensedEdgeMap.values()),
    cycles: cycleNodes.map((node) => ({ id: node.id, members: node.members, label: node.label })),
    cycleLookup: memberToCycle,
  };
}

function sortGraph(nodes, edges) {
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
  return { nodes: sortedNodes, edges: sortedEdges };
}

export function buildSkillsGraph(rawSkills = [], options = {}) {
  const skills = parseSkillInput(rawSkills);
  const resolver = options.resolver || createWikiLinkResolver(collectKnownSkills(skills));

  const nodeMap = new Map();
  const edgeMap = new Map();

  for (const skill of skills) {
    upsertNode(nodeMap, nodeFromSkill(skill));
  }

  for (const skill of skills) {
    for (const scriptPath of skill.scripts) {
      if (!scriptPath) continue;
      const scriptNode = nodeFromScript(scriptPath);
      upsertNode(nodeMap, scriptNode);
      addEdge(edgeMap, skill.id, scriptNode.id, 'scripts');
    }

    for (const relatedTarget of skill.related) {
      const target = resolveTarget(relatedTarget, resolver);
      if (!target.found) upsertNode(nodeMap, nodeFromGhost(target));
      addEdge(edgeMap, skill.id, target.id, 'related', {
        targetRaw: target.raw,
        matchedBy: target.matchedBy,
      });
    }

    for (const wikiLink of skill.wikiLinks) {
      const wikiTargetRaw =
        typeof wikiLink === 'string'
          ? wikiLink
          : wikiLink.target || wikiLink.value || wikiLink.resolvedId || wikiLink.id || '';

      const target = resolveTarget(wikiTargetRaw, resolver);
      if (!target.found) upsertNode(nodeMap, nodeFromGhost(target));
      addEdge(edgeMap, skill.id, target.id, 'wiki', {
        targetRaw: target.raw,
        matchedBy: target.matchedBy,
      });
    }
  }

  const graph = {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
  const rawAdjacency = buildAdjacencyList(graph.nodes, graph.edges, options.adjacencyOptions);

  const condensed = options.condenseCycles === false ? null : condenseCycles(graph.nodes, graph.edges);

  const finalGraph = condensed
    ? {
        nodes: condensed.nodes,
        edges: condensed.edges,
      }
    : graph;

  const sorted = sortGraph(finalGraph.nodes, finalGraph.edges);
  const adjacency = buildAdjacencyList(sorted.nodes, sorted.edges, options.adjacencyOptions);

  return {
    ...sorted,
    adjacency,
    rawAdjacency,
    cycles: condensed ? condensed.cycles : [],
    meta: {
      nodeCount: sorted.nodes.length,
      edgeCount: sorted.edges.length,
      cycleCount: condensed ? condensed.cycles.length : 0,
    },
  };
}

export function chooseGraphLayout(graph, options = {}) {
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const density = nodeCount > 0 ? edgeCount / nodeCount : 0;

  const denseThreshold = Number(options.denseThreshold ?? 120);
  const densityThreshold = Number(options.densityThreshold ?? 1.6);
  const isDense = nodeCount >= denseThreshold || density >= densityThreshold;

  if (isDense) {
    return {
      name: 'dagre',
      rankDir: 'LR',
      nodeSep: 40,
      rankSep: 80,
      edgeSep: 12,
      fit: true,
      padding: 24,
      animate: false,
    };
  }

  return {
    name: 'breadthfirst',
    directed: true,
    padding: 24,
    spacingFactor: 1.1,
    animate: false,
    fit: true,
  };
}

export function buildCytoscapeStyles(options = {}) {
  const colors = options.theme
    ? { ...themeToGraphColors(options.theme), ...(options.colors || {}) }
    : { ...FV_COLORS, ...(options.colors || {}) };

  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        shape: 'data(cytoShape)',
        'background-color': 'data(color)',
        color: '#FFFFFF',
        'font-family': 'JetBrains Mono, monospace',
        'font-size': 11,
        'text-wrap': 'wrap',
        'text-max-width': 160,
        'text-valign': 'center',
        'text-halign': 'center',
        width: 36,
        height: 36,
        'border-width': 1,
        'border-color': colors.slateGray,
      },
    },
    {
      selector: 'node[type = "moc"]',
      style: {
        width: 56,
        height: 56,
        'font-size': 12,
      },
    },
    {
      selector: 'node[type = "cycle"]',
      style: {
        width: 52,
        height: 52,
        'border-width': 2,
      },
    },
    {
      selector: 'node[isGhost = 1]',
      style: {
        'background-color': colors.ghost,
        'border-style': 'dashed',
        'border-width': 2,
        opacity: 0.55,
      },
    },
    {
      selector: ':selected',
      style: {
        'overlay-color': colors.selected,
        'overlay-opacity': 0.18,
        'overlay-padding': 8,
        'border-color': colors.selected,
        'border-width': 3,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 2,
        'line-color': colors.slateGray,
        'target-arrow-color': colors.slateGray,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        opacity: 0.88,
      },
    },
    {
      selector: 'edge[kind = "related"]',
      style: {
        'line-style': 'dashed',
        'line-color': colors.lightBlue,
        'target-arrow-color': colors.lightBlue,
      },
    },
    {
      selector: 'edge[kind = "scripts"]',
      style: {
        'line-style': 'dotted',
        'line-color': colors.accent,
        'target-arrow-color': colors.accent,
      },
    },
    {
      selector: 'edge[target ^= "unresolved:"]',
      style: {
        'line-style': 'dashed',
        opacity: 0.6,
      },
    },
  ];
}

export function createCytoscapeConfig(graph, options = {}) {
  const style = options.style || buildCytoscapeStyles(options);
  const layout = options.layout || chooseGraphLayout(graph, options);

  const elements = {
    nodes: graph.nodes.map((node) => ({
      data: {
        ...node,
        cytoShape: toCytoscapeShape(node.shape),
        isGhost: node.isGhost ? 1 : 0,
      },
    })),
    edges: graph.edges.map((edge) => ({ data: edge })),
  };

  return {
    elements,
    style,
    layout,
    minZoom: options.minZoom ?? 0.08,
    maxZoom: options.maxZoom ?? 2.5,
    pixelRatio: options.pixelRatio ?? 1,
    wheelSensitivity: options.wheelSensitivity ?? 0.2,
    textureOnViewport: true,
    motionBlur: false,
  };
}
