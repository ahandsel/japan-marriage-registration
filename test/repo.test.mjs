// Repository hygiene: the rules AGENTS.md states about the tracked files,
// checked mechanically. Privacy first (nothing private is tracked, and the
// tracked configs hold placeholders only), then the conventions that keep the
// configs, scripts, workflows, and docs consistent with each other.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import YAML from 'yaml';
import {
  readRepoYaml,
  REPO_ROOT,
  TRACKED_CONFIGS,
  VARIANTS,
} from './helpers.mjs';

function git(...args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf-8' });
}

function read(relative) {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf-8');
}

const trackedFiles = git('ls-files').trim().split('\n');

// Dotted key paths of every leaf in a parsed YAML mapping.
function keyPaths(node, prefix = '') {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return [prefix.slice(0, -1)];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    keyPaths(value, `${prefix}${key}.`),
  );
}

function scalarValues(node, prefix = '') {
  if (node === null || typeof node !== 'object') {
    return [[prefix.slice(0, -1), node]];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    scalarValues(value, `${prefix}${key}.`),
  );
}

describe('privacy', () => {
  test('no private config or generated PDF is tracked', () => {
    const leaked = trackedFiles.filter(
      (f) =>
        /(^|\/)config-private/.test(f) ||
        /(^|\/)(result.*|failed-.*)\.pdf$/.test(f) ||
        /(^|\/)(save|p)\.yaml$/.test(f),
    );
    assert.deepEqual(leaked, []);
  });

  test('.gitignore covers every private and generated filename the docs mention', () => {
    const names = [
      'config-private.yaml',
      'config-private-black.yaml',
      'config-private-anything.yaml',
      'result.pdf',
      'result-red-12-34-56.pdf',
      'failed-result.pdf',
      'save.yaml',
      'p.yaml',
      'local/anything.yaml',
    ];
    const ignored = git('check-ignore', '--no-index', ...names)
      .trim()
      .split('\n');
    assert.deepEqual(ignored.sort(), names.sort());
  });

  test('the tracked configs hold no value that only appears in a local private config', () => {
    // Runs only where private configs exist. Anything in a private config that
    // is not also in the public sample is assumed to be real, so the assertion
    // names the key, never the value.
    const privateFiles = fs
      .readdirSync(REPO_ROOT)
      .filter((f) => /^config-private.*\.yaml$/.test(f));
    const publicValues = new Set(
      TRACKED_CONFIGS.flatMap(({ file }) =>
        scalarValues(readRepoYaml(file)).map(([, v]) => String(v)),
      ),
    );
    const publicTexts = trackedFiles
      .filter((f) => /\.(yaml|md|js|mjs|json)$/.test(f))
      .map((f) => [f, read(f)]);
    const leaks = [];
    for (const file of privateFiles) {
      let cfg;
      try {
        cfg = readRepoYaml(file);
      } catch {
        continue;
      }
      for (const [key, value] of scalarValues(cfg)) {
        const text = String(value);
        // Only Japanese text is checked: short ASCII values (years, '03')
        // collide with unrelated numbers in the docs.
        if (!/[^\x00-\x7F]/.test(text) || publicValues.has(text)) {
          continue;
        }
        for (const [tracked, body] of publicTexts) {
          if (body.includes(text)) {
            leaks.push(`${file}: ${key} appears in ${tracked}`);
          }
        }
      }
    }
    assert.deepEqual(leaks, []);
  });
});

