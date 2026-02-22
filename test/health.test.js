/**
 * Unit tests for packages/core/health.js and packages/core/health-adapter.js.
 *
 * Uses node:test (built-in). Run via: node --test test/health.test.js
 */
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
} from '../packages/core/health.js';

import {
  validateAdapter,
  createStubAdapter,
} from '../packages/core/health-adapter.js';

// ── Helpers ─────────────────────────────────────────────────────────

/** Skill .md content with frontmatter containing a name field. */
function skillMd(name, body = '') {
  return `---\nname: ${name}\ntype: skill\n---\n${body}`;
}

/** Skill .md with a DOF heading. */
function skillMdWithDof(name) {
  return `---\nname: ${name}\ntype: skill\n---\n## Description\nSome description.`;
}

/** Helper/reference .md content (no frontmatter name). */
function helperMd(body = 'Reference doc.') {
  return body;
}

/** Build a stub adapter with filesystem contents. */
function buildAdapter(opts = {}) {
  const {
    isGitRepo = true,
    hasAutogitTracking = false,
    files = {},
  } = opts;

  const fileMap = new Map(Object.entries(files));

  // Build directory listing from file paths
  function listDir(dir) {
    const prefix = dir ? dir + '/' : '';
    const names = new Set();
    for (const path of fileMap.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      names.add(slash === -1 ? rest : rest.slice(0, slash));
    }
    return [...names];
  }

  function skillCount() {
    let count = 0;
    for (const path of fileMap.keys()) {
      if (path.endsWith('.md') && !path.startsWith('.')) count++;
    }
    return count;
  }

  return createStubAdapter({
    isGitRepo: async () => isGitRepo,
    hasAutogitTracking: async () => hasAutogitTracking,
    skillFileCount: async () => skillCount(),
    readFile: async (path) => fileMap.get(path) ?? null,
    listDir: async (dir) => listDir(dir || ''),
    exists: async (path) => fileMap.has(path),
  });
}

// ── Schema validation ───────────────────────────────────────────────

describe('HEALTH_SCHEMA_VERSION', () => {
  it('is a semver string', () => {
    assert.match(HEALTH_SCHEMA_VERSION, /^\d+\.\d+\.\d+$/);
  });
});

describe('HEALTH_RULES', () => {
  it('contains exactly 6 rule identifiers', () => {
    assert.equal(HEALTH_RULES.length, 6);
  });

  it('includes expected rules', () => {
    for (const rule of ['git', 'autogit', 'skills-count', 'wiki-links', 'dof', 'helpers']) {
      assert.ok(HEALTH_RULES.includes(rule), `Missing rule: ${rule}`);
    }
  });
});

// ── validateHealthCheckResult ───────────────────────────────────────

describe('validateHealthCheckResult', () => {
  it('accepts a valid result', () => {
    const { valid, errors } = validateHealthCheckResult({
      rule: 'git',
      status: 'pass',
      message: 'Git is present',
    });
    assert.equal(valid, true);
    assert.equal(errors.length, 0);
  });

  it('rejects null', () => {
    const { valid } = validateHealthCheckResult(null);
    assert.equal(valid, false);
  });

  it('rejects non-object', () => {
    const { valid } = validateHealthCheckResult('string');
    assert.equal(valid, false);
  });

  it('rejects empty rule', () => {
    const { valid, errors } = validateHealthCheckResult({
      rule: '',
      status: 'pass',
      message: 'test',
    });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('rule')));
  });

  it('rejects invalid status', () => {
    const { valid, errors } = validateHealthCheckResult({
      rule: 'git',
      status: 'invalid',
      message: 'test',
    });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('status')));
  });

  it('rejects missing message', () => {
    const { valid, errors } = validateHealthCheckResult({
      rule: 'git',
      status: 'pass',
    });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('message')));
  });
});

// ── validateHealthReport ────────────────────────────────────────────

describe('validateHealthReport', () => {
  const validReport = {
    version: HEALTH_SCHEMA_VERSION,
    overall: 'pass',
    results: [{ rule: 'git', status: 'pass', message: 'OK' }],
    checkedAt: new Date().toISOString(),
    duration: 42,
  };

  it('accepts a valid report', () => {
    const { valid, errors, warnings } = validateHealthReport(validReport);
    assert.equal(valid, true);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });

  it('rejects null', () => {
    const { valid } = validateHealthReport(null);
    assert.equal(valid, false);
  });

  it('warns on version mismatch', () => {
    const { valid, warnings } = validateHealthReport({ ...validReport, version: '99.0.0' });
    assert.equal(valid, true);
    assert.ok(warnings.length > 0);
  });

  it('rejects missing version', () => {
    const { valid, errors } = validateHealthReport({ ...validReport, version: '' });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('version')));
  });

  it('rejects invalid overall status', () => {
    const { valid } = validateHealthReport({ ...validReport, overall: 'bad' });
    assert.equal(valid, false);
  });

  it('rejects non-array results', () => {
    const { valid } = validateHealthReport({ ...validReport, results: 'nope' });
    assert.equal(valid, false);
  });

  it('rejects negative duration', () => {
    const { valid } = validateHealthReport({ ...validReport, duration: -1 });
    assert.equal(valid, false);
  });

  it('rejects non-string checkedAt', () => {
    const { valid } = validateHealthReport({ ...validReport, checkedAt: 12345 });
    assert.equal(valid, false);
  });
});

