/**
 * SPEC.md template.
 *
 * The template deliberately ships with *example* criteria that reference
 * common features, plus empty ones to fill in. A blank file teaches nothing;
 * a filled-in example shows the shape immediately.
 */

import { extractTags } from '../matcher.js';

const EXAMPLES = [
  'User can sign in with email and password',
  'User can reset their password via an emailed link',
  'Invalid input is rejected with a helpful message',
  'The user sees a loading state while the request is in flight',
];

export function renderSpecTemplate(stack, opts = {}) {
  const name = opts.name || 'your-project';
  const lines = [];

  lines.push(`# ${name} — Specification`);
  lines.push('');
  lines.push('> Acceptance criteria for this project. `specgate` checks each one');
  lines.push('> against the code and reports which requirements have no evidence.');
  lines.push('>');
  lines.push('> Delete the examples you do not need and write your own.');
  lines.push('');
  lines.push('## Acceptance Criteria');
  lines.push('');

  EXAMPLES.forEach((text, i) => {
    lines.push(`- [ ] AC-${i + 1}: ${text}`);
  });

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push(`- Language: ${stack.language}`);
  lines.push(`- Test command: ${stack.testRunner}`);
  lines.push(`- Package manager: ${stack.packageManager}`);
  lines.push('');
  lines.push('<!--');
  lines.push('  Add a criterion id to a test to make it verifiable:');
  lines.push('');
  lines.push('    // AC-1: User can sign in with email and password');
  lines.push('    test("signs in with email and password", () => { ... });');
  lines.push('-->');
  lines.push('');

  return lines.join('\n');
}

/**
 * Suggest criterion ids for existing test files, so the user can paste them
 * straight into their test files.
 */
export function suggestTags(root, codeFiles) {
  const out = [];
  for (const file of codeFiles) {
    if (!file.isTest) continue;
    const tags = extractTags(file.content);
    if (tags.size === 0) continue;
    out.push({ file: file.path, tags: [...tags] });
  }
  return out;
}
