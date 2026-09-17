// Black-box tests of the command line: every test runs src/main.js as a child
// process and checks the exit code, the messages, and the files it writes.
// Commands that write into the checkout (--init-config, --init-layout, the
// first-run scaffold) run in a sandbox copy, never in the repository itself.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { promisify } from 'node:util';
import YAML from 'yaml';
import {
  makeSandbox,
  makeTempDir,
  readRepoYaml,
  REPO_ROOT,
  runMain,
  TRACKED_CONFIGS,
  VARIANTS,
  writeConfig,
} from './helpers.mjs';

const execFileAsync = promisify(execFile);

describe('help and discovery', () => {
  test('--help exits 0 and names every bundled template', async () => {
    const { code, stdout } = await runMain(['--help']);
    assert.equal(code, 0);
    assert.match(stdout, /^usage: main\.js/);
    for (const variant of VARIANTS) {
      assert.ok(stdout.includes(variant), `usage names ${variant}`);
    }
    for (const flag of [
      '-t, --template',
      '-o, --output',
      '--list-templates',
      '--init-config',
      '--init-layout',
    ]) {
      assert.ok(stdout.includes(flag), `usage documents ${flag}`);
    }
  });

  test('--list-templates prints one line per bundled PDF, sorted', async () => {
    const { code, stdout } = await runMain(['--list-templates']);
    assert.equal(code, 0);
    const lines = stdout.trim().split('\n');
    const stems = lines.map((line) => line.split('\t')[0]);
    assert.deepEqual(
      stems,
      VARIANTS.map((v) => `jp-marriage-registration-${v}`).sort(),
    );
    for (const line of lines) {
      const file = line.split('\t')[1];
      assert.ok(fs.existsSync(file), `${file} exists`);
    }
  });

  test('a second positional argument is rejected', async () => {
    const { code, stderr } = await runMain(['config.yaml', 'extra.yaml']);
    assert.equal(code, 1);
    assert.match(stderr, /unrecognized arguments: extra\.yaml/);
  });

  test('an unknown option is rejected with the usage text', async () => {
    const { code, stderr } = await runMain(['--bogus']);
    assert.equal(code, 1);
    assert.match(stderr, /^usage: main\.js/);
  });

  test('start.sh --help answers before installing anything', async () => {
    const { stdout } = await execFileAsync('bash', ['start.sh', '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    assert.match(stdout, /^usage: \.\/start\.sh/);
    assert.ok(!stdout.includes('Installing dependencies'));
  });
});

describe('generating from the tracked configs', () => {
  for (const { file, variant } of TRACKED_CONFIGS) {
    test(`${file} renders on the ${variant} template`, async (t) => {
      const out = path.join(makeTempDir(t), 'out.pdf');
      const { code, stdout, stderr } = await runMain([file, '-o', out]);
      assert.equal(code, 0, stderr);
      assert.match(stdout, new RegExp(`^Config:\\s+${file}$`, 'm'));
      assert.match(
        stdout,
        new RegExp(
          `^Template:\\s+.*jp-marriage-registration-${variant}\\.pdf$`,
          'm',
        ),
      );
      assert.match(stdout, new RegExp(`^Wrote: ${out}$`, 'm'));
      assert.ok(fs.statSync(out).size > 0);
      // A tracked config is tuned for its own template, so the legacy *_pos
      // warning and the red-fallback notice must both stay silent.
      assert.ok(
        !stdout.includes('Ignoring the legacy *_pos'),
        `no *_pos warning: ${stdout}`,
      );
      assert.ok(
        !stdout.includes('No layout file for template'),
        `no fallback notice: ${stdout}`,
      );
    });
  }

  test('the default output name is result-<template>-<HH-MM-SS>.pdf in the cwd', async (t) => {
    const sandbox = makeSandbox(t);
    const { code, stdout } = await runMain(['config.yaml'], { root: sandbox });
    assert.equal(code, 0);
    const written = stdout.match(/^Wrote: (.+)$/m)?.[1];
    assert.match(written, /^result-red-\d{2}-\d{2}-\d{2}\.pdf$/);
    assert.ok(fs.existsSync(path.join(sandbox, written)));
  });

  test('-t overrides the template: key in the config', async (t) => {
    const out = path.join(makeTempDir(t), 'out.pdf');
    const { code, stdout } = await runMain([
      'config-black.yaml',
      '-t',
      'red',
      '-o',
      out,
    ]);
    assert.equal(code, 0);
    assert.match(stdout, /jp-marriage-registration-red\.pdf$/m);
    // The default name follows the resolved template too.
    const sandbox = makeSandbox(t);
    const { stdout: named } = await runMain(
      ['config.yaml', '-t', 'jp-marriage-registration-black'],
      { root: sandbox },
    );
    assert.match(named, /^Wrote: result-black-/m);
  });

  test('a path to any PDF is accepted as a template and falls back to the red layout', async (t) => {
    const dir = makeTempDir(t);
    const custom = path.join(dir, 'custom.pdf');
    fs.copyFileSync(
      path.join(REPO_ROOT, 'src/template/jp-marriage-registration-red.pdf'),
      custom,
    );
    const out = path.join(dir, 'out.pdf');
    const { code, stdout } = await runMain([
      'config.yaml',
      '-t',
      custom,
      '-o',
      out,
    ]);
    assert.equal(code, 0);
    assert.match(
      stdout,
      /ℹ️ {2}No layout file for template "custom" - using the "red" layout/,
    );
    assert.ok(fs.existsSync(out));
  });

  test('a config without witness sections still renders', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(
      dir,
      'no-witness.yaml',
      'config.yaml',
      (cfg) => {
        delete cfg.witness1;
        delete cfg.witness2;
      },
    );
    const out = path.join(dir, 'out.pdf');
    const { code, stderr } = await runMain([cfgPath, '-o', out]);
    assert.equal(code, 0, stderr);
  });

  test('the legacy is_husband_lastname boolean is still honoured', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'legacy.yaml', 'config.yaml', (cfg) => {
      delete cfg.new_legally_domiciled.lastname_of;
      cfg.new_legally_domiciled.is_husband_lastname = false;
    });
    const out = path.join(dir, 'out.pdf');
    const { code, stderr } = await runMain([cfgPath, '-o', out]);
    assert.equal(code, 0, stderr);
  });
});

