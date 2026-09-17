# AGENTS.md

Guidance for AI agents working in this repo.
Keep it accurate as the code changes.


## What this is

A generator that overlays text onto a blank Japanese marriage registration form (婚姻届) PDF template and writes a filled-in PDF.
The default output name is timestamped, `result-<template>-<HH-MM-SS>.pdf` (24-hour local time), so repeated runs never overwrite each other; `-o` overrides it, and CI pins `-o result.pdf`.
All input comes from a single YAML config.
There is no UI and no server.


## ⚠️ Privacy - read first

This project handles real personal information (PII: names, birthdates, addresses, family register/本籍).

* **`config-private.yaml` is the local file users fill with their real PII.**
  It is the default config for local runs and is **not committed** (it is gitignored and untracked).
  It is created automatically: on the first local run `main.js` copies the public sample `config.yaml` to `config-private.yaml` if it is missing, so a new user gets a ready-to-edit starting point with zero setup.
  The copy is written with `PRIVATE_CONFIG_HEADER` prepended - two comment lines (Japanese and English) marking the file as private and local-only.
  `--init-config` also tops up an existing config: it adds that header when the file lacks it, and appends every top-level section the sample has and the file does not, copied from `config.yaml` with its comments.
  That copy-once scaffold is why a config written before a section existed (the witness box, for example) stays without it, and the top-up is append-only, so the details already in the file are never rewritten or reformatted.
  A normal generate run still never rewrites the file; it only prints an ℹ️ note naming the sections the config does not have, because deleting a section is also the documented way to leave that part of the form blank.
  Never commit it, and never put real PII anywhere tracked.
* **Every tracked config must contain placeholders only** - no real PII.
  This covers `config.yaml` and the per-template samples `config-black.yaml` and `config-cinnamoroll.yaml`.
  CI runs on `config.yaml` and publishes the output as a **public** GitHub Release, so treat anything in any tracked config as public.
* The gitignore rules cover `config-private*.yaml`, `result*.pdf`, and `failed-*.pdf`, plus the ad-hoc names `save.yaml` and `p.yaml`.
  A private config under any other name is not ignored, so do not invent new filenames for real PII.
* When generating a real form, do it locally (`./start.sh`) - never via CI.


## Stack & entry point

* **Runtime:** Node.js `>=24`, package manager **pnpm** `>=10` (`.npmrc` sets `engine-strict=true`).
  `package.json` pins `packageManager` to an exact pnpm version; do not bump it as a side effect of another change.
* **Implementation:** `src/main.js` (ESM, uses `pdf-lib` + `@pdf-lib/fontkit` + `yaml`).
  This is the only implementation, and what `start.sh` and all CI run.
* `start.sh` falls back to npm when pnpm and corepack are both missing, so a user without pnpm can still run the tool.
  That fallback is for end users only: an agent working in this repo always uses pnpm.
  See the Package manager section below.


## Repo map

Beyond `src/`, these files exist and are easy to miss:

* `README.md` (Japanese) and `README.en.md` (English) are **a translated pair, and they cross-link each other**.
  A documentation change that belongs in one belongs in both, so never update only one of them.
* `src/template/marriage-registration-fields.md` is the term-by-term field reference: every Japanese label on the form, a plain-language English rendering, what the box means, and the config keys that fill it.
  Read it before guessing what a field is for.
