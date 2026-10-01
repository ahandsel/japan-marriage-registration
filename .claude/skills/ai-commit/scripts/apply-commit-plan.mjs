#!/usr/bin/env node
// apply-commit-plan.mjs notes
// General notes:
// * Purpose: validate and apply a multi-commit plan (JSON) against the working tree.
// * Each plan commit lists a title, an optional body, and the files it owns; the script
//   stages each group and commits it with `git commit --only -- <files>`, so groups
//   cannot leak into each other and pre-staged content outside the plan stays untouched.
// * Validation rejects a plan that assigns a changed file twice, references an
//   unchanged file, or (without --partial) misses a changed file. Titles and
//   bodies are checked against the commit style guide via lib/commit-utils.mjs.
// Usage:
//   node .claude/skills/ai-commit/scripts/apply-commit-plan.mjs [--dry-run] [--partial] <plan-file>
//   node .claude/skills/ai-commit/scripts/apply-commit-plan.mjs --help
// Output:
// * Emoji status lines: ✅ success, ⚠️ warning, ❌ error; one line per created commit.
// * Exit codes: 0 success, 1 validation or commit failure, 2 usage or configuration error.
// Version history:
// * v1.1 - 2026-07-13 - Validate titles and bodies against the commit style
//   guide (allowed emoji, length, no trailing period, "- " bullets) instead of
//   only warning on long titles.
// * v1.0 - 2026-07-12 - Initial release for the ai-commit --auto workflow.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import process from 'node:process';
import { validateTitle } from './lib/commit-utils.mjs';

function printUsage() {
  console.log(`Validate and apply a multi-commit plan against the working tree.

Usage:
  node .claude/skills/ai-commit/scripts/apply-commit-plan.mjs [--dry-run] [--partial] <plan-file>
  node .claude/skills/ai-commit/scripts/apply-commit-plan.mjs --help

Options:
  --dry-run   Validate the plan and print it; create no commits.
  --partial   Allow changed files that no plan commit lists to stay uncommitted.
  --help, -h  Show this help.

Plan file format (JSON, file paths relative to the repo root):
  {
    "commits": [
      { "title": "<emoji> <commit title>", "body": "- <bullet>\\n- <bullet>", "files": ["a.md"] },
      { "title": "<emoji> <commit title>", "files": ["b.md", "c/d.md"] }
    ]
  }

Validation rules:
  * Every commit needs a non-empty title and a non-empty files array ("body" is optional).
  * Every title must pass the commit style guide checks: one allowed emoji, 50 characters or fewer, and no trailing period.
  * Every non-blank body line must be a "- " bullet.
  * A file may be assigned to exactly one commit.
  * Every listed file must have changes in the working tree.
  * Without --partial, every changed file must be assigned to a commit.

Exit codes: 0 success, 1 validation or commit failure, 2 usage or configuration error.`);
}

const args = process.argv.slice(2);
let dryRun = false;
let partial = false;
let planPath = null;
for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    printUsage();
    process.exit(0);
  } else if (arg === '--dry-run') {
    dryRun = true;
  } else if (arg === '--partial') {
    partial = true;
  } else if (arg.startsWith('-')) {
    console.error(`❌ Unknown option: ${arg}`);
    process.exit(2);
  } else if (planPath === null) {
    planPath = arg;
  } else {
    console.error('❌ Too many arguments; expected exactly one <plan-file>.');
    process.exit(2);
  }
}
if (planPath === null) {
  console.error('❌ Missing <plan-file> argument. Run with --help for usage.');
  process.exit(2);
}

let repoRoot;
try {
  repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
} catch {
  console.error('❌ Not inside a git repository.');
  process.exit(2);
}

