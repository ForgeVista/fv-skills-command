import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWikiLinkResolver,
  normalizeSkillId,
  GHOST_PREFIX,
} from './resolver.js';

describe('normalizeSkillId', () => {
  it('lowercases and dash-separates', () => {
    assert.equal(normalizeSkillId('Trend Analysis'), 'trend-analysis');
  });

  it('strips .md extension', () => {
    assert.equal(normalizeSkillId('skill-file.md'), 'skill-file');
  });

  it('collapses multiple dashes', () => {
    assert.equal(normalizeSkillId('a---b'), 'a-b');
  });

  it('strips leading and trailing dashes', () => {
    assert.equal(normalizeSkillId('-hello-'), 'hello');
  });

  it('handles empty/null input', () => {
    assert.equal(normalizeSkillId(''), '');
    assert.equal(normalizeSkillId(null), '');
    assert.equal(normalizeSkillId(undefined), '');
  });
});

describe('createWikiLinkResolver', () => {
  const skills = [
    { name: 'trend-analysis', id: 'trend-analysis' },
    { name: 'Databook Creation', id: 'databook-creation' },
    { name: 'EBITDA Adjustments', id: 'ebitda-adjustments', aliases: ['qoe-bridge'] },
  ];

  it('resolves exact match', () => {
    const resolver = createWikiLinkResolver(skills);
    const result = resolver.resolve('trend-analysis');
    assert.equal(result.found, true);
    assert.equal(result.matchedBy, 'exact');
    assert.equal(result.id, 'trend-analysis');
  });

  it('resolves normalized match (case-insensitive + dash)', () => {
    const resolver = createWikiLinkResolver(skills);
    const result = resolver.resolve('Databook Creation');
    assert.equal(result.found, true);
    assert.equal(result.matchedBy, 'exact');
    assert.equal(result.id, 'databook-creation');
  });

  it('resolves via alias', () => {
    const resolver = createWikiLinkResolver(skills);
    const result = resolver.resolve('qoe-bridge');
    assert.equal(result.found, true);
    assert.equal(result.id, 'ebitda-adjustments');
  });

  it('returns ghost for unknown target', () => {
    const resolver = createWikiLinkResolver(skills);
    const result = resolver.resolve('nonexistent-skill');
    assert.equal(result.found, false);
    assert.equal(result.matchedBy, 'ghost');
    assert.ok(result.id.startsWith(GHOST_PREFIX));
  });

  it('returns ghost for empty target', () => {
    const resolver = createWikiLinkResolver(skills);
    const result = resolver.resolve('');
    assert.equal(result.found, false);
    assert.equal(result.id, `${GHOST_PREFIX}unknown`);
  });

  it('handles string-only skill entries', () => {
    const resolver = createWikiLinkResolver(['simple-skill', 'another-one']);
    const result = resolver.resolve('simple-skill');
    assert.equal(result.found, true);
    assert.equal(result.id, 'simple-skill');
  });

  it('handles empty skills list', () => {
    const resolver = createWikiLinkResolver([]);
    const result = resolver.resolve('anything');
    assert.equal(result.found, false);
  });

  it('resolves by filename stem', () => {
    const resolver = createWikiLinkResolver([{ name: 'My Skill', file: '/path/to/my-skill.md' }]);
    const result = resolver.resolve('my-skill');
    assert.equal(result.found, true);
  });

  it('ignores null/undefined entries in skills list', () => {
    const resolver = createWikiLinkResolver([null, undefined, '', { name: 'valid' }]);
    const result = resolver.resolve('valid');
    assert.equal(result.found, true);
  });

  it('handles special characters in target', () => {
    const resolver = createWikiLinkResolver([{ name: 'café-latte', id: 'cafe-latte' }]);
    const result = resolver.resolve('café-latte');
    assert.equal(result.found, true);
  });

  it('resolves case-insensitive normalized ID', () => {
    const resolver = createWikiLinkResolver(skills);
    const result = resolver.resolve('TREND-ANALYSIS');
    assert.equal(result.found, true);
    assert.equal(result.id, 'trend-analysis');
  });
});

describe('normalizeSkillId edge cases', () => {
  it('handles numeric input', () => {
    assert.equal(normalizeSkillId(42), '42');
  });

  it('handles path-like input', () => {
    assert.equal(normalizeSkillId('path/to/file.md'), 'path-to-file');
  });

  it('handles unicode', () => {
    const result = normalizeSkillId('über-skill');
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });
});
