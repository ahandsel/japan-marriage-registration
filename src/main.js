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
import { resolveLayout, TEMPLATE_PREFIX } from './layout.js';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(baseDir, '..');
const TEMPLATE_DIR = path.join(baseDir, 'template');
// Bundled templates are named "<TEMPLATE_PREFIX><variant>.pdf" so they can be
// selected by the short variant name alone (e.g. "red", "cinnamoroll").
// Every drawing position, font size, and line step comes from the matching
// per-template layout file, src/layout/<variant>.yaml, resolved by layout.js.
const DEFAULT_TEMPLATE = 'red';
const RESULT_PDF = 'result.pdf';
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
  return `usage: main.js [-h] [-t TEMPLATE] [-o OUTPUT] [--list-templates] [--init-config] [config]

Generate a filled-in Japanese marriage registration form.

positional arguments:
  config                   path to the YAML config (default: config-private.yaml)

options:
  -h, --help               show this help message and exit
  -t, --template TEMPLATE  form template to fill in: ${templateChoiceHelp()}, or path to PDF
  -o, --output OUTPUT      where to write the generated PDF (default: ${RESULT_PDF})
  --list-templates         list the bundled templates and exit
  --init-config             create config-private.yaml from the sample config.yaml
                           (if it is missing) and exit, without generating a PDF`;
}

function parseCliArgs() {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        template: { type: 'string', short: 't' },
        output: { type: 'string', short: 'o', default: RESULT_PDF },
        'list-templates': { type: 'boolean', default: false },
        'init-config': { type: 'boolean', default: false },
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
  };
}

function resolveConfigPath(configArg) {
  if (configArg) {
    return configArg;
  }
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    // First run: scaffold the local config from the public sample so the user
    // gets a filled-in template PDF immediately, then can edit their details.
    if (!fs.existsSync(PUBLIC_CONFIG_PATH)) {
      fail(
        'config-private.yaml not found, and the public sample config.yaml is ' +
          'missing too, so it cannot be created automatically.\n' +
          'Restore config.yaml, or pass a config path explicitly:\n' +
          '    node src/main.js path/to/your-config.yaml',
      );
    }
    const sample = fs.readFileSync(PUBLIC_CONFIG_PATH, 'utf-8');
    fs.writeFileSync(DEFAULT_CONFIG_PATH, PRIVATE_CONFIG_HEADER + sample);
    console.log(
      'config-private.yaml not found - created one from the sample config.yaml.\n' +
        'It contains placeholder details; edit config-private.yaml with your own\n' +
        'information and re-run to generate your real form.\n',
    );
  }
  return DEFAULT_CONFIG_PATH;
}

function addPrivateConfigHeader(configPath) {
  // Returns true if the header was added, false if it was already there.
  const current = fs.readFileSync(configPath, 'utf-8');
  const headerLines = PRIVATE_CONFIG_HEADER.trimEnd().split('\n');
  if (headerLines.every((line) => current.includes(line))) {
    return false;
  }
  fs.writeFileSync(configPath, PRIVATE_CONFIG_HEADER + current);
  return true;
}

function resolveTemplateName(templateArg, cfg) {
  // CLI flag wins, then the config's `template` key, then the default.
  return templateArg || cfg.template || DEFAULT_TEMPLATE;
}

function loadConfig(configPath) {
  return YAML.parse(fs.readFileSync(configPath, 'utf-8'));
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

function drawText(cc, spec, text) {
  cc.setFont(spec.size);
  cc.drawString(spec.pos[0], spec.pos[1], text);
}

function drawMultiline(cc, spec, text) {
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
  if (cfg.is_banchi_address) {
    cc.ellipse(...lay.address_banchi_ellipse);
  } else {
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
    }
  }
  if (lastnameOf === 'husband') {
    drawText(cc, lay.husband_lastname_check, '✓');
  } else if (lastnameOf === 'wife') {
    drawText(cc, lay.wife_lastname_check, '✓');
  }
  if (cfg.address !== '') {
    drawText(cc, lay.address, cfg.address);
    if (cfg.is_banchi_address) {
      cc.ellipse(...lay.banchi_ellipse);
    } else {
      cc.circle(...lay.go_circle);
    }
  }
}

function toLiveTogetherInfo(cfg, lay, cc) {
  drawText(cc, lay.year, cfg.year);
  drawText(cc, lay.month, cfg.month);
}

function maritalHistoryInfo(cfg, lay, cc) {
  if (cfg.marriage_cat === 0) {
    drawText(cc, lay.first_marriage_check, '✓');
    return;
  }
  if (cfg.marriage_cat === 1) {
    drawText(cc, lay.remarriage_death_check, '✓');
  } else {
    drawText(cc, lay.remarriage_divorce_check, '✓');
  }
  drawText(cc, lay.year, cfg.year);
  drawText(cc, lay.month, cfg.month);
  drawText(cc, lay.day, cfg.day);
}

