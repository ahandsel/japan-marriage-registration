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
  The copy is written with `PRIVATE_CONFIG_HEADER` prepended - two comment lines
  (Japanese and English) marking the file as private and local-only.
  `--init-config` also adds that header to an existing config that lacks it; a
  normal generate run never rewrites the file.
  Never commit it, and never put real PII anywhere tracked.
* **`config.yaml` (the committed sample) must contain placeholders only** - no
  real PII. CI runs on it and publishes the output as a **public** GitHub
  Release, so treat anything in it as public.
* When generating a real form, do it locally (`./start.sh`) - never via CI.


## Stack & entry point

* **Runtime:** Node.js `>=24`, package manager **pnpm** `>=10` (`.npmrc` sets
  `engine-strict=true`). npm works as a fallback but pnpm is the default.
* **Implementation:** `src/main.js` (ESM, uses `pdf-lib` +
  `@pdf-lib/fontkit` + `yaml`). This is the only implementation, and what
  `start.sh` and all CI run.


## Common commands

```bash
./start.sh                        # install deps, generate result.pdf, open it (uses config-private.yaml)
./start.sh --template cinnamoroll # extra args are forwarded to main.js
node src/main.js                  # generate from config-private.yaml (local default)
node src/main.js config.yaml      # generate from an explicit config (what CI does)
node src/main.js --list-templates # list bundled templates
node src/main.js --init-config    # create config-private.yaml only, no PDF
pnpm run init-config              # same as --init-config
pnpm run generate                 # same as `node src/main.js`
pnpm run generate-sample          # same as `node src/main.js config.yaml`
pnpm lint                         # prettier --write + markdownlint-cli2 --fix (autofixing)
```

There is **no test suite** and no build step. To verify a change, regenerate the
PDF and inspect it visually - coordinates cannot be checked any other way. Write
throwaway output to the scratchpad with `-o`, not over `result.pdf`.


## How the code works (the important part)

`main.js` embeds the template PDF as a page-sized XObject, then draws text and
shapes on top with a small canvas shim (`makeCanvas`) that exposes a simple
drawing API (`setFont`, `drawString`, `ellipse`, `circle`).

* **Coordinates are PDF points measured from the bottom-left corner.**
  `drawString(x, y, ...)` places the text **baseline** at `(x, y)`. Increasing
  `y` moves _up_.
* **All positioning numbers are data, not code.** They live in per-template
  layout YAML files, `src/layout/<variant>.yaml`, selected by the same name
  that the `-t/--template` flag and the `template:` config key resolve (a
  template without a layout file falls back to the `simple` layout).
  `src/layout.js` loads that file, deep-merges an optional `layout:` block
  from the user config over it, applies the legacy `*_pos` overrides,
  validates the result, and returns the resolved layout object. Layout tuning
  means editing YAML, never `main.js`.
* Every layout entry is absolute: `pos: [x, y]` plus a per-field `size`, and a
  `step` (line spacing) for the multi-line fields. Circles are `[x, y, r]`;
  ellipses are two opposite bounding-box corners. Nothing is derived from
  another field's position, and husband and wife are independent sibling
  sections with identical keys.
* Each form field is one section function in `main.js` taking `(cfg, lay, cc)`:
  the config section (the text), the matching resolved layout section (the
  positions), and the canvas. Husband and wife share the same functions; their
  columns differ only in the layout data.
* `src/layout/simple.yaml` is fully tuned. `src/layout/cinnamoroll.yaml` is
  only **partially** tuned: names, kana, birth dates, addresses, 本籍,
  parents' names, the ✓ checkmarks, and the 番地/号 marks line up, but the
  届出 (notification), 続き柄, 世帯主, 国勢調査, and その他 fields still sit
  on the simple grid and need per-field tuning (see the header comment in that
  file).


## Config shape

Top-level sections: `notification`, `husband`, `wife`, `new_legally_domiciled`,
`to_live_together`, `national_census`, `other`. `husband` and `wife` share the
same keys. See `config.yaml` and the README for the full field reference. An
optional top-level `template:` key selects the template; the `-t/--template`
flag overrides it. An optional top-level `layout:` block deep-merges over the
template's layout file, so a config can nudge one coordinate without copying
the whole grid. Legacy `*_pos` values (`[x, y]` point coordinates) are still
honoured on top of the resolved layout; moving `address_first_pos` or
`legally_domiciled_first_pos` also shifts the fields that were historically
drawn relative to them, so old configs render unchanged.


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
