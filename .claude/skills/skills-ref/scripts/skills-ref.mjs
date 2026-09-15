#!/usr/bin/env node
// skills-ref.mjs notes
// General notes:
// * Purpose: Node port of the Agent Skills reference library (skills-ref 0.1.0).
//   Validate a skill folder, print its frontmatter as JSON, or emit an
//   <available_skills> XML block for agent prompts.
// * Upstream: https://github.com/agentskills/agentskills/tree/main/skills-ref
//   (Apache 2.0). Python is banned in this repo, so this script reimplements
//   the CLI in Node rather than vendoring the original package.
// Usage:
//   node skills/skills-ref/scripts/skills-ref.mjs validate <skill>
//   node skills/skills-ref/scripts/skills-ref.mjs read-properties <skill>
//   node skills/skills-ref/scripts/skills-ref.mjs to-prompt <skill> [skill...]
//   pnpm skills-ref validate <skill>
//   node skills/skills-ref/scripts/skills-ref.mjs --help
// Output:
// * validate: "✅ Valid skill: <path>" on stdout, or "❌ Validation failed..." plus
//   one "  - <error>" line per problem on stderr.
// * read-properties: JSON of the parsed properties on stdout.
// * to-prompt: an <available_skills> XML block on stdout.
// * Exit codes: 0 = success, 1 = validation or parse error, 2 = usage error.
// Version history:
// * v1.0 - 2026-09-09 - Initial Node port of skills-ref 0.1.0.

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { load } from 'js-yaml';

const VERSION = '1.0';
const MAX_SKILL_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_COMPATIBILITY_LENGTH = 500;
const ALLOWED_FIELDS = new Set([
  'name',
  'description',
  'license',
  'allowed-tools',
  'metadata',
  'compatibility',
]);

class SkillError extends Error {}
class ParseError extends SkillError {}
class ValidationError extends SkillError {}

const HELP = `Node port of the Agent Skills reference library (validate, read-properties, to-prompt).

Usage:
  node skills/skills-ref/scripts/skills-ref.mjs validate <skill>
  node skills/skills-ref/scripts/skills-ref.mjs read-properties <skill>
  node skills/skills-ref/scripts/skills-ref.mjs to-prompt <skill> [skill...]
  pnpm skills-ref <command> [args]
  node skills/skills-ref/scripts/skills-ref.mjs --help
  node skills/skills-ref/scripts/skills-ref.mjs --version

Commands:
  validate         Check SKILL.md frontmatter against the Agent Skills spec.
  read-properties  Print parsed frontmatter properties as JSON.
  to-prompt        Emit an <available_skills> XML block for agent prompts.

Arguments:
  <skill>  A skill directory, or a path to SKILL.md / skill.md.

Exit codes:
  0  Success (valid skill, or JSON / XML printed).
  1  Validation or parse error.
  2  Usage or configuration error.`;

function printUsage() {
  console.log(HELP);
}

function usageError(message) {
  console.error(`❌ ${message}`);
  printUsage();
  process.exit(2);
}

function isSkillMdFile(path) {
  try {
    return (
      lstatSync(path).isFile() && basename(path).toLowerCase() === 'skill.md'
    );
  } catch {
    return false;
  }
}

function resolveSkillDir(path) {
  const resolved = isAbsolute(path) ? path : resolve(path);
  if (!existsSync(resolved)) {
    usageError(`Path does not exist: ${path}`);
  }
  return isSkillMdFile(resolved) ? dirname(resolved) : resolved;
}

