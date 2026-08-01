// Load, merge, and validate per-template layout data.
// A layout YAML in src/layout/ holds every positioning number for one
// template: absolute [x, y] positions, font sizes, line steps, and the
// circle/ellipse geometry. main.js only draws; all numbers come from here.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const LAYOUT_DIR = path.join(baseDir, 'layout');
// Bundled templates are named "<prefix><variant>.pdf"; the matching layout is
// "layout/<variant>.yaml". Exported so main.js shares the naming convention.
export const TEMPLATE_PREFIX = 'jp-marriage-registration-';
const DEFAULT_LAYOUT = 'simple';

function fail(message) {
  console.error(message);
  process.exit(1);
}

// --- schema ------------------------------------------------------------------
// Leaf types: 'text' is { pos: [x, y], size }, 'multiline' adds a `step`
// (distance between lines), 'ellipse' is two opposite bounding-box corners
// [x1, y1, x2, y2], 'circle' is [x, y, r], and 'checks' is a ✓ size plus one
// absolute position per job_type value (1-6).

const PERSON_SCHEMA = {
  last_name: 'text',
  last_name_kana: 'text',
  first_name: 'text',
  first_name_kana: 'text',
  birth_year: 'text',
  birth_month: 'text',
  birth_day: 'text',
  address_first: 'text',
  address_second: 'text',
  address_go: 'text',
  household_person: 'text',
  address_apartment: 'multiline',
  address_banchi_ellipse: 'ellipse',
  address_go_circle: 'circle',
  legally_domiciled_first: 'text',
  legally_domiciled_second: 'text',
  head_of_person_of_legally_domiciled: 'text',
  legally_domiciled_banchi_ellipse: 'ellipse',
  legally_domiciled_go_circle: 'circle',
  father_name: 'text',
  mother_name: 'text',
  relationship: 'text',
  marital_history: {
    first_marriage_check: 'text',
    remarriage_death_check: 'text',
    remarriage_divorce_check: 'text',
    year: 'text',
    month: 'text',
    day: 'text',
  },
  job_type_checks: 'checks',
};

const LAYOUT_SCHEMA = {
  husband: PERSON_SCHEMA,
  wife: PERSON_SCHEMA,
  new_legally_domiciled: {
    husband_lastname_check: 'text',
    wife_lastname_check: 'text',
    address: 'text',
    banchi_ellipse: 'ellipse',
    go_circle: 'circle',
  },
  to_live_together: {
    year: 'text',
    month: 'text',
  },
  national_census: {
    year: 'text',
    husband_job: 'text',
    wife_job: 'text',
  },
  notification: {
    year: 'text',
    month: 'text',
    day: 'text',
    to: 'text',
  },
  other: {
    text: 'multiline',
  },
};

// Legacy `*_pos` config keys still override the resolved layout so that old
// private configs keep rendering unchanged. `shifts` lists the fields the old
// code placed at a fixed offset from that key - they move by the same delta as
// the anchor, which reproduces the old derived behavior exactly.
const LEGACY_PERSON_POS_KEYS = {
  last_name_pos: { field: 'last_name', shifts: [] },
  last_name_kana_pos: { field: 'last_name_kana', shifts: [] },
  first_name_pos: { field: 'first_name', shifts: [] },
  first_name_kana_pos: { field: 'first_name_kana', shifts: [] },
  address_first_pos: {
    field: 'address_first',
    shifts: [
      'address_second',
      'address_go',
      'household_person',
      'address_apartment',
    ],
  },
  legally_domiciled_first_pos: {
    field: 'legally_domiciled_first',
    shifts: ['legally_domiciled_second', 'head_of_person_of_legally_domiciled'],
  },
  father_name_pos: { field: 'father_name', shifts: [] },
  mother_name_pos: { field: 'mother_name', shifts: [] },
};

// --- loading -------------------------------------------------------------------

function layoutNameForTemplate(templateName) {
  // Reduce whatever the -t flag or the `template:` key resolved to (short
  // variant, full stem, or a path to a PDF) to the short variant name.
  let name = templateName;
  if (name.toLowerCase().endsWith('.pdf')) {
    name = path.parse(name).name;
  }
  if (name.startsWith(TEMPLATE_PREFIX)) {
    name = name.slice(TEMPLATE_PREFIX.length);
  }
  return name;
}

function layoutPathForTemplate(templateName) {
  const name = layoutNameForTemplate(templateName);
  const candidate = path.join(LAYOUT_DIR, `${name}.yaml`);
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  // A custom template PDF has no bundled layout; start from the default grid
  // and let the config's `layout:` block adjust it.
  console.log(
    `ℹ️  No layout file for template "${name}" - using the "${DEFAULT_LAYOUT}" layout as the base.`,
  );
  return path.join(LAYOUT_DIR, `${DEFAULT_LAYOUT}.yaml`);
}

// --- merging -------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  // Mappings merge key by key; scalars and arrays replace the base value.
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in merged ? deepMerge(merged[key], value) : value;
  }
  return merged;
}

function isPos(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => Number.isFinite(n))
  );
}

