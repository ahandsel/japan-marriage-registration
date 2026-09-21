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

The render tests read the generated PDF back with `pdftotext` and check that every non-blank value from the config lands at the position its layout entry names, on every bundled template, within 0.75 points.
Precisely, they check the first whitespace-separated token of the first line of each value, and each ✓ mark.
The later lines of a multi-line field, the `step` values, blank values, and the 番地/番 circles and ellipses are not checked, because `pdftotext` cannot see shapes and only the first token starts at `pos`.
That proves the text landed where the layout file says.
It does not prove that the layout file matches the printed form, because the expected position is read from the same layout the PDF was drawn from: a coordinate is still verified only by regenerating the PDF and looking at it, as [AGENTS.md][] says.

`pdftotext` comes with poppler (`brew install poppler` on macOS, `apt-get install poppler-utils` on Debian and Ubuntu).
Locally, without it the placement tests are skipped, not failed, and the rest of the suite still runs.
In CI (when `CI` is set in the environment, as GitHub Actions does) a missing `pdftotext` fails the run instead, because `node:test` does not count a skipped `describe` block in its summary and the placement checks would otherwise drop out behind a green check.


## Contents

| Name                | What it covers                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [helpers.mjs][]     | Shared helpers: running `main.js`, the sandbox copy, reading words and their boxes back from a PDF with `pdftotext`, and the list of words `main.js` is expected to draw for a config on a layout.                                                                                                                                                                                                  |
| [cli.test.mjs][]    | The command line: `--help`, `--list-templates`, generating every tracked config, the `-t` and `-o` flags, every config error (empty file, missing key, null value, bad `marriage_cat` or `job_type`, invalid `layout:` block, malformed `*_pos`, unwritable `-o` path), every top-level section being optional, the missing-section note and its remedy, and the scaffolding commands in a sandbox. |
| [layout.test.mjs][] | `src/layout.js` in-process: every bundled layout validates, husband and wife share one key set, no entry is shared verbatim between templates, every coordinate is on the page, `layout:` blocks merge without leaking, the legacy `*_pos` overrides shift the right fields on red and are ignored elsewhere, and a `layout:` entry wins over a `*_pos` key for the same field with a warning.      |
| [render.test.mjs][] | The produced PDF: one page of the template's size with IPAex Mincho embedded, every value at its layout position on all three templates, the ✓ marks for surname, marital history, and job type, blank values drawing nothing, and `*_pos` and `layout:` overrides moving the output.                                                                                                               |
| [repo.test.mjs][]   | Repository hygiene: nothing private is tracked and `.gitignore` covers the private names, the tracked configs match the sample's key set and keep their documented blanks, `package.json` scripts are sorted, helper script versions match their history, `skills-ref` rejects a Unicode skill name, workflows are keyed to `main` and pin SHAs, and the docs match the code they describe.         |


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
