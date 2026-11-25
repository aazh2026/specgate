/**
 * Detect what a project is built with, so the scaffolded spec and CI
 * workflow match reality rather than guessing.
 */

import fs from 'node:fs';
import path from 'node:path';

function exists(root, rel) {
  try {
    return fs.existsSync(path.join(root, rel));
  } catch {
    return false;
  }
}

function readJSON(root, rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @returns {{language: string, testRunner: string, ci: string[], packageManager: string}}
 */
export function detectStack(root) {
  const pkg = readJSON(root, 'package.json');
  const hasPython = exists(root, 'pyproject.toml') || exists(root, 'setup.py') || exists(root, 'requirements.txt');
  const hasGo = exists(root, 'go.mod');
  const hasRust = exists(root, 'Cargo.toml');
  const hasRuby = exists(root, 'Gemfile');
  const hasJava = exists(root, 'pom.xml') || exists(root, 'build.gradle');

  let language = 'javascript';
  if (pkg && pkg.dependencies && Object.keys(pkg.dependencies || {}).length >= 0 && exists(root, 'package.json')) {
    language = 'javascript';
  }
  if (hasPython && !pkg) language = 'python';
  else if (hasPython && pkg) language = 'javascript'; // mixed; JS tooling still applies
  if (hasGo && !pkg && !hasPython) language = 'go';
  if (hasRust && !pkg && !hasPython && !hasGo) language = 'rust';
  if (hasRuby && !pkg && !hasPython && !hasGo && !hasRust) language = 'ruby';
  if (hasJava && !pkg && !hasPython && !hasGo && !hasRust && !hasRuby) language = 'java';

  // Test runner
  let testRunner = 'node --test';
  if (language === 'python') testRunner = 'pytest';
  if (pkg) {
    const dev = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
    if (dev.vitest) testRunner = 'vitest run';
    else if (dev.jest) testRunner = 'jest';
    else if (dev.mocha) testRunner = 'npm test';
  } else if (language === 'python') {
    testRunner = 'pytest';
  } else if (language === 'go') {
    testRunner = 'go test ./...';
  } else if (language === 'rust') {
    testRunner = 'cargo test';
  }

  // Package manager
  let packageManager = 'npm';
  if (exists(root, 'pnpm-lock.yaml')) packageManager = 'pnpm';
  else if (exists(root, 'yarn.lock')) packageManager = 'yarn';
  else if (exists(root, 'bun.lockb') || exists(root, 'bun.lock')) packageManager = 'bun';
  else if (language === 'python') packageManager = 'pip';
  else if (language === 'go') packageManager = 'go';
  else if (language === 'rust') packageManager = 'cargo';

  const ci = [];
  if (exists(root, '.github/workflows')) ci.push('github-actions');
  if (exists(root, '.gitlab-ci.yml')) ci.push('gitlab-ci');

  return { language, testRunner, ci, packageManager, hasPackageJson: Boolean(pkg) };
}
