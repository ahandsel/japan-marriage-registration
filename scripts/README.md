# Scripts

Helper scripts for working in this repository.
None of them takes part in generating a PDF, so a normal `./start.sh` run never calls them.

Two are zsh scripts and one is a Node.js ES module, and each is invoked through a pnpm script rather than by path.
New tooling here should be a Node.js ES module (`.mjs`) or zsh, and should support `--help`, as described in the Scripts section of [AGENTS.md][].


## Contents

| Name                        | pnpm script               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [cleanup-temp-files.sh][]   | `pnpm clean`              | Finds scratch files named `temp`, `temp.*`, or `temp-*`, plus `import.csv`, `import.md`, `.DS_Store`, and the `.pnpm-store` directory. Deletes the empty files automatically, then asks for confirmation before deleting the rest. Always scans from the repository root, skips `node_modules`, and does not follow symlinks. Accepts `-y`/`--yes` to skip the prompt and `-n`/`--dry-run` to list without deleting.                                                                                                                       |
| [index.sh][]                | `pnpm index`              | Reads the nearest `package.json` and prints every pnpm script next to the command it runs. Accepts `-V`/`--version`.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [migrate-config-keys.mjs][] | `pnpm run migrate-config` | Renames the old config keys (for example `address_first` and `notification`) to their current names, in place, using the table in `src/renamed-keys.js`. Keeps every comment, blank line, and value, and converts the three values that changed shape (`true`/`false` banchi flags, `marriage_cat` numbers, and `is_husband_lastname`). With no file, it migrates every `config-private*.yaml` in the repository root. Prints key paths only, never a value. Accepts `-n`/`--dry-run`, `--layout` for a layout file, and `-V`/`--version`. |

[AGENTS.md]: ../AGENTS.md
[cleanup-temp-files.sh]: cleanup-temp-files.sh
[index.sh]: index.sh
[migrate-config-keys.mjs]: migrate-config-keys.mjs
