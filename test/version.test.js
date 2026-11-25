import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { VERSION } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'bin', 'specgate.js');

test('the CLI version matches package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  assert.equal(VERSION, pkg.version);
});

test('specgate --version prints the package version', () => {
  const out = execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim();
  const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  assert.equal(out, pkg.version);
});

test('the JSON report carries the same version', () => {
  const example = path.join(here, '..', 'examples', 'invoice-export');
  const out = execFileSync(process.execPath, [cli, example, '--format', 'json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(out).version, VERSION);
});