describe('config errors stop the run with a ❌ message, never a stack trace', () => {
  test('a missing config path names the file and the init command', async () => {
    const { code, stderr } = await runMain(['does-not-exist.yaml']);
    assert.equal(code, 1);
    assert.match(stderr, /❌ Config file not found: does-not-exist\.yaml/);
    assert.match(stderr, /init-config/);
  });

  test('an unknown template lists the available ones', async () => {
    const { code, stderr } = await runMain(['config.yaml', '-t', 'purple']);
    assert.equal(code, 1);
    assert.match(stderr, /Unknown template: purple/);
    assert.match(stderr, /Available templates: black .*, cinnamoroll .*, red/);
  });

  test('a template path that does not exist is reported', async () => {
    const { code, stderr } = await runMain([
      'config.yaml',
      '-t',
      '/nowhere/form.pdf',
    ]);
    assert.equal(code, 1);
    assert.match(stderr, /Template PDF not found: \/nowhere\/form\.pdf/);
  });

  test('a missing key is named by its dotted path and nothing is written', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'missing.yaml', 'config.yaml', (cfg) => {
      delete cfg.husband.father_name;
    });
    const out = path.join(dir, 'out.pdf');
    const { code, stderr } = await runMain([cfgPath, '-o', out]);
    assert.equal(code, 1);
    assert.match(
      stderr,
      /❌ Config error: no value for "husband\.father_name"/,
    );
    assert.ok(!fs.existsSync(out), 'no PDF is written on a config error');
  });

  test('a null value is treated like a missing key', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'null.yaml', 'config.yaml', (cfg) => {
      cfg.wife.mother_name = null;
    });
    const { code, stderr } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 1);
    assert.match(stderr, /no value for "wife\.mother_name"/);
  });

  test('a missing lastname_of is a missing key, and null is the explicit skip', async (t) => {
    const dir = makeTempDir(t);
    const out = path.join(dir, 'out.pdf');
    // Neither lastname_of nor the legacy is_husband_lastname: a typo in the key
    // name must not print a form with both 氏 boxes blank.
    const missing = writeConfig(
      dir,
      'no-lastname.yaml',
      'config.yaml',
      (cfg) => {
        delete cfg.new_legally_domiciled.lastname_of;
      },
    );
    let result = await runMain([missing, '-o', out]);
    assert.equal(result.code, 1);
    assert.match(
      result.stderr,
      /❌ Config error: no value for "new_legally_domiciled\.lastname_of"/,
    );
    assert.ok(!fs.existsSync(out), 'no PDF is written on a config error');
    // null is the documented way to leave both boxes blank (foreign spouse).
    const skipped = writeConfig(
      dir,
      'null-lastname.yaml',
      'config.yaml',
      (cfg) => {
        cfg.new_legally_domiciled.lastname_of = null;
      },
    );
    result = await runMain([skipped, '-o', out]);
    assert.equal(result.code, 0, result.stderr);
    assert.ok(fs.existsSync(out));
  });

  test('a lastname_of other than husband, wife, or null is rejected', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(
      dir,
      'bad-lastname.yaml',
      'config.yaml',
      (cfg) => {
        cfg.new_legally_domiciled.lastname_of = 'Husband';
      },
    );
    const { code, stderr } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 1);
    assert.match(
      stderr,
      /"new_legally_domiciled\.lastname_of" must be 'husband', 'wife', or null.*got "Husband"/,
    );
  });

  test('a missing witness key is a missing key, like a spouse key', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(
      dir,
      'witness-key.yaml',
      'config.yaml',
      (cfg) => {
        delete cfg.witness2.address_go;
      },
    );
    const out = path.join(dir, 'out.pdf');
    const { code, stderr } = await runMain([cfgPath, '-o', out]);
    assert.equal(code, 1);
    assert.match(stderr, /no value for "witness2\.address_go"/);
    assert.ok(!fs.existsSync(out), 'no PDF is written on a config error');
  });

  test("'' is the explicit blank and is accepted", async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'blank.yaml', 'config.yaml', (cfg) => {
      cfg.husband.father_name = '';
      cfg.other.text = '';
    });
    const { code, stderr } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 0, stderr);
  });

  test('marriage_cat outside 0-2 is rejected, naming the person', async (t) => {
    const dir = makeTempDir(t);
    for (const [who, bad] of [
      ['husband', 3],
      ['wife', '0'],
    ]) {
      const cfgPath = writeConfig(dir, `${who}.yaml`, 'config.yaml', (cfg) => {
        cfg[who].marital_history.marriage_cat = bad;
      });
      const { code, stderr } = await runMain([
        cfgPath,
        '-o',
        path.join(dir, 'out.pdf'),
      ]);
      assert.equal(code, 1);
      assert.match(
        stderr,
        new RegExp(
          `"${who}\\.marital_history\\.marriage_cat" must be 0 .*; got ${JSON.stringify(bad)}`,
        ),
      );
    }
  });

  test('an invalid layout: override lists every problem at once', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'layout.yaml', 'config.yaml', (cfg) => {
      cfg.layout = {
        husband: { bogus: 1, last_name: { pos: [1, 2], size: 0 } },
        other: { text: { step: 0 } },
      };
    });
    const { code, stderr } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 1);
    assert.match(stderr, /❌ Invalid layout for template "red"/);
    assert.match(stderr, /config "layout:" overrides/);
    assert.match(
      stderr,
      /- "husband\.last_name\.size" must be a positive number/,
    );
    assert.match(stderr, /- "husband\.bogus" is not a known layout key/);
    assert.match(stderr, /- "other\.text\.step" must be a positive line step/);
  });

  test('a layout: key that is not a mapping is rejected', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'layout.yaml', 'config.yaml', (cfg) => {
      cfg.layout = 'nope';
    });
    const { code, stderr } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 1);
    assert.match(stderr, /❌ Config error: "layout" must be a mapping/);
  });

  test('a malformed legacy *_pos value is rejected', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'pos.yaml', 'config.yaml', (cfg) => {
      cfg.husband.last_name_pos = [1];
    });
    const { code, stderr } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 1);
    assert.match(stderr, /"husband\.last_name_pos" must be a pair of numbers/);
  });

  test('legacy *_pos keys on a non-red template are ignored with a warning', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'pos-black.yaml', 'config.yaml', (cfg) => {
      cfg.template = 'black';
    });
    const { code, stdout } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 0);
    assert.match(stdout, /⚠️ {2}Ignoring the legacy \*_pos overrides/);
    assert.match(stdout, /tuned "black" layout/);
  });

  test('an empty config file fails with a ❌ message, not a TypeError', async (t) => {
    const dir = makeTempDir(t);
    const empty = path.join(dir, 'empty.yaml');
    fs.writeFileSync(empty, '');
    const scalar = path.join(dir, 'scalar.yaml');
    fs.writeFileSync(scalar, 'just a string\n');
    for (const cfgPath of [empty, scalar]) {
      const { code, stderr } = await runMain([
        cfgPath,
        '-o',
        path.join(dir, 'out.pdf'),
      ]);
      assert.equal(code, 1);
      assert.match(
        stderr,
        /❌ Config error: .* is empty or is not a YAML mapping/,
      );
      assert.ok(!stderr.includes('TypeError'), stderr);
    }
  });

  test('a malformed YAML config fails with a ❌ message naming the file, not a stack trace', async (t) => {
    const dir = makeTempDir(t);
    const bad = path.join(dir, 'bad.yaml');
    fs.writeFileSync(bad, 'husband:\n  last_name: "unclosed\n');
    const { code, stderr } = await runMain([
      bad,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 1);
    assert.match(stderr, /❌ Config error: .*bad\.yaml is not valid YAML/);
    assert.ok(!stderr.includes('    at '), 'no stack trace');
  });

  test('an is_banchi value outside true, false, and null is rejected in every section', async (t) => {
    const dir = makeTempDir(t);
    const cases = [
      ['husband', 'is_banchi_address', 'false'],
      ['wife', 'is_banchi_legally_domiciled', 1],
      ['new_legally_domiciled', 'is_banchi_address', 'yes'],
      ['witness1', 'is_banchi_address', 'null'],
      ['witness2', 'is_banchi_legally_domiciled', 0],
    ];
    for (const [section, key, value] of cases) {
      const cfgPath = writeConfig(dir, 'banchi.yaml', 'config.yaml', (cfg) => {
        cfg[section][key] = value;
      });
      const out = path.join(dir, 'out.pdf');
      const { code, stderr } = await runMain([cfgPath, '-o', out]);
      assert.equal(code, 1, `${section}.${key} = ${JSON.stringify(value)}`);
      assert.match(
        stderr,
        new RegExp(
          `❌ Config error: "${section}\\.${key}" must be true \\(番地\\), false \\(番\\), or null to draw no mark; got `,
        ),
      );
      assert.ok(
        stderr.includes(`got ${JSON.stringify(value)}.`),
        `names the bad value: ${stderr}`,
      );
      assert.ok(!fs.existsSync(out), 'no PDF is written on a config error');
    }
  });

  test('a missing is_banchi key is an error even when the new 本籍 address is blank', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'banchi.yaml', 'config.yaml', (cfg) => {
      cfg.new_legally_domiciled.address = '';
      delete cfg.new_legally_domiciled.is_banchi_address;
    });
    const { code, stderr } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 1);
    assert.match(
      stderr,
      /"new_legally_domiciled\.is_banchi_address" must be true .* the key is missing\./,
    );
  });

  test('a job_type_checks position outside 1-6 is not a known layout key', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'layout.yaml', 'config.yaml', (cfg) => {
      cfg.layout = { wife: { job_type_checks: { positions: { 7: [1, 2] } } } };
    });
    const { code, stderr } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 1);
    assert.match(
      stderr,
      /- "wife\.job_type_checks\.positions\.7" is not a job_type; only 1-6 are\./,
    );
  });

  test('an -o path in a directory that does not exist fails with a ❌ message', async (t) => {
    const dir = makeTempDir(t);
    const out = path.join(dir, 'no-such-dir', 'out.pdf');
    const { code, stderr } = await runMain(['config.yaml', '-o', out]);
    assert.equal(code, 1);
    assert.match(stderr, /❌ Cannot write the PDF to .*no-such-dir/);
    assert.ok(!stderr.includes('    at '), 'no stack trace');
  });

  test('a job_type outside 1-6 fails like a bad marriage_cat does', async (t) => {
    const dir = makeTempDir(t);
    for (const [who, bad] of [
      ['husband', 9],
      ['wife', '4'],
      ['husband', null],
    ]) {
      const cfgPath = writeConfig(dir, `${who}.yaml`, 'config.yaml', (cfg) => {
        cfg[who].job_type = bad;
      });
      const { code, stderr } = await runMain([
        cfgPath,
        '-o',
        path.join(dir, 'out.pdf'),
      ]);
      assert.equal(code, 1, `job_type ${JSON.stringify(bad)}`);
      assert.match(
        stderr,
        new RegExp(
          `"${who}\\.job_type" must be a number from 1 to 6, or 0 or '' to leave the box blank; got ${JSON.stringify(bad)}`,
        ),
      );
    }
  });

  test("job_type 0 and '' leave the box blank without an error", async (t) => {
    const dir = makeTempDir(t);
    for (const blank of [0, '']) {
      const cfgPath = writeConfig(
        dir,
        'blank-job.yaml',
        'config.yaml',
        (cfg) => {
          cfg.husband.job_type = blank;
          cfg.wife.job_type = blank;
        },
      );
      const { code, stderr } = await runMain([
        cfgPath,
        '-o',
        path.join(dir, 'out.pdf'),
      ]);
      assert.equal(code, 0, stderr);
    }
  });

  test('a person section without its marital_history mapping is a missing key', async (t) => {
    const dir = makeTempDir(t);
    const cfgPath = writeConfig(dir, 'no-mh.yaml', 'config.yaml', (cfg) => {
      delete cfg.wife.marital_history;
    });
    const { code, stderr } = await runMain([
      cfgPath,
      '-o',
      path.join(dir, 'out.pdf'),
    ]);
    assert.equal(code, 1);
    assert.match(
      stderr,
      /❌ Config error: no value for "wife\.marital_history"/,
    );
  });
});

