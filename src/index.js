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
import { readPathAliases } from './aliases.js';
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
 * The scope a criterion id belongs to.
 *
 * Ids are unique inside a project, not inside a file: a `SPEC.md` at the
 * project root and a `features/export.feature` describe the same project, so
 * `@AC-1` in both is one requirement. But two different projects — two
 * example directories in this repo, say — each have their own `AC-1`.
 *
 * The scope is therefore the spec file's directory, with a trailing
 * `features/` (or `spec/`) stripped so a feature file and a root spec land in
 * the same scope.
 */
function specScope(file) {
  const dir = String(file).split('/').slice(0, -1).join('/');
  const parts = dir.split('/').filter(Boolean);
  if (parts.length && (parts[parts.length - 1] === 'features' || parts[parts.length - 1] === 'spec')) {
    parts.pop();
  }
  return parts.join('/') || '.';
}

/**
 * @param {{root: string, specFiles?: string[], scope?: string}} options
 *   `scope` restricts which files count as evidence. Specs are still
 *   discovered across the whole repository: in a monorepo the spec usually
 *   lives in one package while the implementation is spread over several.
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
    const specIndex = specs.length;
    specs.push({
      file: rel,
      criteria: parsed.criteria.length,
      headings: parsed.headings.length,
    });
    for (const c of parsed.criteria) {
      criteria.push({ ...c, _spec: specIndex });
    }
  }

  // Deduplicate criteria that appear in several spec files.
  //
  // Rule 1 (global): the same id *and* the same text → one requirement
  // described twice, e.g. the same bullet copied into two files.
  //
  // Rule 2 (scoped): the same explicit id with different wording → still one
  // requirement, but only inside one spec scope. This is what lets a SPEC.md
  // and a feature file in the same project describe the same criterion
  // without double-counting it, while two unrelated projects (for example two
  // example directories in this repo) keep their own AC-1.
  //
  // Whatever gets dropped or merged is subtracted from the per-spec counts,
  // so `sum(specs[].criteria) === summary.total` always holds.
  const byScopeAndId = new Map();
  const seen = new Set();
  const unique = [];

  for (const c of criteria) {
    const scope = specScope(c.file);
    // The slug is part of the key, so the scope has to be part of it too:
    // two different projects can have an `AC-1` whose text slugifies to the
    // same string, and those are two requirements.
    const key = `${scope}::${c.normalisedId}::${c.slug}`;
    if (seen.has(key)) {
      specs[c._spec].criteria -= 1;
      continue;
    }

    const scopedId = `${scope}::${c.normalisedId}`;
    const existing = byScopeAndId.get(scopedId);

    if (existing) {
      if (existing.source === 'explicit' && c.source === 'explicit') {
        // Same requirement, two wordings: merge the searchable phrasings so
        // evidence can match either one.
        const texts = new Set([
          ...(existing.searchTexts || [existing.text]),
          ...(c.searchTexts || [c.text]),
        ]);
        existing.searchTexts = [...texts];
        existing.alsoIn = [...new Set([...(existing.alsoIn || []), c.file])];
        specs[c._spec].criteria -= 1;
        continue;
      }
      // An explicit id beats a minted one: drop the minted duplicate.
      if (existing.source !== 'explicit' && c.source === 'explicit') {
        specs[existing._spec].criteria -= 1;
        const at = unique.indexOf(existing);
        if (at !== -1) unique[at] = c;
        byScopeAndId.set(scopedId, c);
        seen.add(key);
        continue;
      }
      specs[c._spec].criteria -= 1;
      continue;
    }

    seen.add(key);
    byScopeAndId.set(scopedId, c);
    unique.push(c);
  }

  for (const c of unique) delete c._spec;

  const aliases = readPathAliases(root);
  const codeFiles = collectCodeFiles(root, { scope: options.scope, aliases });
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