function applyLegacyPosOverrides(layout, cfg) {
  // (sectionCfg, sectionLayout, legacy key spec) triples for every `*_pos`
  // key the config format supports.
  const overrides = [];
  for (const person of ['husband', 'wife']) {
    for (const [key, spec] of Object.entries(LEGACY_PERSON_POS_KEYS)) {
      overrides.push([cfg[person], layout[person], key, spec, person]);
    }
  }
  overrides.push([
    cfg.new_legally_domiciled,
    layout.new_legally_domiciled,
    'address_pos',
    { field: 'address', shifts: [] },
    'new_legally_domiciled',
  ]);
  for (const [sectionCfg, sectionLayout, key, spec, sectionName] of overrides) {
    const pos = sectionCfg?.[key];
    if (pos === undefined || pos === null) {
      continue;
    }
    if (!isPos(pos)) {
      fail(
        `❌ Config error: "${sectionName}.${key}" must be a pair of numbers [x, y].`,
      );
    }
    const anchor = sectionLayout?.[spec.field];
    if (!isPlainObject(anchor) || !isPos(anchor.pos)) {
      // The layout itself is broken; validation below reports the details.
      continue;
    }
    const dx = pos[0] - anchor.pos[0];
    const dy = pos[1] - anchor.pos[1];
    anchor.pos = [pos[0], pos[1]];
    for (const dependent of spec.shifts) {
      const target = sectionLayout[dependent];
      if (isPlainObject(target) && isPos(target.pos)) {
        target.pos = [target.pos[0] + dx, target.pos[1] + dy];
      }
    }
  }
}

// --- validation ------------------------------------------------------------------

function checkNumbers(value, count, keyPath, shape, errors) {
  const ok =
    Array.isArray(value) &&
    value.length === count &&
    value.every((n) => Number.isFinite(n));
  if (!ok) {
    errors.push(`"${keyPath}" must be ${shape}.`);
  }
}

function checkSize(value, keyPath, errors) {
  if (!Number.isFinite(value) || value <= 0) {
    errors.push(`"${keyPath}.size" must be a positive number of points.`);
  }
}

function validateLeaf(type, value, keyPath, errors) {
  if (type === 'ellipse') {
    checkNumbers(value, 4, keyPath, 'corners [x1, y1, x2, y2]', errors);
    return;
  }
  if (type === 'circle') {
    checkNumbers(value, 3, keyPath, 'a circle [x, y, r]', errors);
    return;
  }
  if (!isPlainObject(value)) {
    errors.push(`"${keyPath}" must be a mapping.`);
    return;
  }
  if (type === 'checks') {
    checkSize(value.size, keyPath, errors);
    if (!isPlainObject(value.positions)) {
      errors.push(`"${keyPath}.positions" must map job_type 1-6 to [x, y].`);
    } else {
      for (const jobType of ['1', '2', '3', '4', '5', '6']) {
        if (!(jobType in value.positions)) {
          errors.push(`"${keyPath}.positions.${jobType}" is missing.`);
        } else {
          checkNumbers(
            value.positions[jobType],
            2,
            `${keyPath}.positions.${jobType}`,
            'a position [x, y]',
            errors,
          );
        }
      }
    }
    for (const key of Object.keys(value)) {
      if (key !== 'size' && key !== 'positions') {
        errors.push(`"${keyPath}.${key}" is not a known layout key.`);
      }
    }
    return;
  }
  // 'text' and 'multiline'
  checkNumbers(value.pos, 2, `${keyPath}.pos`, 'a position [x, y]', errors);
  checkSize(value.size, keyPath, errors);
  const known = ['pos', 'size'];
  if (type === 'multiline') {
    known.push('step');
    if (!Number.isFinite(value.step) || value.step <= 0) {
      errors.push(`"${keyPath}.step" must be a positive line step in points.`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      errors.push(`"${keyPath}.${key}" is not a known layout key.`);
    }
  }
}

function validateNode(schema, value, keyPath, errors) {
  if (typeof schema === 'string') {
    validateLeaf(schema, value, keyPath, errors);
    return;
  }
  if (!isPlainObject(value)) {
    errors.push(
      keyPath
        ? `"${keyPath}" must be a mapping.`
        : 'the layout root must be a mapping.',
    );
    return;
  }
  for (const key of Object.keys(schema)) {
    const childPath = keyPath ? `${keyPath}.${key}` : key;
    if (!(key in value)) {
      errors.push(`"${childPath}" is missing.`);
    } else {
      validateNode(schema[key], value[key], childPath, errors);
    }
  }
  for (const key of Object.keys(value)) {
    if (!(key in schema)) {
      errors.push(
        `"${keyPath ? `${keyPath}.${key}` : key}" is not a known layout key.`,
      );
    }
  }
}

// --- public API ------------------------------------------------------------------

export function resolveLayout(templateName, cfg) {
  const layoutPath = layoutPathForTemplate(templateName);
  let parsed;
  try {
    parsed = YAML.parse(fs.readFileSync(layoutPath, 'utf-8'));
  } catch (err) {
    fail(`❌ Could not read layout file ${layoutPath}:\n${err.message}`);
  }
  if (cfg.layout !== undefined && !isPlainObject(cfg.layout)) {
    fail('❌ Config error: "layout" must be a mapping of layout overrides.');
  }
  // Clone so the override steps below never mutate objects shared with the
  // parsed base when no `layout:` block is present.
  const merged = structuredClone(deepMerge(parsed, cfg.layout ?? {}));
  applyLegacyPosOverrides(merged, cfg);
  const errors = [];
  validateNode(LAYOUT_SCHEMA, merged, '', errors);
  if (errors.length > 0) {
    fail(
      `❌ Invalid layout for template "${layoutNameForTemplate(templateName)}" ` +
        `(${layoutPath}${cfg.layout ? ' + config "layout:" overrides' : ''}):\n` +
        errors.map((line) => `   - ${line}`).join('\n'),
    );
  }
  return merged;
}