describe('tracked configs', () => {
  const sample = readRepoYaml('config.yaml');
  const sampleKeys = keyPaths(sample).filter((k) => !k.endsWith('_pos'));

  test('config.yaml has no template: key, so the red default is what CI builds', () => {
    assert.equal(sample.template, undefined);
  });

  for (const { file, variant } of TRACKED_CONFIGS.filter(
    (c) => c.variant !== 'red',
  )) {
    test(`${file} pins template: ${variant}, drops *_pos, and matches the sample key set`, () => {
      const cfg = readRepoYaml(file);
      assert.equal(cfg.template, variant);
      const keys = keyPaths(cfg);
      assert.deepEqual(
        keys.filter((k) => k.endsWith('_pos')),
        [],
        'no legacy *_pos keys',
      );
      // A per-template sample demonstrates every section, the witness box
      // included, so its layout is exercised by a tracked config.
      const missing = sampleKeys.filter((k) => !keys.includes(k));
      assert.deepEqual(missing, [], 'keys from config.yaml missing');
      const extra = keys.filter(
        (k) => k !== 'template' && !sampleKeys.includes(k),
      );
      assert.deepEqual(extra, [], 'keys that config.yaml does not have');
    });
  }

  test('every witness name is blank, because a witness signature must be handwritten', () => {
    for (const { file } of TRACKED_CONFIGS) {
      const cfg = readRepoYaml(file);
      for (const who of ['witness1', 'witness2']) {
        if (cfg[who]) {
          assert.equal(cfg[who].name, '', `${file} ${who}.name`);
        }
      }
    }
  });

  test('the cinnamoroll sample leaves its two pre-printed fields blank', () => {
    const cfg = readRepoYaml('config-cinnamoroll.yaml');
    assert.equal(cfg.notification.to, '');
    assert.equal(cfg.husband.household_person, '');
    assert.equal(cfg.wife.household_person, '');
  });

  test('the cinnamoroll sample leaves 丁目 out of the spouse address rows, where the form prints it', () => {
    // The husband and wife 住所/本籍 rows pre-print 丁目; a value that carries
    // its own 丁目 prints on top of it. The witness rows do not, so those keep
    // the usual "２丁目　８" shape (see the layout header).
    const cfg = readRepoYaml('config-cinnamoroll.yaml');
    for (const who of ['husband', 'wife']) {
      for (const key of ['address_second', 'legally_domiciled_second']) {
        const value = String(cfg[who][key]);
        assert.ok(!value.includes('丁目'), `${who}.${key} = ${value}`);
        assert.match(
          value,
          /　　/,
          `${who}.${key} leaves room for the printed 丁目`,
        );
      }
    }
    for (const who of ['witness1', 'witness2']) {
      assert.match(
        String(cfg[who].address_second),
        /丁目/,
        `${who}.address_second`,
      );
    }
  });

  test('the black sample skips the witness 番地/番 mark its form does not print', () => {
    const cfg = readRepoYaml('config-black.yaml');
    for (const who of ['witness1', 'witness2']) {
      assert.equal(
        cfg[who].is_banchi_address,
        null,
        `${who}.is_banchi_address`,
      );
    }
  });

  test('every config key is explained in the field reference', () => {
    const doc = read('src/template/marriage-registration-fields.md');
    const leafNames = [...new Set(sampleKeys.map((k) => k.split('.').pop()))];
    const undocumented = leafNames.filter((name) => !doc.includes(name));
    assert.deepEqual(undocumented, []);
  });
});

describe('package.json', () => {
  const pkg = JSON.parse(read('package.json'));

  test('scripts are sorted alphabetically', () => {
    const names = Object.keys(pkg.scripts);
    assert.deepEqual(names, [...names].sort());
  });

  test('every bundled template has its config, layout, and pdf scripts', () => {
    for (const variant of VARIANTS) {
      assert.equal(
        pkg.scripts[`${variant}:config`],
        `node src/main.js --init-config --template ${variant}`,
      );
      assert.equal(
        pkg.scripts[`${variant}:layout`],
        `node src/main.js --init-layout --template ${variant}`,
      );
      assert.equal(
        pkg.scripts[`${variant}:pdf`],
        `node src/main.js --template ${variant}`,
      );
    }
  });

  test('scripts never call npm, npx, or yarn', () => {
    for (const [name, command] of Object.entries(pkg.scripts)) {
      assert.doesNotMatch(command, /\b(npm|npx|yarn)\b/, name);
    }
  });

  test('every pnpm script is documented in AGENTS.md', () => {
    const agents = read('AGENTS.md');
    const perTemplate = new RegExp(
      `^(${VARIANTS.join('|')}):(config|layout|pdf)$`,
    );
    const undocumented = Object.keys(pkg.scripts).filter(
      (name) =>
        !perTemplate.test(name) &&
        !new RegExp(`pnpm (run )?${name}\\b`).test(agents),
    );
    assert.deepEqual(undocumented, []);
  });
});

