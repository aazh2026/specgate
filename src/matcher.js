/**
 * Deterministic evidence matching.
 *
 * The whole point of specgate is that the result is reproducible: same repo,
 * same spec, same coverage. No model calls, no fuzzy guesses.
 *
 * Evidence tiers, strongest first:
 *   tagged   an explicit `# AC-1` style marker in the file
 *   named    the criterion's distinctive words appear in a test name
 *   text     the words appear in a source file body
 *
 * A criterion with no evidence is `uncovered`. A criterion with evidence in a
 * test file but no tagged marker is `untested` — implemented, but nothing
 * guarantees it keeps working.
 */

import { tokenize, normaliseId } from './spec/parse.js';

/**
 * Explicit criterion markers we accept in source code:
 *   # AC-1        (shell, python comment, yaml)
 *   // AC-1       (js, ts, go, rust)
 *   slash-star AC-1 slash-star  (block comment)
 *   * AC-1        (doc comment continuation)
 *   @AC-1         (annotation, decorator)
 *   [AC-1]        (plain bracket)
 *
 * Tags are only ever compared against criterion ids that actually exist in
 * the spec, so an incidental "S3" in a comment is harmless.
 */
const TAGGED_RE = new RegExp(
  '(?:^|\\s)(?:#|//|/\\*|\\*|@)\\s*([A-Za-z]{1,6}[-_ ]?\\d+(?:[._]\\d+)*)\\b',
  'g'
);
const BRACKETED_RE = new RegExp('\\[([A-Za-z]{1,6}[-_ ]?\\d+(?:[._]\\d+)*)\\]', 'g');

/** Pull explicit criterion markers out of a line of code or prose. */
export function extractTags(text) {
  const out = new Set();
  const source = String(text);
  let m;
  TAGGED_RE.lastIndex = 0;
  while ((m = TAGGED_RE.exec(source)) !== null) {
    out.add(normaliseId(m[1]));
  }
  BRACKETED_RE.lastIndex = 0;
  while ((m = BRACKETED_RE.exec(source)) !== null) {
    out.add(normaliseId(m[1]));
  }
  return out;
}

/**
 * Words that carry no discriminating power when matching a criterion to a
 * test name. Everything else in the criterion must appear in the test.
 */
const WEAK_TOKENS = new Set([
  'system', 'user', 'users', 'page', 'screen', 'button', 'form', 'field',
  'data', 'value', 'result', 'results', 'api', 'endpoint', 'request',
  'response', 'feature', 'features', 'allow', 'allows', 'support', 'supports',
  'display', 'show', 'shows', 'shown', 'return', 'returns', 'able', 'correctly',
  'properly', 'proper', 'appropriate', 'expected', 'way', 'ways', 'option',
  'settings', 'setting', 'settings page', 'dashboard', 'home', 'main',
]);

/** Distinctive tokens of a criterion: content words, longest first. */
export function keyTerms(text, limit = 6) {
  const tokens = [...new Set(tokenize(text))].filter((t) => !WEAK_TOKENS.has(t));
  const sorted = tokens.sort((a, b) => b.length - a.length);
  return sorted.slice(0, limit);
}

/** Fraction of a criterion's key terms present in a haystack. */
export function termCoverage(terms, haystackTokens) {
  if (!terms.length) return 0;
  let hits = 0;
  for (const t of terms) {
    if (haystackTokens.has(t)) hits += 1;
  }
  return hits / terms.length;
}

/**
 * @typedef {object} EvidenceFile
 * @property {string} path
 * @property {boolean} isTest
 * @property {string} content
 * @property {string[]} lines
 */

/**
 * Match one criterion against the indexed files.
 * @returns {{status: string, tier: string|null, evidence: object|null}}
 */
export function matchCriterion(criterion, files) {
  const id = criterion.normalisedId;
  // A Gherkin scenario is matched on its title *or* on any single step: the
  // step definition in the code is phrased like the step, not like the title.
  // Matching the whole scenario text at once would demand every step in one
  // file, which is almost never true.
  const searchTexts = criterion.searchTexts && criterion.searchTexts.length
    ? criterion.searchTexts
    : [criterion.text];
  const termSets = searchTexts.map((t) => keyTerms(t));

  let best = null;

  for (const file of files) {
    // The searchable text of a file is its content plus, when the project uses
    // path aliases, its own path. A criterion that talks about "the audit
    // writer" should be able to find `src/lib/audit-writer.ts` even when the
    // file body never says so.
    const pathText = file.searchPath ? `${file.searchPath} ${(file.aliasTargets || []).join(' ')}` : '';
    const fileTokens = new Set(tokenize(`${file.content} ${pathText}`));

    // Tier 1: explicit tag anywhere in the file.
    if (file.tags && file.tags.has(id)) {
      const score = 1;
      if (!best || score > best.score) {
        best = { tier: 'tagged', score, file: file.path, isTest: file.isTest, line: file.tagLines.get(id) };
      }
      continue;
    }

    // Tier 2/3: lexical coverage. The best-matching phrase wins, so one
    // matching step is enough evidence for the whole scenario.
    let cov = 0;
    for (const terms of termSets) {
      const c = termCoverage(terms, fileTokens);
      if (c > cov) cov = c;
    }

    // The module-name signal. When a file is reached through a tsconfig path
    // alias, its name is what the criterion is most likely talking about:
    // "the audit writer" means `audit-writer.ts`. This is a containment test,
    // not a ratio — the criterion names the whole module, even when the rest
    // of the sentence is about something else. Using a ratio here would need
    // a lower threshold, and a lower threshold would weaken every ordinary
    // match in every project.
    let moduleMatch = false;
    if (file.moduleName) {
      const moduleTokens = tokenize(file.moduleName);
      if (moduleTokens.length) {
        for (const text of searchTexts) {
          const criterionTokens = new Set(tokenize(text));
          if (moduleTokens.every((t) => criterionTokens.has(t))) {
            moduleMatch = true;
            break;
          }
        }
      }
    }

    if (!moduleMatch && cov < 0.6) continue;

    const tier = file.isTest ? 'named' : 'text';
    const score = (moduleMatch ? 0.6 : cov) + (file.isTest ? 0.5 : 0);
    if (!best || score > best.score) {
      best = { tier, score, file: file.path, isTest: file.isTest, coverage: cov };
    }
  }

  if (!best) return { status: 'uncovered', tier: null, evidence: null };
  if (best.tier === 'text') return { status: 'untested', tier: 'text', evidence: best };
  if (best.tier === 'named') return { status: 'inferred', tier: 'named', evidence: best };
  return { status: 'covered', tier: 'tagged', evidence: best };
}

/** Index files once, then reuse across criteria. */
export function indexFiles(fileEntries) {
  return fileEntries.map((f) => {
    const tags = new Set();
    const tagLines = new Map();
    const lines = f.content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const tag of extractTags(line)) {
        tags.add(tag);
        if (!tagLines.has(tag)) tagLines.set(tag, idx + 1);
      }
    });
    return { ...f, lines, tags, tagLines };
  });
}
