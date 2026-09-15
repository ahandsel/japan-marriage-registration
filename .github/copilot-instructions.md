# GitHub Copilot instructions

[`AGENTS.md`](../AGENTS.md) at the repository root is the primary instruction set for every AI agent working here, Copilot included.
This file exists only because GitHub does not read `AGENTS.md`: it restates for Copilot the rules that `AGENTS.md` already states for everyone else, and it adds the review guidance that is specific to Copilot code review.
Read `AGENTS.md` first when you can, treat it as authoritative wherever the two disagree, and add a new rule there rather than here.

GitHub loads this file as the repository-wide custom instruction set, so it applies to code review and to authoring alike.
Path-scoped detail lives in `.github/instructions/*.instructions.md`, and GitHub applies a scoped file on top of this one when a changed file matches its `applyTo` pattern.


## Instruction files

* [`.github/copilot-instructions.md`](copilot-instructions.md): this file, the repository-wide rules for review and authoring.
* [`.github/instructions/config.instructions.md`](instructions/config.instructions.md): the privacy rules for the config YAML files.
* [`.github/instructions/layout.instructions.md`](instructions/layout.instructions.md): the coordinate and layout-schema rules for `src/`.
* [`.github/instructions/scripts.instructions.md`](instructions/scripts.instructions.md): the authoring rules for helper scripts.
* [`.github/instructions/workflows.instructions.md`](instructions/workflows.instructions.md): the rules for the GitHub Actions workflows.

A scoped file has to sit in `.github/instructions/`, has to be named `NAME.instructions.md`, and has to declare an `applyTo` glob, with commas between multiple globs.
A file that ends in any other suffix is ignored, so a rule placed there never reaches Copilot.
On GitHub.com the scoped files load for Copilot code review and the Copilot coding agent, so keep a rule in this file when it has to reach every surface.
When you add, rename, or remove a scoped file, update the list above.


## Repository context

This repository is a generator.
It overlays text onto a blank Japanese marriage registration form (婚姻届) PDF template and writes a filled-in PDF.
There is no UI, no server, and no database.
All input comes from a single YAML config, and the only output is a PDF.

* **Entry point.** `src/main.js` is the only implementation, and it is what `start.sh` and every workflow run.
  It is ESM JavaScript on Node.js 24 or newer, and it uses `pdf-lib`, `@pdf-lib/fontkit`, and `yaml`.
* **Drawing model.** `main.js` embeds the template PDF as a page-sized XObject, then draws on top through a small canvas shim (`makeCanvas`).
  Coordinates are PDF points measured from the bottom-left corner, and `drawString(x, y, ...)` places the text baseline at `(x, y)`, so a larger `y` moves the text up.
* **Positions are data.** Every coordinate lives in a per-template layout file under `src/layout/`, never in `main.js`.
  `src/layout.js` loads that file, deep-merges a `layout:` block from the user config over it, applies the legacy `*_pos` overrides, validates the result, and returns the resolved layout.
* **Templates.** `src/template/jp-marriage-registration-<variant>.pdf`, with the bundled variants `red` (the default), `black`, and `cinnamoroll`.
  Each bundled template has a fully tuned layout file, and each form has its own quirks, which the header comment of its layout file records.
* **There is no test suite and no build step.**
  A green check never proves a coordinate is right.
  The only way to verify a positioning change is to regenerate the PDF and look at it.
* **Package manager.** pnpm, always.
  Never `npm`, `npx`, or `yarn`.
  The single npm reference in the repository is the end-user fallback inside `start.sh`.


## Privacy, which outranks everything else

This project handles real personal information: names, birthdates, addresses, and family register (本籍) values.

* `config-private.yaml` and every `config-private-<variant>.yaml` hold the user's real data.
  They are gitignored and must never be committed.
* **Every tracked config must contain placeholders only.**
  This covers `config.yaml`, `config-black.yaml`, and `config-cinnamoroll.yaml`.
  `push.yml` builds `config.yaml` and publishes the result as a **public** GitHub Release, so treat anything in any tracked config as public.
* The gitignore rules cover `config-private*.yaml`, `result*.pdf`, and `failed-*.pdf`, plus the ad-hoc names `save.yaml` and `p.yaml`.
  A private config under any other name is not ignored, so a new filename for real data is a defect.
* Real personal information in a tracked file, or a workflow pointed at a private config, is the most serious finding you can report.
  Raise it ahead of anything else.


## Review philosophy

* Report an issue only when you have high confidence that it is real and introduced or exposed by the pull request.
* Focus on correctness, user impact, privacy, security, broken documentation, and repository invariants.
* Make each comment actionable and keep one issue per comment.
* State the problem first, explain the impact when it is not obvious, and suggest a specific fix.
* Check the changed lines in their repository context before commenting.
* Do not repeat what an automated check already reports unless the failure reveals a problem that the author must reason about.
* Stay silent when you cannot identify a concrete issue.


## Sources of truth

Use these files in priority order when reviewing a change:

