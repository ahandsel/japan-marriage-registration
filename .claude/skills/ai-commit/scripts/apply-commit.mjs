#!/usr/bin/env node

// apply-commit.mjs notes
// General notes:
// * Purpose: Apply ai-commit write operations: stage files and create a commit,
//   or reword one or more existing commits without changing tree contents.
// * Runs prerequisite checks before any reword. Uses git commit --amend --only
//   for HEAD and git rebase -i for older commits, aborting a failed rebase and
//   verifying afterwards that the branch tree and commit count are unchanged.
// * Multi-commit plans are applied by apply-commit-plan.mjs, not this script.
// Usage:
//   node .claude/skills/ai-commit/scripts/apply-commit.mjs --message-file msg.md --files a.md b.md
//   node .claude/skills/ai-commit/scripts/apply-commit.mjs --reword-head --message-file msg.md
//   node .claude/skills/ai-commit/scripts/apply-commit.mjs --reword <hash> --message-file msg.md
//   node .claude/skills/ai-commit/scripts/apply-commit.mjs --reword-unpushed --messages-dir ./msgs/
// Options:
//   --message-file <path>   Message file for a single commit or reword.
//   --files <path...>       Files to stage before committing (repeatable group).
//   --all                   Stage every changed file (default commit mode only).
//   --reword-head           Reword HEAD only (message-only amend).
//   --reword <hash>         Reword one older commit.
//   --reword-unpushed       Reword every unpushed commit oldest-first.
//   --messages-dir <dir>    Directory of <shortHash>.md files for --reword-unpushed.
//   --skip-validate         Skip validate-commit-message checks.
//   --help, -h              Show this message.
// Output:
// * Prints planned git actions, then a final status line.
// * Exit codes: 0 success, 1 refusal or git failure, 2 invalid arguments.
// Version history:
// * v1.1 - 2026-07-13 - Consolidation: move plan mode to apply-commit-plan.mjs,
//   commit with --only so pre-staged unrelated files are never swallowed, abort
//   a failed reword rebase automatically, verify tree and commit count after a
//   reword, and quote the message file path passed to GIT_EDITOR.
// * v1.0 - 2026-07-09 - Initial release for ai-commit script refactor.

import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  commitSummary,
  ensureGitRepo,
  fail,
  formatGitMessage,
  getUnpushedCommits,
  gitOk,
  gitTry,
  readMessageFile,
  runPrerequisiteChecks,
  validateMessage,
} from './lib/commit-utils.mjs';

function printUsage() {
  console.log(`Usage: node apply-commit.mjs [options]

Apply ai-commit write operations.
Multi-commit plans are applied by apply-commit-plan.mjs, not this script.

Options:
  --message-file <path>   Message file for a single commit or reword.
  --files <path...>       Files to stage before committing.
  --all                   Stage every changed file (default commit mode only).
  --reword-head           Reword HEAD only.
  --reword <hash>         Reword one older commit.
  --reword-unpushed       Reword every unpushed commit oldest-first.
  --messages-dir <dir>    <shortHash>.md files for --reword-unpushed.
  --skip-validate         Skip message validation.
  --help, -h              Show this message.

Exit codes:
  0  Success.
  1  Refusal, prerequisite failure, or git error.
  2  Invalid arguments.
`);
}

function parseArgs(argv) {
  const options = {
    messageFile: null,
    files: [],
    all: false,
    rewordHead: false,
    rewordHash: null,
    rewordUnpushed: false,
    messagesDir: null,
    skipValidate: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      case '--message-file':
        options.messageFile = argv[++i];
        if (!options.messageFile) fail(2, '--message-file requires a path.');
        break;
      case '--files':
        while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
          options.files.push(argv[++i]);
        }
        if (options.files.length === 0) {
          fail(2, '--files requires at least one path.');
        }
        break;
      case '--all':
        options.all = true;
        break;
      case '--reword-head':
        options.rewordHead = true;
        break;
      case '--reword':
        options.rewordHash = argv[++i];
        if (!options.rewordHash) fail(2, '--reword requires a hash.');
        break;
      case '--reword-unpushed':
        options.rewordUnpushed = true;
        break;
      case '--messages-dir':
        options.messagesDir = argv[++i];
        if (!options.messagesDir) fail(2, '--messages-dir requires a path.');
        break;
      case '--skip-validate':
        options.skipValidate = true;
        break;
      default:
        fail(2, `Unknown argument: ${arg}. Run with --help for usage.`);
    }
  }

  const modeCount = [
    options.rewordHead,
    options.rewordHash,
    options.rewordUnpushed,
    options.messageFile &&
      !options.rewordHead &&
      !options.rewordHash &&
      !options.rewordUnpushed,
  ].filter(Boolean).length;

  if (modeCount === 0) {
    fail(
      2,
      'Provide --reword-head, --reword, --reword-unpushed, or --message-file for a new commit.',
    );
  }
  if (modeCount > 1) {
    fail(2, 'Use only one apply mode at a time.');
  }

  if (options.rewordUnpushed && !options.messagesDir) {
    fail(2, '--reword-unpushed requires --messages-dir.');
  }

  if (!options.rewordUnpushed && !options.messageFile) {
    fail(2, '--message-file is required for this mode.');
  }

  if (
    !options.rewordHead &&
    !options.rewordHash &&
    !options.rewordUnpushed &&
    options.files.length === 0 &&
    !options.all
  ) {
    fail(2, 'New commits require --files or --all.');
  }

  return options;
}

function assertChecksPass(checks) {
  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    for (const check of failed) {
      console.error(`❌ ${check.detail}`);
    }
    fail(1, 'Prerequisite checks failed.');
  }
}

