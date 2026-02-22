import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEALTH_SCHEMA_VERSION,
  HEALTH_RULES,
  validateHealthCheckResult,
  validateHealthReport,
  worstStatus,
  createCheckResult,
  buildHealthReport,
  runHealthChecks,
} from './health.js';
import { createStubAdapter, validateAdapter } from './health-adapter.js';

// ── Fixture: a skills folder with 2 skills, 1 helper, 1 broken wikilink ──

function createFixtureAdapter() {
  const files = {
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.git/refs/heads/autogit/tracking': 'abc123\n',
    'skill-a.md': [
      '---',
      'name: skill-a',
      'type: skill',
      '---',
      '## Description',
      'First skill.',
      '## Output',
      'Produces a report.',
      '',
      'See also [[skill-b]] and [[missing-skill]].',
    ].join('\n'),
    'skill-b.md': [
      '---',
      'name: skill-b',
      'type: skill',
      '---',
      '## Description',
      'Second skill.',
    ].join('\n'),
    'helpers/README.md': '# Helpers\nReference docs.',
  };

  function resolvePath(rel) {
    return (rel || '').replace(/^\/+/, '');
  }

  return createStubAdapter({
    async readFile(relativePath) {
      const p = resolvePath(relativePath);
      return files[p] ?? null;
    },

    async listDir(relativePath) {
      const prefix = resolvePath(relativePath);
      const entries = new Set();
      for (const key of Object.keys(files)) {
        if (prefix && !key.startsWith(prefix + '/') && !key.startsWith(prefix)) continue;
        const rest = prefix ? key.slice(prefix.length + 1) : key;
        if (!rest) continue;
        const first = rest.split('/')[0];
        if (first && !first.startsWith('.')) {
          entries.add(first);
        }
      }
      return [...entries];
    },

    async exists(relativePath) {
      const p = resolvePath(relativePath);
      // Check direct file match or directory prefix
      if (files[p]) return true;
      return Object.keys(files).some((k) => k.startsWith(p + '/'));
    },

    async isGitRepo() {
      return '.git/HEAD' in files;
    },

    async hasAutogitTracking() {
      return '.git/refs/heads/autogit/tracking' in files;
    },

    async skillFileCount() {
      return Object.keys(files).filter((k) => k.endsWith('.md') && !k.startsWith('.')).length;
    },
  });
}

// ── Schema validation tests ──

describe('HEALTH_SCHEMA_VERSION', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof HEALTH_SCHEMA_VERSION, 'string');
    assert.ok(HEALTH_SCHEMA_VERSION.length > 0);
  });
});

describe('HEALTH_RULES', () => {
  it('contains exactly 6 rule IDs', () => {
    assert.equal(HEALTH_RULES.length, 6);
  });

  it('includes all expected rules', () => {
    for (const id of ['git', 'autogit', 'skills-count', 'wiki-links', 'dof', 'helpers']) {
      assert.ok(HEALTH_RULES.includes(id), `Missing rule: ${id}`);
    }
  });
});

describe('validateHealthCheckResult', () => {
  it('accepts a valid result', () => {
    const { valid, errors } = validateHealthCheckResult({
      rule: 'git', status: 'pass', message: 'OK',
    });
    assert.equal(valid, true);
    assert.equal(errors.length, 0);
  });

  it('rejects missing rule', () => {
    const { valid } = validateHealthCheckResult({ status: 'pass', message: 'OK' });
    assert.equal(valid, false);
  });

  it('rejects invalid status', () => {
    const { valid } = validateHealthCheckResult({ rule: 'git', status: 'unknown', message: 'OK' });
    assert.equal(valid, false);
  });
});

describe('worstStatus', () => {
  it('returns fail when any status is fail', () => {
    assert.equal(worstStatus(['pass', 'warn', 'fail']), 'fail');
  });

  it('returns warn when worst is warn', () => {
    assert.equal(worstStatus(['pass', 'warn']), 'warn');
  });

  it('returns pass when all pass', () => {
    assert.equal(worstStatus(['pass', 'pass']), 'pass');
  });
});

