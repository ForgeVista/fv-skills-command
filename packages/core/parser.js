import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkWikiLink from 'remark-wiki-link';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';

export const DEFAULT_LINK_BASE = '#/skill';
export const GHOST_PREFIX = 'unresolved:';

function normalizeDashSeparated(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeName(value) {
  return String(value ?? '').trim();
}

function pathBasename(value = '') {
  const raw = String(value ?? '');
  if (!raw) return '';
  const normalized = raw.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

function stripExtension(filename = '') {
  return String(filename).replace(/\.[^.]+$/, '');
}

function safeFileStem(filePath = '') {
  return stripExtension(pathBasename(filePath));
}

function withTrailingSlash(base) {
  if (!base) return DEFAULT_LINK_BASE + '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function toCanonicalEntry(raw) {
  if (!raw) return null;

  if (typeof raw === 'string') {
    const name = normalizeName(raw);
    const normalized = normalizeDashSeparated(raw);
    if (!normalized) return null;
    return {
      id: normalized,
      displayName: name || normalized,
      names: [name].filter(Boolean),
      stem: normalized,
    };
  }

  const primaryName = normalizeName(raw.name || raw.id || raw.slug || raw.fileStem || raw.file || raw.path || '');
  const normalizedId = normalizeDashSeparated(raw.id || raw.name || raw.slug || raw.fileStem || safeFileStem(raw.file || raw.path || ''));
  if (!normalizedId) return null;

  const aliases = Array.isArray(raw.aliases) ? raw.aliases : [];
  const stem = normalizeDashSeparated(raw.fileStem || safeFileStem(raw.file || raw.path || primaryName));

  return {
    id: normalizedId,
    displayName: primaryName || normalizedId,
    names: [primaryName, raw.id, raw.slug, ...aliases].map(normalizeName).filter(Boolean),
    stem: stem || normalizedId,
  };
}

function mergeSchemas(base, extension = {}) {
  return {
    ...base,
    ...extension,
    attributes: {
      ...(base.attributes || {}),
      ...(extension.attributes || {}),
    },
    tagNames: Array.from(new Set([...(base.tagNames || []), ...(extension.tagNames || [])])),
  };
}

function buildSanitizeSchema(customSchema) {
  const schema = mergeSchemas(defaultSchema, {
    attributes: {
      ...(defaultSchema.attributes || {}),
      a: [
        ...((defaultSchema.attributes && defaultSchema.attributes.a) || []),
        'className',
        'data-skill-id',
        'data-wiki-target',
        'data-wiki-status',
      ],
      pre: [...((defaultSchema.attributes && defaultSchema.attributes.pre) || []), 'className'],
      code: [...((defaultSchema.attributes && defaultSchema.attributes.code) || []), 'className'],
      span: [...((defaultSchema.attributes && defaultSchema.attributes.span) || []), 'className'],
    },
    tagNames: ['pre', 'code', 'span', 'a'],
  });

  if (!customSchema) return schema;
  return mergeSchemas(schema, customSchema);
}

export function createWikiLinkResolver(knownSkills = []) {
  const exact = new Map();
  const normalized = new Map();
  const stems = new Map();

  for (const rawEntry of knownSkills) {
    const entry = toCanonicalEntry(rawEntry);
    if (!entry) continue;

    for (const name of entry.names) {
      exact.set(name, entry);
      normalized.set(normalizeDashSeparated(name), entry);
    }

    normalized.set(entry.id, entry);
    stems.set(entry.stem, entry);
  }

  return {
    resolve(targetRaw) {
      const target = normalizeName(targetRaw);
      if (!target) {
        return {
          found: false,
          matchedBy: 'ghost',
          id: `${GHOST_PREFIX}unknown`,
          displayName: 'unknown',
        };
      }

      const exactMatch = exact.get(target);
      if (exactMatch) {
        return {
          found: true,
          matchedBy: 'exact',
          id: exactMatch.id,
          displayName: exactMatch.displayName,
        };
      }

      const normalizedTarget = normalizeDashSeparated(target);
      const normalizedMatch = normalized.get(normalizedTarget);
      if (normalizedMatch) {
        return {
          found: true,
          matchedBy: 'normalized',
          id: normalizedMatch.id,
          displayName: normalizedMatch.displayName,
        };
      }

      const stemMatch = stems.get(normalizedTarget);
      if (stemMatch) {
        return {
          found: true,
          matchedBy: 'filename-stem',
          id: stemMatch.id,
          displayName: stemMatch.displayName,
        };
      }

      return {
        found: false,
        matchedBy: 'ghost',
        id: `${GHOST_PREFIX}${normalizedTarget || 'unknown'}`,
        displayName: target,
      };
    },
  };
}

function remarkStripFrontmatter() {
  return (tree) => {
    if (!Array.isArray(tree.children)) return;
    tree.children = tree.children.filter((node) => node.type !== 'yaml' && node.type !== 'toml');
  };
}

function normalizeWikiNode(node) {
  if (!node) return null;
  if (typeof node.value === 'string' && node.value.trim()) return node.value.trim();
  if (node.data && typeof node.data.alias === 'string' && node.data.alias.trim()) return node.data.alias.trim();
  return null;
}

function resolveWikiNodes({ resolver, linkBase, wikiLinks }) {
  const base = withTrailingSlash(linkBase || DEFAULT_LINK_BASE);

  return (tree) => {
    visit(tree, 'wikiLink', (node, index, parent) => {
      if (index == null || !parent || !Array.isArray(parent.children)) return;

      const target = normalizeWikiNode(node) || '';
      const alias = node.data && typeof node.data.alias === 'string' ? node.data.alias : null;
      const resolved = resolver.resolve(target);
      const href = resolved.found ? `${base}${encodeURIComponent(resolved.id)}` : '#';

      wikiLinks.push({
        target,
        alias,
        resolvedId: resolved.id,
        resolved: resolved.found,
        matchedBy: resolved.matchedBy,
      });

      parent.children[index] = {
        type: 'link',
        url: href,
        title: resolved.found ? resolved.displayName : `Skill not found: ${target}`,
        data: {
          hProperties: {
            className: ['wiki-link', resolved.found ? 'wiki-link--resolved' : 'wiki-link--ghost'],
            'data-skill-id': resolved.id,
            'data-wiki-target': target,
            'data-wiki-status': resolved.found ? 'resolved' : 'ghost',
          },
        },
        children: [
          {
            type: 'text',
            value: alias || target,
          },
        ],
      };
    });
  };
}

function trackMermaidBlocks(onMermaid) {
  return (tree) => {
    visit(tree, 'code', (node) => {
      if (normalizeDashSeparated(node.lang) === 'mermaid') {
        onMermaid();
      }
    });
  };
}

function rehypeTransformMermaidBlocks(onMermaid) {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!node || node.tagName !== 'pre' || !Array.isArray(node.children) || node.children.length === 0) {
        return;
      }

      const firstChild = node.children[0];
      if (!firstChild || firstChild.type !== 'element' || firstChild.tagName !== 'code') {
        return;
      }

      const className = firstChild.properties && firstChild.properties.className;
      const classList = Array.isArray(className) ? className.map(String) : className ? [String(className)] : [];
      const isMermaid = classList.includes('language-mermaid');
      if (!isMermaid) return;

      const textNode = (firstChild.children || []).find((child) => child.type === 'text');
      const text = textNode ? textNode.value : '';

      node.properties = {
        ...(node.properties || {}),
        className: ['mermaid'],
      };
      node.children = [{ type: 'text', value: text }];
      onMermaid();
    });
  };
}

