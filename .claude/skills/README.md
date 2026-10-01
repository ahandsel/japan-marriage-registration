# Skills

Repository-local Claude Code skills.
Each subfolder holds one skill, defined by a `SKILL.md` whose frontmatter carries the `name` and the `description` that decides when the skill is used.
Nothing here takes part in generating a PDF.


## Contents

| Name                  | Description                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ai-commit][]         | Drafts, validates, and applies commits with bundled Node scripts. Supports automatic grouping and message-only rewording, while preserving the repository privacy gate.                                               |
| [pr-auditor][]        | Merge audit of a branch or pull request written by an AI coding agent. Treats the description, the comments, and the green checks as claims to verify, and reports severity-ranked findings without editing anything. |
| [readme-maintainer][] | Audit of the top-level folder `README.md` files in this repository. Finds the folders that have no README and the READMEs that no longer match their folder contents, treating a nested folder as part of its parent. |
| [script-auditor][]    | Audit of the helper scripts against the "Scripts" guidelines in `AGENTS.md`, with a bundled `.mjs` checker for language, `--help`, the notes section, and status emojis.                                              |
| [skills-ref][]        | Validation of skill folders against the Agent Skills spec, with a bundled Node CLI that also prints frontmatter as JSON and emits the `<available_skills>` XML block.                                                 |

See [AGENTS.md][] for the guidance every agent working in this repository follows.

[ai-commit]: ai-commit/SKILL.md
[pr-auditor]: pr-auditor/SKILL.md
[readme-maintainer]: readme-maintainer/SKILL.md
[script-auditor]: script-auditor/SKILL.md
[skills-ref]: skills-ref/SKILL.md
[AGENTS.md]: ../../AGENTS.md
