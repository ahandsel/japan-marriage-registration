#!/usr/bin/env node
// Generate a filled-in Japanese marriage registration form.
// pdf-lib draws the text overlay directly onto the form template, and
// @pdf-lib/fontkit embeds the bundled IPAex fonts so Japanese text renders.
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

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(baseDir, '..');
const TEMPLATE_DIR = path.join(baseDir, 'template');
// Bundled templates are named "<TEMPLATE_PREFIX><variant>.pdf" so they can be
// selected by the short variant name alone (e.g. "red", "cinnamoroll").
// Every drawing position, font size, and line step comes from the matching
// per-template layout file, src/layout/<variant>.yaml, resolved by layout.js.
const DEFAULT_TEMPLATE = 'red';
// Default output name: result-<template>-<HH-MM-SS>.pdf (24-hour local time),
// so repeated runs never silently overwrite an earlier PDF. CI passes
// `-o result.pdf` explicitly to keep its artifact and release names stable.
const RESULT_PDF_PATTERN = 'result-<template>-<HH-MM-SS>.pdf';
// Local runs default to the gitignored private config; GitHub Actions passes
// config.yaml explicitly as the first argument. The private config is not
// committed - if it is missing we scaffold it from the public sample below so a
// new user can run the generator with zero setup.
const DEFAULT_CONFIG_PATH = path.join(repoRoot, 'config-private.yaml');
const PUBLIC_CONFIG_PATH = path.join(repoRoot, 'config.yaml');
// Prepended when scaffolding config-private.yaml, so the file itself says it is
// private and local-only even when it is read outside the repo.
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
        // No default here: the default name needs the resolved template, which
        // is only known after the config is read. See defaultOutputName().
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
  // Per-template private config, e.g. config-private-cinnamoroll.yaml. Written
  // by `--init-config -t <variant>`; a template only uses one if it exists, so
  // a single config-private.yaml keeps working for every template.
  const variant = layoutNameForTemplate(templateArg);
  return path.join(repoRoot, `config-private-${variant}.yaml`);
}