// ── worstStatus ─────────────────────────────────────────────────────

describe('worstStatus', () => {
  it('returns pass when all pass', () => {
    assert.equal(worstStatus(['pass', 'pass', 'pass']), 'pass');
  });

  it('returns warn when worst is warn', () => {
    assert.equal(worstStatus(['pass', 'warn', 'pass']), 'warn');
  });

  it('returns fail when any fail', () => {
    assert.equal(worstStatus(['pass', 'warn', 'fail']), 'fail');
  });

  it('returns pass for empty array', () => {
    assert.equal(worstStatus([]), 'pass');
  });
});

// ── createCheckResult ───────────────────────────────────────────────

describe('createCheckResult', () => {
  it('creates a minimal result', () => {
    const r = createCheckResult('git', 'pass', 'OK');
    assert.equal(r.rule, 'git');
    assert.equal(r.status, 'pass');
    assert.equal(r.message, 'OK');
    assert.equal(r.detail, undefined);
  });

  it('includes detail when provided', () => {
    const r = createCheckResult('git', 'fail', 'No git', { count: 0 });
    assert.deepEqual(r.detail, { count: 0 });
  });
});

// ── buildHealthReport ───────────────────────────────────────────────

describe('buildHealthReport', () => {
  it('builds a valid report from results', () => {
    const results = [
      createCheckResult('git', 'pass', 'OK'),
      createCheckResult('autogit', 'warn', 'No tracking'),
    ];
    const report = buildHealthReport(results);

    assert.equal(report.version, HEALTH_SCHEMA_VERSION);
    assert.equal(report.overall, 'warn');
    assert.equal(report.results.length, 2);
    assert.ok(typeof report.checkedAt === 'string');
    assert.ok(typeof report.duration === 'number');
    assert.ok(report.duration >= 0);

    const { valid } = validateHealthReport(report);
    assert.equal(valid, true);
  });

  it('uses startTime for duration calculation', () => {
    const results = [createCheckResult('git', 'pass', 'OK')];
    const report = buildHealthReport(results, { startTime: Date.now() - 100 });
    assert.ok(report.duration >= 90);
  });
});

// ── HealthInputAdapter validation ───────────────────────────────────

describe('validateAdapter', () => {
  it('accepts a complete adapter', () => {
    const adapter = createStubAdapter();
    const { valid, missing } = validateAdapter(adapter);
    assert.equal(valid, true);
    assert.equal(missing.length, 0);
  });

  it('rejects null', () => {
    const { valid, missing } = validateAdapter(null);
    assert.equal(valid, false);
    assert.equal(missing.length, 6);
  });

  it('reports missing methods', () => {
    const { valid, missing } = validateAdapter({ readFile: async () => null });
    assert.equal(valid, false);
    assert.ok(missing.includes('listDir'));
    assert.ok(missing.includes('isGitRepo'));
  });
});

describe('createStubAdapter', () => {
  it('returns safe defaults', async () => {
    const adapter = createStubAdapter();
    assert.equal(await adapter.readFile('any'), null);
    assert.deepEqual(await adapter.listDir(''), []);
    assert.equal(await adapter.exists('any'), false);
    assert.equal(await adapter.isGitRepo(), false);
    assert.equal(await adapter.hasAutogitTracking(), false);
    assert.equal(await adapter.skillFileCount(), 0);
  });

  it('allows overrides', async () => {
    const adapter = createStubAdapter({
      isGitRepo: async () => true,
      skillFileCount: async () => 5,
    });
    assert.equal(await adapter.isGitRepo(), true);
    assert.equal(await adapter.skillFileCount(), 5);
  });
});

// ── runHealthChecks (full integration) ──────────────────────────────

