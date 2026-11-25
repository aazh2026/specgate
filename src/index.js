/**
 * specgate public API.
 *
 * runSpecgate({ root, specFiles }) -> report
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSpec } from './spec/parse.js';
import { parseFeature } from './spec/gherkin.js';
import { collectCodeFiles, findSpecFiles } from './walk.js';
import { indexFiles, matchCriterion } from './matcher.js';
import { computeScore } from './report.js';

// Read the version from package.json so it can never drift from the published
// package.
function readVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION = readVersion();

/**
 * @param {{root: string, specFiles?: string[]}} options
 */
export function runSpecgate(options) {
  const root = path.resolve(options.root || '.');
  const specPaths = findSpecFiles(root, options.specFiles || []);

  const criteria = [];
  const specs = [];

  for (const specPath of specPaths) {
    const content = fs.readFileSync(specPath, 'utf8');
    const rel = path.relative(root, specPath).split(path.sep).join('/');
    // A `.feature` file is Gherkin, not markdown. Parsing it with the
    // markdown parser would silently find nothing.
    const parsed = /\.feature$/i.test(rel)
      ? parseFeature(content, { file: rel })
      : parseSpec(content, { file: rel });
    specs.push({
      file: rel,
      criteria: parsed.criteria.length,
      headings: parsed.headings.length,
    });
    criteria.push(...parsed.criteria);
  }

  // Deduplicate criteria that appear in several spec files.
  //
  // Two rules, in order:
  //   1. the same id *and* the same text → one requirement described twice
  //      (e.g. the same bullet copied into two files);
  //   2. the same explicit id with different wording → still one requirement.
  //      This is what lets a SPEC.md and a .feature file describe the same
  //      acceptance criterion without double-counting it. The two texts are
  //      merged so that evidence can match either wording.
  const seen = new Map();
  const unique = [];
  for (const c of criteria) {
    const key = `${c.normalisedId}::${c.slug}`;
    const idKey = c.normalisedId;

    if (seen.has(key)) continue;

    const existing = seen.get(idKey);
    if (existing && c.source === 'explicit' && existing.source === 'explicit') {
      // Same id, different text: merge the searchable phrasings.
      const texts = new Set([...(existing.searchTexts || [existing.text]), ...(c.searchTexts || [c.text])]);
      existing.searchTexts = [...texts];
      existing.alsoIn = [...new Set([...(existing.alsoIn || []), c.file])];
      continue;
    }

    seen.set(key, true);
    seen.set(idKey, c);
    unique.push(c);
  }

  const codeFiles = collectCodeFiles(root);
  const indexed = indexFiles(codeFiles);

  const results = unique.map((criterion) => {
    const match = matchCriterion(criterion, indexed);
    return { ...criterion, ...match };
  });

  return {
    version: VERSION,
    root,
    specs,
    criteria: results,
    summary: computeScore(results),
    stats: {
      filesScanned: codeFiles.length,
      testFiles: codeFiles.filter((f) => f.isTest).length,
    },
  };
}

export { parseSpec } from './spec/parse.js';
export { parseFeature } from './spec/gherkin.js';
export { computeScore, renderText, renderJson, renderSarif } from './report.js';
export { extractTags, keyTerms, matchCriterion } from './matcher.js';
export { STATUS_LABEL, STATUS_WEIGHT } from './status.js';
