#!/usr/bin/env node

// validate-commit-message.mjs notes
// General notes:
// * Purpose: Validate an ai-commit message file against the project commit style
//   guide before staging, committing, or rewording.
// Usage:
//   node .claude/skills/ai-commit/scripts/validate-commit-message.mjs --file msg.md
//   node .claude/skills/ai-commit/scripts/validate-commit-message.mjs --file msg.md --json
// Options:
//   --file <path>         Message file with "Title:" and "Message:" sections.
//   --json                Print errors as JSON instead of plain text.
//   --help, -h            Show this message.
// Output:
// * Prints validation errors on stderr when checks fail.
// * Exit codes: 0 pass, 1 validation failure, 2 invalid arguments.
// Version history:
// * v1.0 - 2026-07-09 - Initial release for ai-commit script refactor.

import { fail, readMessageFile, validateMessage } from './lib/commit-utils.mjs';

function printUsage() {
  console.log(`Usage: node validate-commit-message.mjs --file <path> [options]

Validate an ai-commit message file.

Message file format:
  Title: <emoji> <commit title>

  Message:
  - <main change>
  - <supporting detail>

Options:
  --file <path>   Message file to validate. Required.
  --json          Print errors as JSON on failure.
  --help, -h      Show this message.

Exit codes:
  0  Pass.
  1  Validation failure.
  2  Invalid arguments.
`);
}

function parseArgs(argv) {
  const options = { file: null, json: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      case '--file':
        options.file = argv[++i];
        if (!options.file) fail(2, '--file requires a path.');
        break;
      case '--json':
        options.json = true;
        break;
      default:
        fail(2, `Unknown argument: ${arg}. Run with --help for usage.`);
    }
  }

  if (!options.file) {
    fail(2, '--file is required. Run with --help for usage.');
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { title, bullets } = readMessageFile(options.file);
  const errors = validateMessage(title, bullets);

  if (errors.length === 0) {
    console.error('✅ Commit message passes style checks.');
    process.exit(0);
  }

  if (options.json) {
    console.error(JSON.stringify({ ok: false, errors }, null, 2));
  } else {
    for (const error of errors) {
      console.error(`❌ ${error}`);
    }
  }
  process.exit(1);
}

main();
