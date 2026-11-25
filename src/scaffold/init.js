/**
 * `specgate init` — scaffold a spec and a CI gate in an existing project.
 *
 * The barrier to using a requirement-coverage tool is that most repos have no
 * written spec to point it at. `init` removes that barrier: it inspects the
 * project, writes a SPEC.md with the acceptance criteria already structured,
 * and drops in a CI workflow that gates on coverage.
 */

import fs from 'node:fs';
import path from 'node:path';

import { detectStack } from './stack.js';
import { renderSpecTemplate } from './spec-template.js';
import { renderWorkflow } from './workflow.js';

const SPEC_HEADER = '## Acceptance Criteria';

export function init(root, opts = {}) {
  const created = [];
  const skipped = [];

  const specPath = path.resolve(root, opts.spec || 'SPEC.md');
  if (fs.existsSync(specPath) && !opts.force) {
    skipped.push({ file: path.relative(root, specPath), reason: 'already exists' });
  } else {
    const stack = detectStack(root);
    const content = renderSpecTemplate(stack, opts);
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(specPath, content);
    created.push(path.relative(root, specPath));
  }

  const workflowDir = path.join(root, '.github', 'workflows');
  const workflowPath = path.join(workflowDir, 'requirements.yml');
  if (fs.existsSync(workflowPath) && !opts.force) {
    skipped.push({ file: '.github/workflows/requirements.yml', reason: 'already exists' });
  } else {
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(workflowPath, renderWorkflow(opts));
    created.push('.github/workflows/requirements.yml');
  }

  return { created, skipped, specPath };
}

/** Human-readable summary printed by the CLI. */
export function renderInitResult(result) {
  const lines = [''];
  for (const file of result.created) {
    lines.push(`  created  ${file}`);
  }
  for (const file of result.skipped) {
    lines.push(`  skipped  ${file} (${file.reason})`);
  }
  lines.push('');
  lines.push('  Next:');
  lines.push('    1. Edit the acceptance criteria in your spec.');
  lines.push('    2. Tag your tests with the criterion id, e.g. // AC-1');
  lines.push('    3. Run `specgate` to see coverage.');
  lines.push('');
  return lines.join('\n');
}

export { SPEC_HEADER };
