// Tests of the produced PDF. pdf-lib checks the structure (one page, the
// template's size, the Japanese font embedded); pdftotext, when installed,
// reads every word back with its bounding box, so each value can be checked
// against the position its layout entry names.
//
// What this proves: the text landed where the layout file says, for every
// field, on every template, and nothing printed as "undefined".
// What it does not prove: that the layout file matches the printed form. A
// coordinate is still verified by regenerating the PDF and looking at it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, before, describe, test } from 'node:test';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { resolveLayout, TEMPLATE_PREFIX } from '../src/layout.js';
import {
  describeMark,
  expectedMarks,
  extractWords,
  findWord,
  hasPdftotext,
  makeTempDir,
  readRepoYaml,
  readYaml,
  REPO_ROOT,
  runMain,
  TRACKED_CONFIGS,
  writeConfig,
} from './helpers.mjs';

// Locally the placement checks are optional. In CI they are the point of
// installing poppler, and node:test does not count a skipped describe block
// in its summary, so a missing pdftotext there has to fail loudly rather than
// drop ten tests behind a green check.
if (!hasPdftotext() && process.env.CI) {
  throw new Error(
    '❌ pdftotext (poppler) is not installed, but CI requires the text placement checks. ' +
      'Install poppler-utils before running pnpm test.',
  );
}
const skipPlacement = hasPdftotext()
  ? false
  : 'pdftotext (poppler) is not installed, so the placement checks are skipped';

// Generate every tracked config once for the whole file.
const outputs = new Map();
let workDir;

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jmr-render-'));
  for (const { file, variant } of TRACKED_CONFIGS) {
    const out = path.join(workDir, `${variant}.pdf`);
    const { code, stderr } = await runMain([file, '-o', out]);
    assert.equal(code, 0, stderr);
    outputs.set(variant, out);
  }
});

after(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

// BaseFont names of every font dictionary in the document.
function embeddedFontNames(doc) {
  const names = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (
      obj instanceof PDFDict &&
      obj.get(PDFName.of('Type'))?.toString() === '/Font'
    ) {
      names.push(obj.get(PDFName.of('BaseFont'))?.toString() ?? '');
    }
  }
  return names;
}

// Assert that every expected mark is present in the words pdftotext found.
function assertMarksPresent(words, marks, label) {
  const missing = marks
    .filter((mark) => !findWord(words, mark))
    .map(describeMark);
  assert.deepEqual(
    missing,
    [],
    `${label}: marks not found where the layout places them`,
  );
}

describe('PDF structure', () => {
  for (const { variant } of TRACKED_CONFIGS) {
    test(`${variant}: one page, the template's size, IPAex Mincho embedded`, async () => {
      const bytes = fs.readFileSync(outputs.get(variant));
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      assert.equal(doc.getPageCount(), 1);
      const templateBytes = fs.readFileSync(
        path.join(
          REPO_ROOT,
          'src/template',
          `${TEMPLATE_PREFIX}${variant}.pdf`,
        ),
      );
      const template = await PDFDocument.load(templateBytes, {
        updateMetadata: false,
      });
      const size = doc.getPage(0).getSize();
      const expected = template.getPage(0).getSize();
      assert.ok(
        Math.abs(size.width - expected.width) < 0.5,
        `width ${size.width} vs ${expected.width}`,
      );
      assert.ok(
        Math.abs(size.height - expected.height) < 0.5,
        `height ${size.height} vs ${expected.height}`,
      );
      const fonts = embeddedFontNames(doc);
      assert.ok(
        fonts.some((name) => name.includes('IPAexMincho')),
        `IPAex Mincho is embedded (found: ${fonts.join(', ')})`,
      );
    });
  }
});

