# Skills

Repository-local Claude Code skills.
Each subfolder holds one skill, defined by a `SKILL.md` whose frontmatter carries the `name` and the `description` that decides when the skill is used.
Nothing here takes part in generating a PDF.


## Contents

| Name                  | Description                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [pr-auditor][]        | Merge audit of a branch or pull request written by an AI coding agent. Treats the description, the comments, and the green checks as claims to verify, and reports severity-ranked findings without editing anything. |
| [readme-maintainer][] | Audit of the folder `README.md` files in this repository. Finds the folders that have no README and the READMEs that no longer match their folder's contents.                                                         |

See [AGENTS.md][] for the guidance every agent working in this repository follows.

[pr-auditor]: pr-auditor/SKILL.md
[readme-maintainer]: readme-maintainer/SKILL.md
[AGENTS.md]: ../../AGENTS.md
