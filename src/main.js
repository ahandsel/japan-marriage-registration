#!/usr/bin/env node
// Generate a filled-in Japanese marriage registration form.
// Node.js port of the original Python implementation (reportlab + pdfrw):
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

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(baseDir, '..');
const TEMPLATE_DIR = path.join(baseDir, 'template');
// Bundled templates are named "<prefix><variant>.pdf" so they can be selected by
// the short variant name alone (e.g. "simple", "cinnamoroll").
const TEMPLATE_PREFIX = 'jp-marriage-registration-';
// Note: the drawing coordinates below are tuned for the "simple" template. Other
// templates render, but their boxes sit on a different grid, so text needs
// nudging per template before it lines up.
const DEFAULT_TEMPLATE = 'simple';
const RESULT_PDF = 'result.pdf';
// Local runs default to the gitignored private config; GitHub Actions passes
// config.yaml explicitly as the first argument. The private config is not
// committed - if it is missing we scaffold it from the public sample below so a
// new user can run the generator with zero setup.
const DEFAULT_CONFIG_PATH = path.join(repoRoot, 'config-private.yaml');
const PUBLIC_CONFIG_PATH = path.join(repoRoot, 'config.yaml');
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
  return `usage: main.js [-h] [-t TEMPLATE] [-o OUTPUT] [--list-templates] [config]

Generate a filled-in Japanese marriage registration form.

positional arguments:
  config                path to the YAML config (default: config-private.yaml)

options:
  -h, --help            show this help message and exit
  -t, --template TEMPLATE
                        form template to fill in: ${templateChoiceHelp()}, or a
                        path to a PDF (default: the config's \`template\` key,
                        else ${DEFAULT_TEMPLATE})
  -o, --output OUTPUT   where to write the generated PDF (default: ${RESULT_PDF})
  --list-templates      list the bundled templates and exit`;
}

function parseCliArgs() {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        template: { type: 'string', short: 't' },
        output: { type: 'string', short: 'o', default: RESULT_PDF },
        'list-templates': { type: 'boolean', default: false },
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
    fs.copyFileSync(PUBLIC_CONFIG_PATH, DEFAULT_CONFIG_PATH);
    console.log(
      'config-private.yaml not found - created one from the sample config.yaml.\n' +
        'It contains placeholder details; edit config-private.yaml with your own\n' +
        'information and re-run to generate your real form.\n',
    );
  }
  return DEFAULT_CONFIG_PATH;
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

// --- drawing helpers matching the reportlab canvas API -----------------------

