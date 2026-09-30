#!/usr/bin/env node
// Generate a filled-in Japanese marriage registration form.
// pdf-lib draws the text overlay directly onto the form template, and @pdf-lib/fontkit embeds the bundled IPAex Mincho font so Japanese text renders.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import YAML from 'yaml';
import {
  initLayout,
  layoutNameForTemplate,
  LEGACY_POS_KEY_PATHS,
  resolveLayout,
  TEMPLATE_PREFIX,
} from './layout.js';
import { findRenamedKeys } from './renamed-keys.js';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(baseDir, '..');
const TEMPLATE_DIR = path.join(baseDir, 'template');
// Bundled templates are named "<TEMPLATE_PREFIX><variant>.pdf" so they can be selected by the short variant name alone (e.g. "red", "cinnamoroll").
// Every drawing position, font size, and line step comes from the matching per-template layout file, src/layout/<variant>.yaml, resolved by layout.js.
const DEFAULT_TEMPLATE = 'red';
// Default output name: result-<template>-<HH-MM-SS>.pdf (24-hour local time), so repeated runs never silently overwrite an earlier PDF.
// CI passes `-o result.pdf` explicitly to keep its artifact and release names stable.
const RESULT_PDF_PATTERN = 'result-<template>-<HH-MM-SS>.pdf';
// Local runs default to the gitignored private config; GitHub Actions passes config.yaml explicitly as the first argument.
// The private config is not committed - if it is missing, resolveConfigPath() scaffolds it from the public sample so a new user can run the generator with zero setup.
const DEFAULT_CONFIG_PATH = path.join(repoRoot, 'config-private.yaml');
const PUBLIC_CONFIG_PATH = path.join(repoRoot, 'config.yaml');
// Prepended when scaffolding config-private.yaml, so the file itself says it is private and local-only even when it is read outside the repo.
const PRIVATE_CONFIG_HEADER =
  '# ローカル実行時のみ使用される非公開の設定ファイルです。\n' +
  '# Private configuration file that is only used for local execution.\n\n';
const FONT_PATH = path.join(baseDir, 'fonts/ipaexm.ttf');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function availableTemplates() {
  // Bundled templates, keyed by file stem (the canonical template name).
  const templates = new Map();
  for (const entry of fs.readdirSync(TEMPLATE_DIR).sort()) {
    if (entry.toLowerCase().endsWith('.pdf')) {
      templates.set(path.parse(entry).name, path.join(TEMPLATE_DIR, entry));
    }
  }
  return templates;
}

function templateChoiceHelp() {
  const names = [];
  for (const stem of availableTemplates().keys()) {
    const short = stem.startsWith(TEMPLATE_PREFIX)
      ? stem.slice(TEMPLATE_PREFIX.length)
      : stem;
    names.push(short === stem ? short : `${short} (${stem})`);
  }
  return names.length ? names.join(', ') : 'none found';
}

function resolveTemplatePath(name) {
  // Accept a short variant name, a full template name, or a path to any PDF.
  const templates = availableTemplates();
  if (templates.has(name)) {
    return templates.get(name);
  }
  if (templates.has(TEMPLATE_PREFIX + name)) {
    return templates.get(TEMPLATE_PREFIX + name);
  }
  const candidate = name.startsWith('~')
    ? path.join(process.env.HOME || '', name.slice(1))
    : name;
  if (candidate.toLowerCase().endsWith('.pdf')) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
    fail(`Template PDF not found: ${candidate}`);
  }
  fail(
    `Unknown template: ${name}\nAvailable templates: ${templateChoiceHelp()}`,
  );
}

function usage() {
  return `usage: main.js [-h] [-t TEMPLATE] [-o OUTPUT] [--list-templates] [--init-config] [--init-layout] [config]

Generate a filled-in Japanese marriage registration form.

positional arguments:
  config                   path to the YAML config (default: config-private-<template>.yaml
                           when it exists, otherwise config-private.yaml)

options:
  -h, --help               show this help message and exit
  -t, --template TEMPLATE  form template to fill in: ${templateChoiceHelp()}, or path to PDF
  -o, --output OUTPUT      where to write the generated PDF (default: ${RESULT_PDF_PATTERN})
  --list-templates         list the bundled templates and exit
  --init-config            create the private config from the sample config.yaml
                           (if it is missing), or add the private header and the
                           sections it lacks (if it exists), and exit without
                           generating a PDF. With -t, the target is
                           config-private-<template>.yaml
  --init-layout            create src/layout/<template>.yaml from the default grid
                           (if it is missing) and exit, without generating a PDF`;
}

