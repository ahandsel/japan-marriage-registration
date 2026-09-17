// In-process tests of src/layout.js: the schema, the deep merge of a `layout:`
// block, the legacy `*_pos` overrides, and the naming rules that tie a
// template to its layout file. Failure paths call process.exit, so they are
// covered by the CLI tests instead.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import {
  layoutNameForTemplate,
  LEGACY_POS_KEY_PATHS,
  resolveLayout,
  TEMPLATE_PREFIX,
} from '../src/layout.js';
import { readRepoYaml, REPO_ROOT, VARIANTS } from './helpers.mjs';

const LAYOUT_DIR = path.join(REPO_ROOT, 'src/layout');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'src/template');

// Every positional entry of a layout as [dotted path, JSON value] pairs.
function leaves(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => {
    const isBranch =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !('pos' in value) &&
      !('positions' in value);
    return isBranch
      ? leaves(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, JSON.stringify(value)]];
  });
}

function silence(t) {
  // resolveLayout reports the red fallback and the *_pos warning on stdout;
  // keep the test output clean and hand the calls back for assertions.
  return t.mock.method(console, 'log', () => {});
}

describe('bundled templates and layouts', () => {
  test('every template PDF has a layout file and every layout file has a template', () => {
    const templates = fs
      .readdirSync(TEMPLATE_DIR)
      .filter((f) => f.endsWith('.pdf'))
      .map((f) => path.parse(f).name);
    const layouts = fs
      .readdirSync(LAYOUT_DIR)
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => path.parse(f).name);
    for (const stem of templates) {
      assert.ok(
        stem.startsWith(TEMPLATE_PREFIX),
        `${stem} follows the naming convention`,
      );
    }
    assert.deepEqual(
      templates.map((stem) => stem.slice(TEMPLATE_PREFIX.length)).sort(),
      layouts.sort(),
    );
    assert.deepEqual(layouts.sort(), [...VARIANTS].sort());
  });

  test('every bundled layout passes the closed schema on its own', () => {
    for (const variant of VARIANTS) {
      const layout = resolveLayout(variant, {});
      for (const section of [
        'husband',
        'wife',
        'witness1',
        'witness2',
        'new_legally_domiciled',
        'to_live_together',
        'national_census',
        'notification',
        'other',
      ]) {
        assert.ok(section in layout, `${variant}.${section}`);
      }
      assert.equal(layout.husband.job_type_checks.positions[6].length, 2);
    }
  });

  test('a resolved layout equals its YAML file when the config has no overrides', () => {
    for (const variant of VARIANTS) {
      assert.deepEqual(
        resolveLayout(variant, {}),
        readRepoYaml(`src/layout/${variant}.yaml`),
      );
    }
  });

  test('husband and wife, and the two witnesses, share one key set', () => {
    for (const variant of VARIANTS) {
      const layout = readRepoYaml(`src/layout/${variant}.yaml`);
      const keys = (section) => leaves(layout[section]).map(([k]) => k);
      assert.deepEqual(
        keys('husband'),
        keys('wife'),
        `${variant}: husband vs wife`,
      );
      assert.deepEqual(
        keys('witness1'),
        keys('witness2'),
        `${variant}: witness1 vs witness2`,
      );
    }
  });

  test('no positional entry is shared verbatim between two templates', () => {
    // Each layout was measured against its own printed grid, so a value
    // copied from another template is a defect even when it renders plausibly.
    const all = Object.fromEntries(
      VARIANTS.map((v) => [
        v,
        Object.fromEntries(leaves(readRepoYaml(`src/layout/${v}.yaml`))),
      ]),
    );
    for (let i = 0; i < VARIANTS.length; i += 1) {
      for (let j = i + 1; j < VARIANTS.length; j += 1) {
        const a = VARIANTS[i];
        const b = VARIANTS[j];
        const shared = Object.keys(all[a]).filter(
          (key) => all[a][key] === all[b][key],
        );
        assert.deepEqual(shared, [], `${a} and ${b} share entries`);
      }
    }
  });

  test('the three templates are single-page A3 landscape sheets of the same size', async () => {
    const sizes = [];
    for (const variant of VARIANTS) {
      const bytes = fs.readFileSync(
        path.join(TEMPLATE_DIR, `${TEMPLATE_PREFIX}${variant}.pdf`),
      );
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      assert.equal(doc.getPageCount(), 1, `${variant} has one page`);
      sizes.push(doc.getPage(0).getSize());
    }
    for (const size of sizes) {
      assert.ok(Math.abs(size.width - sizes[0].width) < 0.5);
      assert.ok(Math.abs(size.height - sizes[0].height) < 0.5);
      assert.ok(size.width > size.height, 'landscape');
    }
    // Every coordinate in every layout lands on the sheet.
    for (const variant of VARIANTS) {
      for (const [key, json] of leaves(
        readRepoYaml(`src/layout/${variant}.yaml`),
      )) {
        const value = JSON.parse(json);
        const points = Array.isArray(value)
          ? [
              value.slice(0, 2),
              value.length === 4 ? value.slice(2) : null,
            ].filter(Boolean)
          : 'pos' in value
            ? [value.pos]
            : Object.values(value.positions);
        for (const [x, y] of points) {
          assert.ok(
            x >= 0 && x <= sizes[0].width,
            `${variant}.${key} x=${x} on the page`,
          );
          assert.ok(
            y >= 0 && y <= sizes[0].height,
            `${variant}.${key} y=${y} on the page`,
          );
        }
      }
    }
  });
});

