---
name: skills-ref
description: Validate Agent Skills folders against the Agent Skills spec, print SKILL.md frontmatter as JSON, or emit an <available_skills> XML prompt block. Use when adding or reviewing a skill, checking SKILL.md frontmatter, or generating the available-skills XML for an agent prompt.
---

# Skills-ref

Node port of the Agent Skills reference library from [agentskills/agentskills `skills-ref`][skills-ref-upstream].
Use it to check that a skill folder matches the published spec, to dump parsed frontmatter, or to build the `<available_skills>` XML block that Anthropic recommends for agent prompts.

The upstream package is Python and is marked demonstration-only.
This repo bans Python helper scripts, so the bundled CLI reimplements the same commands in Node.


## Quick start

Run the bundled script from the repository root:

```bash
# Validate one skill folder (or a path to SKILL.md).
node skills/skills-ref/scripts/skills-ref.mjs validate skills/skills-ref
pnpm skills-ref validate skills/ai-commit

# Print parsed frontmatter as JSON.
node skills/skills-ref/scripts/skills-ref.mjs read-properties skills/ai-commit

# Emit <available_skills> XML for one or more skills.
node skills/skills-ref/scripts/skills-ref.mjs to-prompt skills/ai-commit skills/en-review
```


## What it checks

`validate` reports problems as a list.
An empty list means the skill is valid.

* `SKILL.md` (or `skill.md`) exists and opens with a closed YAML frontmatter mapping.
* Required fields: `name` and `description`.
* Optional spec fields only: `license`, `allowed-tools`, `metadata`, `compatibility`.
* `name` is lowercase, at most 64 characters, letters/digits/hyphens, no leading, trailing, or consecutive hyphens, and it matches the folder name (after NFKC normalization).
* `description` is a non-empty string at most 1024 characters.
* `compatibility`, when present, is a string at most 500 characters.

Cursor-only frontmatter such as `disable-model-invocation` or `paths` is outside the spec and fails validation.


## Workflow

1. Point `validate` at the skill folder you added or changed.
2. Read the stderr list if the exit code is `1`.
3. Fix the frontmatter or folder name, then rerun until the script prints a valid-skill line.
4. Use `read-properties` when you need the parsed fields as JSON, and `to-prompt` when you need the XML block for an agent system prompt.


## Bundled resources


### scripts/skills-ref.mjs

Node CLI with the upstream commands `validate`, `read-properties`, and `to-prompt`.

Exit codes:

* `0` - success
* `1` - validation or parse error
* `2` - usage error


## Constraints

* Do not vendor the upstream Python package or add `pyproject.toml` / `uv.lock` under this skill.
* Do not add a README inside this skill folder; this `SKILL.md` is the entry point.
* Treat the [Agent Skills specification][skills-spec] as the format authority when this port and the upstream demo library disagree.

[skills-ref-upstream]: https://github.com/agentskills/agentskills/tree/main/skills-ref
[skills-spec]: https://agentskills.io/specification