function validateMessageFile(path, skipValidate) {
  const { title, bullets } = readMessageFile(path);
  if (skipValidate) {
    return { title, bullets };
  }
  const errors = validateMessage(title, bullets);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`❌ ${error}`);
    }
    fail(1, `Message file ${path} failed validation.`);
  }
  return { title, bullets };
}

function writeTempGitMessage(title, bullets) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-commit-'));
  const file = join(dir, 'message.txt');
  writeFileSync(file, `${formatGitMessage(title, bullets)}\n`, 'utf8');
  return file;
}

function runGitCommit(messageFile, files, all) {
  if (all) {
    console.log('git add -A');
    gitOk(['add', '-A']);
    console.log(`git commit -F ${messageFile}`);
    gitOk(['commit', '-F', messageFile]);
    return;
  }

  // --only commits exactly the listed paths, so content that was already
  // staged outside this group stays out of the commit.
  console.log(`git add -A -- ${files.join(' ')}`);
  gitOk(['add', '-A', '--', ...files]);
  console.log(`git commit --only -F ${messageFile} -- ${files.join(' ')}`);
  gitOk(['commit', '--only', '-F', messageFile, '--', ...files]);
}

function rewordAtPosition(positionFromHead, messageFile) {
  if (positionFromHead === 0) {
    console.log(`git commit --amend --only -F ${messageFile}`);
    gitOk(['commit', '--amend', '--only', '-F', messageFile]);
    return;
  }

  const target = gitOk(['rev-parse', `HEAD~${positionFromHead}`]);
  const parentTry = gitTry(['rev-parse', `${target}^`]);
  const isRoot = !parentTry.ok;
  const upstream = isRoot ? '--root' : parentTry.stdout;

  const sequenceEditor = `sed -i.bak '1s/^pick/reword/'`;
  const messageEditor = `cp '${messageFile}'`;

  const treeBefore = gitOk(['rev-parse', 'HEAD^{tree}']);
  const countBefore = gitOk(['rev-list', '--count', 'HEAD']);

  console.log(
    `GIT_SEQUENCE_EDITOR="${sequenceEditor}" GIT_EDITOR="${messageEditor}" git rebase -i ${upstream}`,
  );

  const result = spawnSync(
    'git',
    ['rebase', '-i', ...(isRoot ? ['--root'] : [upstream])],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_SEQUENCE_EDITOR: sequenceEditor,
        GIT_EDITOR: messageEditor,
      },
    },
  );

  if (result.status !== 0) {
    const output = `${result.stderr || ''}${result.stdout || ''}`.trim();
    gitTry(['rebase', '--abort']);
    fail(
      result.status || 1,
      `Reword rebase failed; the rebase was aborted and the branch is unchanged:\n${output}`,
    );
  }

  const treeAfter = gitOk(['rev-parse', 'HEAD^{tree}']);
  const countAfter = gitOk(['rev-list', '--count', 'HEAD']);
  if (treeAfter !== treeBefore || countAfter !== countBefore) {
    fail(
      1,
      'Post-check failed: branch content changed unexpectedly; inspect "git reflog" to recover.',
    );
  }
}

function rewordHash(hash, messageFile) {
  const resolved = gitOk(['rev-parse', '--verify', `${hash}^{commit}`]);
  const head = gitOk(['rev-parse', 'HEAD']);
  if (resolved === head) {
    rewordAtPosition(0, messageFile);
    return;
  }

  assertChecksPass(runPrerequisiteChecks(resolved));

  const positionFromHead = Number(
    gitOk(['rev-list', '--count', `${resolved}..HEAD`]),
  );
  rewordAtPosition(positionFromHead, messageFile);
}

function rewordUnpushed(messagesDir, skipValidate) {
  const hashes = getUnpushedCommits();
  if (hashes.length === 0) {
    fail(1, 'No unpushed commits to reword.');
  }

  for (const checkHash of hashes) {
    assertChecksPass(runPrerequisiteChecks(checkHash));
  }

  const total = hashes.length;
  for (let index = 0; index < total; index++) {
    const hash = hashes[index];
    const summary = commitSummary(hash);
    const messagePath = join(messagesDir, `${summary.shortHash}.md`);
    if (!existsSync(messagePath)) {
      fail(2, `Missing message file for ${summary.shortHash}: ${messagePath}`);
    }
    const { title, bullets } = validateMessageFile(messagePath, skipValidate);
    const tempMessage = writeTempGitMessage(title, bullets);
    const positionFromHead = total - 1 - index;
    console.log(`Rewording ${summary.shortHash} at HEAD~${positionFromHead}`);
    rewordAtPosition(positionFromHead, tempMessage);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureGitRepo();

  if (options.rewordUnpushed) {
    rewordUnpushed(options.messagesDir, options.skipValidate);
    console.error('✅ Reworded unpushed commits.');
    return;
  }

  const { title, bullets } = validateMessageFile(
    options.messageFile,
    options.skipValidate,
  );
  const tempMessage = writeTempGitMessage(title, bullets);

  if (options.rewordHead) {
    assertChecksPass(runPrerequisiteChecks('HEAD'));
    rewordAtPosition(0, tempMessage);
    console.error('✅ Reworded HEAD.');
    return;
  }

  if (options.rewordHash) {
    rewordHash(options.rewordHash, tempMessage);
    console.error(`✅ Reworded ${options.rewordHash}.`);
    return;
  }

  runGitCommit(tempMessage, options.files, options.all);
  console.error('✅ Created commit.');
}

main();