function parseCliArgs() {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        template: { type: 'string', short: 't' },
        // No default here: the default name needs the resolved template, which is only known after the config is read.
        // See defaultOutputName().
        output: { type: 'string', short: 'o' },
        'list-templates': { type: 'boolean', default: false },
        'init-config': { type: 'boolean', default: false },
        'init-layout': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      allowPositionals: true,
    });
  } catch (err) {
    fail(`${usage()}\nerror: ${err.message}`);
  }
  if (parsed.values.help) {
    console.log(usage());
    process.exit(0);
  }
  if (parsed.positionals.length > 1) {
    fail(
      `${usage()}\nerror: unrecognized arguments: ${parsed.positionals.slice(1).join(' ')}`,
    );
  }
  return {
    config: parsed.positionals[0],
    template: parsed.values.template,
    output: parsed.values.output,
    listTemplates: parsed.values['list-templates'],
    initConfig: parsed.values['init-config'],
    initLayout: parsed.values['init-layout'],
  };
}

function variantConfigPath(templateArg) {
  // Per-template private config, e.g. config-private-cinnamoroll.yaml.
  // Written by `--init-config -t <variant>`; a template only uses one if it exists, so a single config-private.yaml keeps working for every template.
  const variant = layoutNameForTemplate(templateArg);
  return path.join(repoRoot, `config-private-${variant}.yaml`);
}

function scaffoldVariantConfig(templateArg) {
  // Seed from the details the user has already typed into config-private.yaml when there are any, so switching templates does not mean re-entering everything; otherwise fall back to the public placeholder sample.
  const target = variantConfigPath(templateArg);
  const variant = layoutNameForTemplate(templateArg);
  if (fs.existsSync(target)) {
    return { path: target, created: false, seed: null };
  }
  const seed = fs.existsSync(DEFAULT_CONFIG_PATH)
    ? DEFAULT_CONFIG_PATH
    : PUBLIC_CONFIG_PATH;
  if (!fs.existsSync(seed)) {
    fail(
      `❌ Cannot create ${path.basename(target)}: neither config-private.yaml ` +
        'nor the sample config.yaml exists to copy from.',
    );
  }
  // parseDocument keeps the seed's comments and field order intact; the `template:` key is set, pinning the file to the form it is named after.
  const doc = YAML.parseDocument(fs.readFileSync(seed, 'utf-8'));
  if (doc.has('template')) {
    doc.set('template', variant);
  } else {
    doc.contents.items.unshift(doc.createPair('template', variant));
  }
  // The legacy *_pos keys hold red coordinates, so copying them into a per-template config would pin red positions over this template's tuned layout.
  // Drop them; a `layout:` block is the per-template way to nudge one.
  for (const keyPath of LEGACY_POS_KEY_PATHS) {
    // deleteIn throws when the parent section is absent, and a seed written before a section existed may lack one, so check first.
    if (doc.hasIn(keyPath)) {
      doc.deleteIn(keyPath);
    }
  }
  const body = doc.toString({ lineWidth: 0 });
  const content = hasPrivateConfigHeader(body)
    ? body
    : PRIVATE_CONFIG_HEADER + body;
  try {
    // `wx` refuses to overwrite, so a config created between the existsSync check above and this write is never clobbered.
    fs.writeFileSync(target, content, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      return { path: target, created: false, seed: null };
    }
    throw err;
  }
  return { path: target, created: true, seed };
}

function resolveConfigPath(configArg, templateArg) {
  if (configArg) {
    if (!fs.existsSync(configArg)) {
      fail(
        `❌ Config file not found: ${configArg}\n` +
          '   Create it with `pnpm run init-config -t <template>`, ' +
          'or pass a different path.',
      );
    }
    return configArg;
  }
  // A template with its own private config uses it; everything else falls back to the shared config-private.yaml.
  // Only the -t flag reaches this lookup: it runs before the config is parsed, so a `template:` key inside the shared config cannot switch to a per-template config.
  // That ordering is unavoidable - name the template on the command line to use one.
  if (templateArg) {
    const variantPath = variantConfigPath(templateArg);
    if (fs.existsSync(variantPath)) {
      return variantPath;
    }
  }
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    // First run: scaffold the local config from the public sample so the user gets a filled-in template PDF immediately, then can edit their details.
    if (!fs.existsSync(PUBLIC_CONFIG_PATH)) {
      fail(
        'config-private.yaml not found, and the public sample config.yaml is ' +
          'missing too, so it cannot be created automatically.\n' +
          'Restore config.yaml, or pass a config path explicitly:\n' +
          '    pnpm run generate path/to/your-config.yaml',
      );
    }
    const sample = fs.readFileSync(PUBLIC_CONFIG_PATH, 'utf-8');
    try {
      // `wx` refuses to overwrite, so a private config created between the existsSync check above and this write is never clobbered.
      fs.writeFileSync(DEFAULT_CONFIG_PATH, PRIVATE_CONFIG_HEADER + sample, {
        flag: 'wx',
      });
      console.log(
        'config-private.yaml not found - created one from the sample config.yaml.\n' +
          'It contains placeholder details; edit config-private.yaml with your own\n' +
          'information and re-run to generate your real form.\n',
      );
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
  }
  return DEFAULT_CONFIG_PATH;
}

