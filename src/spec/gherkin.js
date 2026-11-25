/**
 * Parse a Gherkin/Cucumber `.feature` file into acceptance criteria.
 *
 * A feature file is already a spec, so each scenario is a requirement:
 *
 *   @AC-1
 *   Scenario: Export invoices as CSV
 *     Given an invoice exists
 *     When the user requests an export
 *     Then a CSV file is produced
 *
 * Two ways to give a scenario an id:
 *   1. an explicit tag (`@AC-1`) — the criterion then matches a tagged test
 *      exactly like a markdown criterion does, so one requirement can be
 *      described in both a SPEC.md and a feature file and still be one id;
 *   2. otherwise we mint `SC-<n>` in document order.
 *
 * The scenario *name* is the human-readable requirement text. The steps are
 * kept separately as `searchText`, because a step definition usually says
 * something like `Given('the user requests an export')` and that wording is
 * better evidence than the scenario title alone.
 */

import { normaliseId, tokenize } from './parse.js';

const FEATURE_RE = /^\s*Feature\s*:\s*(.*)$/i;
const RULE_RE = /^\s*Rule\s*:\s*(.*)$/i;
const BACKGROUND_RE = /^\s*Background\s*:\s*(.*)$/i;
const SCENARIO_RE = /^\s*Scenario(?: Outline| Template)?\s*:\s*(.*)$/i;
const EXAMPLES_RE = /^\s*Examples\s*:/i;
const STEP_RE = /^\s*(Given|When|Then|And|But|\*)\s+(.*)$/i;
const TAG_RE = /^\s*@([A-Za-z0-9_.\-]+)/;
const TABLE_ROW_RE = /^\s*\|/;

/** Tags that look like a criterion id (`AC-1`, `S3`, `REQ_2`). */
const ID_TAG_RE = /^[A-Za-z]{1,6}[-_ ]?\d+(?:[._]\d+)*$/;

/**
 * @param {string} content raw feature file text
 * @param {{file?: string}} [opts]
 * @returns {{criteria: Array<object>, headings: Array<object>}}
 */
export function parseFeature(content, opts = {}) {
  const file = opts.file || '<feature>';
  const lines = String(content).split(/\r?\n/);

  const criteria = [];
  const headings = [];

  let featureName = 'Feature';
  let section = 'Feature';
  let pendingTags = [];
  let scenario = null;
  let scenarioCounter = 0;
  let inExamples = false;

  const closeScenario = () => {
    if (!scenario) return;
    criteria.push(scenario);
    scenario = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip blank lines, comments and table rows.
    if (!line.trim()) continue;
    if (/^\s*#/.test(line)) continue;
    if (TABLE_ROW_RE.test(line)) continue;

    const tag = TAG_RE.exec(line);
    if (tag) {
      pendingTags.push(tag[1]);
      continue;
    }

    const feature = FEATURE_RE.exec(line);
    if (feature) {
      closeScenario();
      featureName = feature[1].trim() || 'Feature';
      section = featureName;
      headings.push({ title: featureName, level: 1, line: i + 1 });
      pendingTags = [];
      continue;
    }

    const rule = RULE_RE.exec(line);
    if (rule) {
      closeScenario();
      section = rule[1].trim() || 'Rule';
      headings.push({ title: section, level: 2, line: i + 1 });
      pendingTags = [];
      continue;
    }

    if (BACKGROUND_RE.test(line)) {
      closeScenario();
      pendingTags = [];
      continue;
    }

    if (EXAMPLES_RE.test(line)) {
      // The Examples table is data for the outline, not a separate scenario.
      inExamples = true;
      continue;
    }

    const sc = SCENARIO_RE.exec(line);
    if (sc) {
      closeScenario();
      inExamples = false;
      scenarioCounter += 1;
      const name = sc[1].trim();
      const isOutline = /outline|template/i.test(sc[0]);
      const idTag = pendingTags.find((t) => ID_TAG_RE.test(t));
      const id = idTag || `SC-${scenarioCounter}`;
      pendingTags = [];
      scenario = {
        id,
        normalisedId: normaliseId(id),
        text: name,
        slug: slugify(name),
        section,
        line: i + 1,
        file,
        checked: false,
        source: idTag ? 'explicit' : 'inferred',
        steps: [],
        isOutline,
      };
      headings.push({ title: name, level: 3, line: i + 1 });
      continue;
    }

    const step = STEP_RE.exec(line);
    if (step && scenario) {
      if (inExamples) continue;
      scenario.steps.push(step[2].trim());
      continue;
    }

    // Any other content ends the current step block but not the scenario.
    if (scenario && !inExamples) {
      // A free-text line inside a scenario is still part of the requirement.
      scenario.steps.push(line.trim());
    }
  }

  closeScenario();

  // The searchable text of a criterion includes its steps: step definitions
  // in the code are usually phrased like the step, not like the title.
  for (const c of criteria) {
    c.searchTexts = [c.text, ...c.steps].filter((t) => t && t.trim());
  }

  return { criteria, headings };
}

function slugify(text, max = 48) {
  const tokens = tokenize(text).slice(0, 6);
  const base = tokens.join('-') || 'scenario';
  return base.slice(0, max);
}