describe('runHealthChecks', () => {
  it('returns all-pass for a healthy repo', async () => {
    const adapter = buildAdapter({
      isGitRepo: true,
      hasAutogitTracking: true,
      files: {
        'alpha.md': skillMdWithDof('Alpha'),
        'beta.md': skillMdWithDof('Beta'),
      },
    });

    const report = await runHealthChecks(adapter);
    const { valid } = validateHealthReport(report);
    assert.equal(valid, true);
    assert.equal(report.overall, 'pass');
    assert.equal(report.results.length, 6);

    for (const r of report.results) {
      assert.equal(r.status, 'pass', `Rule "${r.rule}" should pass: ${r.message}`);
    }
  });

  it('fails git rule when no .git', async () => {
    const adapter = buildAdapter({
      isGitRepo: false,
      files: { 'skill.md': skillMdWithDof('Test') },
    });

    const report = await runHealthChecks(adapter);
    const gitResult = report.results.find((r) => r.rule === 'git');
    assert.equal(gitResult.status, 'fail');
  });

  it('warns autogit when no tracking branch', async () => {
    const adapter = buildAdapter({
      isGitRepo: true,
      hasAutogitTracking: false,
      files: { 'skill.md': skillMdWithDof('Test') },
    });

    const report = await runHealthChecks(adapter);
    const autogitResult = report.results.find((r) => r.rule === 'autogit');
    assert.equal(autogitResult.status, 'warn');
  });

  it('fails skills-count when no .md files', async () => {
    const adapter = buildAdapter({
      isGitRepo: true,
      files: {},
    });

    const report = await runHealthChecks(adapter);
    const countResult = report.results.find((r) => r.rule === 'skills-count');
    assert.equal(countResult.status, 'fail');
  });

  it('warns wiki-links when references point to missing targets', async () => {
    const adapter = buildAdapter({
      isGitRepo: true,
      files: {
        'alpha.md': skillMd('Alpha', 'Links to [[NonExistent]]'),
      },
    });

    const report = await runHealthChecks(adapter);
    const wikiResult = report.results.find((r) => r.rule === 'wiki-links');
    assert.equal(wikiResult.status, 'warn');
    assert.ok(wikiResult.detail.broken.length > 0);
  });

  it('passes wiki-links when all references resolve', async () => {
    const adapter = buildAdapter({
      isGitRepo: true,
      files: {
        'alpha.md': skillMd('Alpha', 'Links to [[Beta]]'),
        'beta.md': skillMd('Beta', 'Links to [[Alpha]]'),
      },
    });

    const report = await runHealthChecks(adapter);
    const wikiResult = report.results.find((r) => r.rule === 'wiki-links');
    assert.equal(wikiResult.status, 'pass');
  });

  it('warns dof when skill files lack Description/Output/Format headings', async () => {
    const adapter = buildAdapter({
      isGitRepo: true,
      files: {
        'alpha.md': skillMd('Alpha', 'No headings here.'),
      },
    });

    const report = await runHealthChecks(adapter);
    const dofResult = report.results.find((r) => r.rule === 'dof');
    assert.equal(dofResult.status, 'warn');
    assert.ok(dofResult.detail.missing.length > 0);
  });

  it('passes dof when skill files have a Description heading', async () => {
    const adapter = buildAdapter({
      isGitRepo: true,
      files: {
        'alpha.md': skillMdWithDof('Alpha'),
      },
    });

    const report = await runHealthChecks(adapter);
    const dofResult = report.results.find((r) => r.rule === 'dof');
    assert.equal(dofResult.status, 'pass');
  });

  it('counts helper files correctly', async () => {
    const adapter = buildAdapter({
      isGitRepo: true,
      files: {
        'alpha.md': skillMdWithDof('Alpha'),
        'reference.md': helperMd(),
        'notes.md': helperMd('Some notes'),
      },
    });

    const report = await runHealthChecks(adapter);
    const helpersResult = report.results.find((r) => r.rule === 'helpers');
    assert.equal(helpersResult.status, 'pass');
    assert.equal(helpersResult.detail.helperCount, 2);
    assert.equal(helpersResult.detail.skillCount, 1);
  });

  it('reports worst overall status', async () => {
    const adapter = buildAdapter({
      isGitRepo: false,
      hasAutogitTracking: false,
      files: {},
    });

    const report = await runHealthChecks(adapter);
    assert.equal(report.overall, 'fail'); // git=fail dominates
  });

  it('includes valid timestamp and duration', async () => {
    const adapter = buildAdapter({ isGitRepo: true, files: {} });
    const before = Date.now();
    const report = await runHealthChecks(adapter);
    const after = Date.now();

    assert.ok(new Date(report.checkedAt).getTime() >= before);
    assert.ok(new Date(report.checkedAt).getTime() <= after);
    assert.ok(report.duration >= 0);
    assert.ok(report.duration <= after - before + 10); // small tolerance
  });
});
