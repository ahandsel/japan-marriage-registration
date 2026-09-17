---
applyTo: 'scripts/**,start.sh,package.json'
---

# Scripts and repository automation

The "Scripts" section of `AGENTS.md` sets the authoring rules, and `.claude/skills/script-auditor/SKILL.md` enforces them.
The existing helpers are `scripts/cleanup-temp-files.sh` and `scripts/index.sh`, both zsh, invoked through `pnpm clean` and `pnpm index`.
No workflow runs any of them, so a script reaches users on review alone.

* New helper scripts use Node.js ES modules (`.mjs`) or zsh by default.
  Python is not allowed, because of the overhead of managing Python environments across machines.
  Prefer Node.js for file system work, string manipulation, and anything that integrates with the JavaScript tooling; prefer zsh for simple command sequences and environment setup.
* Every helper script supports `--help` and prints usage that is clear to someone who has not seen the script before.
* Every helper script carries a notes section near the top that documents its general notes, its usage, and its output.
  The existing scripts also keep a reverse-chronological version history in the form `vX.Y, YYYY-MM-DD; summary`, so a modified script bumps its version and adds an entry.
* Script output uses ✅ for success, ⚠️ for warnings, and ❌ for errors.
* `scripts/README.md` stays accurate when a script is added, renamed, or removed.
* New subprocess calls handle a nonzero exit and do not interpolate untrusted input into a shell command.
* New file operations validate their target and cannot delete or overwrite a broad directory by accident.
  `cleanup-temp-files.sh` deletes files, so review any widening of what it matches.
* The `scripts` block in `package.json` stays sorted alphabetically and uses `pnpm` rather than `npm`, `npx`, or `yarn`.
  The one npm reference in the repository is the deliberate end-user fallback in `start.sh`.
* Do not bump the `packageManager` pin as a side effect of another change.
