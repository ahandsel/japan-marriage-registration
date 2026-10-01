---
name: ai-commit
description: Draft and apply commit messages from git changes, following the project commit style guide. Use when the user asks to commit changes (--auto for no questions), or to reword commit messages (--head for all unpushed commits, --commit <hash> for one past commit).
---

# AI commit message drafter

Draft commit titles and messages from git changes and apply them, following the project commit style guide.

Every run follows the same loop: **gather** context with a script, **draft** the message file or plan file, **validate** it with a script, then **apply** with a script.
Do not hand-roll git sequences the scripts already cover.
Run every command from the repository root.


## Helper scripts

Each script supports `--help`.

| Script                            | Role                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [`gather-commit-context.mjs`][]   | Read-only. Bundles style guide, diffs, and reword checks into one payload. Supports `--max-diff-lines` for small context windows. |
| [`validate-commit-message.mjs`][] | Checks a message file against the style guide before any write.                                                                   |
| [`apply-commit.mjs`][]            | Stages files and commits one group, or rewords existing commits (message only).                                                   |
| [`apply-commit-plan.mjs`][]       | Validates a multi-commit plan JSON against the style guide and grouping rules (`--dry-run`), then applies it. Used by `--auto`.   |

[`gather-commit-context.mjs`]: scripts/gather-commit-context.mjs
[`validate-commit-message.mjs`]: scripts/validate-commit-message.mjs
[`apply-commit.mjs`]: scripts/apply-commit.mjs
[`apply-commit-plan.mjs`]: scripts/apply-commit-plan.mjs


## File formats

Write each draft to a file before validate and apply.
Store draft files outside the repository (for example, in `/tmp/ai-commit/`), so they never show up as changed files in the working tree.
[message-file-format.md][] holds the message file template and the plan JSON format.
[reword-procedure.md][] holds the reword safety checks and failure recovery steps.

[message-file-format.md]: message-file-format.md
[reword-procedure.md]: reword-procedure.md


## Shared steps

These steps apply to every branch unless a branch says otherwise.

1. **Gather.** Run `gather-commit-context.mjs` for the active mode (see branches below).
   Done when the payload prints and every prerequisite check in it reports ok.