function hasPrivateConfigHeader(text) {
  return PRIVATE_CONFIG_HEADER.trimEnd()
    .split('\n')
    .every((line) => text.includes(line));
}

function pinTemplateKey(configPath, variant) {
  // A per-template config is named after its form, so it should also say so in its `template:` key: without one, the file falls back to the red template when it is later passed by path instead of through -t.
  // Returns 'added' when the key was inserted, 'kept' when it already names this variant, and the existing value when it names another one.
  // The key is inserted as text after the leading comment block, so the rest of the file is never re-serialized.
  const text = fs.readFileSync(configPath, 'utf-8');
  const doc = YAML.parseDocument(text);
  if (doc.has('template')) {
    const current = doc.get('template');
    return current === variant ? 'kept' : String(current);
  }
  const lines = text.split('\n');
  let insertAt = 0;
  while (
    insertAt < lines.length &&
    (lines[insertAt].trim() === '' || lines[insertAt].startsWith('#'))
  ) {
    insertAt++;
  }
  lines.splice(insertAt, 0, `template: ${variant}`, '');
  fs.writeFileSync(configPath, lines.join('\n'));
  return 'added';
}

function addPrivateConfigHeader(configPath) {
  // Returns true if the header was added, false if it was already there.
  const current = fs.readFileSync(configPath, 'utf-8');
  if (hasPrivateConfigHeader(current)) {
    return false;
  }
  fs.writeFileSync(configPath, PRIVATE_CONFIG_HEADER + current);
  return true;
}

function missingSampleSections(configPath) {
  // Top-level sections the sample config.yaml has but this config does not.
  // A private config is copied from the sample only once, on the first run, so one written before a section existed (the witness box, for example) never grows it on its own.
  if (!fs.existsSync(configPath) || !fs.existsSync(PUBLIC_CONFIG_PATH)) {
    return [];
  }
  const sample = YAML.parseDocument(
    fs.readFileSync(PUBLIC_CONFIG_PATH, 'utf-8'),
  );
  const current = YAML.parseDocument(fs.readFileSync(configPath, 'utf-8'));
  return (sample.contents?.items ?? [])
    .map((item) => item.key.value)
    .filter((name) => !current.has(name));
}

function appendMissingSections(configPath, names, { stripLegacyPos } = {}) {
  // Append the named sections, comments and all, copied from the sample.
  // The existing text is read and written back verbatim rather than re-serialized, so the user's own details, comments, and formatting come through untouched.
  const wanted = new Set(names);
  const block = YAML.parseDocument(
    fs.readFileSync(PUBLIC_CONFIG_PATH, 'utf-8'),
  );
  block.commentBefore = null;
  block.comment = null;
  block.contents.items = block.contents.items.filter((item) =>
    wanted.has(item.key.value),
  );
  if (stripLegacyPos) {
    // The legacy *_pos keys hold red coordinates, so they would pin red positions over a per-template layout - the same reason the variant scaffold drops them.
    for (const keyPath of LEGACY_POS_KEY_PATHS) {
      // Only the sections being appended are in the block, so most of these paths have no parent here - deleteIn throws on a missing one.
      if (block.hasIn(keyPath)) {
        block.deleteIn(keyPath);
      }
    }
  }
  const current = fs.readFileSync(configPath, 'utf-8').replace(/\s*$/, '');
  const addition = block.toString({ lineWidth: 0 }).trim();
  fs.writeFileSync(configPath, `${current}\n\n${addition}\n`);
}

function resolveTemplateName(templateArg, cfg) {
  // CLI flag wins, then the config's `template` key, then the default.
  return templateArg || cfg.template || DEFAULT_TEMPLATE;
}

function defaultOutputName(templateName) {
  // result-<template>-<HH-MM-SS>.pdf, 24-hour local time, zero-padded, so repeated runs never silently overwrite an earlier PDF.
  // Two runs within the same second would still collide, so writeDefaultOutput() below reserves the name atomically and falls back to a -2, -3, ... suffix.
  const variant = layoutNameForTemplate(templateName);
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(pad)
    .join('-');
  return `result-${variant}-${time}.pdf`;
}