function scaffoldVariantConfig(templateArg) {
  // Seed from the details the user has already typed into config-private.yaml
  // when there are any, so switching templates does not mean re-entering
  // everything; otherwise fall back to the public placeholder sample.
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
  // parseDocument keeps the sample's comments and field order intact; the
  // `template:` key is set, pinning the file to the form it is named after.
  const doc = YAML.parseDocument(fs.readFileSync(seed, 'utf-8'));
  if (doc.has('template')) {
    doc.set('template', variant);
  } else {
    doc.contents.items.unshift(doc.createPair('template', variant));
  }
  // The legacy *_pos keys hold red coordinates, so copying them into a
  // per-template config would pin red positions over this template's tuned
  // layout. Drop them; a `layout:` block is the per-template way to nudge one.
  for (const keyPath of LEGACY_POS_KEY_PATHS) {
    // deleteIn throws when the parent section is absent, and a seed written
    // before a section existed may lack one, so check first.
    if (doc.hasIn(keyPath)) {
      doc.deleteIn(keyPath);
    }
  }
  const body = doc.toString({ lineWidth: 0 });
  const content = hasPrivateConfigHeader(body)
    ? body
    : PRIVATE_CONFIG_HEADER + body;
  try {
    // `wx` refuses to overwrite, so a config created between the existsSync
    // check above and this write is never clobbered.
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
  // A template with its own private config uses it; everything else falls back
  // to the shared config-private.yaml. Only the -t flag reaches this lookup:
  // it runs before the config is parsed, so a `template:` key inside the
  // shared config cannot switch to a per-template config. That ordering is
  // unavoidable - name the template on the command line to use one.
  if (templateArg) {
    const variantPath = variantConfigPath(templateArg);
    if (fs.existsSync(variantPath)) {
      return variantPath;
    }
  }
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    // First run: scaffold the local config from the public sample so the user
    // gets a filled-in template PDF immediately, then can edit their details.
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
      // `wx` refuses to overwrite, so a private config created between the
      // existsSync check above and this write is never clobbered.
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
  // A private config is copied from the sample only once, on the first run, so
  // one written before a section existed (the witness box, for example) never
  // grows it on its own.
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
  // Append the named sections, comments and all, copied from the sample. The
  // existing text is read and written back verbatim rather than re-serialized,
  // so the user's own details, comments, and formatting come through untouched.
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
    // The legacy *_pos keys hold red coordinates, so they would pin red
    // positions over a per-template layout - same reason the variant scaffold
    // drops them.
    for (const keyPath of LEGACY_POS_KEY_PATHS) {
      // Only the sections being appended are in the block, so most of these
      // paths have no parent here - deleteIn throws on a missing one.
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
  // result-<template>-<HH-MM-SS>.pdf, 24-hour local time, zero-padded, so
  // repeated runs never silently overwrite an earlier PDF.
  const variant = layoutNameForTemplate(templateName);
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(pad)
    .join('-');
  return `result-${variant}-${time}.pdf`;
}

function loadConfig(configPath) {
  let cfg;
  try {
    cfg = YAML.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    // A stray tab or an unclosed quote is the most common config mistake, and
    // the parser's message already names the line; keep it, drop the stack.
    fail(
      `❌ Config error: ${configPath} is not valid YAML.\n` +
        `   ${err.message.trim().split('\n').join('\n   ')}`,
    );
  }
  // An empty file parses to null and a bare scalar to a string; neither has
  // sections to draw, and the run would otherwise die on the first property
  // access with a stack trace instead of naming the file.
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) {
    fail(
      `❌ Config error: ${configPath} is empty or is not a YAML mapping.\n` +
        '   Start from the sample config.yaml, or run `pnpm run init-config`.',
    );
  }
  return cfg;
}

async function setup(templatePath, font) {
  // Draw the template as a form XObject on a canvas matched to its size, so
  // templates of differing sizes all line up with the coordinates below,
  // which are measured from the bottom left.
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
// Each section takes (cfg, lay, cc): the config section holding the text, the
// matching resolved layout section holding every position, size, and shape,
// and the canvas. Husband and wife share the same functions because all
// per-column coordinates now live in the layout sections.

function requireValue(spec, text) {
  // A missing config key must never print as the literal text "undefined" on
  // a legal form; name the key (annotated onto the layout by layout.js) and
  // stop. '' stays the explicit "leave blank for handwriting" value.
  if (text === undefined || text === null) {
    fail(
      `❌ Config error: no value for "${spec.keyPath ?? 'a drawn field'}" - the key is missing or null.\n` +
        '   Every key in the sample config.yaml must also exist in the config;\n' +
        "   set a key to '' to leave its box blank for handwriting.",
    );
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
  drawText(cc, lay.address_first, cfg.address_first);
  drawText(cc, lay.address_second, cfg.address_second);
  // `null` skips the 番地/番 mark, as it does for 本籍 and for the witnesses,
  // so the same key means the same thing in every section.
  if (cfg.is_banchi_address === true) {
    cc.ellipse(...lay.address_banchi_ellipse);
  } else if (cfg.is_banchi_address === false) {
    cc.circle(...lay.address_go_circle);
  }
  drawText(cc, lay.address_go, cfg.address_go);
  drawText(cc, lay.household_person, cfg.household_person);
  drawMultiline(cc, lay.address_apartment, cfg.address_apartment);
}

function legallyDomiciledInfo(cfg, lay, cc) {
  drawText(cc, lay.legally_domiciled_first, cfg.legally_domiciled_first);
  drawText(cc, lay.legally_domiciled_second, cfg.legally_domiciled_second);
  // A foreign national has no 本籍 - the column holds a nationality instead, so
  // neither 番地 nor 号 applies. `null` in the config skips the marking.
  if (cfg.is_banchi_legally_domiciled === true) {
    cc.ellipse(...lay.legally_domiciled_banchi_ellipse);
  } else if (cfg.is_banchi_legally_domiciled === false) {
    cc.circle(...lay.legally_domiciled_go_circle);
  }
  drawText(
    cc,
    lay.head_of_person_of_legally_domiciled,
    cfg.head_of_person_of_legally_domiciled,
  );
}

function familyInfo(cfg, lay, cc) {
  drawText(cc, lay.father_name, cfg.father_name);
  drawText(cc, lay.mother_name, cfg.mother_name);
  drawText(cc, lay.relationship, cfg.relationship);
}

function newLegallyDomiciled(cfg, lay, cc) {
  // `lastname_of` names the spouse whose surname the couple takes ('husband'
  // or 'wife'). In a marriage with a foreign national the couple keeps
  // separate surnames, so neither box applies; `null` skips the ✓.
  // The legacy boolean `is_husband_lastname` is still honoured.
  let lastnameOf = cfg.lastname_of;
  if (lastnameOf === undefined) {
    if (cfg.is_husband_lastname === true) {
      lastnameOf = 'husband';
    } else if (cfg.is_husband_lastname === false) {
      lastnameOf = 'wife';
    } else {
      // null skips below; undefined means neither key exists.
      lastnameOf = cfg.is_husband_lastname;
    }
  }
  // Exactly one 氏 box has to be ticked on a valid form, so a key that is
  // missing (a typo such as lastname_off) or holds a value other than
  // husband/wife must not print a blank pair; only null does that, on purpose.
  if (lastnameOf === undefined) {
    fail(
      `❌ Config error: no value for "${lay.keyPath ?? 'new_legally_domiciled'}.lastname_of" - the key is missing.\n` +
        "   Set it to 'husband' or 'wife', or to null to leave both 氏 boxes blank.",
    );
  }
  if (lastnameOf === 'husband') {
    drawText(cc, lay.husband_lastname_check, '✓');
  } else if (lastnameOf === 'wife') {
    drawText(cc, lay.wife_lastname_check, '✓');
  } else if (lastnameOf !== null) {
    fail(
      `❌ Config error: "${lay.keyPath ?? 'new_legally_domiciled'}.lastname_of" must be 'husband', 'wife', ` +
        `or null to leave both 氏 boxes blank; got ${JSON.stringify(lastnameOf)}.`,
    );
  }
  if (cfg.address !== '') {
    drawText(cc, lay.address, cfg.address);
    if (cfg.is_banchi_address === true) {
      cc.ellipse(...lay.banchi_ellipse);
    } else if (cfg.is_banchi_address === false) {
      cc.circle(...lay.go_circle);
    }
  }
}

function toLiveTogetherInfo(cfg, lay, cc) {
  drawText(cc, lay.year, cfg.year);
  drawText(cc, lay.month, cfg.month);
}

function maritalHistoryInfo(cfg, lay, cc) {
  // A person section without its marital_history mapping is a missing key,
  // not an optional section, so name it instead of dying on cfg.marriage_cat.
  if (cfg === undefined || cfg === null) {
    fail(
      `❌ Config error: no value for "${lay.keyPath ?? 'marital_history'}" - the mapping is missing or null.\n` +
        '   Every key in the sample config.yaml must also exist in the config.',
    );
  }
  if (cfg.marriage_cat === 0) {
    drawText(cc, lay.first_marriage_check, '✓');
    return;
  }
  // Anything outside 0/1/2 must fail: a typo silently checking 離別 (divorce)
  // would put wrong legal content on the form.
  if (cfg.marriage_cat === 1) {
    drawText(cc, lay.remarriage_death_check, '✓');
  } else if (cfg.marriage_cat === 2) {
    drawText(cc, lay.remarriage_divorce_check, '✓');
  } else {
    fail(
      `❌ Config error: "${lay.keyPath ?? 'marital_history'}.marriage_cat" must be ` +
        `0 (初婚), 1 (死別), or 2 (離別); got ${JSON.stringify(cfg.marriage_cat)}.`,
    );
  }
  drawText(cc, lay.year, cfg.year);
  drawText(cc, lay.month, cfg.month);
  drawText(cc, lay.day, cfg.day);
}

function jobTypeInfo(cfg, lay, cc) {
  // 1-6 tick the matching box. 0 (the value the original Python config used)
  // and '' leave the box blank for handwriting. Anything else must fail: a
  // typo such as 7 would otherwise silently leave a required box unmarked.
  if (cfg.job_type === 0 || cfg.job_type === '') {
    return;
  }
  const pos = lay.job_type_checks.positions[cfg.job_type];
  if (typeof cfg.job_type !== 'number' || pos === undefined) {
    fail(
      `❌ Config error: "${lay.keyPath ?? 'person'}.job_type" must be a number from 1 to 6, ` +
        `or 0 or '' to leave the box blank; got ${JSON.stringify(cfg.job_type)}.`,
    );
  }
  cc.setFont(lay.job_type_checks.size);
  cc.drawString(pos[0], pos[1], '✓');
}

function nationalCensusInfo(cfg, lay, cc) {
  if (cfg.year !== '') {
    drawText(cc, lay.year, cfg.year);
    drawText(cc, lay.husband_job, cfg.husband_job);
    drawText(cc, lay.wife_job, cfg.wife_job);
  }
}

function notificationInfo(cfg, lay, cc) {
  drawText(cc, lay.year, cfg.year);
  drawText(cc, lay.month, cfg.month);
  drawText(cc, lay.day, cfg.day);
  drawText(cc, lay.to, cfg.to);
}

function otherInfo(cfg, lay, cc) {
  drawMultiline(cc, lay.text, cfg.text);
}

function witnessInfo(cfg, lay, cc) {
  // The whole witness section is optional: configs written before it existed
  // do not have it, and many couples have the witnesses fill the box in by
  // hand. A key missing inside a present section is an error here as in every
  // other section (see requireValue); `pnpm run init-config` appends a whole
  // section from the sample, so there is no half-written witness to tolerate.
  if (cfg === undefined || cfg === null) {
    return;
  }
  // 署名 must be handwritten by the witness for the filing to be valid, so
  // leave `name` empty ('') unless the printout is a draft or a sample.
  drawText(cc, lay.name, cfg.name);
  drawText(cc, lay.birth_year, cfg.birth_year);
  drawText(cc, lay.birth_month, cfg.birth_month);
  drawText(cc, lay.birth_day, cfg.birth_day);
  drawText(cc, lay.address_first, cfg.address_first);
  drawText(cc, lay.address_second, cfg.address_second);
  drawText(cc, lay.address_go, cfg.address_go);
  // `null` skips the 番地/番 marking, as in legallyDomiciledInfo.
  if (cfg.is_banchi_address === true) {
    cc.ellipse(...lay.address_banchi_ellipse);
  } else if (cfg.is_banchi_address === false) {
    cc.circle(...lay.address_go_circle);
  }
  drawText(cc, lay.legally_domiciled_first, cfg.legally_domiciled_first);
  drawText(cc, lay.legally_domiciled_second, cfg.legally_domiciled_second);
  if (cfg.is_banchi_legally_domiciled === true) {
    cc.ellipse(...lay.legally_domiciled_banchi_ellipse);
  } else if (cfg.is_banchi_legally_domiciled === false) {
    cc.circle(...lay.legally_domiciled_go_circle);
  }
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
    // Scaffold-only mode for the coordinates, the counterpart of --init-config:
    // give a template its own layout file instead of borrowing another one.
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
    // With -t, scaffold the per-template config instead of the shared one, so
    // each template can carry its own details and its own `template:` key.
    if (args.template) {
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
        // An existing per-template config is topped up the same way the shared
        // one is below: it was seeded once and never refreshed since.
        const headerAdded = addPrivateConfigHeader(target);
        const missing = missingSampleSections(target);
        if (missing.length) {
          appendMissingSections(target, missing, { stripLegacyPos: true });
        }
        if (headerAdded || missing.length) {
          const added = [
            headerAdded ? 'the private-file header' : null,
            missing.length
              ? `the sections it was missing: ${missing.join(', ')}`
              : null,
          ]
            .filter(Boolean)
            .join(' and ');
          console.log(
            `✅ ${name} already exists - kept its contents and added ${added}.\n` +
              '✏️  An appended section holds the sample placeholder values, so ' +
              'edit it with your own details.',
          );
        } else {
          console.log(`⚠️  ${name} already exists - left it untouched.`);
        }
      }
      return;
    }
    // Scaffold-only mode: reuse the same first-run copy that a normal run does,
    // so `pnpm run init-config` never generates a PDF over an unedited config.
    const existed = fs.existsSync(DEFAULT_CONFIG_PATH);
    const configPath = resolveConfigPath(undefined);
    if (!existed) {
      console.log(`✅ Created ${path.relative(repoRoot, configPath)}.`);
      return;
    }
    const name = path.relative(repoRoot, configPath);
    // The file predates this header (or was written by hand). Prepend it
    // without touching the rest, so an existing config keeps its details.
    if (addPrivateConfigHeader(configPath)) {
      console.log(
        `⚠️  ${name} already exists - added the private-file header to it, but kept its contents.`,
      );
    } else {
      console.log(`✅ ${name} already exists - kept its contents.`);
    }
    // The first-run copy happens once and never again, so a config written
    // before a section was added to the sample stays without it. Append the
    // missing sections here instead of making the user move the file away and
    // retype every detail it already holds.
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
  const templateName = resolveTemplateName(args.template, cfg);
  const templatePath = resolveTemplatePath(templateName);
  const layout = resolveLayout(templateName, cfg);
  console.log(`Config:   ${path.relative(repoRoot, configPath)}`);
  console.log(`Template: ${templatePath}`);
  // A generate run never rewrites the config - it only points out sections the
  // sample has and this one does not. Removing a section on purpose is a
  // documented way to leave that part of the form blank, so this is a note and
  // not a warning. The remedy it names has to target the file actually in use:
  // plain `init-config` edits only config-private.yaml.
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
  // Every top-level section is optional: a section the config does not have
  // leaves that part of the form blank for handwriting, which is what the
  // note above promises. A key missing inside a section that is present is
  // still an error (see requireValue).
  const section = (name) => cfg[name] ?? null;
  for (const who of ['husband', 'wife']) {
    const person = section(who);
    if (person === null) {
      continue;
    }
    nameInfo(person, layout[who], cc);
    addressInfo(person, layout[who], cc);
    legallyDomiciledInfo(person, layout[who], cc);
    familyInfo(person, layout[who], cc);
    maritalHistoryInfo(person.marital_history, layout[who].marital_history, cc);
    jobTypeInfo(person, layout[who], cc);
  }
  const optional = [
    [newLegallyDomiciled, 'new_legally_domiciled'],
    [toLiveTogetherInfo, 'to_live_together'],
    [nationalCensusInfo, 'national_census'],
    [notificationInfo, 'notification'],
    [otherInfo, 'other'],
    [witnessInfo, 'witness1'],
    [witnessInfo, 'witness2'],
  ];
  for (const [draw, name] of optional) {
    if (section(name) !== null) {
      draw(section(name), layout[name], cc);
    }
  }
  const output = args.output ?? defaultOutputName(templateName);
  const bytes = await doc.save();
  try {
    fs.writeFileSync(output, bytes);
  } catch (err) {
    // A typo in -o (a directory that does not exist, a read-only location)
    // should name the path, not print an ENOENT stack trace.
    fail(`❌ Cannot write the PDF to ${output}:\n   ${err.message}`);
  }
  console.log(`Wrote: ${output}`);
}

main().catch((err) => {
  fail(err.stack || String(err));
});
