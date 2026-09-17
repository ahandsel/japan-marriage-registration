// Shared helpers for the test suite.
// Every test runs the real generator, either in-process (layout.js) or as a
// child process (main.js), and never writes into the repository: state-changing
// commands run inside a throwaway sandbox copy of src/ under the OS temp dir.
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';

const execFileAsync = promisify(execFile);

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const VARIANTS = ['red', 'black', 'cinnamoroll'];
// Every tracked config, with the template it is written for. These are the
// public, placeholder-only configs, so their values are safe to print.
export const TRACKED_CONFIGS = [
  { file: 'config.yaml', variant: 'red' },
  { file: 'config-black.yaml', variant: 'black' },
  { file: 'config-cinnamoroll.yaml', variant: 'cinnamoroll' },
];

export function readYaml(file) {
  return YAML.parse(fs.readFileSync(file, 'utf-8'));
}

export function readRepoYaml(relative) {
  return readYaml(path.join(REPO_ROOT, relative));
}

// Run src/main.js with the given arguments and resolve with the exit code and
// both streams, whether it succeeded or not. `root` is the checkout to run
// (the repo or a sandbox), `cwd` where the process runs from.
export async function runMain(args, { root = REPO_ROOT, cwd = root } = {}) {
  const mainJs = path.join(root, 'src/main.js');
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [mainJs, ...args],
      { cwd, encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    if (typeof err.code !== 'number') {
      throw err;
    }
    return {
      code: err.code,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

// A fresh directory under the OS temp dir, removed when the test ends.
export function makeTempDir(t, prefix = 'jmr-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A throwaway copy of the checkout for commands that write files
// (--init-config, --init-layout, the first-run scaffold). The JavaScript and
// the layout files are copied, so a command that writes into src/layout/ only
// touches the copy; the large read-only assets (templates, fonts,
// node_modules) are symlinked. package.json is copied for its "type": "module".
export function makeSandbox(t) {
  const dir = makeTempDir(t, 'jmr-sandbox-');
  fs.mkdirSync(path.join(dir, 'src'));
  for (const file of ['main.js', 'layout.js']) {
    fs.copyFileSync(
      path.join(REPO_ROOT, 'src', file),
      path.join(dir, 'src', file),
    );
  }
  fs.cpSync(path.join(REPO_ROOT, 'src/layout'), path.join(dir, 'src/layout'), {
    recursive: true,
  });
  for (const link of ['src/template', 'src/fonts', 'node_modules']) {
    fs.symlinkSync(path.join(REPO_ROOT, link), path.join(dir, link), 'dir');
  }
  for (const file of ['package.json', 'config.yaml']) {
    fs.copyFileSync(path.join(REPO_ROOT, file), path.join(dir, file));
  }
  return dir;
}

// Write a config derived from a tracked sample: `mutate` receives the parsed
// object and may change it in place. Returns the path of the new file.
export function writeConfig(dir, name, base, mutate) {
  const cfg = readRepoYaml(base);
  mutate?.(cfg);
  const target = path.join(dir, name);
  fs.writeFileSync(target, YAML.stringify(cfg));
  return target;
}

// --- pdftotext ---------------------------------------------------------------
// poppler's pdftotext reads the overlay text back with the bounding box of
// every word, which is what lets the render tests check where a value landed.
// It is optional: without it those tests are skipped, not failed.

let pdftotextAvailable;

export function hasPdftotext() {
  if (pdftotextAvailable === undefined) {
    try {
      execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
      pdftotextAvailable = true;
    } catch (err) {
      // Only "not installed" means skip. A pdftotext that is present but
      // broken is a real failure and must not be hidden behind a skip.
      if (err.code !== 'ENOENT') {
        throw err;
      }
      pdftotextAvailable = false;
    }
  }
  return pdftotextAvailable;
}

function decodeXml(text) {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

// Every word on the first page, with x from the left and `bottom`/`top`
// measured from the bottom of the page like the layout files (pdftotext
// itself measures y from the top, hence the conversion).
export function extractWords(pdfPath) {
  const xml = execFileSync('pdftotext', ['-bbox', pdfPath, '-'], {
    encoding: 'utf-8',
    // Some templates make poppler print harmless "Unknown character
    // collection" warnings on stderr; keep them out of the test output.
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const page = xml.match(/<page width="([\d.]+)" height="([\d.]+)"/);
  if (!page) {
    throw new Error(`pdftotext found no page in ${pdfPath}`);
  }
  const pageWidth = Number(page[1]);
  const pageHeight = Number(page[2]);
  const words = [];
  const wordRe =
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  for (const m of xml.matchAll(wordRe)) {
    words.push({
      text: decodeXml(m[5]),
      xMin: Number(m[1]),
      xMax: Number(m[3]),
      top: pageHeight - Number(m[2]),
      bottom: pageHeight - Number(m[4]),
    });
  }
  return { pageWidth, pageHeight, words };
}

// IPAex Mincho's descender is 0.12 em, so the bottom of the word box that
// pdftotext reports sits 0.12 * size below the baseline that `pos` names.
const DESCENT_RATIO = 0.12;
// Half a point of slack covers pdftotext's rounding; a wrong coordinate is
// never this close.
export const POSITION_TOLERANCE = 0.75;

export function findWord(words, mark) {
  const expectedBottom = mark.baseline - DESCENT_RATIO * mark.size;
  return words.find(
    (w) =>
      w.text === mark.text &&
      Math.abs(w.xMin - mark.x) <= POSITION_TOLERANCE &&
      Math.abs(w.bottom - expectedBottom) <= POSITION_TOLERANCE,
  );
}

// The words main.js is expected to draw for a config on a resolved layout:
// one entry per non-blank value and per ✓ mark, with the position the layout
// gives it. This mirrors the drawing rules in main.js (which values are
// skipped when, and which ✓ each choice ticks), so a divergence between the
// two shows up as a missing word.
export function expectedMarks(cfg, lay) {
  const marks = [];
  const add = (spec, value) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    // pdftotext splits on whitespace (full-width spaces included), so the
    // first token is the one that starts at `pos`.
    const first = String(value)
      .split('\n')[0]
      .split(/[\s　]+/)
      .find(Boolean);
    if (first) {
      marks.push({
        text: first,
        x: spec.pos[0],
        baseline: spec.pos[1],
        size: spec.size,
      });
    }
  };
  const check = (spec) => add(spec, '✓');
  const PERSON_TEXT_KEYS = [
    'last_name',
    'last_name_kana',
    'first_name',
    'first_name_kana',
    'birth_year',
    'birth_month',
    'birth_day',
    'address_first',
    'address_second',
    'address_go',
    'household_person',
    'address_apartment',
    'legally_domiciled_first',
    'legally_domiciled_second',
    'head_of_person_of_legally_domiciled',
    'father_name',
    'mother_name',
    'relationship',
  ];
  // Every top-level section is optional in main.js; a missing one draws nothing.
  const has = (name) => cfg[name] !== undefined && cfg[name] !== null;
  for (const who of ['husband', 'wife']) {
    if (!has(who)) {
      continue;
    }
    const c = cfg[who];
    const l = lay[who];
    for (const key of PERSON_TEXT_KEYS) {
      add(l[key], c[key]);
    }
    const mh = c.marital_history;
    const ml = l.marital_history;
    if (mh.marriage_cat === 0) {
      check(ml.first_marriage_check);
    } else {
      check(
        mh.marriage_cat === 1
          ? ml.remarriage_death_check
          : ml.remarriage_divorce_check,
      );
      for (const key of ['year', 'month', 'day']) {
        add(ml[key], mh[key]);
      }
    }
    // 1-6 tick a box; 0 and '' leave it blank (main.js rejects anything else).
    const jobPos = l.job_type_checks.positions[c.job_type];
    if (c.job_type !== 0 && c.job_type !== '' && jobPos !== undefined) {
      add({ pos: jobPos, size: l.job_type_checks.size }, '✓');
    }
  }
  if (has('new_legally_domiciled')) {
    const nl = cfg.new_legally_domiciled;
    const nll = lay.new_legally_domiciled;
    let lastnameOf = nl.lastname_of;
    if (lastnameOf === undefined) {
      if (nl.is_husband_lastname === true) {
        lastnameOf = 'husband';
      } else if (nl.is_husband_lastname === false) {
        lastnameOf = 'wife';
      }
    }
    if (lastnameOf === 'husband') {
      check(nll.husband_lastname_check);
    } else if (lastnameOf === 'wife') {
      check(nll.wife_lastname_check);
    }
    if (nl.address !== '') {
      add(nll.address, nl.address);
    }
  }
  if (has('to_live_together')) {
    add(lay.to_live_together.year, cfg.to_live_together.year);
    add(lay.to_live_together.month, cfg.to_live_together.month);
  }
  if (has('national_census') && cfg.national_census.year !== '') {
    for (const key of ['year', 'husband_job', 'wife_job']) {
      add(lay.national_census[key], cfg.national_census[key]);
    }
  }
  if (has('notification')) {
    for (const key of ['year', 'month', 'day', 'to']) {
      add(lay.notification[key], cfg.notification[key]);
    }
  }
  if (has('other')) {
    add(lay.other.text, cfg.other.text);
  }
  for (const who of ['witness1', 'witness2']) {
    const c = cfg[who];
    if (c === undefined || c === null) {
      continue;
    }
    for (const [key, spec] of Object.entries(lay[who])) {
      if (spec?.pos) {
        add(spec, c[key]);
      }
    }
  }
  return marks;
}

export function describeMark(mark) {
  return `"${mark.text}" at [${mark.x}, ${mark.baseline}] size ${mark.size}`;
}