describe('text placement', { skip: skipPlacement }, () => {
  for (const { file, variant } of TRACKED_CONFIGS) {
    test(`${variant}: every value lands at its layout position`, () => {
      const cfg = readRepoYaml(file);
      const layout = resolveLayout(variant, cfg);
      const { words } = extractWords(outputs.get(variant));
      const marks = expectedMarks(cfg, layout);
      assert.ok(marks.length > 40, `${marks.length} marks to check`);
      assertMarksPresent(words, marks, variant);
      assert.equal(
        marks.filter((m) => m.text === '✓').length,
        5,
        'five ✓ marks: surname, two marital, two job',
      );
    });

    test(`${variant}: nothing prints as undefined or null`, () => {
      const { words } = extractWords(outputs.get(variant));
      const bad = words.filter((w) =>
        /^(undefined|null|\[object)/.test(w.text),
      );
      assert.deepEqual(bad, []);
    });
  }

  test('a first marriage ticks 初婚 and prints no dissolution date', () => {
    // config.yaml: the husband is remarried (2), the wife is a first marriage (0).
    const cfg = readRepoYaml('config.yaml');
    const layout = resolveLayout('red', cfg);
    const { words } = extractWords(outputs.get('red'));
    const wife = layout.wife.marital_history;
    assert.ok(
      findWord(words, {
        text: '✓',
        x: wife.first_marriage_check.pos[0],
        baseline: wife.first_marriage_check.pos[1],
        size: wife.first_marriage_check.size,
      }),
    );
    for (const key of ['year', 'month', 'day']) {
      const spec = wife[key];
      const mark = {
        text: String(cfg.wife.marital_history[key]),
        x: spec.pos[0],
        baseline: spec.pos[1],
        size: spec.size,
      };
      assert.equal(
        findWord(words, mark),
        undefined,
        `wife ${key} is not drawn`,
      );
    }
    const husband = layout.husband.marital_history;
    assert.ok(
      findWord(words, {
        text: '✓',
        x: husband.remarriage_divorce_check.pos[0],
        baseline: husband.remarriage_divorce_check.pos[1],
        size: husband.remarriage_divorce_check.size,
      }),
    );
  });

  test('a legacy address_first_pos shifts the whole 住所 block in the output', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'shift.yaml', 'config.yaml', (cfg) => {
      cfg.husband.address_first_pos = [
        cfg.husband.address_first_pos[0] + 10,
        cfg.husband.address_first_pos[1] - 5,
      ];
    });
    const out = path.join(dir, 'out.pdf');
    const { code, stderr } = await runMain([cfgPath, '-o', out]);
    assert.equal(code, 0, stderr);
    const cfg = readYaml(cfgPath);
    const layout = resolveLayout('red', cfg);
    const base = resolveLayout('red', readRepoYaml('config.yaml'));
    assert.equal(
      layout.husband.household_person.pos[0],
      base.husband.household_person.pos[0] + 10,
    );
    const { words } = extractWords(out);
    assertMarksPresent(words, expectedMarks(cfg, layout), 'shifted');
  });

  test('a layout: override moves exactly that field in the output', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(
      dir,
      'override.yaml',
      'config-black.yaml',
      (cfg) => {
        cfg.layout = { wife: { first_name: { pos: [480, 640] } } };
      },
    );
    const out = path.join(dir, 'out.pdf');
    const { code, stderr } = await runMain([cfgPath, '-o', out]);
    assert.equal(code, 0, stderr);
    const cfg = readYaml(cfgPath);
    const { words } = extractWords(out);
    const layout = resolveLayout('black', cfg);
    assert.deepEqual(layout.wife.first_name.pos, [480, 640]);
    assertMarksPresent(words, expectedMarks(cfg, layout), 'override');
    const original = resolveLayout('black', {}).wife.first_name;
    assert.equal(
      findWord(words, {
        text: cfg.wife.first_name,
        x: original.pos[0],
        baseline: original.pos[1],
        size: original.size,
      }),
      undefined,
      'the name no longer sits at the original position',
    );
  });

  test('blank values draw nothing, and every job_type 1-6 ticks its own box', async (t) => {
    const dir = makeTempDir(t);
    for (const jobType of [1, 2, 3, 4, 5, 6]) {
      const cfgPath = writeConfig(
        dir,
        `job${jobType}.yaml`,
        'config-cinnamoroll.yaml',
        (cfg) => {
          cfg.husband.job_type = jobType;
          cfg.wife.job_type = jobType;
          cfg.husband.address_apartment = '';
          cfg.national_census.year = '';
          cfg.new_legally_domiciled.lastname_of = null;
        },
      );
      const out = path.join(dir, `job${jobType}.pdf`);
      const { code, stderr } = await runMain([cfgPath, '-o', out]);
      assert.equal(code, 0, stderr);
      const cfg = readYaml(cfgPath);
      const layout = resolveLayout('cinnamoroll', cfg);
      const { words } = extractWords(out);
      const marks = expectedMarks(cfg, layout);
      assertMarksPresent(words, marks, `job_type ${jobType}`);
      // No surname ✓ (separate surnames), so only the two marital and two job ticks remain.
      assert.equal(marks.filter((m) => m.text === '✓').length, 4);
      const ticks = words.filter((w) => w.text === '✓');
      assert.equal(
        ticks.length,
        4,
        `exactly four ✓ on the page for job_type ${jobType}`,
      );
      const census = layout.national_census.year;
      assert.equal(
        findWord(words, {
          text: '令和3',
          x: census.pos[0],
          baseline: census.pos[1],
          size: census.size,
        }),
        undefined,
        'an empty national_census.year draws no census block',
      );
    }
  });
});
