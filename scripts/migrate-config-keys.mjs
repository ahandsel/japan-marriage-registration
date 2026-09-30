#!/usr/bin/env node
/*
Name:     migrate-config-keys.mjs
Usage:    migrate-config-keys.mjs [-h|--help] [-V|--version] [-n|--dry-run] [--layout] [file ...]
Purpose:  Rewrite a config (or a layout file) that still uses the old key names.

Version history:
- v1.0, 2026-09-30; Initial version.

Notes:
* The old and new names live in src/renamed-keys.js, the same table main.js uses to refuse an old config.
* Only the old key names, and the values that changed shape, are replaced in the file text.
  Every comment, blank line, quote style, and other value stays exactly as it was.
* Three values change shape as well as name:
  is_banchi_* true/false becomes *_banchi_type banchi/ban, marriage_cat 0/1/2 becomes status first_marriage/widowed/divorced, and is_husband_lastname true/false becomes surname_from husband/wife.
  A null stays null, and any other value is left for main.js to report.
* With no file argument, every config-private*.yaml in the repository root is migrated.
* A config can hold real personal information, so the output names key paths only and never prints a value.

Output:
* One line per file: ✅ migrated (with each renamed key path), ✅ already current, or ❌ with the reason.
* With -n/--dry-run, the same report, and no file is written.
* Exit codes: 0 success, 1 a file could not be migrated, 2 usage error.
*/
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import {
  CONFIG_KEY_RULES,
  LAYOUT_KEY_RULES,
  ruleFor,
} from '../src/renamed-keys.js';

const SCRIPT_NAME = 'migrate-config-keys.mjs';
const VERSION = '1.0';
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function usage() {
  return `${SCRIPT_NAME} v${VERSION}

🧭 Usage:
  pnpm run migrate-config [-n|--dry-run] [--layout] [file ...]

🧩 Options:
  -h, --help     Show this help message and exit.
  -V, --version  Print version and exit.
  -n, --dry-run  Report what would change, without writing any file.
  --layout       Treat each file as a layout file (src/layout/<variant>.yaml),
                 not as a config.

📝 Description:
  Renames the old config keys (for example address_first, is_banchi_address,
  and notification) to their current names, in place. Comments and
  formatting are kept. With no file, every config-private*.yaml in the
  repository root is migrated. Values are never printed.`;
}

// Collect [start, end, replacement] text edits for every old key under this mapping, recursing into the mappings the rules describe.
function collectEdits(map, rules, prefix, edits, renamed, errors) {
  if (!YAML.isMap(map)) {
    return;
  }
  const newKeys = new Set(map.items.map((pair) => String(pair.key?.value)));
  for (const pair of map.items) {
    const key = String(pair.key?.value);
    const rule = ruleFor(rules, key);
    if (!rule) {
      continue;
    }
    const newKey = rule.to && rule.to !== key ? rule.to : key;
    if (newKey !== key) {
      if (newKeys.has(newKey)) {
        errors.push(
          `${[...prefix, key].join('.')} and ${[...prefix, newKey].join('.')} are both present; keep one and run again.`,
        );
        continue;
      }
      newKeys.add(newKey);
      edits.push([pair.key.range[0], pair.key.range[1], newKey]);
      renamed.push(`${[...prefix, key].join('.')} -> ${newKey}`);
    }
    if (rule.values && YAML.isScalar(pair.value)) {
      const replacement = rule.values[String(pair.value.value)];
      if (replacement !== undefined) {
        edits.push([pair.value.range[0], pair.value.range[1], replacement]);
      }
    }
    if (rule.children) {
      collectEdits(
        pair.value,
        rule.children,
        [...prefix, newKey],
        edits,
        renamed,
        errors,
      );
    }
  }
}

export function migrateText(text, rules) {
  const doc = YAML.parseDocument(text);
  if (doc.errors.length > 0) {
    return { error: `not valid YAML: ${doc.errors[0].message.split('\n')[0]}` };
  }
  const edits = [];
  const renamed = [];
  const errors = [];
  collectEdits(doc.contents, rules, [], edits, renamed, errors);
  if (errors.length > 0) {
    return { error: errors.join(' ') };
  }
  // Apply from the end of the file backwards, so an earlier edit never shifts the offsets of a later one.
  let result = text;
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return { text: result, renamed };
}

function defaultTargets() {
  return fs
    .readdirSync(repoRoot)
    .filter((name) => /^config-private.*\.yaml$/.test(name))
    .sort()
    .map((name) => path.join(repoRoot, name));
}

function main() {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'V' },
        'dry-run': { type: 'boolean', short: 'n' },
        layout: { type: 'boolean' },
      },
      allowPositionals: true,
    });
  } catch (err) {
    console.error(`❌ ${err.message}\n\n${usage()}`);
    process.exit(2);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(usage());
    return;
  }
  if (values.version) {
    console.log(`${SCRIPT_NAME} v${VERSION}`);
    return;
  }
  const rules = values.layout ? LAYOUT_KEY_RULES : CONFIG_KEY_RULES;
  const targets = positionals.length ? positionals : defaultTargets();
  if (targets.length === 0) {
    console.log(
      '✅ No config-private*.yaml in the repository root - nothing to migrate.',
    );
    return;
  }
  let failed = false;
  for (const target of targets) {
    const name = path.relative(process.cwd(), target) || target;
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      console.error(`❌ ${name}: file not found.`);
      failed = true;
      continue;
    }
    const result = migrateText(fs.readFileSync(target, 'utf-8'), rules);
    if (result.error) {
      console.error(`❌ ${name}: ${result.error}`);
      failed = true;
      continue;
    }
    if (result.renamed.length === 0) {
      console.log(`✅ ${name}: already uses the current key names.`);
      continue;
    }
    if (!values['dry-run']) {
      fs.writeFileSync(target, result.text);
    }
    console.log(
      `✅ ${name}: ${values['dry-run'] ? 'would rename' : 'renamed'} ${result.renamed.length} keys.\n` +
        result.renamed.map((line) => `   - ${line}`).join('\n'),
    );
  }
  if (failed) {
    process.exit(1);
  }
}

// Run only as a script, so a test can import migrateText without touching any file.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