describe('layoutNameForTemplate', () => {
  test('reduces every accepted spelling to the short variant name', () => {
    assert.equal(layoutNameForTemplate('red'), 'red');
    assert.equal(layoutNameForTemplate(`${TEMPLATE_PREFIX}black`), 'black');
    assert.equal(
      layoutNameForTemplate(`/x/y/${TEMPLATE_PREFIX}cinnamoroll.pdf`),
      'cinnamoroll',
    );
    assert.equal(layoutNameForTemplate('/x/y/my-form.pdf'), 'my-form');
    assert.equal(layoutNameForTemplate('MY-FORM.PDF'), 'MY-FORM');
  });
});

describe('layout: overrides', () => {
  test('a layout: block replaces one entry and leaves every other entry alone', () => {
    const base = resolveLayout('red', {});
    const merged = resolveLayout('red', {
      layout: { husband: { last_name: { pos: [230, 600] } } },
    });
    assert.deepEqual(merged.husband.last_name, { pos: [230, 600], size: 24 });
    const strip = (layout) => {
      const copy = structuredClone(layout);
      delete copy.husband.last_name;
      return copy;
    };
    assert.deepEqual(strip(merged), strip(base));
  });

  test('a layout: block never leaks into the next resolve', () => {
    const before = resolveLayout('black', {});
    resolveLayout('black', { layout: { wife: { first_name: { size: 99 } } } });
    assert.deepEqual(resolveLayout('black', {}), before);
    assert.deepEqual(
      readRepoYaml('src/layout/black.yaml').wife.first_name,
      before.wife.first_name,
    );
  });

  test('a layout: block applies on top of a custom PDF using the red fallback', (t) => {
    const log = silence(t);
    const merged = resolveLayout('/tmp/custom.pdf', {
      layout: { notification: { to: { pos: [1, 2] } } },
    });
    assert.deepEqual(merged.notification.to.pos, [1, 2]);
    assert.equal(
      merged.husband.last_name.size,
      resolveLayout('red', {}).husband.last_name.size,
    );
    assert.ok(
      log.mock.calls.some((c) =>
        String(c.arguments[0]).includes('No layout file for template "custom"'),
      ),
      'the fallback is announced',
    );
  });
});

