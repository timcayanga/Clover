import { bracesAdvisory } from './braces-security-patch.mjs';
import { mitigation } from './forge-security-patch.mjs';

const severities = new Set(['info', 'low', 'moderate', 'high', 'critical']);

// npm continues to report the original version. Account for just this advisory
// and its transitive effects, only after installed code + regressions are checked.
// Other advisories, malformed reports, missing graph edges and unanchored cycles fail closed.
export function assessAudit(report, patchedPaths, now = Date.now(), bracesPaths = []) {
  if (now >= Date.parse(mitigation.reviewBy)) throw new Error('node-forge mitigation review is due; upgrade or re-review before release.');
  if (report?.error || report?.auditReportVersion !== 2 || !report.vulnerabilities ||
      !report.metadata?.vulnerabilities || !Array.isArray(patchedPaths) || !patchedPaths.length) {
    throw new Error('Incomplete npm audit report or missing patch verification.');
  }
  const vulnerabilities = report.vulnerabilities;
  let mitigated = 0;
  const blocked = new Set();
  const visit = (name, parents = new Set()) => {
    const entry = vulnerabilities[name];
    if (parents.has(name)) return false;
    let anchored = false;
    if (!entry || !severities.has(entry.severity) || !Array.isArray(entry.via) || !entry.via.length) {
      throw new Error(`Invalid npm audit dependency chain: ${name}`);
    }
    const ancestors = new Set([...parents, name]);
    for (const via of entry.via) {
      if (typeof via === 'string') {
        anchored = visit(via, ancestors) || anchored;
        continue;
      }
      anchored = true;
      if (!via || !severities.has(via.severity) || typeof via.url !== 'string') throw new Error(`Invalid advisory for ${name}`);
      if (via.url === mitigation.advisory && name === 'node-forge' &&
          via.name === 'node-forge' && via.severity === 'high' &&
          Array.isArray(entry.nodes) && entry.nodes.length > 0 &&
          entry.nodes.every((path) => patchedPaths.includes(path))) {
        mitigated += 1;
      } else if (via.url === bracesAdvisory && name === 'braces' && via.name === 'braces' && via.severity === 'high' && Array.isArray(entry.nodes) && entry.nodes.length && entry.nodes.every(p => bracesPaths.includes(p))) {
        mitigated += 1;
      } else if (via.severity === 'high' || via.severity === 'critical') {
        blocked.add(`${name}: ${via.url}`);
      }
    }
    return anchored;
  };
  // Reconcile metadata as well: unknown/omitted findings must not silently pass.
  for (const severity of ['high', 'critical']) {
    const entries = Object.values(vulnerabilities).filter((v) => v.severity === severity).length;
    if (report.metadata.vulnerabilities[severity] !== entries) throw new Error(`Inconsistent ${severity} audit counts.`);
  }
  for (const name of Object.keys(vulnerabilities)) if (!visit(name)) throw new Error(`Invalid npm audit dependency chain without advisory: ${name}`);
  if (blocked.size) throw new Error(`Unmitigated high/critical dependency advisories:\n${[...blocked].join('\n')}`);
  return { mitigated: mitigated > 0 };
}