function findSkillMd(skillDir) {
  for (const name of ['SKILL.md', 'skill.md']) {
    const path = join(skillDir, name);
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) {
    throw new ParseError('SKILL.md must start with YAML frontmatter (---)');
  }
  const parts = content.split('---', 3);
  if (parts.length < 3) {
    throw new ParseError('SKILL.md frontmatter not properly closed with ---');
  }
  const frontmatterStr = parts[1];
  const body = parts[2].trim();
  let parsed;
  try {
    parsed = load(frontmatterStr) ?? {};
  } catch (error) {
    throw new ParseError(`Invalid YAML in frontmatter: ${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ParseError('SKILL.md frontmatter must be a YAML mapping');
  }
  if (
    Object.hasOwn(parsed, 'metadata') &&
    parsed.metadata !== null &&
    typeof parsed.metadata === 'object' &&
    !Array.isArray(parsed.metadata)
  ) {
    parsed.metadata = Object.fromEntries(
      Object.entries(parsed.metadata).map(([key, value]) => [
        String(key),
        String(value),
      ]),
    );
  }
  return { metadata: parsed, body };
}

function isAlnumOrHyphen(char) {
  return char === '-' || /^\p{L}$/u.test(char) || /^\p{N}$/u.test(char);
}

function validateName(name, skillDir) {
  const errors = [];
  if (typeof name !== 'string' || !name.trim()) {
    errors.push("Field 'name' must be a non-empty string");
    return errors;
  }
  const normalized = name.trim().normalize('NFKC');
  if (normalized.length > MAX_SKILL_NAME_LENGTH) {
    errors.push(
      `Skill name '${normalized}' exceeds ${MAX_SKILL_NAME_LENGTH} character limit (${normalized.length} chars)`,
    );
  }
  if (normalized !== normalized.toLowerCase()) {
    errors.push(`Skill name '${normalized}' must be lowercase`);
  }
  if (normalized.startsWith('-') || normalized.endsWith('-')) {
    errors.push('Skill name cannot start or end with a hyphen');
  }
  if (normalized.includes('--')) {
    errors.push('Skill name cannot contain consecutive hyphens');
  }
  if (![...normalized].every(isAlnumOrHyphen)) {
    errors.push(
      `Skill name '${normalized}' contains invalid characters. Only letters, digits, and hyphens are allowed.`,
    );
  }
  if (skillDir) {
    const dirName = basename(skillDir).normalize('NFKC');
    if (dirName !== normalized) {
      errors.push(
        `Directory name '${basename(skillDir)}' must match skill name '${normalized}'`,
      );
    }
  }
  return errors;
}

function validateDescription(description) {
  if (typeof description !== 'string' || !description.trim()) {
    return ["Field 'description' must be a non-empty string"];
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return [
      `Description exceeds ${MAX_DESCRIPTION_LENGTH} character limit (${description.length} chars)`,
    ];
  }
  return [];
}

function validateCompatibility(compatibility) {
  if (typeof compatibility !== 'string') {
    return ["Field 'compatibility' must be a string"];
  }
  if (compatibility.length > MAX_COMPATIBILITY_LENGTH) {
    return [
      `Compatibility exceeds ${MAX_COMPATIBILITY_LENGTH} character limit (${compatibility.length} chars)`,
    ];
  }
  return [];
}

function validateMetadataFields(metadata) {
  const extraFields = Object.keys(metadata)
    .filter((key) => !ALLOWED_FIELDS.has(key))
    .sort();
  if (extraFields.length === 0) {
    return [];
  }
  const allowed = [...ALLOWED_FIELDS].sort().map((field) => `'${field}'`);
  return [
    `Unexpected fields in frontmatter: ${extraFields.join(', ')}. Only [${allowed.join(', ')}] are allowed.`,
  ];
}

function validateMetadata(metadata, skillDir = null) {
  const errors = [...validateMetadataFields(metadata)];
  if (!Object.hasOwn(metadata, 'name')) {
    errors.push('Missing required field in frontmatter: name');
  } else {
    errors.push(...validateName(metadata.name, skillDir));
  }
  if (!Object.hasOwn(metadata, 'description')) {
    errors.push('Missing required field in frontmatter: description');
  } else {
    errors.push(...validateDescription(metadata.description));
  }
  if (Object.hasOwn(metadata, 'compatibility')) {
    errors.push(...validateCompatibility(metadata.compatibility));
  }
  return errors;
}

function validate(skillDir) {
  if (!existsSync(skillDir)) {
    return [`Path does not exist: ${skillDir}`];
  }
  let stats;
  try {
    stats = lstatSync(skillDir);
  } catch {
    return [`Path does not exist: ${skillDir}`];
  }
  if (!stats.isDirectory()) {
    return [`Not a directory: ${skillDir}`];
  }
  const skillMd = findSkillMd(skillDir);
  if (skillMd === null) {
    return ['Missing required file: SKILL.md'];
  }
  try {
    const content = readFileSync(skillMd, 'utf8');
    const { metadata } = parseFrontmatter(content);
    return validateMetadata(metadata, skillDir);
  } catch (error) {
    if (error instanceof ParseError) {
      return [error.message];
    }
    throw error;
  }
}

function propertiesToDict(props) {
  const result = { name: props.name, description: props.description };
  if (props.license !== undefined) {
    result.license = props.license;
  }
  if (props.compatibility !== undefined) {
    result.compatibility = props.compatibility;
  }
  if (props.allowedTools !== undefined) {
    result['allowed-tools'] = props.allowedTools;
  }
  if (props.metadata && Object.keys(props.metadata).length > 0) {
    result.metadata = props.metadata;
  }
  return result;
}

function readProperties(skillDir) {
  const skillMd = findSkillMd(skillDir);
  if (skillMd === null) {
    throw new ParseError(`SKILL.md not found in ${skillDir}`);
  }
  const content = readFileSync(skillMd, 'utf8');
  const { metadata } = parseFrontmatter(content);
  if (!Object.hasOwn(metadata, 'name')) {
    throw new ValidationError('Missing required field in frontmatter: name');
  }
  if (!Object.hasOwn(metadata, 'description')) {
    throw new ValidationError(
      'Missing required field in frontmatter: description',
    );
  }
  const { name, description } = metadata;
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError("Field 'name' must be a non-empty string");
  }
  if (typeof description !== 'string' || !description.trim()) {
    throw new ValidationError("Field 'description' must be a non-empty string");
  }
  return {
    name: name.trim(),
    description: description.trim(),
    license: metadata.license,
    compatibility: metadata.compatibility,
    allowedTools: metadata['allowed-tools'],
    metadata: metadata.metadata ?? {},
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}

function toPrompt(skillDirs) {
  if (skillDirs.length === 0) {
    return '<available_skills>\n</available_skills>';
  }
  const lines = ['<available_skills>'];
  for (const skillDir of skillDirs) {
    const resolvedDir = resolve(skillDir);
    const props = readProperties(resolvedDir);
    const skillMdPath = findSkillMd(resolvedDir);
    lines.push('<skill>');
    lines.push('<name>');
    lines.push(escapeXml(props.name));
    lines.push('</name>');
    lines.push('<description>');
    lines.push(escapeXml(props.description));
    lines.push('</description>');
    lines.push('<location>');
    lines.push(String(skillMdPath));
    lines.push('</location>');
    lines.push('</skill>');
  }
  lines.push('</available_skills>');
  return lines.join('\n');
}

function runValidate(skillPath) {
  const skillDir = resolveSkillDir(skillPath);
  const errors = validate(skillDir);
  if (errors.length > 0) {
    console.error(`❌ Validation failed for ${skillDir}:`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
  console.log(`✅ Valid skill: ${skillDir}`);
}

function runReadProperties(skillPath) {
  const skillDir = resolveSkillDir(skillPath);
  try {
    const props = readProperties(skillDir);
    console.log(JSON.stringify(propertiesToDict(props), null, 2));
  } catch (error) {
    if (error instanceof SkillError) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

function runToPrompt(skillPaths) {
  try {
    const resolved = skillPaths.map((path) => resolveSkillDir(path));
    console.log(toPrompt(resolved));
  } catch (error) {
    if (error instanceof SkillError) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

function main(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    printUsage();
    process.exit(0);
  }
  if (argv.includes('--version') || argv.includes('-V')) {
    console.log(VERSION);
    process.exit(0);
  }
  const [command, ...rest] = argv;
  if (!command) {
    usageError('Missing command.');
  }
  if (command === 'validate') {
    if (rest.length !== 1) {
      usageError('validate requires exactly one skill path.');
    }
    runValidate(rest[0]);
    return;
  }
  if (command === 'read-properties') {
    if (rest.length !== 1) {
      usageError('read-properties requires exactly one skill path.');
    }
    runReadProperties(rest[0]);
    return;
  }
  if (command === 'to-prompt') {
    if (rest.length < 1) {
      usageError('to-prompt requires at least one skill path.');
    }
    runToPrompt(rest);
    return;
  }
  usageError(`Unknown command: ${command}`);
}

main(process.argv.slice(2));