describe('legacy *_pos overrides', () => {
  const LEGACY_PERSON_KEYS = [
    'last_name_pos',
    'last_name_kana_pos',
    'first_name_pos',
    'first_name_kana_pos',
    'address_first_pos',
    'legally_domiciled_first_pos',
    'father_name_pos',
    'mother_name_pos',
  ];

  test('LEGACY_POS_KEY_PATHS lists every key, for both spouses plus the new domicile', () => {
    const expected = [
      ...['husband', 'wife'].flatMap((who) =>
        LEGACY_PERSON_KEYS.map((key) => [who, key]),
      ),
      ['new_legally_domiciled', 'address_pos'],
    ];
    assert.deepEqual(LEGACY_POS_KEY_PATHS, expected);
  });

  test('address_first_pos moves the whole 住所 block by the same delta on red', () => {
    const base = resolveLayout('red', {});
    const [x, y] = base.husband.address_first.pos;
    const merged = resolveLayout('red', {
      husband: { address_first_pos: [x + 10, y - 5] },
    });
    const shifted = (key) => [
      base.husband[key].pos[0] + 10,
      base.husband[key].pos[1] - 5,
    ];
    assert.deepEqual(merged.husband.address_first.pos, [x + 10, y - 5]);
    for (const key of [
      'address_second',
      'address_go',
      'household_person',
      'address_apartment',
    ]) {
      assert.deepEqual(merged.husband[key].pos, shifted(key), key);
    }
    // Shapes and the other blocks stay where they were.
    assert.deepEqual(
      merged.husband.address_banchi_ellipse,
      base.husband.address_banchi_ellipse,
    );
    assert.deepEqual(
      merged.husband.legally_domiciled_first,
      base.husband.legally_domiciled_first,
    );
    assert.deepEqual(merged.wife, base.wife);
  });

  test('legally_domiciled_first_pos moves the 本籍 block, and the name keys move only themselves', () => {
    const base = resolveLayout('red', {});
    const merged = resolveLayout('red', {
      wife: {
        legally_domiciled_first_pos: [0, 0],
        last_name_pos: [1, 1],
        father_name_pos: [2, 2],
      },
      new_legally_domiciled: { address_pos: [3, 3] },
    });
    const [bx, by] = base.wife.legally_domiciled_first.pos;
    assert.deepEqual(merged.wife.legally_domiciled_first.pos, [0, 0]);
    for (const key of [
      'legally_domiciled_second',
      'head_of_person_of_legally_domiciled',
    ]) {
      assert.deepEqual(
        merged.wife[key].pos,
        [base.wife[key].pos[0] - bx, base.wife[key].pos[1] - by],
        key,
      );
    }
    assert.deepEqual(merged.wife.last_name.pos, [1, 1]);
    assert.deepEqual(merged.wife.last_name_kana, base.wife.last_name_kana);
    assert.deepEqual(merged.wife.father_name.pos, [2, 2]);
    assert.deepEqual(merged.wife.mother_name, base.wife.mother_name);
    assert.deepEqual(merged.new_legally_domiciled.address.pos, [3, 3]);
    assert.deepEqual(
      merged.new_legally_domiciled.banchi_ellipse,
      base.new_legally_domiciled.banchi_ellipse,
    );
  });

  test('the *_pos values in config.yaml equal the red layout, so the sample renders unchanged', () => {
    const cfg = readRepoYaml('config.yaml');
    const base = resolveLayout('red', {});
    assert.deepEqual(resolveLayout('red', cfg), base);
    for (const [section, key] of LEGACY_POS_KEY_PATHS) {
      assert.ok(
        cfg[section][key] !== undefined,
        `config.yaml carries ${section}.${key}`,
      );
    }
  });

  test('a null *_pos is ignored, not an error', () => {
    const base = resolveLayout('red', {});
    assert.deepEqual(
      resolveLayout('red', { husband: { last_name_pos: null } }),
      base,
    );
  });

  test('*_pos keys are ignored with a warning on every non-red layout', (t) => {
    for (const variant of VARIANTS.filter((v) => v !== 'red')) {
      const log = silence(t);
      const base = resolveLayout(variant, {});
      const merged = resolveLayout(variant, {
        husband: { last_name_pos: [1, 1] },
      });
      assert.deepEqual(merged, base, `${variant} positions unchanged`);
      assert.ok(
        log.mock.calls.some((c) =>
          String(c.arguments[0]).includes(
            'Ignoring the legacy *_pos overrides',
          ),
        ),
        `${variant} warns`,
      );
      log.mock.restore();
    }
  });

  test('*_pos keys apply to a custom PDF, because it uses the red grid', (t) => {
    silence(t);
    const merged = resolveLayout('/tmp/custom.pdf', {
      husband: { last_name_pos: [7, 8] },
    });
    assert.deepEqual(merged.husband.last_name.pos, [7, 8]);
  });

  test('a layout: entry wins over the *_pos key for the same field, with a warning', (t) => {
    // config.yaml ships every *_pos key, so this is what a `layout:` nudge on
    // a config copied from the sample looks like.
    const log = silence(t);
    const cfg = readRepoYaml('config.yaml');
    cfg.layout = { husband: { last_name: { pos: [220, 630] } } };
    const merged = resolveLayout('red', cfg);
    assert.deepEqual(merged.husband.last_name.pos, [220, 630]);
    const warning = log.mock.calls
      .map((c) => String(c.arguments[0]))
      .find((line) => line.includes('"layout:" entry wins'));
    assert.ok(warning, 'the ignored *_pos key is announced');
    assert.match(
      warning,
      /- husband\.last_name_pos \(layout\.husband\.last_name sets pos\)/,
    );
    // The other *_pos keys still apply, and no other warning line appears.
    assert.equal(warning.match(/^ {3}- /gm).length, 1);
    assert.deepEqual(merged.wife, resolveLayout('red', {}).wife);
  });

  test('a layout: entry for a dependent field is not dragged along by the anchor *_pos shift', (t) => {
    const log = silence(t);
    const base = resolveLayout('red', {});
    const [x, y] = base.husband.address_first.pos;
    const merged = resolveLayout('red', {
      husband: { address_first_pos: [x + 10, y - 5] },
      layout: { husband: { address_second: { pos: [300, 500] } } },
    });
    assert.deepEqual(merged.husband.address_first.pos, [x + 10, y - 5]);
    assert.deepEqual(merged.husband.address_second.pos, [300, 500]);
    // The dependents without their own entry still move with the anchor.
    assert.deepEqual(merged.husband.household_person.pos, [
      base.husband.household_person.pos[0] + 10,
      base.husband.household_person.pos[1] - 5,
    ]);
    const warning = log.mock.calls
      .map((c) => String(c.arguments[0]))
      .find((line) => line.includes('"layout:" entry wins'));
    assert.match(
      warning,
      /- the husband\.address_first_pos shift of address_second \(layout\.husband\.address_second sets pos\)/,
    );
  });

  test('no precedence warning when a layout: entry and the *_pos keys name different fields', (t) => {
    const log = silence(t);
    const cfg = readRepoYaml('config.yaml');
    cfg.layout = { notification: { to: { pos: [1, 2] } } };
    resolveLayout('red', cfg);
    assert.ok(
      !log.mock.calls.some((c) =>
        String(c.arguments[0]).includes('"layout:" entry wins'),
      ),
    );
  });
});

describe('key path annotation', () => {
  test('every node knows its dotted path, without it showing up as a key', () => {
    const layout = resolveLayout('red', {});
    assert.equal(layout.husband.keyPath, 'husband');
    assert.equal(
      layout.husband.marital_history.keyPath,
      'husband.marital_history',
    );
    assert.equal(layout.wife.last_name.keyPath, 'wife.last_name');
    assert.equal(layout.witness2.address_go.keyPath, 'witness2.address_go');
    assert.ok(!Object.keys(layout.husband).includes('keyPath'));
    assert.ok(!JSON.stringify(layout).includes('keyPath'));
  });
});
