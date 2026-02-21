import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFrontmatter,
  validateSkillSet,
  isViewerCompatible,
  normalizeFrontmatter,
  VALID_TYPES,
  VALID_STATUSES,
} from './schema.js';

describe('validateFrontmatter', () => {
  it('accepts valid frontmatter with all fields', () => {
    const fm = {
      name: 'trend-analysis',
      type: 'skill',
      category: 'fdd',
      tags: ['analysis', 'trends'],
      status: 'stable',
      version: '1.0',
      related: ['databook-creation'],
      scripts: ['scripts/shared/fdd-context.sh'],
      moc: false,
      description: 'Analyze trends',
    };
    const result = validateFrontmatter(fm);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.normalized.name, 'trend-analysis');
    assert.equal(result.normalized.type, 'skill');
    assert.deepEqual(result.normalized.tags, ['analysis', 'trends']);
  });

  it('rejects missing frontmatter', () => {
    const result = validateFrontmatter(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('missing'));
  });

  it('rejects non-object frontmatter', () => {
    const result = validateFrontmatter('not an object');
    assert.equal(result.valid, false);
  });

  it('errors on missing required name field', () => {
    const result = validateFrontmatter({ type: 'skill' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('name')));
  });

  it('applies defaults for missing optional fields', () => {
    const result = validateFrontmatter({ name: 'minimal' });
    assert.equal(result.valid, true);
    assert.equal(result.normalized.type, 'skill');
    assert.equal(result.normalized.status, 'stable');
    assert.equal(result.normalized.moc, false);
    assert.deepEqual(result.normalized.tags, []);
    assert.deepEqual(result.normalized.related, []);
  });

  it('coerces invalid type to default', () => {
    const result = validateFrontmatter({ name: 'test', type: 'INVALID' });
    assert.equal(result.valid, true);
    assert.equal(result.normalized.type, 'skill');
    assert.ok(result.warnings.length > 0);
  });

  it('coerces comma-separated tags string to array', () => {
    const result = validateFrontmatter({ name: 'test', tags: 'a, b, c' });
    assert.equal(result.valid, true);
    assert.deepEqual(result.normalized.tags, ['a', 'b', 'c']);
  });

  it('coerces single related string to array', () => {
    const result = validateFrontmatter({ name: 'test', related: 'other-skill' });
    assert.equal(result.valid, true);
    assert.deepEqual(result.normalized.related, ['other-skill']);
  });

  it('coerces numeric version to string', () => {
    const result = validateFrontmatter({ name: 'test', version: 1.5 });
    assert.equal(result.valid, true);
    assert.equal(result.normalized.version, '1.5');
  });

  it('coerces string boolean moc to actual boolean', () => {
    const result = validateFrontmatter({ name: 'test', moc: 'true' });
    assert.equal(result.valid, true);
    assert.equal(result.normalized.moc, true);
  });

  it('passes through unknown fields', () => {
    const result = validateFrontmatter({ name: 'test', phase: '04-analysis', triggers: ['trend'] });
    assert.equal(result.valid, true);
    assert.equal(result.normalized.phase, '04-analysis');
    assert.deepEqual(result.normalized.triggers, ['trend']);
  });

  it('warns on unknown fields in strict mode', () => {
    const result = validateFrontmatter({ name: 'test', custom_field: 'val' }, { strict: true });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes('custom_field')));
  });

  it('allows overriding required fields', () => {
    const result = validateFrontmatter({ type: 'skill' }, { requiredFields: ['type'] });
    assert.equal(result.valid, true);
  });
});

describe('validateSkillSet', () => {
  it('validates an array of skill entries', () => {
    const skills = [
      { path: '/a.md', frontmatter: { name: 'a', type: 'skill' } },
      { path: '/b.md', frontmatter: { name: 'b', type: 'hook' } },
      { path: '/c.md', frontmatter: {} },
    ];
    const result = validateSkillSet(skills);
    assert.equal(result.summary.total, 3);
    assert.equal(result.summary.valid, 2);
    assert.equal(result.summary.invalid, 1);
  });

  it('returns per-skill validation results', () => {
    const skills = [
      { path: '/good.md', frontmatter: { name: 'good' } },
      { path: '/bad.md', frontmatter: null },
    ];
    const result = validateSkillSet(skills);
    assert.equal(result.results[0].valid, true);
    assert.equal(result.results[1].valid, false);
    assert.equal(result.results[0].path, '/good.md');
  });
});

describe('isViewerCompatible', () => {
  it('returns true for frontmatter with name', () => {
    assert.equal(isViewerCompatible({ name: 'test' }), true);
  });

  it('returns false for empty object', () => {
    assert.equal(isViewerCompatible({}), false);
  });

  it('returns false for null', () => {
    assert.equal(isViewerCompatible(null), false);
  });

  it('returns false for whitespace-only name', () => {
    assert.equal(isViewerCompatible({ name: '   ' }), false);
  });
});

describe('normalizeFrontmatter', () => {
  it('applies defaults and coercions', () => {
    const result = normalizeFrontmatter({ name: 'test', tags: 'a,b' });
    assert.equal(result.name, 'test');
    assert.equal(result.type, 'skill');
    assert.deepEqual(result.tags, ['a', 'b']);
  });

  it('returns empty object for null input', () => {
    const result = normalizeFrontmatter(null);
    assert.deepEqual(result, {});
  });
});

describe('constants', () => {
  it('exports valid types', () => {
    assert.ok(VALID_TYPES.has('skill'));
    assert.ok(VALID_TYPES.has('moc'));
    assert.ok(VALID_TYPES.has('hook'));
    assert.ok(!VALID_TYPES.has('unknown'));
  });

  it('exports valid statuses', () => {
    assert.ok(VALID_STATUSES.has('stable'));
    assert.ok(VALID_STATUSES.has('deprecated'));
    assert.ok(!VALID_STATUSES.has('deleted'));
  });
});