function jobTypeInfo(cfg, lay, cc) {
  const pos = lay.job_type_checks.positions[cfg.job_type];
  if (pos !== undefined) {
    cc.setFont(lay.job_type_checks.size);
    cc.drawString(pos[0], pos[1], '✓');
  }
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
  // hand. Missing per-field keys are treated as empty for the same reason.
  if (cfg === undefined || cfg === null) {
    return;
  }
  const text = (value) => value ?? '';
  // 署名 must be handwritten by the witness for the filing to be valid, so
  // leave `name` empty ('') unless the printout is a draft or a sample.
  drawText(cc, lay.name, text(cfg.name));
  drawText(cc, lay.birth_year, text(cfg.birth_year));
  drawText(cc, lay.birth_month, text(cfg.birth_month));
  drawText(cc, lay.birth_day, text(cfg.birth_day));
  drawText(cc, lay.address_first, text(cfg.address_first));
  drawText(cc, lay.address_second, text(cfg.address_second));
  drawText(cc, lay.address_go, text(cfg.address_go));
  // `null` skips the 番地/番 marking, as in legallyDomiciledInfo.
  if (cfg.is_banchi_address === true) {
    cc.ellipse(...lay.address_banchi_ellipse);
  } else if (cfg.is_banchi_address === false) {
    cc.circle(...lay.address_go_circle);
  }
  drawText(cc, lay.legally_domiciled_first, text(cfg.legally_domiciled_first));
  drawText(
    cc,
    lay.legally_domiciled_second,
    text(cfg.legally_domiciled_second),
  );
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
  if (args.initConfig) {
    // Scaffold-only mode: reuse the same first-run copy that a normal run does,
    // so `pnpm run init-config` never generates a PDF over an unedited config.
    const existed = fs.existsSync(DEFAULT_CONFIG_PATH);
    const configPath = resolveConfigPath(undefined);
    if (!existed) {
      console.log(`✅ Created ${configPath}.`);
      return;
    }
    // The file predates this header (or was written by hand). Prepend it
    // without touching the rest, so an existing config keeps its details.
    if (addPrivateConfigHeader(configPath)) {
      console.log(
        `✅ ${configPath} already exists - added the private-file header to it.`,
      );
    } else {
      console.log(`✅ ${configPath} already exists - left it untouched.`);
    }
    console.log(
      '✏️  Edit it with your own information, then run `pnpm run generate`.',
    );
    return;
  }
  const configPath = resolveConfigPath(args.config);
  const cfg = loadConfig(configPath);
  const templateName = resolveTemplateName(args.template, cfg);
  const templatePath = resolveTemplatePath(templateName);
  const layout = resolveLayout(templateName, cfg);
  console.log(`Template: ${templatePath}`);
  const { doc, page, ipaexm } = await setup(templatePath, FONT_PATH);
  const cc = makeCanvas(page, ipaexm);
  nameInfo(cfg.husband, layout.husband, cc);
  addressInfo(cfg.husband, layout.husband, cc);
  legallyDomiciledInfo(cfg.husband, layout.husband, cc);
  familyInfo(cfg.husband, layout.husband, cc);
  nameInfo(cfg.wife, layout.wife, cc);
  addressInfo(cfg.wife, layout.wife, cc);
  legallyDomiciledInfo(cfg.wife, layout.wife, cc);
  familyInfo(cfg.wife, layout.wife, cc);
  newLegallyDomiciled(
    cfg.new_legally_domiciled,
    layout.new_legally_domiciled,
    cc,
  );
  toLiveTogetherInfo(cfg.to_live_together, layout.to_live_together, cc);
  maritalHistoryInfo(
    cfg.husband.marital_history,
    layout.husband.marital_history,
    cc,
  );
  maritalHistoryInfo(cfg.wife.marital_history, layout.wife.marital_history, cc);
  jobTypeInfo(cfg.husband, layout.husband, cc);
  jobTypeInfo(cfg.wife, layout.wife, cc);
  nationalCensusInfo(cfg.national_census, layout.national_census, cc);
  notificationInfo(cfg.notification, layout.notification, cc);
  otherInfo(cfg.other, layout.other, cc);
  witnessInfo(cfg.witness1, layout.witness1, cc);
  witnessInfo(cfg.witness2, layout.witness2, cc);
  fs.writeFileSync(args.output, await doc.save());
  console.log(`Wrote: ${args.output}`);
}

main().catch((err) => {
  fail(err.stack || String(err));
});