// Write the PDF under the default name without ever replacing an existing file: `wx` creates the file only if it does not exist yet, so a name taken by a run in the same second is detected at the write itself, not by a separate existence check that a parallel run could slip past.
// The first free suffix (result-red-12-00-00-2.pdf, -3, ...) is used instead.
function writeDefaultOutput(name, bytes) {
  const { dir, name: stem, ext } = path.parse(name);
  const MAX_TRIES = 100;
  for (let n = 1; n <= MAX_TRIES; n++) {
    const candidate = n === 1 ? name : path.join(dir, `${stem}-${n}${ext}`);
    try {
      fs.writeFileSync(candidate, bytes, { flag: 'wx' });
      return candidate;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
  }
  fail(
    `❌ Cannot write the PDF: ${name} and its -2 to -${MAX_TRIES} variants all exist already.\n` +
      '   Pass -o to name the output.',
  );
}

function loadConfig(configPath) {
  let cfg;
  try {
    cfg = YAML.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    // A stray tab or an unclosed quote is the most common config mistake, and the parser's message already names the line; keep it, drop the stack.
    fail(
      `❌ Config error: ${configPath} is not valid YAML.\n` +
        `   ${err.message.trim().split('\n').join('\n   ')}`,
    );
  }
  // An empty file parses to null and a bare scalar to a string; neither has sections to draw, and the run would otherwise die on the first property access with a stack trace instead of naming the file.
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) {
    fail(
      `❌ Config error: ${configPath} is empty or is not a YAML mapping.\n` +
        '   Start from the sample config.yaml, or run `pnpm run init-config`.',
    );
  }
  return cfg;
}

function rejectRenamedKeys(cfg, configPath) {
  // Every top-level section is optional, so an old section name such as `notification:` would be skipped without a word and its part of the form would print blank.
  // An old key inside a section would fail later as a missing key, but without saying what it is called now.
  // Either way, stop before drawing and name every old key with its new name.
  const renamed = findRenamedKeys(cfg);
  if (renamed.length === 0) {
    return;
  }
  const name = path.relative(repoRoot, configPath) || configPath;
  fail(
    `❌ Config error: ${name} uses ${renamed.length} old key ${renamed.length > 1 ? 'names' : 'name'}:\n` +
      renamed.map(({ from, to }) => `   - ${from} is now ${to}`).join('\n') +
      `\n🛠️  Run \`pnpm run migrate-config ${name}\` to rename them in place; comments and values are kept.`,
  );
}

async function setup(templatePath, font) {
  // Draw the template as a form XObject on a page matched to its size, so templates of differing sizes all line up with the layout coordinates, which are measured from the bottom left.
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [template] = await doc.embedPdf(fs.readFileSync(templatePath), [0]);
  const page = doc.addPage([template.width, template.height]);
  page.drawPage(template);
  const ipaexm = await doc.embedFont(fs.readFileSync(font), { subset: true });
  return { doc, page, ipaexm };
}

// --- drawing helpers: a small canvas shim over pdf-lib -----------------------

function makeCanvas(page, font) {
  let fontSize = 12;
  const stroke = { borderColor: rgb(0, 0, 0), borderWidth: 1 };
  return {
    setFont(size) {
      fontSize = size;
    },
    drawString(x, y, text) {
      // y is the text baseline.
      for (const line of String(text).split('\n')) {
        if (line) page.drawText(line, { x, y, size: fontSize, font });
      }
    },
    // ellipse(x1, y1, x2, y2) takes opposite bounding-box corners.
    ellipse(x1, y1, x2, y2) {
      page.drawEllipse({
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
        xScale: Math.abs(x2 - x1) / 2,
        yScale: Math.abs(y2 - y1) / 2,
        ...stroke,
      });
    },
    circle(xCen, yCen, r) {
      page.drawCircle({ x: xCen, y: yCen, size: r, ...stroke });
    },
  };
}

// --- form sections ------------------------------------------------------------
// Each section takes (cfg, lay, cc): the config section holding the text, the matching resolved layout section holding every position, size, and shape, and the canvas.
// Husband and wife share the same functions because all per-column coordinates live in the layout sections.

function requireValue(spec, text) {
  // A missing config key must never print as the literal text "undefined" on a legal form; name the key (annotated onto the layout by layout.js) and stop.
  // '' stays the explicit "leave blank for handwriting" value.
  if (text === undefined || text === null) {
    fail(
      `❌ Config error: no value for "${spec.keyPath ?? 'a drawn field'}" - the key is missing or null.\n` +
        '   Every key in the sample config.yaml must also exist in the config;\n' +
        "   set a key to '' to leave its box blank for handwriting.",
    );
  }
}

function requireBanchiType(lay, key, value) {
  // address_banchi_type / domicile_banchi_type: 'banchi' draws the 番地 ellipse, 'ban' the 番 circle, and null draws nothing on purpose.
  // Anything else - the key missing, or a typo such as 'banch' - must stop the run like every other bad config value, or a required mark silently goes missing.
  if (value === 'banchi' || value === 'ban' || value === null) {
    return;
  }
  const section = lay.keyPath ?? 'a section';
  fail(
    `❌ Config error: "${section}.${key}" must be 'banchi' (番地), 'ban' (番), or null to draw no mark; ` +
      (value === undefined
        ? 'the key is missing.'
        : `got ${JSON.stringify(value)}.`),
  );
}