1. `AGENTS.md` for repository-wide requirements.
2. The `.github/instructions/*.instructions.md` file whose `applyTo` glob matches the changed path.
3. `src/template/marriage-registration-fields.md` for what a form field means and which config keys fill it.
4. The header comment of the layout file under `src/layout/` for a template's measured grid and its quirks.
5. A matching `.claude/skills/<skill-name>/SKILL.md` for task-specific requirements.
6. Existing nearby files for local implementation patterns.

Do not treat this file as a replacement for those sources.
If two sources conflict, follow the higher-priority source.
When its content is unavailable, follow the sources above rather than guessing at a rule it might contain.


## Repository invariants

These are the rules a change breaks most often here.

* **The layout schema is closed.**
  `LAYOUT_SCHEMA` in `src/layout.js` lists every legal key, and validation rejects a missing key and an unknown key alike.
  Adding one positional entry is therefore a four-file change: `src/layout.js`, plus `red.yaml`, `black.yaml`, and `cinnamoroll.yaml` under `src/layout/`.
  A change that touches only one layout file breaks the other two templates at generate time, not at review time.
* **Every layout entry is absolute.**
  Nothing is derived from another field's position, and husband and wife are independent sibling sections with identical keys.
  Reject a refactor that computes one coordinate from another.
* **A cross-cutting change covers every site.**
  The repeated pairs are husband and wife, `witness1` and `witness2`, and the three layout files.
  Changing one member of a pair and not the other is a defect.
* **`README.md` (Japanese) and `README.en.md` (English) are a translated pair.**
  A documentation change that belongs in one belongs in both.
* **A new bundled template needs three things in the same change**: the conventional `jp-marriage-registration-<variant>.pdf` filename, a fully tuned `src/layout/<variant>.yaml`, and the three `<variant>:config`, `<variant>:layout`, and `<variant>:pdf` scripts in `package.json`.
  A bundled template must never rely on the `red` layout fallback, which exists for user-supplied PDFs only.
* **Branches.** Day-to-day work lands on `dev`, and pull requests open against `main`.
  Nothing is committed directly to `main`.
* **No AI attribution.**
  Never add a `Co-Authored-By:` trailer, a "Generated with" line, or any other AI-attribution line to a commit message, a pull request body, an issue body, or a comment.


## Writing style

No automated check enforces the rules in this section, and they apply to Markdown prose and to prose comments in scripts, YAML, and other code files.

These come from `AGENTS.md`:

* Give each sentence its own source line, and never split one sentence across two source lines.
* Use a plain hyphen, never an en dash or an em dash.
* Do not reformat frontmatter, code blocks, tables, or other syntax-sensitive content to satisfy the sentence-per-line rule.
* Use sentence case for headings.
* Do not use contractions in documentation prose.
* Use the Oxford comma.
* Keep wording simple for non-native English speakers, and avoid slang and idiom.
* Use full-width punctuation inside Japanese text, and half-width punctuation inside English text.
* Add an emoji to a system message so it reads at a glance, for example ✅ for success, ⚠️ for a warning, and ❌ for an error.


## Code style

* Favor readability over cleverness.
  `src/` is plain ESM JavaScript, so there is no TypeScript and no framework to account for.
* Match the existing style: plain functions, no classes, and `node:`-prefixed builtin imports.
* Do not nest ternary operators. Use an early return or a named helper instead.
* Write a comment that explains the _why_ of a coordinate or a quirk, not what the line already says.
* Each form field is one section function in `main.js` taking `(cfg, lay, cc)`, the config section, the resolved layout section, and the canvas.
  A new field follows that shape.


## Authoring rules

Apply these when writing or editing files rather than reviewing them:

* Make the matching change to the counterpart README, `README.md` or `README.en.md`.
* Use the `.yaml` extension for YAML files unless an external platform requires another name, as `.github/workflows/*.yml` and `.github/dependabot.yml` do.
* Use ASCII, lowercase, kebab-case for filenames, variables, and function names, and camelCase for object keys.
* Keep the `scripts` block in `package.json` sorted alphabetically.
* Do not bump the `packageManager` pin in `package.json` as a side effect of another change.
* Write throwaway PDF output somewhere outside the repository with `-o`, rather than letting it pile up in the repository root.


## Low-value comments to avoid

Do not comment on:

* Formatting that Prettier or markdownlint handles.
* Curly quotes, em dashes, en dashes, and non-breaking spaces, which the markdownlint `search-replace` rules in `.markdownlint-cli2.jsonc` rewrite automatically.
* Subjective rewrites that do not improve accuracy or task completion.
* Minor naming preferences when the existing name is clear and consistent.
* Requests for comments on self-explanatory code.
* Refactoring ideas without a concrete correctness or maintainability problem.
* Missing dependencies that a clean `pnpm install` or the workflow setup will detect.
* A missing test, because this repository has no test suite.
* Several unrelated issues in one comment.


## Comment format

Use this structure when you identify an issue:

1. State the problem in one sentence.
2. Explain why it matters in one sentence when the impact is not obvious.
3. Suggest a specific change or a small replacement snippet.
