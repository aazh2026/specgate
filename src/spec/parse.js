/**
 * Parse a spec document into a list of acceptance criteria.
 *
 * Supported shapes (all optional, mixed freely):
 *   ## Acceptance Criteria
 *   - [ ] AC-1: User can reset their password
 *   - [ ] [AC-2] Export runs as CSV
 *   - [ ] AC3 S3. Writes an audit log entry
 *   - [ ] Given a locked account, when the user retries 3 times, then it is suspended
 *
 * Every criterion gets a stable id. If the author wrote an explicit id we keep
 * it verbatim (case-insensitively normalised for matching); otherwise we mint
 * `AC-<n>` in document order so the tool still works on unstructured specs.
 */

const ID_RE = /^\[?([A-Za-z]{1,5}[-_ ]?\d+(?:[._]\d+)*)\]?\s*(?:[:：\-–—]\s*)?(.*)$/;

// Headings that turn a plain bullet list into acceptance criteria.
const ACCEPTANCE_HEADING_RE =
  /^(acceptance\s+criteria|acceptance|ac|requirements?|user\s+stories?|criteria|验收标准|需求|用户故事)\b/i;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is',
  'are', 'be', 'it', 'that', 'this', 'as', 'at', 'by', 'from', 'can', 'should',
  'must', 'will', 'shall', 'user', 'users', 'when', 'then', 'given', 'system',
  'i', 'if', 'so', 'not', 'no', 'they', 'their', 'has', 'have', 'had', 'but',
]);

/** Normalise an id for comparison: `AC-1`, `ac 1`, `AC_1` all become `ac-1`. */
export function normaliseId(raw) {
  return String(raw)
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Split text into meaningful lowercase tokens.
 *
 * Identifier boundaries matter: code says `resetPassword`, `export_csv`,
 * `HTTPResponse`. A naive split on non-alphanumerics would produce one
 * meaningless token and break every match against real source files.
 */
export function tokenize(text) {
  const expanded = String(text)
    // camelCase / PascalCase boundaries
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // ACRONYM followed by a word: HTTPServer -> HTTPServer
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // snake_case and kebab-case
    .replace(/[_\-.]+/g, ' ');

  return expanded
    .toLowerCase()
    .split(/[^a-z0-9一-鿿]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function slugify(text, max = 48) {
  const tokens = tokenize(text).slice(0, 6);
  const base = tokens.join('-') || 'criterion';
  return base.slice(0, max);
}

function headingLevel(line) {
  const m = /^(#{1,6})\s+(.*)$/.exec(line);
  return m ? { level: m[1].length, title: m[2].trim() } : null;
}

/**
 * @param {string} content raw spec text
 * @param {{file?: string}} [opts]
 * @returns {{criteria: Array<object>, headings: Array<object>}}
 */
export function parseSpec(content, opts = {}) {
  const file = opts.file || '<spec>';
  const lines = String(content).split(/\r?\n/);

  const criteria = [];
  const headings = [];
  let inFence = false;
  let currentHeading = null;
  let headingLevelNow = 0;
  let acceptanceMode = false;
  let autoCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h = headingLevel(line);
    if (h) {
      currentHeading = h.title;
      headingLevelNow = h.level;
      headings.push({ title: h.title, level: h.level, line: i + 1 });
      // Acceptance mode ends when a new heading at the same or shallower level appears.
      if (headingLevelNow <= headingLevelNow || true) {
        acceptanceMode = ACCEPTANCE_HEADING_RE.test(h.title);
      }
      continue;
    }

    // A bullet, optionally with a checkbox.
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s*)?(.*)$/.exec(line);
    if (!bullet) continue;

    const body = (bullet[2] || '').trim();
    if (!body) continue;

    // Only treat bullets as criteria when we are inside an acceptance-criteria
    // section, OR when the bullet carries an explicit id like `AC-1:`.
    const explicit = ID_RE.exec(body);
    const hasExplicitId = Boolean(explicit && explicit[1] && /\d/.test(explicit[1]));
    if (!acceptanceMode && !hasExplicitId) continue;

    autoCounter += 1;
    let id;
    let text;
    if (hasExplicitId) {
      id = explicit[1];
      text = (explicit[2] || '').trim() || body;
    } else {
      id = `AC-${autoCounter}`;
      text = body;
    }

    criteria.push({
      id,
      normalisedId: normaliseId(id),
      text,
      slug: slugify(text),
      section: currentHeading || 'Acceptance Criteria',
      line: i + 1,
      file,
      checked: Boolean(bullet[1]),
      source: hasExplicitId ? 'explicit' : 'inferred',
    });
  }

  return { criteria, headings };
}
