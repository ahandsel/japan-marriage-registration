# Scripts

Helper scripts for working in this repository.
They are development tooling only: neither script takes part in generating a PDF, so a normal `./start.sh` run never calls them.

Both are zsh scripts, and both are invoked through a pnpm script rather than by path.
New tooling here should be a Node.js ES module (`.mjs`) or zsh, and should support `--help`, as described in the Scripts section of [AGENTS.md][].


## Contents

| Name                      | pnpm script  | Description                                                                                                                                                                                                                                     |
| ------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [cleanup-temp-files.sh][] | `pnpm clean` | Finds scratch files named `temp`, `temp.*`, or `temp-*`, deletes the empty ones automatically, then asks for confirmation before deleting the rest. Skips `node_modules` and does not follow symlinks. Accepts `-y`/`--yes` to skip the prompt. |
| [index.sh][]              | `pnpm index` | Reads the nearest `package.json` and prints every pnpm script next to the command it runs. Accepts `-V`/`--version`.                                                                                                                            |

[AGENTS.md]: ../AGENTS.md
[cleanup-temp-files.sh]: cleanup-temp-files.sh
[index.sh]: index.sh
