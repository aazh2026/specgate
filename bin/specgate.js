#!/usr/bin/env node
/**
 * specgate — requirement coverage for your codebase.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSpecgate } from '../src/index.js';
import { renderText, renderJson, renderSarif } from '../src/report.js';
import { init, renderInitResult } from '../src/scaffold/init.js';

// Read the version from package.json so it can never drift from the published
// package. Falls back to a literal if package.json is missing.
function readVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = readVersion();

const USAGE = `
specgate ${VERSION} — requirement coverage for your codebase

Usage:
  specgate [options] [path]
  specgate init [options] [path]

Commands:
  (default)     Scan the project and report requirement coverage.
  init          Create a starter SPEC.md and a CI gate for this project.

Options:
  --spec <file>        Spec file to read (repeatable). Default: auto-discover.
  --format <fmt>       text | json | sarif      (default: text)
  --min <n>            Fail (exit 1) if coverage score is below n (default: none)
  --fail-uncovered     Fail if any criterion is uncovered
  --fail-untested      Fail if any criterion is untested
  --json-out <file>    Also write the JSON report to a file
  --sarif-out <file>   Write a SARIF report (for GitHub code scanning)
  --verbose, -v        Show every criterion, not just the gaps
  --quiet              Print nothing; rely on exit code
  --force              With init: overwrite existing files
  --name <name>        With init: project name for the spec title
  --version, -V        Print version
  --help, -h           Show this help

Examples:
  specgate
  specgate init --min 70
  specgate --spec docs/SPEC.md --format json
  specgate --min 80 --fail-untested
  specgate --sarif-out specgate.sarif --format sarif
`;

function parseArgs(argv) {
  const opts = {
    path: '.',
    command: 'scan',
    specs: [],
    format: 'text',
    min: null,
    failUncovered: false,
    failUntested: false,
    jsonOut: null,
    sarifOut: null,
    verbose: false,
    quiet: false,
    force: false,
    name: null,
    help: false,
    version: false,
  };
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-V':
      case '--version':
        opts.version = true;
        break;
      case '-v':
      case '--verbose':
        opts.verbose = true;
        break;
      case '--quiet':
        opts.quiet = true;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--name':
        opts.name = argv[++i];
        break;
      case 'init':
        opts.command = 'init';
        break;
      case '--spec':
        opts.specs.push(argv[++i]);
        break;
      case '--format':
        opts.format = argv[++i];
        break;
      case '--min':
        opts.min = Number(argv[++i]);
        break;
      case '--json-out':
        opts.jsonOut = argv[++i];
        break;
      case '--sarif-out':
        opts.sarifOut = argv[++i];
        break;
      case '--fail-uncovered':
        opts.failUncovered = true;
        break;
      case '--fail-untested':
        opts.failUntested = true;
        break;
      default:
        if (a.startsWith('-')) {
          console.error(`specgate: unknown option ${a}`);
          process.exit(2);
        }
        rest.push(a);
    }
  }

  if (rest.length) opts.path = rest[0];
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (opts.version) {
    console.log(VERSION);
    return 0;
  }
  if (!['text', 'json', 'sarif'].includes(opts.format)) {
    console.error(`specgate: unknown format "${opts.format}" (use text, json or sarif)`);
    return 2;
  }

  const root = path.resolve(opts.path);
  if (!fs.existsSync(root)) {
    console.error(`specgate: path not found: ${root}`);
    return 2;
  }

  if (opts.command === 'init') {
    const result = init(root, {
      force: opts.force,
      name: opts.name,
      min: opts.min,
      failUncovered: opts.failUncovered,
    });
    if (!opts.quiet) console.log(renderInitResult(result));
    return 0;
  }

  const report = runSpecgate({
    root,
    specFiles: opts.specs,
  });

  if (!opts.quiet) {
    if (opts.format === 'json') console.log(renderJson(report));
    else if (opts.format === 'sarif') console.log(renderSarif(report));
    else console.log(renderText(report, { verbose: opts.verbose }));
  }

  if (opts.jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(opts.jsonOut)), { recursive: true });
    fs.writeFileSync(path.resolve(opts.jsonOut), renderJson(report));
  }
  if (opts.sarifOut) {
    fs.mkdirSync(path.dirname(path.resolve(opts.sarifOut)), { recursive: true });
    fs.writeFileSync(path.resolve(opts.sarifOut), renderSarif(report));
  }

  const { score, uncovered, untested } = report.summary;
  if (opts.min !== null && !Number.isNaN(opts.min) && score < opts.min) {
    console.error(`specgate: coverage ${score}% is below the required ${opts.min}%`);
    return 1;
  }
  if (opts.failUncovered && uncovered > 0) {
    console.error(`specgate: ${uncovered} acceptance criteria are uncovered`);
    return 1;
  }
  if (opts.failUntested && untested > 0) {
    console.error(`specgate: ${untested} acceptance criteria are untested`);
    return 1;
  }
  return 0;
}

process.exit(main());