export async function parseMarkdown(markdown, options = {}) {
  const wikiLinks = [];
  const unresolvedLinks = [];
  let hasMermaid = false;

  const resolver =
    options.resolver ||
    createWikiLinkResolver(options.skills || options.knownSkills || options.skillIndex || []);

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkStripFrontmatter)
    .use(remarkWikiLink, {
      aliasDivider: '|',
      pageResolver: (name) => [name],
      hrefTemplate: (permalink) => permalink,
    })
    .use(resolveWikiNodes, {
      resolver,
      linkBase: options.linkBase || DEFAULT_LINK_BASE,
      wikiLinks,
    })
    .use(trackMermaidBlocks, () => {
      hasMermaid = true;
    })
    .use(remarkRehype)
    .use(rehypeTransformMermaidBlocks, () => {
      hasMermaid = true;
    })
    .use(rehypeHighlight, {
      ignoreMissing: true,
      plainText: ['text'],
    })
    .use(rehypeSanitize, buildSanitizeSchema(options.sanitizeSchema))
    .use(rehypeStringify);

  const file = await processor.process(String(markdown ?? ''));

  for (const link of wikiLinks) {
    if (!link.resolved) unresolvedLinks.push(link);
  }

  return {
    html: String(file),
    wikiLinks,
    unresolvedLinks,
    hasMermaid,
  };
}

export async function renderMermaidIfNeeded(container, options = {}) {
  if (!container || !options.hasMermaid) return false;

  const mermaidNodes = container.querySelectorAll('pre.mermaid');
  if (!mermaidNodes.length) return false;

  const loader = options.loadMermaid || (() => import('mermaid'));
  const imported = await loader();
  const mermaid = imported && imported.default ? imported.default : imported;

  if (!mermaid || typeof mermaid.run !== 'function') return false;

  if (typeof mermaid.initialize === 'function') {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      ...options.mermaidConfig,
    });
  }

  await mermaid.run({
    nodes: mermaidNodes,
  });

  return true;
}

export function normalizeSkillId(value) {
  return normalizeDashSeparated(value);
}
