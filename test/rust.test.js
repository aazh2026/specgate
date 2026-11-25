import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runSpecgate } from '../src/index.js';
import { isTestFile } from '../src/walk.js';

const root = fileURLToPath(new URL('../examples/rust-counter/', import.meta.url));

test('AC-1: Rust integration tests use the tests directory convention', () => {
  assert.equal(isTestFile('crates/counter/tests/module.rs'), true);
  assert.equal(isTestFile('src/lib.rs', '#[cfg(unix)]\nmod platform;'), false);
  assert.equal(isTestFile('src/lib.js', '#[cfg(test)]\nmod tests {}'), false);
});

test('AC-2: Rust example reports tagged inline and integration tests', () => {
  const report = runSpecgate({ root });
  assert.equal(report.stats.testFiles, 2);
  assert.deepEqual(report.criteria.map(({ status }) => status), ['covered', 'covered', 'uncovered']);
  for (const [id, file] of [['AC-1', 'tests/counter.rs'], ['AC-2', 'src/lib.rs']]) {
    const evidence = report.criteria.find((criterion) => criterion.id === id).evidence;
    assert.equal(evidence.file, file);
    assert.equal(evidence.isTest, true);
  }
});
