/**
 * TypeScript path aliases.
 *
 * A project with `paths` in its tsconfig imports modules by a short alias:
 *
 *   import { writeAuditLog } from '@/lib/audit-writer';
 *
 * The real file is `src/lib/audit-writer.ts`. A criterion that talks about
 * "the audit writer" should be able to find that file, and a test that
 * imports the aliased module should carry the module's name as searchable
 * text.
 *
 * This module resolves an import specifier to the file it actually points
 * at, so the matcher can index the alias name as evidence.
 */

import fs from 'node:fs';
import path from 'node:path';

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];

/**
 * Strip comments and trailing commas from a tsconfig.
 *
 * A tsconfig is JSONC, not JSON: `//` and `/* *\/` comments are legal, and
 * trailing commas are legal. `JSON.parse` rejects both.
 */
export function parseJsonc(text) {
  const withoutComments = String(text)
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, comment) => (comment ? '' : m))
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(withoutComments);
}

/**
 * Read `compilerOptions.paths` (and `baseUrl`) from a tsconfig.
 *
 * @param {string} root the repository root
 * @returns {{baseUrl: string|null, paths: Record<string,string[]>}|null}
 */
export function readPathAliases(root) {
  const file = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(file)) return null;

  let json;
  try {
    json = parseJsonc(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }

  const opts = json.compilerOptions || {};
  if (!opts.paths || typeof opts.paths !== 'object') return null;

  const baseUrl = opts.baseUrl
    ? path.resolve(root, opts.baseUrl)
    : root;

  const paths = {};
  for (const [pattern, targets] of Object.entries(opts.paths)) {
    if (!Array.isArray(targets)) continue;
    paths[pattern] = targets.filter((t) => typeof t === 'string');
  }
  if (!Object.keys(paths).length) return null;

  return { baseUrl, paths };
}

/**
 * Does an import specifier match a tsconfig path pattern?
 *
 * `@/*` matches `@/lib/audit-writer` with remainder `lib/audit-writer`.
 * A pattern without `*` only matches itself.
 */
function matchPattern(pattern, specifier) {
  const star = pattern.indexOf('*');
  if (star === -1) {
    return pattern === specifier ? '' : null;
  }
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (!specifier.startsWith(prefix)) return null;
  if (!specifier.endsWith(suffix)) return null;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

/** Candidate absolute paths for one alias target, in preference order. */
function candidates(baseUrl, target, remainder) {
  const raw = target.includes('*') ? target.replace('*', remainder) : target;
  const abs = path.resolve(baseUrl, raw);
  const out = [];

  // Exact file.
  out.push(abs);
  // With a known extension.
  if (!path.extname(abs)) {
    for (const ext of RESOLVE_EXTENSIONS) out.push(abs + ext);
  }
  // Directory index.
  for (const ext of RESOLVE_EXTENSIONS) out.push(path.join(abs, `index${ext}`));

  return out;
}

/**
 * Resolve an import specifier to the real file it points at.
 *
 * @param {string} specifier e.g. `@/lib/audit-writer`
 * @param {{baseUrl: string|null, paths: Record<string,string[]>}|null} aliases
 * @returns {string|null} absolute path of the target file, or null
 */
export function resolveAlias(specifier, aliases) {
  if (!aliases || !specifier) return null;
  // A relative or absolute import is not an alias.
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;

  for (const [pattern, targets] of Object.entries(aliases.paths)) {
    const remainder = matchPattern(pattern, specifier);
    if (remainder === null) continue;
    for (const target of targets) {
      for (const cand of candidates(aliases.baseUrl, target, remainder)) {
        try {
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
        } catch {
          /* unreadable: try the next candidate */
        }
      }
    }
  }
  return null;
}

const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Every import specifier in a file's source.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function extractImportSpecifiers(content) {
  const out = [];
  const source = String(content);
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(source)) !== null) {
    const spec = m[1] || m[2];
    if (spec) out.push(spec);
  }
  return out;
}
