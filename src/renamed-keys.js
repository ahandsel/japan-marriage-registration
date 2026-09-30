// Config and layout keys that were renamed, mapped from the old name to the new one.
// main.js refuses a config that still uses an old key, because every top-level section is optional: an old `notification:` section would otherwise be skipped silently, and the filing date would print blank.
// scripts/migrate-config-keys.mjs reads the same table to rewrite an old config in place.
//
// A rule is { to, values, children }, and every field is optional:
// `to` is the new key name, `values` maps an old scalar value to its new one (keyed by String(value)), and `children` holds the rules for the keys inside that mapping.

// true drew the 番地 ellipse and false the 番 circle; null (no mark) is unchanged.
const BANCHI_TYPE_VALUES = { true: 'banchi', false: 'ban' };

// The address and 本籍 keys that a spouse and a witness share.
const ADDRESS_KEYS = {
  address_first: { to: 'address_town' },
  address_second: { to: 'address_banchi' },
  is_banchi_address: { to: 'address_banchi_type', values: BANCHI_TYPE_VALUES },
  address_apartment: { to: 'address_building' },
  legally_domiciled_first: { to: 'domicile_town' },
  legally_domiciled_second: { to: 'domicile_banchi' },
  is_banchi_legally_domiciled: {
    to: 'domicile_banchi_type',
    values: BANCHI_TYPE_VALUES,
  },
};

const PERSON_KEYS = {
  ...ADDRESS_KEYS,
  address_first_pos: { to: 'address_town_pos' },
  legally_domiciled_first_pos: { to: 'domicile_town_pos' },
  household_person: { to: 'head_of_household' },
  head_of_person_of_legally_domiciled: { to: 'head_of_family_register' },
  relationship: { to: 'relationship_to_parents' },
  job_type: { to: 'household_work_type' },
  marital_history: {
    children: {
      marriage_cat: {
        to: 'status',
        values: { 0: 'first_marriage', 1: 'widowed', 2: 'divorced' },
      },
    },
  },
};

const LAYOUT_ADDRESS_KEYS = {
  address_first: { to: 'address_town' },
  address_second: { to: 'address_banchi' },
  address_apartment: { to: 'address_building' },
  // The old name said 号, but this circle has always been drawn around 番.
  address_go_circle: { to: 'address_ban_circle' },
  legally_domiciled_first: { to: 'domicile_town' },
  legally_domiciled_second: { to: 'domicile_banchi' },
  legally_domiciled_banchi_ellipse: { to: 'domicile_banchi_ellipse' },
  legally_domiciled_go_circle: { to: 'domicile_ban_circle' },
};

const LAYOUT_PERSON_KEYS = {
  ...LAYOUT_ADDRESS_KEYS,
  household_person: { to: 'head_of_household' },
  head_of_person_of_legally_domiciled: { to: 'head_of_family_register' },
  relationship: { to: 'relationship_to_parents' },
  job_type_checks: { to: 'household_work_type_checks' },
  marital_history: {
    children: {
      remarriage_death_check: { to: 'widowed_check' },
      remarriage_divorce_check: { to: 'divorced_check' },
    },
  },
};

// The root of a layout file, and of the `layout:` block inside a config.
export const LAYOUT_KEY_RULES = {
  husband: { children: LAYOUT_PERSON_KEYS },
  wife: { children: LAYOUT_PERSON_KEYS },
  witness1: { children: LAYOUT_ADDRESS_KEYS },
  witness2: { children: LAYOUT_ADDRESS_KEYS },
  new_legally_domiciled: {
    to: 'new_domicile',
    children: {
      husband_lastname_check: { to: 'husband_surname_check' },
      wife_lastname_check: { to: 'wife_surname_check' },
      go_circle: { to: 'ban_circle' },
    },
  },
  to_live_together: { to: 'living_together_since' },
  notification: { to: 'filing', children: { to: { to: 'office' } } },
};

// The root of a config file.
export const CONFIG_KEY_RULES = {
  husband: { children: PERSON_KEYS },
  wife: { children: PERSON_KEYS },
  witness1: { children: ADDRESS_KEYS },
  witness2: { children: ADDRESS_KEYS },
  new_legally_domiciled: {
    to: 'new_domicile',
    children: {
      lastname_of: { to: 'surname_from' },
      // The boolean that came before lastname_of.
      is_husband_lastname: {
        to: 'surname_from',
        values: { true: 'husband', false: 'wife' },
      },
      is_banchi_address: {
        to: 'address_banchi_type',
        values: BANCHI_TYPE_VALUES,
      },
    },
  },
  to_live_together: { to: 'living_together_since' },
  notification: { to: 'filing', children: { to: { to: 'office' } } },
  layout: { children: LAYOUT_KEY_RULES },
};

// The rule for one key: first the key's old name, then its new name, so the keys inside a section that was renamed already are still checked.
export function ruleFor(rules, key) {
  if (Object.hasOwn(rules, key)) {
    return rules[key];
  }
  return Object.values(rules).find((rule) => rule.to === key && rule.children);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Every old key in a parsed config, as { from, to } dotted key paths.
export function findRenamedKeys(node, rules = CONFIG_KEY_RULES, prefix = []) {
  const found = [];
  if (!isPlainObject(node)) {
    return found;
  }
  for (const [key, value] of Object.entries(node)) {
    const rule = ruleFor(rules, key);
    if (!rule) {
      continue;
    }
    const newKey = rule.to && rule.to !== key ? rule.to : key;
    if (newKey !== key) {
      found.push({
        from: [...prefix, key].join('.'),
        to: [...prefix, newKey].join('.'),
      });
    }
    if (rule.children) {
      found.push(...findRenamedKeys(value, rule.children, [...prefix, newKey]));
    }
  }
  return found;
}
