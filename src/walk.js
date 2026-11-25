/**
 * Repository walking + spec discovery.
 */

import fs from 'node:fs';
import path from 'node:path';

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', '.venv', 'venv', 'dist', 'build', 'out', 'coverage',
  '__pycache__', '.mypy_cache', '.pytest_cache', '.next', '.nuxt', 'target',
  'vendor', '.idea', '.vscode', '.tox', 'site-packages', '.cache',
]);

const CODE_EXT = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.kts', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.php',
  '.swift', '.scala', '.sh', '.bash', '.sql',
]);

const TEST_HINT = /(^|[.\-/])(test|tests|spec|specs|__tests__)([.\-/]|$)|[._-](test|spec)\.[a-z]+$|\.test\.|\.spec\./i;

export function isCodeFile(filePath) {
  return CODE_EXT.has(path.extname(filePath).toLowerCase());
}

/** True when `file` lives inside `dir` (or is `dir` itself). */
function isInside(dir, file) {
  const rel = path.relative(dir, file);
  if (!rel) return true;
  if (rel.startsWith('..')) return false;
  return !path.isAbsolute(rel);
}

export function isTestFile(filePath, content = '') {
  // Rust's inline tests live in modules compiled only in the test configuration.
  if (/\.rs$/i.test(filePath) && /^[ \t]*#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]\s*(?:pub\s+)?mod\s+\w+\s*\{/m.test(content)) return true;
  const base = path.basename(filePath);
  if (/(^test_.*\.py$)|(_test\.py$)|(test\.py$)|(^conftest\.py$)/i.test(base)) return true;
  if (/\.(test|spec)\.[a-z]+$/i.test(base)) return true;
  if (/(^tests?[\/\\])|([\/\\]tests?[\/\\])|([\/\\]__tests__[\/\\])/i.test(filePath)) return true;
  return TEST_HINT.test(filePath);
}

/** Recursively list files under a directory, skipping noisy folders. */
export function walk(root, opts = {}) {
  const out = [];
  const maxFiles = opts.maxFiles || 20000;
  const stack = [root];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) return out;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Find candidate spec documents in the repository.
 * Preference order: explicit config, then conventional locations.
 */
export function findSpecFiles(root, explicit = []) {
  const found = [];
  const seen = new Set();

  const push = (p) => {
    const abs = path.resolve(p);
    // Compare lower-cased so a case-insensitive filesystem (macOS, Windows)
    // cannot report the same file twice under two spellings.
    const key = abs.toLowerCase();
    if (!seen.has(key) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      seen.add(key);
      found.push(abs);
    }
  };

  for (const p of explicit) push(path.resolve(root, p));

  const conventions = [
    'SPEC.md', 'spec.md', 'SPECIFICATION.md', 'specification.md',
    'REQUIREMENTS.md', 'requirements.md', 'PRD.md', 'prd.md',
    'docs/SPEC.md', 'docs/spec.md', 'docs/requirements.md',
    'docs/acceptance-criteria.md', 'spec/SPEC.md', '.specgate/spec.md',
  ];
  for (const c of conventions) push(path.join(root, c));

  // Any markdown that contains an acceptance-criteria section, plus any
  // Gherkin feature file (a feature file is a spec by construction).
  for (const file of walk(root, { maxFiles: 4000 })) {
    const isMarkdown = /\.md$/i.test(file);
    const isFeature = /\.feature$/i.test(file);
    if (!isMarkdown && !isFeature) continue;
    const rel = path.relative(root, file);
    if (/(^|\/)(node_modules|vendor|dist|build)\//.test(rel)) continue;
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (isFeature) {
        push(file);
        continue;
      }
      if (/^\s{0,3}#{1,6}\s.*(acceptance\s+criteria|验收标准|acceptance)/im.test(content)) {
        push(file);
      }
    } catch {
      /* unreadable file: ignore */
    }
  }

  return found;
}

/**
 * Read source files that can hold evidence.
 *
 * @param {string} root the repository root
 * @param {{maxFiles?: number, scope?: string}} [opts]
 *   `scope` restricts which files count as evidence, relative to `root`.
 *   The specs are still discovered across the whole repository — in a
 *   monorepo the spec usually lives in one package while the implementation
 *   is spread across several.
 */
export function collectCodeFiles(root, opts = {}) {
  const files = [];
  const scope = opts.scope ? path.resolve(root, opts.scope) : null;

  for (const file of walk(root, { maxFiles: opts.maxFiles || 20000 })) {
    if (!isCodeFile(file)) continue;
    const rel = path.relative(root, file);
    if (/(^|\/)(node_modules|vendor|dist|build|out)\//.test(rel)) continue;
    // When a scope is given, only files inside it can be evidence. A file
    // outside the scope must not satisfy a criterion, even if its wording
    // matches.
    if (scope && !isInside(scope, file)) continue;
    try {
      const stat = fs.statSync(file);
      if (stat.size > 512 * 1024) continue;
      const content = fs.readFileSync(file, 'utf8');
      files.push({
        path: rel.split(path.sep).join('/'),
        absPath: file,
        isTest: isTestFile(rel, content),
        content,
      });
    } catch {
      /* skip unreadable */
    }
  }
  return files;
}