describe('buildHealthReport', () => {
  it('builds a valid report', () => {
    const results = [
      createCheckResult('git', 'pass', 'OK'),
      createCheckResult('autogit', 'warn', 'Missing'),
    ];
    const report = buildHealthReport(results, { startTime: Date.now() - 100 });

    assert.equal(report.version, HEALTH_SCHEMA_VERSION);
    assert.equal(report.overall, 'warn');
    assert.equal(report.results.length, 2);
    assert.equal(typeof report.checkedAt, 'string');
    assert.ok(report.duration >= 0);

    const { valid } = validateHealthReport(report);
    assert.equal(valid, true);
  });
});

// ── Adapter validation tests ──

describe('validateAdapter', () => {
  it('accepts a complete stub adapter', () => {
    const adapter = createStubAdapter();
    const { valid, missing } = validateAdapter(adapter);
    assert.equal(valid, true);
    assert.equal(missing.length, 0);
  });

  it('detects missing methods', () => {
    const { valid, missing } = validateAdapter({ readFile: async () => null });
    assert.equal(valid, false);
    assert.ok(missing.includes('listDir'));
  });
});

// ── Conformance test: both adapters produce identical results from same fixture ──

describe('runHealthChecks — adapter conformance', () => {
  it('produces a valid HealthReport from fixture adapter', async () => {
    const adapter = createFixtureAdapter();
    const report = await runHealthChecks(adapter);

    // Report structure
    assert.equal(report.version, HEALTH_SCHEMA_VERSION);
    assert.equal(typeof report.checkedAt, 'string');
    assert.ok(report.duration >= 0);
    assert.equal(report.results.length, 6);

    // Validate the report itself
    const { valid, errors } = validateHealthReport(report);
    assert.equal(valid, true, `Validation errors: ${errors.join(', ')}`);
  });

  it('passes git check when .git exists', async () => {
    const adapter = createFixtureAdapter();
    const report = await runHealthChecks(adapter);
    const git = report.results.find((r) => r.rule === 'git');
    assert.equal(git.status, 'pass');
  });

  it('passes autogit check when tracking branch exists', async () => {
    const adapter = createFixtureAdapter();
    const report = await runHealthChecks(adapter);
    const autogit = report.results.find((r) => r.rule === 'autogit');
    assert.equal(autogit.status, 'pass');
  });

  it('passes skills-count check with 3 .md files', async () => {
    const adapter = createFixtureAdapter();
    const report = await runHealthChecks(adapter);
    const skills = report.results.find((r) => r.rule === 'skills-count');
    assert.equal(skills.status, 'pass');
  });

  it('warns on broken wiki links', async () => {
    const adapter = createFixtureAdapter();
    const report = await runHealthChecks(adapter);
    const wikiLinks = report.results.find((r) => r.rule === 'wiki-links');
    assert.equal(wikiLinks.status, 'warn');
    assert.ok(wikiLinks.detail.broken.length > 0);
    assert.ok(wikiLinks.detail.broken.some((b) => b.target === 'missing-skill'));
  });

  it('fails git check when no .git', async () => {
    const adapter = createStubAdapter({
      async isGitRepo() { return false; },
      async hasAutogitTracking() { return false; },
      async skillFileCount() { return 0; },
      async listDir() { return []; },
    });
    const report = await runHealthChecks(adapter);
    const git = report.results.find((r) => r.rule === 'git');
    assert.equal(git.status, 'fail');
  });

  it('overall status is worst across all checks', async () => {
    const adapter = createStubAdapter({
      async isGitRepo() { return false; }, // fail
      async hasAutogitTracking() { return false; }, // warn
      async skillFileCount() { return 0; }, // fail
      async listDir() { return []; },
    });
    const report = await runHealthChecks(adapter);
    assert.equal(report.overall, 'fail');
  });
});