function drawBanchiMark(cc, lay, key, value, ellipse, circle) {
  requireBanchiType(lay, key, value);
  if (value === 'banchi') {
    cc.ellipse(...ellipse);
  } else if (value === 'ban') {
    cc.circle(...circle);
  }
}

function drawText(cc, spec, text) {
  requireValue(spec, text);
  cc.setFont(spec.size);
  cc.drawString(spec.pos[0], spec.pos[1], text);
}

function drawMultiline(cc, spec, text) {
  requireValue(spec, text);
  cc.setFont(spec.size);
  let y = spec.pos[1];
  for (const line of String(text).split('\n')) {
    cc.drawString(spec.pos[0], y, line);
    y -= spec.step;
  }
}

function nameInfo(cfg, lay, cc) {
  drawText(cc, lay.last_name, cfg.last_name);
  drawText(cc, lay.last_name_kana, cfg.last_name_kana);
  drawText(cc, lay.first_name, cfg.first_name);
  drawText(cc, lay.first_name_kana, cfg.first_name_kana);
  drawText(cc, lay.birth_year, cfg.birth_year);
  drawText(cc, lay.birth_month, cfg.birth_month);
  drawText(cc, lay.birth_day, cfg.birth_day);
}

function addressInfo(cfg, lay, cc) {
  drawText(cc, lay.address_town, cfg.address_town);
  drawText(cc, lay.address_banchi, cfg.address_banchi);
  // `null` skips the 番地/番 mark, as it does for 本籍 and for the witnesses, so the same value means the same thing in every section.
  drawBanchiMark(
    cc,
    lay,
    'address_banchi_type',
    cfg.address_banchi_type,
    lay.address_banchi_ellipse,
    lay.address_ban_circle,
  );
  drawText(cc, lay.address_go, cfg.address_go);
  drawText(cc, lay.head_of_household, cfg.head_of_household);
  drawMultiline(cc, lay.address_building, cfg.address_building);
}

function domicileInfo(cfg, lay, cc) {
  drawText(cc, lay.domicile_town, cfg.domicile_town);
  drawText(cc, lay.domicile_banchi, cfg.domicile_banchi);
  // A foreign national has no 本籍 - the column holds a nationality instead, so neither 番地 nor 番 applies.
  // `null` in the config skips the marking.
  drawBanchiMark(
    cc,
    lay,
    'domicile_banchi_type',
    cfg.domicile_banchi_type,
    lay.domicile_banchi_ellipse,
    lay.domicile_ban_circle,
  );
  drawText(cc, lay.head_of_family_register, cfg.head_of_family_register);
}

function familyInfo(cfg, lay, cc) {
  drawText(cc, lay.father_name, cfg.father_name);
  drawText(cc, lay.mother_name, cfg.mother_name);
  drawText(cc, lay.relationship_to_parents, cfg.relationship_to_parents);
}

function newDomicileInfo(cfg, lay, cc) {
  // `surname_from` names the spouse whose surname the couple takes ('husband' or 'wife').
  // In a marriage with a foreign national the couple keeps separate surnames, so neither box applies; `null` skips the ✓.
  const surnameFrom = cfg.surname_from;
  // Exactly one 氏 box has to be ticked on a valid form, so a key that is missing (a typo such as surname_form) or holds a value other than husband/wife must not print a blank pair; only null does that, on purpose.
  if (surnameFrom === undefined) {
    fail(
      `❌ Config error: no value for "${lay.keyPath ?? 'new_domicile'}.surname_from" - the key is missing.\n` +
        "   Set it to 'husband' or 'wife', or to null to leave both 氏 boxes blank.",
    );
  }
  if (surnameFrom === 'husband') {
    drawText(cc, lay.husband_surname_check, '✓');
  } else if (surnameFrom === 'wife') {
    drawText(cc, lay.wife_surname_check, '✓');
  } else if (surnameFrom !== null) {
    fail(
      `❌ Config error: "${lay.keyPath ?? 'new_domicile'}.surname_from" must be 'husband', 'wife', ` +
        `or null to leave both 氏 boxes blank; got ${JSON.stringify(surnameFrom)}.`,
    );
  }
  // Checked even when the address is blank: a present section must hold every key the sample has, and a blank address is not a reason to skip that rule.
  requireBanchiType(lay, 'address_banchi_type', cfg.address_banchi_type);
  if (cfg.address !== '') {
    drawText(cc, lay.address, cfg.address);
    drawBanchiMark(
      cc,
      lay,
      'address_banchi_type',
      cfg.address_banchi_type,
      lay.banchi_ellipse,
      lay.ban_circle,
    );
  }
}