describe('every top-level section is optional', () => {
  // Deleting a section is the documented way to leave that part of the form
  // blank for handwriting, so a missing section is a note, never a crash.
  const SECTIONS = [
    'notification',
    'husband',
    'wife',
    'new_legally_domiciled',
    'to_live_together',
    'national_census',
    'other',
    'witness1',
    'witness2',
  ];

  for (const name of SECTIONS) {
    test(`a config without ${name} renders, and the note names it`, async (t) => {
      const dir = makeTempDir(t);
      const cfgPath = writeConfig(
        dir,
        `no-${name}.yaml`,
        'config.yaml',
        (cfg) => {
          delete cfg[name];
        },
      );
      const out = path.join(dir, 'out.pdf');
      const { code, stdout, stderr } = await runMain([cfgPath, '-o', out]);
      assert.equal(code, 0, stderr);
      assert.match(
        stdout,
        new RegExp(
          `ℹ️ {2}This config has no ${name} section\\. That part of the form stays blank\\.`,
        ),
      );
      assert.ok(fs.existsSync(out));
    });
  }

  test('the note names the remedy that targets the config actually in use', async (t) => {
    // An explicit path: init-config cannot reach it, so no command is offered.
    const dir = makeTempDir(t);
    const explicit = writeConfig(dir, 'explicit.yaml', 'config.yaml', (cfg) => {
      delete cfg.other;
    });
    const viaPath = await runMain([explicit, '-o', path.join(dir, 'a.pdf')]);
    assert.equal(viaPath.code, 0, viaPath.stderr);
    assert.match(viaPath.stdout, /copy it from the sample config\.yaml\./);
    assert.ok(!viaPath.stdout.includes('init-config'));
    // A per-template private config picked up by -t: the -t form of init-config.
    const sandbox = makeSandbox(t);
    writeConfig(
      sandbox,
      'config-private-black.yaml',
      'config-black.yaml',
      (cfg) => {
        delete cfg.witness1;
        delete cfg.witness2;
      },
    );
    const viaFlag = await runMain(['-t', 'black', '-o', 'b.pdf'], {
      root: sandbox,
    });
    assert.equal(viaFlag.code, 0, viaFlag.stderr);
    assert.match(
      viaFlag.stdout,
      /run `pnpm run init-config -t black` to append them from the sample\./,
    );
    // The shared private config: plain init-config.
    writeConfig(sandbox, 'config-private.yaml', 'config.yaml', (cfg) => {
      delete cfg.witness2;
    });
    const shared = await runMain(['-o', 'c.pdf'], { root: sandbox });
    assert.equal(shared.code, 0, shared.stderr);
    assert.match(
      shared.stdout,
      /run `pnpm run init-config` to append it from the sample\./,
    );
  });
});