* `docs/` holds working tickets, currently `docs/ticket-per-template-layout.md` (the per-template layout work).
* `test/` holds the test suite (`pnpm test`, Node's built-in `node:test`), with its own `README.md` describing each file and what the suite does and does not prove.
* `.claude/skills/` holds repo-local skills: `ai-commit` (commit message drafting), `pr-auditor` (merge audit of a branch or pull request), `readme-maintainer` (folder README upkeep), `script-auditor` (helper script guidelines), and `skills-ref` (skill folder validation).
* `.github/` holds the GitHub configuration: the workflows, `dependabot.yml`, `PULL_REQUEST_TEMPLATE.md`, and the Copilot instruction set.
  `.github/copilot-instructions.md` restates this document for Copilot, which does not read `AGENTS.md`, and `.github/instructions/*.instructions.md` adds path-scoped rules for the configs, the layout files, the helper scripts, and the workflows.
  A rule belongs here in `AGENTS.md` first, and those files mirror it.
* `.claude/CLAUDE.md` is a pointer file; it delegates all guidance to this document, so guidance belongs here and not there.


## Common commands

After the initial setup, everyone runs this project through pnpm, so document and suggest the pnpm script rather than the command it wraps.
pnpm passes every argument after the script name to `main.js`, so any flag works with any of these scripts.

```bash
pnpm start                         # install deps, generate result-<template>-<HH-MM-SS>.pdf, open it (runs start.sh, uses config-private.yaml)
pnpm start --template cinnamoroll  # arguments after the script name reach main.js
pnpm run generate                  # generate from config-private.yaml, without installing or opening
pnpm run generate config.yaml      # generate from an explicit config (what CI builds from)
pnpm run generate-sample           # same as `pnpm run generate config.yaml`
pnpm run generate --help           # full flag reference, printed by main.js itself
pnpm run generate -o out.pdf       # write somewhere other than the timestamped default
pnpm run generate --list-templates # list bundled templates
pnpm run init-config               # create config-private.yaml only, no PDF
pnpm run < variant > :config       # --init-config -t <variant>: create config-private-<variant>.yaml
pnpm run < variant > :layout       # --init-layout -t <variant>: scaffold or validate the layout file
pnpm run < variant > :pdf          # generate result-<variant>-<HH-MM-SS>.pdf from that template
pnpm lint                          # prettier --write + markdownlint-cli2 --fix (autofixing)
pnpm run lint-code                 # prettier only
pnpm run lint-md                   # markdownlint-cli2 only
pnpm test                          # run the test suite (node --test); pdftotext (poppler) enables the text placement checks
pnpm index                         # list every pnpm script with its command
pnpm clean                         # delete scratch files: temp*, import.csv, import.md, .DS_Store, .pnpm-store (asks first; -n lists only)
```

The pnpm scripts are thin wrappers: `./start.sh` and `node src/main.js [options] [config]` still work when you need them directly, and CI calls `node src/main.js config.yaml -o result.pdf` with no pnpm script in between.

The three `<variant>:*` scripts exist for every bundled template (`red`, `black`, `cinnamoroll`), in the order you work in: config, layout, PDF.
The `:config` and `:layout` steps are write-once and never overwrite an existing file.
A run with no explicit config path uses `config-private-<variant>.yaml` when `-t` named a variant and that file exists, and `config-private.yaml` otherwise.
Only the `-t` flag reaches that lookup: it runs before the config is parsed, so a `template:` key inside the shared config never switches to a per-template config.
`--init-layout` validates only the layout YAML file itself; a broken `layout:` override block in a private config is caught by a generate run, not by `:layout`.

There is no build step.
The test suite in `test/` runs with `pnpm test` and covers the CLI, the layout loader, repository hygiene, and, when `pdftotext` is installed, that every drawn value lands at the position its layout entry names on all three templates.
That proves the text landed where the layout file says, not that the layout file matches the printed form.
To verify a coordinate change, regenerate the PDF and inspect it visually - the tests cannot do that part.
Run `pnpm test` after a change to `main.js` or `layout.js`, and extend the suite when a rule about the tracked files changes.
Write throwaway output to the scratchpad with `-o`, not into the repo root: the timestamped default name never overwrites anything, but the files pile up.

To _derive_ a coordinate rather than eyeball it, note that some templates carry a real text layer: `pdftotext -bbox-layout <template>.pdf out.xhtml` then lists every printed label (年, 月, 日, 番地, 番, 号, the □ boxes) with exact coordinates, so a field can be placed against the label it belongs next to.
The `black` template has such a layer; `red` is a flattened Photoshop image and does not, so its grid has to be measured from a raster instead.
Remember that `pdftotext` measures y from the _top_ of the page, while the layout files measure it from the bottom: `y_layout = page_height - y_pdftotext`.


## How the code works (the important part)

`main.js` embeds the template PDF as a page-sized XObject, then draws text and shapes on top with a small canvas shim (`makeCanvas`) that exposes a simple drawing API (`setFont`, `drawString`, `ellipse`, `circle`).

* **Coordinates are PDF points measured from the bottom-left corner.**
  `drawString(x, y, ...)` places the text **baseline** at `(x, y)`.
  Increasing `y` moves _up_.
* **All positioning numbers are data, not code.**
  They live in per-template layout YAML files, `src/layout/<variant>.yaml`, selected by the same name that the `-t/--template` flag and the `template:` config key resolve (a template without a layout file falls back to the `red` layout).
  `src/layout.js` loads that file, deep-merges an optional `layout:` block from the user config over it, applies the legacy `*_pos` overrides (only when the base layout is `red` - see Config shape below), validates the result, and returns the resolved layout object.
  Layout tuning means editing YAML, never `main.js`.
* Every layout entry is absolute: `pos: [x, y]` plus a per-field `size`, and a `step` (line spacing) for the multi-line fields.
  Circles are `[x, y, r]`; ellipses are two opposite bounding-box corners.
  Nothing is derived from another field's position, and husband and wife are independent sibling sections with identical keys.
* Each form field is one section function in `main.js` taking `(cfg, lay, cc)`: the config section (the text), the matching resolved layout section (the positions), and the canvas.
  Husband and wife share the same functions; their columns differ only in the layout data.
* **The layout schema in `src/layout.js` is closed.**
  `LAYOUT_SCHEMA` (built from `PERSON_SCHEMA` and `WITNESS_SCHEMA`) lists every legal key, and `validateNode` reports both a missing key and an unknown one as an error.
  So adding one positional entry is a four-file change: the schema in `layout.js` plus an entry in `red.yaml`, `black.yaml`, and `cinnamoroll.yaml`.
  Adding it to only one layout file breaks the other two templates at generate time, not at review time.
* All three bundled layouts (`red.yaml`, `black.yaml`, `cinnamoroll.yaml`) are fully tuned: every entry was placed against its own template's printed grid, and no entry is shared verbatim with another template's file.
* The cinnamoroll form is a 品川区 layout with two fields the other forms have but it does not: the recipient 品川区長殿 is pre-printed and so `notification.to` should stay `''`, and its 住所 box has no 世帯主の氏名 row and so `household_person` should stay `''` too.
  Its spouse 住所 and 本籍 rows also pre-print 丁目 right after the chome number, so `address_second` and `legally_domiciled_second` leave 丁目 out and hold two full-width spaces in its place (`３　　４`); the witness rows are written above their printed 丁目 and keep the usual `２丁目　８` shape.
  The header comment in `cinnamoroll.yaml` records all three quirks.
* The black form is a denser grid than the red one, so `black.yaml` uses smaller sizes (names at 18pt rather than 24, kana at 9pt rather than 12) and it prints boxes the config has no keys for: the □昭和□平成 era checkboxes, □同右/□同左, the 養父/養母 rows, □未同居・未挙式, 届出人署名, and the bottom 事件簿番号 block all stay blank for handwriting.
  Its witness 住所 row prints no 番地/番/号, so a witness's `is_banchi_address` should be `null` on this template.
  The header comment in `black.yaml` records the measured grid and every one of these quirks.


## Config shape

Top-level sections: `notification`, `husband`, `wife`, `new_legally_domiciled`, `to_live_together`, `national_census`, `other`, `witness1`, `witness2`.
`husband` and `wife` share the same keys, and so do `witness1` and `witness2` (the left and right columns of the 証人 box).
The witness sections are optional: a config without them (for example one written before they existed) leaves the whole witness box blank for handwriting, and the witness `name` should stay `''` because a witness signature must be handwritten.
See `config.yaml`, `src/template/marriage-registration-fields.md`, and both READMEs for the full field reference.
An optional top-level `template:` key selects the template; the `-t/--template` flag overrides it.
An optional top-level `layout:` block deep-merges over the template's layout file, so a config can nudge one coordinate without copying the whole grid.
Legacy `*_pos` values (`[x, y]` point coordinates) are still honoured on top of the resolved layout; moving `address_first_pos` or `legally_domiciled_first_pos` also shifts the fields that were historically drawn relative to them, so old configs render unchanged.
When a `layout:` entry sets `pos` for the same field as a `*_pos` key, the `layout:` entry wins and a ⚠️ names the ignored key, because `config.yaml` ships every `*_pos` key and a `layout:` nudge on a config copied from it would otherwise silently do nothing.
The `*_pos` values are `red` coordinates by definition, so they apply only when the base layout is `red` (the red template itself, or a custom PDF on the red fallback); on any other template they are ignored with a ⚠️ warning, and `--init-config -t <variant>` strips them from the scaffolded per-template config.


## Templates & fonts

* Templates: `src/template/*.pdf`, named `jp-marriage-registration-<variant>.pdf`.
  Select by short variant name (`red`, `black`, `cinnamoroll`), full stem, or a path to any PDF.
  Default variant is `red`.
* **Adding a bundled template requires, in the same change:** the conventional `jp-marriage-registration-<variant>.pdf` filename, a fully tuned `src/layout/<variant>.yaml` (scaffold with `--init-layout`, then tune every entry against the printed form), and the three `<variant>:*` scripts in `package.json`.
  A bundled template must never rely on the `red` layout fallback; that fallback exists for user-supplied custom PDFs only.
* Japanese fonts: `src/fonts/ipaexm.ttf` (IPAex Mincho, used by JS) and `ipaexg.ttf`.
  `main.js` subsets and embeds the font so Japanese renders.
  Fonts ship under the IPA Font License (see the license files in `src/fonts/`).


## Conventions

* **Formatting is enforced.**
  Prettier: 2-space indent, single quotes (see `.prettierrc.json5`).
  Markdown: `markdownlint-cli2` (`.markdownlint-cli2.jsonc`), which notably forbids **curly quotes, em/en dashes, and non-breaking spaces** in `.md`.
  Run `pnpm lint` before committing; a CI job also autofixes and pushes.
* Match the existing style: plain functions, no classes, `node:`-prefixed builtin imports, comments that explain the _why_ of a coordinate or a quirk.
* **Branches:** day-to-day work lands on `dev`, and pull requests open against `main`, which is what every workflow is keyed to.
  Do not commit directly to `main`.
* **Commits:** never add a `Co-Authored-By:` trailer (or any other AI-attribution line) to commit messages.
  Keep the message to the title and body only.
  The same rule applies to pull request bodies, issue bodies, and comments.


## Scripts

Default to creating scripts as Node.js ES modules (`.mjs`) or zsh for any new script tooling in this repo.
The existing helpers live in `scripts/` (`cleanup-temp-files.sh` and `index.sh`, both zsh) and are invoked through the `pnpm clean` and `pnpm index` scripts.

* Do not use Python due to the overhead of managing Python environments and dependencies across different users' machines.
* Default to Node.js for scripts that involve file system operations, string manipulation, or integration with JavaScript-based tools, as it provides a consistent runtime environment and leverages the strengths of the JavaScript ecosystem for build and automation tasks.
* Use zsh for simple command sequences, environment setup, or when leveraging powerful shell features that would be more cumbersome to implement in Node.js.
* Always include `--help` output for any script, and ensure it is clear and informative for users who may not be familiar with the script's functionality.
* When writing scripts, always include a notes section near the top with:
  * General notes - a brief description of what the script does.
  * Usage - how to include or invoke the script.
  * Output - what the script generates or returns.
* For script outputs that are expected to be read by a user, use emojis to clarify messages and statuses, e.g. ✅ for success, ⚠️ for warnings, and ❌ for errors.


## Package manager

Always use `pnpm` - never `npm`, `npx`, or `yarn`.
The one npm reference in this repo is the end-user fallback inside `start.sh`, and it is not a licence to run npm yourself.
The pnpm equivalents:

* `npm install` / `yarn add` → `pnpm add` (or `pnpm install` for the whole lockfile)
* `npm run <script>` / `yarn <script>` → `pnpm run <script>` (or `pnpm <script>`)
* `npm exec <bin>` → `pnpm exec <bin>`
* `npx <pkg>` → `pnpm dlx <pkg>`

Keep scripts in `package.json` sorted alphabetically.


## CI (`.github/workflows/`)

* `pr.yml` - on PRs to `main`: run `pnpm test`, build the PDF from `config.yaml`, upload as an artifact.
* `push.yml` - on push to `main`: build the PDF and publish it as a **public** timestamped GitHub Release (`marriage_registration.pdf`).
* `pr-lint-autofix.yml` - runs `pnpm lint` on PRs and commits the fixes back.

`pr.yml` and `push.yml` run `node src/main.js config.yaml -o result.pdf` on Node 24 with pnpm, and `pr-lint-autofix.yml` runs `pnpm lint` only.
`pr.yml` also installs `poppler-utils` and runs `pnpm test` before the build, so the text placement checks run in CI.
Every workflow pins each action to a full commit SHA with a trailing comment naming the version, and declares an explicit `permissions` block.
`push.yml` creates the release with `gh release create`.


## Writing style guide

These rules apply to every text this repo produces, not only Markdown files: commit messages, pull request bodies, YAML comments, code comments, and script output.

* Use full-width punctuation for Japanese text, half-width for English.
* Use ASCII, lowercase, kebab-case for filenames, variables, and function names.
  Use camelCase for object keys.
* Add emojis to make system messages (errors, warnings, instructions) more visible and easier to understand.
* Use straight quotes, not curly quotes.
* Do not use contractions (write "do not" instead of "don't").
* Use the Oxford comma.
* Use sentence case for headings and subheadings (capitalize only the first word and proper nouns).
* Never use an en dash or an em dash; always use a plain hyphen (`-`) instead.
* Keep wording simple for non-native English speakers.
  Avoid slang and idiomatic expressions.
* Maintain consistent capitalization and punctuation throughout a document.


### Line breaks

This is the rule that is easiest to get wrong, so it is stated once, here, and nowhere else.

**Give each sentence its own source line, and never split one sentence across two source lines.**

* Do not hard-wrap by column width.
  Never break a sentence to hit a fixed width such as 76 or 80 characters, and never continue a broken sentence on an indented line.
* Use a line break only to start a new sentence, a new paragraph, a new list item, or a new heading.
* Separate paragraphs with a blank line, not with a trailing space or a manual line break.
* A multi-sentence list item follows the same rule: each sentence starts a new line, indented 2 spaces to stay inside the item.
  That indent is the only continuation line allowed, and it always starts a whole sentence, never the tail of a wrapped one.
* Do not add a trailing space or a `<br>` element to end a line, because both create a visible line break instead of a soft one.
* Inside a blockquote, repeat `>` on a continuation sentence, so the sentence stays inside the same quote.
* The rule is exempt for syntax-sensitive content, which keeps its existing line structure: frontmatter, fenced code blocks, inline code spans, tables, URLs, and YAML values.
  Do not convert a frontmatter value to a block scalar in order to split its sentences.


### Markdown

* Follow the rules defined in [.markdownlint-cli2.jsonc](.markdownlint-cli2.jsonc).
* Use `*` for unordered list items (not `-` or `+`).
* Use 2-space indentation for nested lists.
* Leave 2 blank lines above headings and 1 blank line below.
* Do not use curly quotes, em dashes, en dashes, or non-breaking spaces.
  The linter auto-corrects these.
* Inline HTML is restricted to `<br>` and `<pre>`.