function livingTogetherSinceInfo(cfg, lay, cc) {
  drawText(cc, lay.year, cfg.year);
  drawText(cc, lay.month, cfg.month);
}

function maritalHistoryInfo(cfg, lay, cc) {
  // A person section without its marital_history mapping is a missing key, not an optional section, so name it instead of dying on cfg.status.
  if (cfg === undefined || cfg === null) {
    fail(
      `❌ Config error: no value for "${lay.keyPath ?? 'marital_history'}" - the mapping is missing or null.\n` +
        '   Every key in the sample config.yaml must also exist in the config.',
    );
  }
  if (cfg.status === 'first_marriage') {
    drawText(cc, lay.first_marriage_check, '✓');
    return;
  }
  // Anything else must fail: a typo silently checking 離別 (divorce) would put wrong legal content on the form.
  if (cfg.status === 'widowed') {
    drawText(cc, lay.widowed_check, '✓');
  } else if (cfg.status === 'divorced') {
    drawText(cc, lay.divorced_check, '✓');
  } else {
    fail(
      `❌ Config error: "${lay.keyPath ?? 'marital_history'}.status" must be ` +
        `first_marriage (初婚), widowed (死別), or divorced (離別); got ${JSON.stringify(cfg.status)}.`,
    );
  }
  drawText(cc, lay.year, cfg.year);
  drawText(cc, lay.month, cfg.month);
  drawText(cc, lay.day, cfg.day);
}

function householdWorkTypeInfo(cfg, lay, cc) {
  // 1-6 tick the matching box.
  // 0 (the value the original Python config used) and '' leave the box blank for handwriting.
  // Anything else must fail: a typo such as 7 would otherwise silently leave a required box unmarked.
  const workType = cfg.household_work_type;
  if (workType === 0 || workType === '') {
    return;
  }
  const pos = lay.household_work_type_checks.positions[workType];
  if (typeof workType !== 'number' || pos === undefined) {
    fail(
      `❌ Config error: "${lay.keyPath ?? 'person'}.household_work_type" must be a number from 1 to 6, ` +
        `or 0 or '' to leave the box blank; got ${JSON.stringify(workType)}.`,
    );
  }
  cc.setFont(lay.household_work_type_checks.size);
  cc.drawString(pos[0], pos[1], '✓');
}

function nationalCensusInfo(cfg, lay, cc) {
  if (cfg.year !== '') {
    drawText(cc, lay.year, cfg.year);
    drawText(cc, lay.husband_job, cfg.husband_job);
    drawText(cc, lay.wife_job, cfg.wife_job);
  }
}

function filingInfo(cfg, lay, cc) {
  drawText(cc, lay.year, cfg.year);
  drawText(cc, lay.month, cfg.month);
  drawText(cc, lay.day, cfg.day);
  drawText(cc, lay.office, cfg.office);
}

function otherInfo(cfg, lay, cc) {
  drawMultiline(cc, lay.text, cfg.text);
}

function witnessInfo(cfg, lay, cc) {
  // The whole witness section is optional: configs written before it existed do not have it, and many couples have the witnesses fill the box in by hand.
  // A key missing inside a present section is an error here, as in every other section (see requireValue).
  // The one exception is address_building, which was added after the witness box shipped.
  // A witness section written before it has no such key, and the init-config top-up adds only whole sections, so a missing (or null) address_building prints nothing, like ''.
  if (cfg === undefined || cfg === null) {
    return;
  }
  // 署名 must be handwritten by the witness for the filing to be valid, so leave `name` empty ('') unless the printout is a draft or a sample.
  drawText(cc, lay.name, cfg.name);
  drawText(cc, lay.birth_year, cfg.birth_year);
  drawText(cc, lay.birth_month, cfg.birth_month);
  drawText(cc, lay.birth_day, cfg.birth_day);
  drawText(cc, lay.address_town, cfg.address_town);
  drawText(cc, lay.address_banchi, cfg.address_banchi);
  drawText(cc, lay.address_go, cfg.address_go);
  // `null` skips the 番地/番 marking, as in domicileInfo.
  drawBanchiMark(
    cc,
    lay,
    'address_banchi_type',
    cfg.address_banchi_type,
    lay.address_banchi_ellipse,
    lay.address_ban_circle,
  );
  // 方書 (building and room) has its own slot after 号: written into address_banchi, it runs over the 番 mark and the 号 value on the red form.
  drawMultiline(cc, lay.address_building, cfg.address_building ?? '');
  drawText(cc, lay.domicile_town, cfg.domicile_town);
  drawText(cc, lay.domicile_banchi, cfg.domicile_banchi);
  drawBanchiMark(
    cc,
    lay,
    'domicile_banchi_type',
    cfg.domicile_banchi_type,
    lay.domicile_banchi_ellipse,
    lay.domicile_ban_circle,
  );
}

