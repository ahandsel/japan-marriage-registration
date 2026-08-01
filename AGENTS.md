# AGENTS.md

Guidance for AI agents working in this repo.
Keep it accurate as the code changes.


## What this is

A generator that overlays text onto a blank Japanese marriage registration form (婚姻届) PDF template and writes a filled-in `result.pdf`.
All input comes from a single YAML config.
There is no UI and no server.


## ⚠️ Privacy - read first

This project handles real personal information (PII: names, birthdates, addresses, family register/本籍).

* **`config-private.yaml` is the local file users fill with their real PII.**
  It is the default config for local runs and is **not committed** (it is
  gitignored and untracked). It is created automatically: on the first local run
  `main.js` copies the public sample `config.yaml` to `config-private.yaml` if it
  is missing, so a new user gets a ready-to-edit starting point with zero setup.
  Never commit it, and never put real PII anywhere tracked.
* **`config.yaml` (the committed sample) must contain placeholders only** - no
  real PII. CI runs on it and publishes the output as a **public** GitHub
  Release, so treat anything in it as public.
* When generating a real form, do it locally (`./run.sh`) - never via CI.


## Stack & entry point

* **Runtime:** Node.js `>=24`, package manager **pnpm** `>=10` (`.npmrc` sets
  `engine-strict=true`). npm works as a fallback but pnpm is the default.
* **Canonical implementation:** `src/main.js` (ESM, uses `pdf-lib` +
  `@pdf-lib/fontkit` + `yaml`). This is what `run.sh` and all CI run.
* **Legacy:** `src/main.py` (`reportlab` + `pdfrw`, `requirements.txt`, `venv/`)
  is the original Python version being phased out. `main.js` is a line-for-line
  port of it. Prefer editing the JS; only touch the Python to keep parity if
  explicitly asked.


## Common commands

```bash
./run.sh                          # install deps, generate result.pdf, open it (uses config-private.yaml)
./run.sh --template cinnamoroll   # extra args are forwarded to main.js
node src/main.js                  # generate from config-private.yaml (local default)
node src/main.js config.yaml      # generate from an explicit config (what CI does)
node src/main.js --list-templates # list bundled templates
pnpm lint                         # prettier --write + markdownlint-cli2 --fix (autofixing)
```

There is **no test suite** and no build step. To verify a change, regenerate the
PDF and inspect it visually - coordinates cannot be checked any other way. Write
throwaway output to the scratchpad with `-o`, not over `result.pdf`.


## How the code works (the important part)

`main.js` embeds the template PDF as a page-sized XObject, then draws text and
shapes on top with a small canvas shim (`makeCanvas`) that mirrors reportlab's
API (`setFont`, `drawString`, `ellipse`, `circle`).

* **Coordinates are PDF points measured from the bottom-left corner.**
  `drawString(x, y, ...)` places the text **baseline** at `(x, y)`. Increasing
  `y` moves _up_.
* Each form field is one `*_info` function taking `(cfg, cc)`. Positions come
  either from the config (`*_pos` keys) or from **hardcoded literals** in the
  function bodies (e.g. the ✓ checkmarks, circles, birth-date columns). Most
  layout tuning means nudging those numbers by a few points.
* **The wife's column sits ~200pt to the right of the husband's.** Husband and
  wife functions are near-duplicates with shifted x-values - change both when
  adjusting shared layout.
* Coordinates are tuned for the **`simple`** template (the default). Other
  templates render but their boxes sit on a different grid, so text will not
  line up without per-template re-tuning.


## Config shape

Top-level sections: `notification`, `husband`, `wife`, `new_legally_domiciled`,
`to_live_together`, `national_census`, `other`. `husband` and `wife` share the
same keys. `*_pos` values are `[x, y]` point coordinates. See `config.yaml` and
the README for the full field reference. An optional top-level `template:` key
selects the template; the `-t/--template` flag overrides it.


## Templates & fonts

* Templates: `src/template/*.pdf`, named `jp-marriage-registration-<variant>.pdf`.
  Select by short variant name (`simple`, `cinnamoroll`), full stem, or a path
  to any PDF. Default variant is `simple`.
* Japanese fonts: `src/fonts/ipaexm.ttf` (IPAex Mincho, used by JS) and
  `ipaexg.ttf`. `main.js` subsets and embeds the font so Japanese renders.
  Fonts ship under the IPA Font License (see the license files in `src/fonts/`).


## Conventions

* **Formatting is enforced.** Prettier: 2-space indent, single quotes (see
  `.prettierrc.json5`). Markdown: `markdownlint-cli2` (`.markdownlint-cli2.jsonc`),
  which notably forbids **curly quotes, em/en dashes, and non-breaking spaces**
  in `.md`. Run `pnpm lint` before committing; a CI job also autofixes and pushes.
* Match the existing style: plain functions, no classes, `node:`-prefixed
  builtin imports, comments that explain the _why_ of a coordinate or a quirk.
* **Commits:** never add a `Co-Authored-By:` trailer (or any other AI-attribution
  line) to commit messages. Keep the message to the title and body only.


## CI (`.github/workflows/`)

* `pr.yml` - on PRs to `main`: build the PDF from `config.yaml`, upload as an
  artifact.
* `push.yml` - on push to `main`: build the PDF and publish it as a **public**
  timestamped GitHub Release (`marriage_registration.pdf`).
* `pr-lint-autofix.yml` - runs `pnpm lint` on PRs and commits the fixes back.

All workflows run `node src/main.js config.yaml` on Node 24 with pnpm.


## Note on repo state

This branch is mid-migration (Python → Node, and a config/README rename in
progress). Some docs/CI may reference `config-public.yaml` - that is the intended
new name for the committed sample currently on disk as `config.yaml`. Confirm the
actual filename before wiring anything to it.


## Writing style guide

* Do not add linebreaks in the middle of a sentence. Markdown will wrap it automatically.
* Use full-width punctuation for Japanese text, half-width for English.
* Use ASCII, lowercase, kebab-case for filenames, variables, and function names. Use camelCase for object keys.
* Add emojis to make system messages (errors, warnings, instructions) more visible and easier to understand.
* Use straight quotes, not curly quotes.
* Do not use contractions.
* Use the Oxford comma.
* Keep capitalization and punctuation consistent.
* Use sentence case for headings and subheadings (capitalize only the first word and proper nouns).
* Avoid slang and idiomatic expressions.
* Keep wording simple and clear for non-native English speakers.
* Replace any en dash with `-`.
