# Message file format

Each draft is a plain-text file passed to `validate-commit-message.mjs` and `apply-commit.mjs`.
Write draft files outside the repository (for example, in `/tmp/ai-commit/`), so they never show up as changed files in the working tree.

```markdown
Title: <emoji> <commit title>

Message:

- <main change>
- <supporting detail when supported by the diff>
```

Rules:

* The `Title:` and `Message:` labels are required.
* Every body line is a `-` bullet (a hyphen and one space).
* Keep each bullet on one line.
* Follow the resolved style guide from the gather payload for emoji choice, title length, and tone.

For `--reword-unpushed`, name one file per commit: `<shortHash>.md` inside the messages directory (for example `a1b2c3d.md`).


## Plan file format

For `--auto` runs that need several commits, write one plan JSON file instead of separate message files.
`apply-commit-plan.mjs` validates the plan and applies it.

```json
{
  "commits": [
    {
      "title": "📝 Update onboarding guide",
      "body": "- Rewrite the setup steps for clarity",
      "files": ["ONBOARDING.md"]
    },
    {
      "title": "🔧 Add lint script",
      "files": ["package.json"]
    }
  ]
}
```

Rules:

* `title` follows the same style rules as a message file title (one allowed emoji, 50 characters or fewer, no trailing period).
* `body` is optional; when present, it holds the `-` bullets joined with `\n`.
* `files` lists the changed files the commit owns, as paths relative to the repo root.
* Assign each changed file to exactly one commit; the script rejects duplicates, unchanged files, and (without `--partial`) unassigned files.

Validate with a dry run first, then apply:

```bash
node .claude/skills/ai-commit/scripts/apply-commit-plan.mjs --dry-run /tmp/ai-commit/plan.json
node .claude/skills/ai-commit/scripts/apply-commit-plan.mjs /tmp/ai-commit/plan.json
```

The dry run validates the plan structure, the file grouping, and the message style (allowed emoji, title length, no trailing period, and `-` bullets).
