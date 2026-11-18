export const picomatchException = {
  advisory: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  expiresAt: '2026-12-02T00:00:00.000Z',
};

// Reviewed development-only graph. Changes require a new assessment, not an
// automatic extension of the exception. See docs/DEPENDENCIES.md.
const reviewedVersions = {
  picomatch: '4.0.7',
  fdir: '6.5.0',
  tinyglobby: '0.2.17',
  vite: '8.3.6',
  '@vitejs/plugin-react': '6.0.2',
  '@typescript-eslint/typescript-estree': '8.72.1',
};
const levels = ['info', 'low', 'moderate', 'high', 'critical'];

export function assessAudit(report, lockfile, now = new Date()) {
  const vulnerabilities = report?.vulnerabilities;
  if (
    report?.error ||
    report?.auditReportVersion !== 2 ||
    !vulnerabilities ||
    typeof vulnerabilities !== 'object' ||
    Array.isArray(vulnerabilities) ||
    lockfile?.lockfileVersion !== 3 ||
    !lockfile.packages ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error('Invalid npm audit report or lockfile.');
  }
  const entries = Object.entries(vulnerabilities);
  for (const [name, entry] of entries) {
    if (
      entry?.name !== name ||
      !levels.includes(entry.severity) ||
      !Array.isArray(entry.via) ||
      !entry.via.length ||
      !entry.via.every(
        (via) =>
          (typeof via === 'string' && vulnerabilities[via]) ||
          (via &&
            typeof via === 'object' &&
            typeof via.url === 'string' &&
            levels.includes(via.severity)),
      ) ||
      !Array.isArray(entry.nodes) ||
      !entry.nodes.length ||
      !entry.nodes.every((node) => typeof node === 'string')
    ) {
      throw new Error('Invalid npm audit vulnerability: ' + name);
    }
  }
  const counts = Object.fromEntries(
    levels.map((level) => [
      level,
      entries.filter(([, entry]) => entry.severity === level).length,
    ]),
  );
  if (
    !levels.every(
      (level) => report.metadata?.vulnerabilities?.[level] === counts[level],
    ) ||
    report.metadata?.vulnerabilities?.total !== entries.length
  ) {
    throw new Error('Incomplete npm audit report.');
  }

  function reviewedChain(name, visiting = new Set()) {
    const entry = vulnerabilities[name];
    if (['info', 'low', 'moderate'].includes(entry.severity)) return true;
    if (
      entry.severity !== 'high' ||
      visiting.has(name) ||
      !Object.hasOwn(reviewedVersions, name) ||
      now.getTime() >= Date.parse(picomatchException.expiresAt) ||
      !entry.nodes.every((node) => {
        const dependency = lockfile.packages[node];
        return (
          node === 'node_modules/' + name &&
          dependency?.dev === true &&
          dependency.version === reviewedVersions[name]
        );
      })
    ) {
      return false;
    }
    const next = new Set(visiting).add(name);
    let excepted = false;
    const allowed = entry.via.every((via) => {
      if (typeof via === 'string') {
        if (vulnerabilities[via].severity === 'high') excepted = true;
        return reviewedChain(via, next);
      }
      if (['info', 'low', 'moderate'].includes(via.severity)) return true;
      const known =
        name === 'picomatch' &&
        via.name === 'picomatch' &&
        via.dependency === 'picomatch' &&
        via.url === picomatchException.advisory &&
        via.severity === 'high' &&
        via.range === '<=4.0.7';
      if (known) excepted = true;
      return known;
    });
    return allowed && excepted;
  }

  const accepted = [];
  const blocked = [];
  for (const [name, entry] of entries) {
    if (!['high', 'critical'].includes(entry.severity)) continue;
    (reviewedChain(name) ? accepted : blocked).push(name);
  }
  return { accepted, blocked, counts };
}
