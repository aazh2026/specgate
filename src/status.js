/**
 * Criterion statuses and their weights.
 *
 * covered   explicit evidence: a test (or source) references the criterion id
 * inferred  a test name or body matches the criterion's distinctive words
 * untested  only implementation code matched — nothing pins the behaviour
 * uncovered no evidence found at all
 */

export const STATUS_LABEL = {
  covered: 'covered',
  inferred: 'inferred',
  untested: 'untested',
  uncovered: 'uncovered',
};

export const STATUS_WEIGHT = {
  covered: 1.0,
  inferred: 0.75,
  untested: 0.4,
  uncovered: 0.0,
};

export const STATUS_ORDER = ['covered', 'inferred', 'untested', 'uncovered'];
