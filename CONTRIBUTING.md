# Contributing to specgate

Thanks for considering it. `specgate` is small and has no runtime dependencies, so
there is plenty of room to contribute.

## Getting set up

```bash
git clone https://github.com/aazh2026/specgate
cd specgate
npm test
```

No install step is needed — the package has zero dependencies.

## Running the tests

```bash
npm test              # all tests
node --test test/parse.test.js   # one file
```

The suite runs against Node 20, 22 and 24 in CI. Please keep it green.

## What the project expects from a change

Every behaviour change should come with:

1. **A test.** If you fix a bug, add a regression test that fails without the fix.
2. **An acceptance criterion in the issue.** Issues here use `AC-N` ids. If you
   implement one, tag the code that implements it — this is exactly the workflow
   `specgate` is built around, and dogfooding it is the point.

   ```js
   // AC-3: Path aliases resolve to real files
   test('resolves tsconfig path aliases', () => { ... });
   ```

3. **A clear commit message.** `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Good places to start

Issues labelled [`good first issue`](https://github.com/aazh2026/specgate/labels/good%20first%20issue)
are scoped to be a reasonable first contribution. `help wanted` means the
direction is agreed but nobody is working on it yet.

## Design rules

These are not style preferences. They are the reasons the tool is useful.

**Deterministic.** No LLM calls, no network requests, no randomness at runtime.
The same repo and spec must produce the same score every time, or it cannot be
used as a CI gate. If your change introduces a non-deterministic input, it will
not be merged.

**No runtime dependencies.** `specgate` should install and run in under a second.
Please do not add dependencies to `dependencies` in `package.json`. Dev-only
tools are fine.

**Evidence tiers stay honest.** The four tiers (`tagged` → `covered`,
`named` → `inferred`, `text` → `untested`, none → `uncovered`) exist because
they have different levels of certainty. Do not promote a weaker tier to a
stronger one to make a score look better. `inferred` is discounted for a reason.

**Say what does not work.** The README has a "Limitations" section, and it is
not marketing copy — it lists real cases where `specgate` gives the wrong
answer. If you find another one, it belongs there.

## Adding a language

Language support is mostly configuration:

1. Add the extension to `CODE_EXT` in `src/walk.js`.
2. Add the test-file conventions to `isTestFile` in the same file.
3. Add a fixture under `examples/` and a test in `test/`.

The matcher itself is language-agnostic: it works on identifiers and comments,
which are similar enough across languages to share one implementation. If a
language genuinely needs different logic, add it in `src/matcher.js` behind a
capability check, and keep the default path untouched.

## Regenerating the demo

The animated GIF in the README is generated from the real CLI output:

```bash
python3 scripts/make-demo-gif.py assets/demo.gif
```

It needs Pillow. Regenerate it whenever the CLI output format changes.

## Reporting a bug

Open an issue with:

- what you expected,
- what happened,
- a minimal repo or snippet that reproduces it.

If the bug is about a specific criterion not being detected, please include the
spec line and the file you expected it to match. That combination usually makes
the cause obvious.

## Pull requests

- Keep them focused — one change per PR.
- Make sure `npm test` passes locally first.
- CI will check Node 20, 22 and 24.

## License

By contributing, you agree that your contributions are licensed under the MIT
License, the same as the rest of the project.