function git(gitArgs, options = {}) {
  return execFileSync('git', gitArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

let plan;
try {
  plan = JSON.parse(readFileSync(planPath, 'utf8'));
} catch (error) {
  console.error(`❌ Cannot read plan file '${planPath}': ${error.message}`);
  process.exit(2);
}

const gitDirRaw = git(['rev-parse', '--git-dir']).trim();
const gitDir = isAbsolute(gitDirRaw) ? gitDirRaw : join(repoRoot, gitDirRaw);
for (const marker of [
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'rebase-merge',
  'rebase-apply',
]) {
  if (existsSync(join(gitDir, marker))) {
    console.error(
      `❌ A merge, rebase, or cherry-pick is in progress (${marker}); finish or abort it first.`,
    );
    process.exit(2);
  }
}

// Collect every changed path, expanding untracked directories into files.
const porcelain = git([
  'status',
  '--porcelain=v1',
  '-z',
  '--untracked-files=all',
]);
const changed = new Set();
const tokens = porcelain.split('\0');
for (let i = 0; i < tokens.length; i++) {
  const entry = tokens[i];
  if (!entry) continue;
  const status = entry.slice(0, 2);
  changed.add(entry.slice(3));
  if (status[0] === 'R' || status[0] === 'C') {
    i++; // the next token is the rename/copy source path
    if (tokens[i]) changed.add(tokens[i]);
  }
}
if (changed.size === 0) {
  console.error('❌ The working tree has no changes; nothing to commit.');
  process.exit(1);
}

const errors = [];
if (
  !plan ||
  typeof plan !== 'object' ||
  !Array.isArray(plan.commits) ||
  plan.commits.length === 0
) {
  console.error(
    '❌ Plan must be a JSON object with a non-empty "commits" array. Run with --help for the format.',
  );
  process.exit(1);
}
const assigned = new Map(); // file path -> index of the commit that owns it
plan.commits.forEach((commit, index) => {
  const label = `commits[${index}]`;
  if (typeof commit.title !== 'string' || commit.title.trim() === '') {
    errors.push(`${label}: missing or empty "title".`);
  } else {
    for (const titleError of validateTitle(commit.title)) {
      errors.push(`${label}: ${titleError}`);
    }
  }
  if (commit.body !== undefined && typeof commit.body !== 'string') {
    errors.push(`${label}: "body" must be a string when present.`);
  } else if (commit.body) {
    for (const line of commit.body.split('\n')) {
      if (line.trim() === '') continue;
      if (!line.startsWith('- ')) {
        errors.push(`${label}: body line "${line}" must start with "- ".`);
      } else if (line.slice(2).trim() === '') {
        errors.push(`${label}: body has an empty "- " bullet.`);
      }
    }
  }
  if (!Array.isArray(commit.files) || commit.files.length === 0) {
    errors.push(`${label}: missing or empty "files".`);
    return;
  }
  for (const file of commit.files) {
    if (typeof file !== 'string' || file === '') {
      errors.push(`${label}: invalid file entry ${JSON.stringify(file)}.`);
      continue;
    }
    if (assigned.has(file)) {
      const owner = assigned.get(file);
      errors.push(
        owner === index
          ? `${label}: file "${file}" is listed twice.`
          : `${label}: file "${file}" is already assigned to commits[${owner}].`,
      );
    } else {
      assigned.set(file, index);
    }
    if (!changed.has(file)) {
      errors.push(
        `${label}: file "${file}" has no changes in the working tree.`,
      );
    }
  }
});
if (!partial) {
  for (const file of changed) {
    if (!assigned.has(file)) {
      errors.push(
        `Unassigned changed file: "${file}". Add it to a commit or rerun with --partial.`,
      );
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`❌ ${error}`);
  console.error(
    `❌ Plan validation failed with ${errors.length} error(s); no commits were created.`,
  );
  process.exit(1);
}

const total = plan.commits.length;
console.log(
  `✅ Plan is valid: ${total} commit(s) covering ${assigned.size} of ${changed.size} changed file(s).`,
);
if (dryRun) {
  plan.commits.forEach((commit, index) => {
    console.log(
      `   ${index + 1}. ${commit.title} (${commit.files.length} file(s))`,
    );
  });
  console.log('✅ Dry run: no commits were created.');
  process.exit(0);
}

let created = 0;
for (const [index, commit] of plan.commits.entries()) {
  const message = commit.body
    ? `${commit.title}\n\n${commit.body}\n`
    : `${commit.title}\n`;
  try {
    git(['add', '-A', '--', ...commit.files]);
    git(['commit', '--only', '--quiet', '-F', '-', '--', ...commit.files], {
      input: message,
    });
  } catch (error) {
    console.error(
      `❌ Commit ${index + 1}/${total} ("${commit.title}") failed: ${error.message}`,
    );
    if (created > 0) {
      console.error(
        `⚠️ ${created} commit(s) were already created; the remaining ${total - created} were not applied.`,
      );
    }
    process.exit(1);
  }
  created++;
  const shortHash = git(['rev-parse', '--short', 'HEAD']).trim();
  console.log(`✅ [${index + 1}/${total}] ${shortHash} ${commit.title}`);
}

const leftover = git(['status', '--porcelain']).trim();
if (partial) {
  if (leftover) {
    console.log(
      `⚠️ ${leftover.split('\n').length} change(s) left uncommitted (allowed by --partial).`,
    );
  }
  console.log(`✅ Applied ${total} commit(s).`);
} else if (leftover) {
  console.error(
    '❌ Working tree is not clean after applying the plan; these files changed during the run:',
  );
  console.error(leftover);
  process.exit(1);
} else {
  console.log(`✅ Applied ${total} commit(s); working tree is clean.`);
}