describe('helper scripts', () => {
  const scripts = trackedFiles.filter((f) =>
    /(^|\/)scripts\/[^/]+\.(sh|zsh|mjs|js)$/.test(f),
  );

  test('there is at least one helper script to check', () => {
    assert.ok(scripts.length >= 2);
  });

  test('the VERSION constant matches the newest version history entry', () => {
    const mismatches = [];
    for (const file of scripts) {
      const text = read(file);
      const constant = text.match(
        /^(?:const |export const )?VERSION\s*=\s*['"]([\d.]+)['"]/m,
      )?.[1];
      const newest = text.match(/version history[\s\S]*?\bv(\d+\.\d+)/i)?.[1];
      if (
        constant !== undefined &&
        newest !== undefined &&
        constant !== newest
      ) {
        mismatches.push(
          `${file}: VERSION is ${constant}, history starts at v${newest}`,
        );
      }
    }
    assert.deepEqual(mismatches, []);
  });

  test('no helper script is Python', () => {
    const python = trackedFiles.filter((f) => f.endsWith('.py'));
    assert.deepEqual(python, []);
  });
});

describe('workflows', () => {
  const workflowFiles = trackedFiles.filter((f) =>
    f.startsWith('.github/workflows/'),
  );

  test('three workflows exist', () => {
    assert.deepEqual(workflowFiles.sort(), [
      '.github/workflows/pr-lint-autofix.yml',
      '.github/workflows/pr.yml',
      '.github/workflows/push.yml',
    ]);
  });

  for (const file of workflowFiles) {
    test(`${file}: actions pinned to a SHA, permissions declared, only config.yaml built`, () => {
      const text = read(file);
      const wf = YAML.parse(text);
      assert.ok(wf.permissions, 'top-level permissions block');
      const usesLines = text
        .split('\n')
        .filter((line) => /^\s*-?\s*uses:/.test(line));
      assert.ok(usesLines.length > 0);
      for (const line of usesLines) {
        assert.match(line, /@[0-9a-f]{40}\s+#.*pinned/, line.trim());
      }
      assert.ok(
        !text.includes('config-private'),
        'never builds a private config',
      );
      for (const line of text
        .split('\n')
        .filter((l) => l.includes('src/main.js'))) {
        assert.match(line, /config\.yaml/, line.trim());
      }
      for (const job of Object.values(wf.jobs)) {
        for (const step of job.steps) {
          if (step.run) {
            assert.doesNotMatch(step.run, /\b(npm|npx|yarn)\b/, 'pnpm only');
            assert.ok(
              !/\$\{\{\s*github\.event\.(head_commit|pull_request)\./.test(
                step.run,
              ),
              'no event data interpolated into run:',
            );
          }
        }
      }
    });
  }
});

describe('documentation pair', () => {
  test('README.md and README.en.md link to each other', () => {
    assert.ok(read('README.md').includes('README.en.md'));
    assert.ok(read('README.en.md').includes('README.md'));
  });

  test('.claude/CLAUDE.md delegates to AGENTS.md', () => {
    assert.match(read('.claude/CLAUDE.md'), /AGENTS\.md/);
  });

  test('the field reference and both READMEs are free of curly quotes and dashes', () => {
    for (const file of [
      'README.md',
      'README.en.md',
      'AGENTS.md',
      'src/template/marriage-registration-fields.md',
      'test/README.md',
    ]) {
      assert.doesNotMatch(read(file), /[–—“”‘’ ]/, file);
    }
  });
});
