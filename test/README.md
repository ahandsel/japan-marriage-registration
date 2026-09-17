# Tests

The test suite for the generator.
It runs on the test runner built into Node.js (`node:test`), so it adds no dependency, and `pnpm test` runs it.

```bash
pnpm test                                                    # the whole suite
node --test test/cli.test.mjs                                # one file
node --test --test-name-pattern=witness 'test/**/*.test.mjs' # tests whose name matches
```

Every test runs the real code.
The layout tests import `src/layout.js` directly, and every other test runs `src/main.js` as a child process and checks its exit code, its messages, and the files it writes.
Nothing here writes into the repository: commands that create files (`--init-config`, `--init-layout`, the first-run scaffold) run inside a throwaway copy of `src/` under the OS temp directory, and generated PDFs go there too.


## What the suite proves, and what it does not

The render tests read the generated PDF back with `pdftotext` and check that every value from the config lands at the position its layout entry names, on every bundled template, within 0.75 points.
That proves the text landed where the layout file says.
It does not prove that the layout file matches the printed form: a coordinate is still verified only by regenerating the PDF and looking at it, as [AGENTS.md][] says.

`pdftotext` comes with poppler (`brew install poppler` on macOS, `apt-get install poppler-utils` on Debian and Ubuntu).
Without it the placement tests are skipped, not failed, and the rest of the suite still runs.


## Contents

| Name                | What it covers                                                                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [helpers.mjs][]     | Shared helpers: running `main.js`, the sandbox copy, reading words and their boxes back from a PDF with `pdftotext`, and the list of words `main.js` is expected to draw for a config on a layout.                                                                                                                |
| [cli.test.mjs][]    | The command line: `--help`, `--list-templates`, generating every tracked config, the `-t` and `-o` flags, every config error (missing key, null value, bad `marriage_cat`, invalid `layout:` block, malformed `*_pos`), and the scaffolding commands in a sandbox.                                                |
| [layout.test.mjs][] | `src/layout.js` in-process: every bundled layout validates, husband and wife share one key set, no entry is shared verbatim between templates, every coordinate is on the page, `layout:` blocks merge without leaking, and the legacy `*_pos` overrides shift the right fields on red and are ignored elsewhere. |
| [render.test.mjs][] | The produced PDF: one page of the template's size with IPAex Mincho embedded, every value at its layout position on all three templates, the ✓ marks for surname, marital history, and job type, blank values drawing nothing, and `*_pos` and `layout:` overrides moving the output.                             |
| [repo.test.mjs][]   | Repository hygiene: nothing private is tracked and `.gitignore` covers the private names, the tracked configs match the sample's key set and keep their documented blanks, `package.json` scripts are sorted, helper script versions match their history, workflows pin SHAs, and the README pair cross-links.    |

The `test.todo` entries in `cli.test.mjs` record inputs the audit found ending in a raw stack trace rather than a `❌` message.
They are not run; turn one into a test once `main.js` handles that input.


## Adding a test

* Put a CLI behaviour in `cli.test.mjs`, a loader rule in `layout.test.mjs`, a rendering check in `render.test.mjs`, and a rule about the tracked files in `repo.test.mjs`.
* Derive a config from a tracked sample with `writeConfig` instead of committing a fixture, so the tracked configs stay the single source of placeholder data.
* Use `makeSandbox` for anything that writes a file, and `makeTempDir` for output PDFs.
* Never put real personal information in a test, and never print a value from a local `config-private*.yaml` in an assertion message.

[AGENTS.md]: ../AGENTS.md
[helpers.mjs]: helpers.mjs
[cli.test.mjs]: cli.test.mjs
[layout.test.mjs]: layout.test.mjs
[render.test.mjs]: render.test.mjs
[repo.test.mjs]: repo.test.mjs