function makeCanvas(page, font) {
  let fontSize = 12;
  const stroke = { borderColor: rgb(0, 0, 0), borderWidth: 1 };
  return {
    setFont(size) {
      fontSize = size;
    },
    drawString(x, y, text) {
      // reportlab draws with y at the text baseline; pdf-lib does the same.
      for (const line of String(text).split('\n')) {
        if (line) page.drawText(line, { x, y, size: fontSize, font });
      }
    },
    // reportlab's ellipse(x1, y1, x2, y2) takes opposite bounding-box corners.
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

function husbandNameInfo(cfg, cc) {
  cc.setFont(24);
  let [x, y] = cfg.last_name_pos;
  cc.drawString(x, y, cfg.last_name);
  cc.setFont(12);
  [x, y] = cfg.last_name_kana_pos;
  cc.drawString(x, y, cfg.last_name_kana);
  cc.setFont(24);
  [x, y] = cfg.first_name_pos;
  cc.drawString(x, y, cfg.first_name);
  cc.setFont(12);
  [x, y] = cfg.first_name_kana_pos;
  cc.drawString(x, y, cfg.first_name_kana);
  cc.setFont(12);
  cc.drawString(221, 569, cfg.birth_year);
  cc.drawString(300, 569, cfg.birth_month);
  cc.drawString(345, 569, cfg.birth_day);
}

function husbandAddressInfo(cfg, cc) {
  cc.setFont(12);
  const [x, y] = cfg.address_first_pos;
  cc.drawString(x, y, cfg.address_first);
  cc.drawString(x - 12, y - 21, cfg.address_second);
  if (cfg.is_banchi_address) {
    cc.ellipse(300, 539, 270, 528);
  } else {
    cc.circle(279.5, 523, 6);
  }
  cc.drawString(x + 80, y - 21, cfg.address_go);
  cc.drawString(x + 10, y - 44, cfg.household_person);
  cc.setFont(5);
  let lineY = y - 13;
  for (const text of String(cfg.address_apartment).split('\n')) {
    cc.drawString(x + 130, lineY, text);
    lineY -= 5;
  }
}

function husbandLegallyDomiciledInfo(cfg, cc) {
  cc.setFont(12);
  const [x, y] = cfg.legally_domiciled_first_pos;
  cc.drawString(x, y, cfg.legally_domiciled_first);
  cc.drawString(x, y - 21, cfg.legally_domiciled_second);
  if (cfg.is_banchi_legally_domiciled) {
    cc.ellipse(346, 473, 316, 462);
  } else {
    cc.circle(327, 457, 6);
  }
  cc.drawString(x + 10, y - 44, cfg.head_of_person_of_legally_domiciled);
}

function husbandFamilyInfo(cfg, cc) {
  cc.setFont(12);
  let [x, y] = cfg.father_name_pos;
  cc.drawString(x, y, cfg.father_name);
  [x, y] = cfg.mother_name_pos;
  cc.drawString(x, y, cfg.mother_name);
  cc.drawString(351, 385, cfg.relationship);
}

function wifeNameInfo(cfg, cc) {
  cc.setFont(24);
  let [x, y] = cfg.last_name_pos;
  cc.drawString(x, y, cfg.last_name);
  cc.setFont(12);
  [x, y] = cfg.last_name_kana_pos;
  cc.drawString(x, y, cfg.last_name_kana);
  cc.setFont(24);
  [x, y] = cfg.first_name_pos;
  cc.drawString(x, y, cfg.first_name);
  cc.setFont(12);
  [x, y] = cfg.first_name_kana_pos;
  cc.drawString(x, y, cfg.first_name_kana);
  cc.setFont(12);
  cc.drawString(421, 569, cfg.birth_year);
  cc.drawString(500, 569, cfg.birth_month);
  cc.drawString(545, 569, cfg.birth_day);
}

function wifeAddressInfo(cfg, cc) {
  cc.setFont(12);
  const [x, y] = cfg.address_first_pos;
  cc.drawString(x, y, cfg.address_first);
  cc.drawString(x - 12, y - 21, cfg.address_second);
  if (cfg.is_banchi_address) {
    cc.ellipse(502, 539, 472, 528);
  } else {
    cc.circle(481, 523, 6);
  }
  cc.drawString(x + 80, y - 21, cfg.address_go);
  cc.drawString(x + 10, y - 44, cfg.household_person);
  cc.setFont(5);
  let lineY = y - 13;
  for (const text of String(cfg.address_apartment).split('\n')) {
    cc.drawString(x + 130, lineY, text);
    lineY -= 5;
  }
}

function wifeLegallyDomiciledInfo(cfg, cc) {
  cc.setFont(12);
  const [x, y] = cfg.legally_domiciled_first_pos;
  cc.drawString(x, y, cfg.legally_domiciled_first);
  cc.drawString(x, y - 21, cfg.legally_domiciled_second);
  if (cfg.is_banchi_legally_domiciled) {
    cc.ellipse(549, 473, 519, 462);
  } else {
    // The wife's column sits 203pt right of the husband's (see the ellipse
    // above); the original Python reused the husband's x here by mistake.
    cc.circle(530, 457, 6);
  }
  cc.drawString(x + 10, y - 44, cfg.head_of_person_of_legally_domiciled);
}

function wifeFamilyInfo(cfg, cc) {
  cc.setFont(12);
  let [x, y] = cfg.father_name_pos;
  cc.drawString(x, y, cfg.father_name);
  [x, y] = cfg.mother_name_pos;
  cc.drawString(x, y, cfg.mother_name);
  cc.drawString(551, 385, cfg.relationship);
}

function newLegallyDomiciled(cfg, cc) {
  cc.setFont(12);
  if (cfg.is_husband_lastname) {
    cc.drawString(194, 351, '✓');
  } else {
    cc.drawString(194, 340, '✓');
  }
  cc.setFont(16);
  if (cfg.address !== '') {
    const [x, y] = cfg.address_pos;
    cc.drawString(x, y, cfg.address);
    if (cfg.is_banchi_address) {
      cc.ellipse(547, 352, 520, 341);
    } else {
      cc.circle(529, 334, 6);
    }
  }
}

function toLiveTogetherInfo(cfg, cc) {
  cc.setFont(15);
  cc.drawString(220, 310, cfg.year);
  cc.drawString(300, 310, cfg.month);
}

function husbandMaritalHistoryInfo(cfg, cc) {
  if (cfg.marriage_cat === 0) {
    cc.setFont(12);
    cc.drawString(196, 290, '✓');
  } else if (cfg.marriage_cat === 1) {
    cc.setFont(12);
    cc.drawString(273, 295, '✓');
    cc.setFont(6);
    cc.drawString(301, 289, cfg.year);
    cc.drawString(338, 289, cfg.month);
    cc.drawString(365, 289, cfg.day);
  } else {
    cc.setFont(12);
    cc.drawString(273, 285, '✓');
    cc.setFont(6);
    cc.drawString(301, 289, cfg.year);
    cc.drawString(338, 289, cfg.month);
    cc.drawString(365, 289, cfg.day);
  }
}

function wifeMaritalHistoryInfo(cfg, cc) {
  if (cfg.marriage_cat === 0) {
    cc.setFont(12);
    cc.drawString(398, 290, '✓');
  } else if (cfg.marriage_cat === 1) {
    cc.setFont(12);
    cc.drawString(476, 295, '✓');
    cc.setFont(6);
    cc.drawString(504, 289, cfg.year);
    cc.drawString(542, 289, cfg.month);
    cc.drawString(569, 289, cfg.day);
  } else {
    cc.setFont(12);
    cc.drawString(476, 285, '✓');
    cc.setFont(6);
    cc.drawString(504, 289, cfg.year);
    cc.drawString(542, 289, cfg.month);
    cc.drawString(569, 289, cfg.day);
  }
}

const JOB_TYPE_OFFSETS = { 1: 0, 2: 11, 3: 21, 4: 41, 5: 62, 6: 72 };

function husbandJobType(cfg, cc) {
  const [x, y] = [210, 271];
  cc.setFont(12);
  const offset = JOB_TYPE_OFFSETS[cfg.job_type];
  if (offset !== undefined) {
    cc.drawString(x, y - offset, '✓');
  }
}

function wifeJobType(cfg, cc) {
  const [x, y] = [249, 271];
  cc.setFont(12);
  const offset = JOB_TYPE_OFFSETS[cfg.job_type];
  if (offset !== undefined) {
    cc.drawString(x, y - offset, '✓');
  }
}

function nationalCensusInfo(cfg, cc) {
  cc.setFont(6);
  if (cfg.year !== '') {
    cc.drawString(278, 186, cfg.year);
    cc.setFont(16);
    cc.drawString(258, 168, cfg.husband_job);
    cc.drawString(458, 168, cfg.wife_job);
  }
}

function notificationInfo(cfg, cc) {
  cc.setFont(12);
  cc.drawString(141, 716, cfg.year);
  cc.drawString(181, 716, cfg.month);
  cc.drawString(210, 716, cfg.day);
  cc.drawString(141, 680, cfg.to);
}

function otherInfo(cfg, cc) {
  cc.setFont(12);
  const x = 40;
  let y = 145;
  for (const text of String(cfg.text).split('\n')) {
    cc.drawString(x + 130, y, text);
    y -= 15;
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
  const configPath = resolveConfigPath(args.config);
  const cfg = loadConfig(configPath);
  const templatePath = resolveTemplatePath(
    resolveTemplateName(args.template, cfg),
  );
  console.log(`Template: ${templatePath}`);
  const { doc, page, ipaexm } = await setup(templatePath, FONT_PATH);
  const cc = makeCanvas(page, ipaexm);
  husbandNameInfo(cfg.husband, cc);
  husbandAddressInfo(cfg.husband, cc);
  husbandLegallyDomiciledInfo(cfg.husband, cc);
  husbandFamilyInfo(cfg.husband, cc);
  wifeNameInfo(cfg.wife, cc);
  wifeAddressInfo(cfg.wife, cc);
  wifeLegallyDomiciledInfo(cfg.wife, cc);
  wifeFamilyInfo(cfg.wife, cc);
  newLegallyDomiciled(cfg.new_legally_domiciled, cc);
  toLiveTogetherInfo(cfg.to_live_together, cc);
  husbandMaritalHistoryInfo(cfg.husband.marital_history, cc);
  wifeMaritalHistoryInfo(cfg.wife.marital_history, cc);
  husbandJobType(cfg.husband, cc);
  wifeJobType(cfg.wife, cc);
  nationalCensusInfo(cfg.national_census, cc);
  notificationInfo(cfg.notification, cc);
  otherInfo(cfg.other, cc);
  fs.writeFileSync(args.output, await doc.save());
  console.log(`Wrote: ${args.output}`);
}

main().catch((err) => {
  fail(err.stack || String(err));
});
