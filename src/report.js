/**
 * Coverage report generation: score, table, JSON, SARIF.
 */

import { STATUS_LABEL, STATUS_WEIGHT } from './status.js';

export function computeScore(criteria) {
  const total = criteria.length;
  if (!total) return { score: 0, total: 0, covered: 0, inferred: 0, untested: 0, uncovered: 0 };

  let covered = 0;
  let inferred = 0;
  let untested = 0;
  let uncovered = 0;
  for (const c of criteria) {
    if (c.status === 'covered') covered += 1;
    else if (c.status === 'inferred') inferred += 1;
    else if (c.status === 'untested') untested += 1;
    else uncovered += 1;
  }

  // Only explicit, traceable evidence counts fully. Inferred evidence is
  // discounted because a name match is a hint, not a guarantee.
  const weighted =
    covered * 1.0 + inferred * 0.75 + untested * 0.4 + uncovered * 0.0;

  return {
    score: Math.round((weighted / total) * 100),
    total,
    covered,
    inferred,
    untested,
    uncovered,
  };
}

const SYMBOL = {
  covered: '✔',
  inferred: '~',
  untested: '!',
  uncovered: '✗',
};

/** Human-readable console report. */
export function renderText(report, opts = {}) {
  const { score, total } = report.summary;
  const lines = [];

  lines.push('');
  lines.push(`  Requirement coverage: ${score}%  (${total} criteria)`);
  lines.push('');
  lines.push(`  ${SYMBOL.covered} covered    ${report.summary.covered}`);
  lines.push(`  ${SYMBOL.inferred} inferred   ${report.summary.inferred}`);
  lines.push(`  ${SYMBOL.untested} untested   ${report.summary.untested}`);
  lines.push(`  ${SYMBOL.uncovered} uncovered  ${report.summary.uncovered}`);
  lines.push('');

  if (!report.criteria.length) {
    lines.push('  No acceptance criteria found.');
    lines.push('');
    return lines.join('\n');
  }

  const showAll = opts.verbose || score < 100;
  const shown = showAll ? report.criteria : report.criteria.filter((c) => c.status !== 'covered');

  if (shown.length) {
    lines.push('  Criterion                                    Status     Evidence');
    lines.push('  ' + '-'.repeat(78));
    for (const c of shown) {
      const id = c.id.padEnd(12).slice(0, 12);
      const status = STATUS_LABEL[c.status].padEnd(10).slice(0, 10);
      const ev = c.evidence
        ? `${c.evidence.tier === 'tagged' ? '#' : ''}${c.evidence.file}${c.evidence.line ? ':' + c.evidence.line : ''}`
        : '—';
      lines.push(`  ${id} ${status} ${ev.slice(0, 54)}`);
      lines.push(`  ${' '.repeat(12)} ${c.text.slice(0, 70)}`);
    }
    lines.push('');
  }

  if (report.summary.uncovered || report.summary.untested) {
    lines.push('  Gaps:');
    for (const c of report.criteria) {
      if (c.status === 'uncovered' || c.status === 'untested') {
        lines.push(`    ${c.id}  ${c.text.slice(0, 66)}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Machine-readable JSON report. */
export function renderJson(report) {
  return JSON.stringify(
    {
      version: report.version,
      score: report.summary.score,
      summary: report.summary,
      specs: report.specs,
      criteria: report.criteria.map((c) => ({
        id: c.id,
        text: c.text,
        section: c.section,
        file: c.file,
        line: c.line,
        status: c.status,
        statusLabel: STATUS_LABEL[c.status],
        weight: STATUS_WEIGHT[c.status],
        evidence: c.evidence
          ? {
              tier: c.evidence.tier,
              file: c.evidence.file,
              line: c.evidence.line || null,
              coverage: c.evidence.coverage ?? null,
            }
          : null,
      })),
    },
    null,
    2
  );
}

/**
 * SARIF 2.1.0 output so findings show up in GitHub code scanning.
 */
export function renderSarif(report) {
  const rules = [
    { id: 'spec-uncovered', name: 'RequirementUncovered', level: 'warning' },
    { id: 'spec-untested', name: 'RequirementUntested', level: 'warning' },
    { id: 'spec-inferred', name: 'RequirementInferred', level: 'note' },
  ];

  const ruleIndex = new Map(rules.map((r, i) => [r.id, i]));
  const results = [];

  for (const c of report.criteria) {
    if (c.status === 'covered') continue;
    const ruleId =
      c.status === 'uncovered' ? 'spec-uncovered'
      : c.status === 'untested' ? 'spec-untested'
      : 'spec-inferred';
    const rule = rules[ruleIndex.get(ruleId)];
    const message =
      c.status === 'uncovered'
        ? `Acceptance criterion "${c.id}" has no evidence in the codebase.`
        : c.status === 'untested'
        ? `Acceptance criterion "${c.id}" is implemented but not covered by a tagged test.`
        : `Acceptance criterion "${c.id}" is only matched by test naming; add an explicit tag to make it verifiable.`;

    results.push({
      ruleId,
      level: rule.level,
      message: { text: message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: c.file, uriBaseId: '%SRCROOT%' },
            region: { startLine: c.line || 1 },
          },
        },
      ],
    });
  }

  return JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'specgate',
              informationUri: 'https://github.com/aazh2026/specgate',
              version: report.version,
              rules,
            },
          },
          results,
        },
      ],
    },
    null,
    2
  );
}