async function main() {
  const args = parseCliArgs();
  if (args.listTemplates) {
    for (const [stem, templatePath] of availableTemplates()) {
      console.log(`${stem}\t${templatePath}`);
    }
    return;
  }
  if (args.initLayout) {
    // Scaffold-only mode for the coordinates, the counterpart of --init-config: give a template its own layout file instead of borrowing another one.
    const templateName = args.template || DEFAULT_TEMPLATE;
    resolveTemplatePath(templateName);
    const { path: layoutPath, variant, created } = initLayout(templateName);
    if (created) {
      console.log(
        `✅ Created ${path.relative(repoRoot, layoutPath)} from the default grid.\n` +
          `✏️  Every number in it still belongs to another form. Tune it against\n` +
          `   the printed ${variant} template: run \`pnpm run generate -t ${variant}\`\n` +
          `   (or its \`pnpm run ${variant}:pdf\` script, if one exists), look at\n` +
          '   where each field landed, adjust the [x, y] values, repeat.',
      );
    } else {
      console.log(
        `✅ ${path.relative(repoRoot, layoutPath)} already exists and is valid - left it untouched.\n` +
          '   Layout files are hand-tuned, so this never overwrites one. Edit it\n' +
          '   directly to adjust a coordinate.',
      );
    }
    return;
  }
  if (args.initConfig) {
    // With -t, scaffold the per-template config instead of the shared one, so each template can carry its own details and its own `template:` key.
    if (args.template) {
      // Resolve the template before writing anything, so a typo such as `-t blakc` is refused here rather than creating a config-private-blakc.yaml that no generate run can use.
      resolveTemplatePath(args.template);
      const {
        path: target,
        created,
        seed,
      } = scaffoldVariantConfig(args.template);
      const name = path.relative(repoRoot, target);
      if (created) {
        const variant = layoutNameForTemplate(args.template);
        console.log(
          `✅ Created ${name} from ${path.basename(seed)}.\n` +
            '✏️  Edit it with your own information, then run ' +
            `\`pnpm run generate -t ${variant}\`\n` +
            `   (or its \`pnpm run ${variant}:pdf\` script, if one exists).`,
        );
      } else {
        // An existing per-template config is topped up the same way the shared one is below: it was seeded once and never refreshed since.
        const variant = layoutNameForTemplate(args.template);
        // An old section name looks like a missing section, and the top-up would append a second copy full of placeholders next to it.
        rejectRenamedKeys(loadConfig(target), target);
        const headerAdded = addPrivateConfigHeader(target);
        const templateKey = pinTemplateKey(target, variant);
        const missing = missingSampleSections(target);
        if (missing.length) {
          appendMissingSections(target, missing, { stripLegacyPos: true });
        }
        if (templateKey !== 'kept' && templateKey !== 'added') {
          console.log(
            `⚠️  ${name} says \`template: ${templateKey}\` although it is named after ${variant}.\n` +
              `   Left as is; \`pnpm run generate -t ${variant}\` overrides it, but a run that passes\n` +
              `   the file by path renders on ${templateKey}. Fix the key by hand if that is wrong.`,
          );
        }
        if (headerAdded || templateKey === 'added' || missing.length) {
          const added = [
            headerAdded ? 'the private-file header' : null,
            templateKey === 'added' ? `the \`template: ${variant}\` key` : null,
            missing.length
              ? `the sections it was missing: ${missing.join(', ')}`
              : null,
          ].filter(Boolean);
          const list =
            added.length > 2
              ? `${added.slice(0, -1).join(', ')}, and ${added.at(-1)}`
              : added.join(' and ');
          console.log(
            `✅ ${name} already exists - kept its contents and added ${list}.\n` +
              '✏️  An appended section holds the sample placeholder values, so ' +
              'edit it with your own details.',
          );
        } else {
          console.log(`⚠️  ${name} already exists - left it untouched.`);
        }
      }
      return;
    }
    // Scaffold-only mode: reuse the same first-run copy that a normal run does, so `pnpm run init-config` never generates a PDF over an unedited config.
    const existed = fs.existsSync(DEFAULT_CONFIG_PATH);
    const configPath = resolveConfigPath(undefined);
    if (!existed) {
      console.log(`✅ Created ${path.relative(repoRoot, configPath)}.`);
      return;
    }
    // An old section name looks like a missing section, and the top-up would append a second copy full of placeholders next to it.
    rejectRenamedKeys(loadConfig(configPath), configPath);
    const name = path.relative(repoRoot, configPath);
    // If the file predates this header (or was written by hand), prepend it without touching the rest, so an existing config keeps its details.
    if (addPrivateConfigHeader(configPath)) {
      console.log(
        `⚠️  ${name} already exists - added the private-file header to it, but kept its contents.`,
      );
    } else {
      console.log(`✅ ${name} already exists - kept its contents.`);
    }
    // The first-run copy happens once and never again, so a config written before a section was added to the sample stays without it.
    // Append the missing sections here instead of making the user move the file away and retype every detail it already holds.
    const missing = missingSampleSections(configPath);
    if (missing.length) {
      appendMissingSections(configPath, missing);
      console.log(
        `✅ Appended the sections it was missing: ${missing.join(', ')}.\n` +
          '✏️  They hold the sample placeholder values, so edit them with your own details.',
      );
    } else {
      console.log(
        '✅ It already has every section the sample config.yaml has.',
      );
    }
    console.log(
      '✏️  Edit it with your own information, then run `pnpm run generate`.',
    );
    return;
  }
  const configPath = resolveConfigPath(args.config, args.template);
  const cfg = loadConfig(configPath);
  rejectRenamedKeys(cfg, configPath);
  const templateName = resolveTemplateName(args.template, cfg);
  const templatePath = resolveTemplatePath(templateName);
  const layout = resolveLayout(templateName, cfg);
  console.log(`Config:   ${path.relative(repoRoot, configPath)}`);
  console.log(`Template: ${templatePath}`);
  // A generate run never rewrites the config - it only points out sections the sample has and this one does not.
  // Removing a section on purpose is a documented way to leave that part of the form blank, so this is a note and not a warning.
  // The remedy it names has to target the file actually in use: plain `init-config` edits only config-private.yaml.
  if (path.resolve(configPath) !== PUBLIC_CONFIG_PATH) {
    const missing = missingSampleSections(configPath);
    if (missing.length) {
      const many = missing.length > 1;
      const them = many ? 'them' : 'it';
      let remedy;
      if (args.config) {
        remedy = `copy ${them} from the sample config.yaml`;
      } else if (
        args.template &&
        path.resolve(configPath) === variantConfigPath(args.template)
      ) {
        remedy = `run \`pnpm run init-config -t ${layoutNameForTemplate(args.template)}\` to append ${them} from the sample`;
      } else {
        remedy = `run \`pnpm run init-config\` to append ${them} from the sample`;
      }
      console.log(
        `ℹ️  This config has no ${missing.join(', ')} ` +
          `${many ? 'sections' : 'section'}. ` +
          `${many ? 'Those parts of the form stay' : 'That part of the form stays'} blank.\n` +
          `   If that is not deliberate, ${remedy}.`,
      );
    }
  }
  const { doc, page, ipaexm } = await setup(templatePath, FONT_PATH);
  const cc = makeCanvas(page, ipaexm);
  // Every top-level section is optional: a section the config does not have leaves that part of the form blank for handwriting, which is what the note above promises.
  // A key missing inside a section that is present is still an error (see requireValue).
  const section = (name) => cfg[name] ?? null;
  for (const who of ['husband', 'wife']) {
    const person = section(who);
    if (person === null) {
      continue;
    }
    nameInfo(person, layout[who], cc);
    addressInfo(person, layout[who], cc);
    domicileInfo(person, layout[who], cc);
    familyInfo(person, layout[who], cc);
    maritalHistoryInfo(person.marital_history, layout[who].marital_history, cc);
    householdWorkTypeInfo(person, layout[who], cc);
  }
  const optional = [
    [newDomicileInfo, 'new_domicile'],
    [livingTogetherSinceInfo, 'living_together_since'],
    [nationalCensusInfo, 'national_census'],
    [filingInfo, 'filing'],
    [otherInfo, 'other'],
    [witnessInfo, 'witness1'],
    [witnessInfo, 'witness2'],
  ];
  for (const [draw, name] of optional) {
    if (section(name) !== null) {
      draw(section(name), layout[name], cc);
    }
  }
  const bytes = await doc.save();
  let output = args.output ?? defaultOutputName(templateName);
  try {
    if (args.output) {
      // An explicit -o keeps overwrite semantics: CI pins `-o result.pdf` and relies on the name staying stable from run to run.
      fs.writeFileSync(output, bytes);
    } else {
      output = writeDefaultOutput(output, bytes);
    }
  } catch (err) {
    // A typo in -o (a directory that does not exist, a read-only location) should name the path, not print an ENOENT stack trace.
    fail(`❌ Cannot write the PDF to ${output}:\n   ${err.message}`);
  }
  console.log(`Wrote: ${output}`);
}

main().catch((err) => {
  fail(err.stack || String(err));
});