2. **Draft.** Write one message file per commit, or one plan JSON for `--auto` with several commits, from the gathered payload and any user notes.
   Follow the [drafting rules](#drafting-rules) and the resolved style guide.
   Done when every in-scope change is covered by a draft.
3. **Validate.** For message files, run `validate-commit-message.mjs --file <path>` on each file.
   For a plan file, run `apply-commit-plan.mjs --dry-run <plan>`; the dry run checks both the grouping and the message style.
   Done when every run exits 0.
4. **Apply.** Before any command that stages files, run the privacy gate below on every in-scope file, including every group in a multi-commit plan.
   Run the apply command for the active branch only when the gate passes.
   Done when the command exits 0 and the completion criterion for the branch is met.

If any script exits non-zero, stop and report its `❌` lines; do not retry with different flags.
If a reword rebase fails, follow the failure recovery steps in [reword-procedure.md][].


### Privacy gate (runs before any `git add`)

This repository handles real personal information (see the Privacy section of `AGENTS.md`).
The gitignore covers `config-private*.yaml`, `result*.pdf`, and `failed-*.pdf`, but a private config saved under any other name, or a generated PDF renamed by hand, is not ignored and would be staged by a blanket `git add`.
So before staging anything, in every mode that stages files:

1. List what would be staged: `git status --porcelain --untracked-files=all` (all of it in `--auto` mode, the in-scope files otherwise).
2. Treat a path as suspicious when it matches any of these, unless it is one of the tracked placeholder configs (`config.yaml`, `config-black.yaml`, `config-cinnamoroll.yaml`) or a bundled template under `src/template/`:
   * any `*.yaml` or `*.yml` file that is new or untracked,
   * any `*.pdf` file,
   * `save.yaml`, `p.yaml`, or any name starting with `config-private`,
   * any file whose content holds a filled-in config: real-looking names, birthdates, addresses, or 本籍 values that do not appear in the tracked sample `config.yaml`.
3. If any path is suspicious, do not run `git add`. Print the suspicious paths with a ❌ line each, explain that they may hold real personal information or a generated form, and stop. The user decides whether to gitignore, delete, or explicitly stage them; never stage them on your own, even in `--auto` mode.
4. Only when nothing is suspicious, stage the files and continue.


## Branches


### Default (no flags)

1. Gather the working tree: `node .claude/skills/ai-commit/scripts/gather-commit-context.mjs`.
2. Present changed files and a brief summary. Ask which files are in scope and for optional notes. Wait for the reply before drafting.
3. Run `pnpm lint`. Fix errors before drafting. Done when lint passes.
4. Draft one message file, validate it, then show the message to the user.
5. After approval, apply: `node .claude/skills/ai-commit/scripts/apply-commit.mjs --message-file <path> --files <in-scope files>`.

Completion criterion: one commit exists for the approved in-scope files and `git status --porcelain` shows no staged or unstaged changes for those files.


### `--head` - reword unpushed commits

Message-only. Never stage files or change tree contents.

1. Gather unpushed commits: `node .claude/skills/ai-commit/scripts/gather-commit-context.mjs --head`.
2. If the commit list is empty, stop. If any prerequisite check failed in the payload, stop and report it.
3. Present each unpushed commit with its current subject and changed files. Ask for optional notes. All unpushed commits are in scope unless the user narrows the list.
4. Skip `pnpm lint`.
5. Draft one message file per in-scope commit. Name reword files `<shortHash>.md` when applying a batch.
6. Validate each file, show all drafts, then apply after approval:
   * One commit and it is `HEAD`: `apply-commit.mjs --reword-head --message-file <path>`.
   * Otherwise: `apply-commit.mjs --reword-unpushed --messages-dir <dir>` with one `<shortHash>.md` per commit.

Completion criterion: every in-scope unpushed commit has the approved message and tree contents are unchanged (`git diff-tree` before and after matches for each hash's tree - the apply script enforces message-only rewrites).


### `--commit <hash>` - reword one commit

Like `--head`, but exactly one target. Warn when the payload reports `likelyPushed`.

1. Gather: `node .claude/skills/ai-commit/scripts/gather-commit-context.mjs --commit <hash>`.
2. If checks failed, stop. If the payload notes the target is `HEAD`, use `--reword-head` on apply.
3. Present the target commit. Ask for optional notes.
4. Skip `pnpm lint`.
5. Draft, validate, show, then apply:
   * `HEAD`: `apply-commit.mjs --reword-head --message-file <path>`.
   * Older commit: `apply-commit.mjs --reword <hash> --message-file <path>`.

Completion criterion: the target commit has the approved message and its tree is unchanged.


### `--auto` - no questions

No prompts and no confirmation. When the diff is ambiguous, pick the most defensible reading and state the assumption in the draft output.

1. **Default (`--auto` alone).** Gather, then run `pnpm lint` (include fixes it writes; stop on unfixable errors). Group changes into small atomic commits.
   * One commit: draft a message file, validate it, then apply with `apply-commit.mjs --message-file <path> --files <files>`.
   * Several commits: draft one plan JSON (see [message-file-format.md][]), validate with `apply-commit-plan.mjs --dry-run <plan>`, then apply with `apply-commit-plan.mjs <plan>`.
   * Done when `git status --porcelain` is empty.
2. **`--auto --head`.** Gather with `--head`, draft and validate every unpushed commit, apply with `--reword-unpushed` or `--reword-head`. Stop on any failed prerequisite check.
3. **`--auto --commit <hash>`.** Gather with `--commit`, draft, validate, apply with `--reword` or `--reword-head`. Stop on any failed check.


## Output format

Wrap the entire output in a single fenced code block with the `markdown` language tag.
Do not include commentary before or after the output.


### Single commit

```markdown
Title: <emoji> <commit title>

Message:

- <main change>
- <supporting change or rationale, if supported>
- <testing details, if supported>
- <risk, migration, or compatibility note, if supported>
```


### Multiple commits

```markdown
Commit plan:

1. Title: <emoji> <commit title>
   Message:
   - <main change>
   - <supporting change or rationale, if supported>

2. Title: <emoji> <commit title>
   Message:
   - <main change>
   - <supporting change or rationale, if supported>
```


### Clarifying questions

```markdown
Clarifying questions:

1. <question>
   - Option A: <answer>
   - Option B: <answer>
   - Option C: <answer>
```


## Drafting rules

* Base commit messages only on information from the gathered payload and user-provided notes. Do not invent or speculate about intent, implementation details, side effects, testing, or risk.
* Plan JSON titles and bodies follow the same style rules as message files.
* Do not copy large chunks of the diff verbatim.
* Do not mention that you are an AI.

* Never add a `Co-Authored-By:` trailer or any other AI-attribution line to a commit message.