describe('scaffolding in a sandbox copy', () => {
  const HEADER_LINES = [
    '# ローカル実行時のみ使用される非公開の設定ファイルです。',
    '# Private configuration file that is only used for local execution.',
  ];

  test('the first run creates config-private.yaml from config.yaml with the private header', async (t) => {
    const sandbox = makeSandbox(t);
    const { code, stdout } = await runMain(['-o', 'out.pdf'], {
      root: sandbox,
    });
    assert.equal(code, 0);
    assert.match(stdout, /config-private\.yaml not found - created one/);
    const privateText = fs.readFileSync(
      path.join(sandbox, 'config-private.yaml'),
      'utf-8',
    );
    const sampleText = fs.readFileSync(
      path.join(sandbox, 'config.yaml'),
      'utf-8',
    );
    assert.equal(privateText, `${HEADER_LINES.join('\n')}\n\n${sampleText}`);
    assert.ok(fs.existsSync(path.join(sandbox, 'out.pdf')));
  });

  test('--init-config creates the private config and never regenerates it', async (t) => {
    const sandbox = makeSandbox(t);
    const first = await runMain(['--init-config'], { root: sandbox });
    assert.equal(first.code, 0);
    assert.match(first.stdout, /✅ Created .*config-private\.yaml/);
    assert.ok(
      !fs.existsSync(path.join(sandbox, 'out.pdf')),
      'no PDF is generated',
    );
    const before = fs.readFileSync(
      path.join(sandbox, 'config-private.yaml'),
      'utf-8',
    );
    const second = await runMain(['--init-config'], { root: sandbox });
    assert.equal(second.code, 0);
    assert.match(second.stdout, /config-private\.yaml already exists/);
    assert.ok(!second.stdout.includes('Created'));
    assert.equal(
      fs.readFileSync(path.join(sandbox, 'config-private.yaml'), 'utf-8'),
      before,
    );
  });

  test('--init-config adds the private header to a config that lacks it, keeping its contents', async (t) => {
    const sandbox = makeSandbox(t);
    const body = fs.readFileSync(path.join(sandbox, 'config.yaml'), 'utf-8');
    fs.writeFileSync(path.join(sandbox, 'config-private.yaml'), body);
    const { code, stdout } = await runMain(['--init-config'], {
      root: sandbox,
    });
    assert.equal(code, 0);
    assert.match(
      stdout,
      /added the private-file header to it, but kept its contents/,
    );
    assert.equal(
      fs.readFileSync(path.join(sandbox, 'config-private.yaml'), 'utf-8'),
      `${HEADER_LINES.join('\n')}\n\n${body}`,
    );
  });

  test('a normal generate run never rewrites an existing private config', async (t) => {
    const sandbox = makeSandbox(t);
    const body = fs.readFileSync(path.join(sandbox, 'config.yaml'), 'utf-8');
    fs.writeFileSync(path.join(sandbox, 'config-private.yaml'), body);
    const { code } = await runMain(['-o', 'out.pdf'], { root: sandbox });
    assert.equal(code, 0);
    assert.equal(
      fs.readFileSync(path.join(sandbox, 'config-private.yaml'), 'utf-8'),
      body,
    );
  });

  // A private config is copied from the sample only once, so one written
  // before the witness box existed never grows it on its own. These cover the
  // top-up that --init-config does instead.
  function withoutWitnesses(text) {
    const doc = YAML.parseDocument(text);
    doc.delete('witness1');
    doc.delete('witness2');
    return doc.toString({ lineWidth: 0 });
  }

  test('--init-config appends the sections an older private config lacks, keeping its contents', async (t) => {
    const sandbox = makeSandbox(t);
    const stale = withoutWitnesses(
      fs.readFileSync(path.join(sandbox, 'config.yaml'), 'utf-8'),
    );
    const target = path.join(sandbox, 'config-private.yaml');
    fs.writeFileSync(target, `${HEADER_LINES.join('\n')}\n\n${stale}`);
    const { code, stdout } = await runMain(['--init-config'], {
      root: sandbox,
    });
    assert.equal(code, 0);
    assert.match(
      stdout,
      /✅ Appended the sections it was missing: witness1, witness2\./,
    );
    const text = fs.readFileSync(target, 'utf-8');
    assert.ok(
      text.startsWith(`${HEADER_LINES.join('\n')}\n\n${stale.trimEnd()}`),
      'the existing text is kept byte for byte',
    );
    assert.ok(
      text.includes('# Witness box. witness1 is the left column'),
      'the sample comments come with the appended sections',
    );
    const sample = readRepoYaml('config.yaml');
    const cfg = YAML.parse(text);
    assert.deepEqual(cfg.witness1, sample.witness1);
    assert.deepEqual(cfg.witness2, sample.witness2);
    // Re-running finds nothing to add, and leaves the file alone.
    const second = await runMain(['--init-config'], { root: sandbox });
    assert.equal(second.code, 0);
    assert.match(second.stdout, /already has every section/);
    assert.equal(fs.readFileSync(target, 'utf-8'), text);
  });

  test('a generate run only notes the missing sections, and writes the PDF', async (t) => {
    const sandbox = makeSandbox(t);
    const stale = withoutWitnesses(
      fs.readFileSync(path.join(sandbox, 'config.yaml'), 'utf-8'),
    );
    const target = path.join(sandbox, 'config-private.yaml');
    fs.writeFileSync(target, stale);
    const { code, stdout } = await runMain(['-o', 'out.pdf'], {
      root: sandbox,
    });
    assert.equal(code, 0);
    assert.match(
      stdout,
      /ℹ️ {2}This config has no witness1, witness2 sections/,
    );
    assert.match(stdout, /init-config/);
    assert.equal(fs.readFileSync(target, 'utf-8'), stale);
    assert.ok(fs.existsSync(path.join(sandbox, 'out.pdf')));
  });

  test('a complete config draws no missing-section note', async (t) => {
    const sandbox = makeSandbox(t);
    const body = fs.readFileSync(path.join(sandbox, 'config.yaml'), 'utf-8');
    fs.writeFileSync(path.join(sandbox, 'config-private.yaml'), body);
    const { code, stdout } = await runMain(['-o', 'out.pdf'], {
      root: sandbox,
    });
    assert.equal(code, 0);
    assert.ok(!stdout.includes('ℹ️'), 'no note when nothing is missing');
  });

  test('--init-config -t <variant> tops up an existing per-template config', async (t) => {
    const sandbox = makeSandbox(t);
    const stale = withoutWitnesses(
      fs.readFileSync(path.join(sandbox, 'config.yaml'), 'utf-8'),
    );
    const target = path.join(sandbox, 'config-private-black.yaml');
    fs.writeFileSync(target, stale);
    const { code, stdout } = await runMain(['--init-config', '-t', 'black'], {
      root: sandbox,
    });
    assert.equal(code, 0);
    // The file was written without the header or a template: key, so the
    // header, the key, and the sections are all added, and the message says so.
    assert.match(
      stdout,
      /config-private-black\.yaml already exists - kept its contents and added the private-file header, the `template: black` key, and the sections it was missing: witness1, witness2\./,
    );
    const text = fs.readFileSync(target, 'utf-8');
    assert.ok(
      text.startsWith(
        `${HEADER_LINES.join('\n')}\n\ntemplate: black\n\n${stale.trimEnd()}`,
      ),
      'the header and the template: key are prepended and the existing text is kept byte for byte',
    );
    const cfg = YAML.parse(text);
    assert.equal(cfg.template, 'black');
    assert.deepEqual(cfg.witness1, readRepoYaml('config.yaml').witness1);
    // Re-running finds nothing to add.
    const second = await runMain(['--init-config', '-t', 'black'], {
      root: sandbox,
    });
    assert.match(
      second.stdout,
      /⚠️ {2}config-private-black\.yaml already exists - left it untouched/,
    );
    assert.equal(fs.readFileSync(target, 'utf-8'), text);
  });

  test('--init-config -t <variant> adds only the header to a complete config that lacks it', async (t) => {
    const sandbox = makeSandbox(t);
    const target = writeConfig(
      sandbox,
      'config-private-red.yaml',
      'config-black.yaml',
      (cfg) => {
        cfg.template = 'red';
      },
    );
    const body = fs.readFileSync(target, 'utf-8');
    const { code, stdout } = await runMain(['--init-config', '-t', 'red'], {
      root: sandbox,
    });
    assert.equal(code, 0);
    assert.match(
      stdout,
      /config-private-red\.yaml already exists - kept its contents and added the private-file header\./,
    );
    assert.equal(
      fs.readFileSync(target, 'utf-8'),
      `${HEADER_LINES.join('\n')}\n\n${body}`,
    );
  });

  test('--init-config -t <variant> pins template:, drops *_pos, and keeps comments', async (t) => {
    const sandbox = makeSandbox(t);
    const { code, stdout } = await runMain(['--init-config', '-t', 'black'], {
      root: sandbox,
    });
    assert.equal(code, 0);
    assert.match(
      stdout,
      /✅ Created config-private-black\.yaml from config\.yaml/,
    );
    const target = path.join(sandbox, 'config-private-black.yaml');
    const text = fs.readFileSync(target, 'utf-8');
    for (const line of HEADER_LINES) {
      assert.ok(text.includes(line), 'private header present');
    }
    assert.ok(
      text.includes('# 0: 初婚 1:死別 2:離別'),
      'sample comments survive',
    );
    const cfg = YAML.parse(text);
    assert.equal(cfg.template, 'black');
    assert.equal(Object.keys(cfg)[0], 'template', 'template: is the first key');
    const posKeys = JSON.stringify(cfg).match(/"[a-z_]+_pos"/g) ?? [];
    assert.deepEqual(posKeys, [], 'no legacy *_pos keys remain');
    assert.deepEqual(
      cfg.husband.marital_history,
      readRepoYaml('config.yaml').husband.marital_history,
    );
    // The scaffolded config renders on its template.
    const run = await runMain(['-t', 'black', '-o', 'out.pdf'], {
      root: sandbox,
    });
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /^Config:\s+config-private-black\.yaml$/m);
  });

  test('--init-config -t seeds from config-private.yaml when it exists', async (t) => {
    const sandbox = makeSandbox(t);
    writeConfig(sandbox, 'config-private.yaml', 'config.yaml', (cfg) => {
      cfg.husband.last_name = '試験';
    });
    const { code, stdout } = await runMain(
      ['--init-config', '-t', 'cinnamoroll'],
      { root: sandbox },
    );
    assert.equal(code, 0);
    assert.match(stdout, /from config-private\.yaml/);
    const cfg = YAML.parse(
      fs.readFileSync(
        path.join(sandbox, 'config-private-cinnamoroll.yaml'),
        'utf-8',
      ),
    );
    assert.equal(cfg.husband.last_name, '試験');
    assert.equal(cfg.template, 'cinnamoroll');
  });

  test('--init-config -t leaves an existing, complete per-template config untouched', async (t) => {
    const sandbox = makeSandbox(t);
    const target = writeConfig(
      sandbox,
      'config-private-red.yaml',
      'config-black.yaml',
      (cfg) => {
        cfg.template = 'red';
      },
    );
    // Complete means the header too; without it the header would be added.
    fs.writeFileSync(
      target,
      `${HEADER_LINES.join('\n')}\n\n${fs.readFileSync(target, 'utf-8')}`,
    );
    const before = fs.readFileSync(target, 'utf-8');
    const { code, stdout } = await runMain(['--init-config', '-t', 'red'], {
      root: sandbox,
    });
    assert.equal(code, 0);
    assert.match(
      stdout,
      /⚠️ {2}config-private-red\.yaml already exists - left it untouched/,
    );
    assert.equal(fs.readFileSync(target, 'utf-8'), before);
  });

  test('only the -t flag selects a per-template private config', async (t) => {
    const sandbox = makeSandbox(t);
    writeConfig(sandbox, 'config-private.yaml', 'config.yaml', (cfg) => {
      cfg.template = 'black';
    });
    writeConfig(sandbox, 'config-private-black.yaml', 'config-black.yaml');
    // template: black inside the shared config does not switch configs...
    const shared = await runMain(['-o', 'a.pdf'], { root: sandbox });
    assert.equal(shared.code, 0, shared.stderr);
    assert.match(shared.stdout, /^Config:\s+config-private\.yaml$/m);
    // ...but -t black does.
    const flagged = await runMain(['-t', 'black', '-o', 'b.pdf'], {
      root: sandbox,
    });
    assert.equal(flagged.code, 0, flagged.stderr);
    assert.match(flagged.stdout, /^Config:\s+config-private-black\.yaml$/m);
    // And an explicit config path wins over both.
    const explicit = await runMain(
      ['config.yaml', '-t', 'black', '-o', 'c.pdf'],
      { root: sandbox },
    );
    assert.match(explicit.stdout, /^Config:\s+config\.yaml$/m);
  });

  test('--init-layout validates an existing layout without rewriting it', async (t) => {
    const sandbox = makeSandbox(t);
    for (const variant of VARIANTS) {
      const file = path.join(sandbox, 'src/layout', `${variant}.yaml`);
      const before = fs.readFileSync(file, 'utf-8');
      const { code, stdout } = await runMain(['--init-layout', '-t', variant], {
        root: sandbox,
      });
      assert.equal(code, 0);
      assert.match(
        stdout,
        new RegExp(
          `✅ src/layout/${variant}\\.yaml already exists and is valid`,
        ),
      );
      assert.equal(fs.readFileSync(file, 'utf-8'), before);
    }
  });

  test('--init-layout scaffolds a validating layout for a custom PDF, which the next run uses', async (t) => {
    const sandbox = makeSandbox(t);
    const custom = path.join(sandbox, 'my-form.pdf');
    fs.copyFileSync(
      path.join(sandbox, 'src/template/jp-marriage-registration-red.pdf'),
      custom,
    );
    const init = await runMain(['--init-layout', '-t', custom], {
      root: sandbox,
    });
    assert.equal(init.code, 0, init.stderr);
    assert.match(
      init.stdout,
      /✅ Created src\/layout\/my-form\.yaml from the default grid/,
    );
    const layoutFile = path.join(sandbox, 'src/layout/my-form.yaml');
    const text = fs.readFileSync(layoutFile, 'utf-8');
    assert.match(text, /^# Layout for the "my-form" template/);
    assert.ok(text.includes('⚠️ Generated from the "red" grid'));
    // Same numbers as red, written in the hand-tuned inline style.
    assert.deepEqual(YAML.parse(text), readRepoYaml('src/layout/red.yaml'));
    assert.match(text, /last_name: \{ pos: \[220, 590\], size: 24 \}/);
    assert.match(
      text,
      /^ {6}1: \[210, 271\]$/m,
      'job_type keys are bare numbers',
    );
    // A generate run now finds the file and no longer falls back to red.
    const run = await runMain(['config.yaml', '-t', custom, '-o', 'out.pdf'], {
      root: sandbox,
    });
    assert.equal(run.code, 0, run.stderr);
    assert.ok(
      !run.stdout.includes('No layout file for template'),
      `no fallback notice: ${run.stdout}`,
    );
    // Re-running is a no-op.
    const again = await runMain(['--init-layout', '-t', custom], {
      root: sandbox,
    });
    assert.match(again.stdout, /already exists and is valid/);
  });

  test('--init-config -t refuses a template that does not exist, and creates nothing', async (t) => {
    const sandbox = makeSandbox(t);
    const { code, stderr } = await runMain(['--init-config', '-t', 'blakc'], {
      root: sandbox,
    });
    assert.equal(code, 1);
    assert.match(stderr, /Unknown template: blakc/);
    assert.ok(!fs.existsSync(path.join(sandbox, 'config-private-blakc.yaml')));
  });

  test('--init-config -t warns about a template: key that names another form, and keeps it', async (t) => {
    const sandbox = makeSandbox(t);
    const target = writeConfig(
      sandbox,
      'config-private-cinnamoroll.yaml',
      'config-black.yaml',
    );
    const body = fs.readFileSync(target, 'utf-8');
    const { code, stdout } = await runMain(
      ['--init-config', '-t', 'cinnamoroll'],
      { root: sandbox },
    );
    assert.equal(code, 0);
    assert.match(
      stdout,
      /⚠️ {2}config-private-cinnamoroll\.yaml says `template: black` although it is named after cinnamoroll\./,
    );
    assert.equal(
      YAML.parse(fs.readFileSync(target, 'utf-8')).template,
      'black',
    );
    assert.equal(
      fs.readFileSync(target, 'utf-8'),
      `${HEADER_LINES.join('\n')}\n\n${body}`,
      'only the header is added; the key is never rewritten',
    );
  });

  test('--init-layout refuses a template that does not exist', async (t) => {
    const sandbox = makeSandbox(t);
    const { code, stderr } = await runMain(
      ['--init-layout', '-t', 'nothing.pdf'],
      { root: sandbox },
    );
    assert.equal(code, 1);
    assert.match(stderr, /Template PDF not found: nothing\.pdf/);
    assert.ok(!fs.existsSync(path.join(sandbox, 'src/layout/nothing.yaml')));
  });
});
