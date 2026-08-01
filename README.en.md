# GitHub Marriage Registration

🌐 Languages:

**English** | [日本語][]

![header][]

> Fill out your Japanese marriage registration form (`婚姻届`) in YAML and generate a PDF with a single command.

[header]: ./public/hero-img-ja.png
[日本語]: README.md


## Table of contents <!-- omit in toc -->

* [Overview](#overview)
* [Initial setup](#initial-setup)
  * [Requirements](#requirements)
  * [Steps](#steps)
  * [Dependencies](#dependencies)
* [Configuration](#configuration)
  * [Details](#details)
  * [Layout](#layout)
* [Usage - run it locally](#usage---run-it-locally)
* [Usage - run via GitHub Actions](#usage---run-via-github-actions)
* [GitHub directory](#github-directory)


## Overview

This project generates a filled-in Japanese marriage registration form (`婚姻届`) as a PDF from a single YAML file.

You describe both partners' details - names, birthdays, addresses, etc. - in the [YAML][] file, and `src/main.js` overlays that text onto the official form template and writes `result.pdf`.
The configuration is split across two files (see [Configuration](#configuration)):

* locally you use `config-private.yaml` (your details, gitignored)
* while GitHub Actions uses the sample `config.yaml`.

You can generate the PDF two ways:

* **Locally** with a one-command script (`./start.sh`), or
* **Via GitHub Actions**, which builds the PDF on every push and publishes it as a release.

[YAML]: config.yaml


## Initial setup


### Requirements

| Requirement | Version     | Notes                                                                                                                                                               |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Node.js][] | 24 or newer | `.npmrc` sets `engine-strict=true`, so older versions are rejected instead of failing later.                                                                        |
| [pnpm][]    | 10 or newer | The recommended package manager. `package.json` pins the exact version through `packageManager`, so [Corepack][] can provision it for you. npm works as a fallback. |

No other tooling is required: the Japanese fonts and the form templates are bundled in `src/`, and there is no build step.

On macOS, install both with [Homebrew][]:

```bash
brew install node pnpm
```

`brew install node` installs the latest Node.js release, which satisfies the requirement. To stay on the Node.js 24 line instead, run `brew install node@24` and follow the `PATH` instructions Homebrew prints at the end.

On other platforms, see the [Node.js][] and [pnpm][] download pages. If you already have Node.js, you can also get pnpm through Corepack instead of Homebrew:

```bash
corepack enable pnpm
```

Confirm that both tools are on your `PATH` and new enough:

```bash
node --version # v24.0.0 or newer
pnpm --version # 10.0.0 or newer
```


### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/ahandsel/japan-marriage-registration.git
   cd japan-marriage-registration
   ```

2. Create your private config file:

   ```bash
   cp config.yaml config-private.yaml
   ```

   This step is optional. If `config-private.yaml` does not exist, the first run creates it from the sample `config.yaml` for you and prints a reminder to edit it. Either way you end up with the same file, filled with the sample placeholder details.

   `config-private.yaml` is listed in `.gitignore`, so it is the one file where your real personal information belongs. See [Configuration](#configuration) for why the config is split in two.

3. Generate your first PDF:

   ```bash
   ./start.sh
   ```

   `start.sh` handles the rest for you. It installs the dependencies (pnpm if it is on your `PATH`, then Corepack, then npm), runs the generator against `config-private.yaml`, writes `result.pdf`, and opens it. At this point `result.pdf` still shows the sample placeholder details.

4. Edit `config-private.yaml` with your own details, then run `./start.sh` again. See [Configuration](#configuration) for the field reference.

If you prefer to prepare the environment yourself instead of letting `start.sh` do it:

```bash
corepack enable # optional: provisions the pinned pnpm version
pnpm install    # or: npm install
node src/main.js
```

> [!NOTE]
> `pnpm-workspace.yaml` sets `minimumReleaseAge` to three days, so pnpm ignores dependency versions published very recently. This reduces supply chain risk and is expected behavior, not an outdated lockfile.


### Dependencies

Runtime dependencies (see `package.json`):

* `pdf-lib` - draws the text overlay and merges it onto the form template
* `@pdf-lib/fontkit` - embeds the bundled Japanese font (IPAex Mincho)
* `yaml` - reads the config files (`config-private.yaml` / `config.yaml`)

Development dependencies cover formatting only (`prettier` and `markdownlint-cli2`, plus their plugins). Run `pnpm lint` to apply the autofixes before committing. There is no test suite, so verify a change by regenerating the PDF and checking it visually.

[Corepack]: https://nodejs.org/api/corepack.html
[Homebrew]: https://brew.sh/
[Node.js]: https://nodejs.org/
[pnpm]: https://pnpm.io/


## Configuration

The configuration is split across two YAML files with identical field structures:

| File                  | Role                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.yaml`         | The committed sample. Used by GitHub Actions in CI, and the file you copy from to create your private config. **Keep it placeholder-only - never put real personal information here.** |
| `config-private.yaml` | Your local file with your real details. It is gitignored and is the **default for local runs**.                                                                                        |

The first local run creates `config-private.yaml` for you by copying the sample, so there is nothing to set up by hand. To create it yourself before the first run:

```bash
cp config.yaml config-private.yaml
```

Then fill in your details in `config-private.yaml`.
Text placement (coordinates, font sizes, and line spacing) comes from a per-template layout file, `src/layout/<template>.yaml`, so the config normally holds only your details.
To nudge a field, add a top-level `layout:` block that merges over the template layout (see [Layout](#layout)).
The legacy `*_pos` fields (`[x, y]` point coordinates) still work as overrides, so existing configs keep rendering unchanged.

> ⚠️ **Privacy warning:** Pushing to `main` publishes the CI-generated PDF as a **public** [Release][].
> Put your real personal information only in `config-private.yaml` and generate the PDF locally (with `./start.sh`). Never commit or push a config that contains real PII.

Each file has the following top-level sections:

| Section                 | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `notification`          | Submission date and the municipality you file with (`to`)     |
| `husband`               | Husband-to-be's details                                       |
| `wife`                  | Wife-to-be's details                                          |
| `new_legally_domiciled` | The couple's new legal domicile (本籍) after marriage         |
| `to_live_together`      | When the couple started (or will start) living together       |
| `national_census`       | National census info (only required during the census period) |
| `other`                 | Free-text notes (e.g. old/new kanji changes, consent)         |


### Details

The `husband` and `wife` sections share the same fields. For example:

```yaml
husband:
  last_name: 山田
  last_name_pos: [220, 590]
  last_name_kana: やまだ
  last_name_kana_pos: [221, 623]
  first_name: 太郎
  first_name_pos: [300, 590]
  first_name_kana: たろう
  first_name_kana_pos: [305, 623]
  birth_year: 平成５
  birth_month: ５
  birth_day: ２１
  address_first: 東京都千代田区神田
  address_first_pos: [221, 545]
  address_second: ３丁目　４
  is_banchi_address: false
  address_go: １０
  address_apartment:
    | # Can be displayed without breaking layout if within 3 lines
    インチキタワー
    マンション
    ３６１０号室
  household_person: 山田　太郎
  legally_domiciled_first: 東京都千代田区飯田橋
  legally_domiciled_first_pos: [221, 480]
  legally_domiciled_second: ３丁目　４
  is_banchi_legally_domiciled: true
  head_of_person_of_legally_domiciled: 山田　太郎兵衛
  father_name: 山田　権左衛門
  father_name_pos: [221, 410]
  mother_name: 山田　としこ
  mother_name_pos: [221, 380]
  relationship: 長
  marital_history:
    marriage_cat: 2 # 0 = first marriage, 1 = widowed, 2 = divorced
    year: 令和3
    month: 6
    day: 1
  job_type: 6
```

Fill in the `wife` section the same way (it has the same fields, and the form's right-hand column positions come from the layout file).

[Release]: https://github.com/ahandsel/japan-marriage-registration/releases


### Layout

All drawing positions live in per-template layout files, `src/layout/simple.yaml` and `src/layout/cinnamoroll.yaml`, selected by the same name as the `-t/--template` flag or the `template:` config key.
Every entry is absolute: `pos: [x, y]` is the text baseline in PDF points measured from the bottom-left corner, `size` is the font size in points, and the multi-line fields (`address_apartment` and `other.text`) also have a `step`, the distance between lines.
Circles are `[x, y, r]`, and ellipses are two opposite bounding-box corners `[x1, y1, x2, y2]`.
The `job_type_checks` entry maps each `job_type` value (1-6) to the absolute position of its ✓ mark.

To adjust a field without editing the layout file, add a `layout:` block to your config.
It deep-merges over the template layout, so you only write the keys you want to change:

```yaml
layout:
  husband:
    last_name: { pos: [225, 592] } # nudge one field, keep everything else
```

The legacy `*_pos` keys are still honoured on top of the resolved layout.
Moving `address_first_pos` or `legally_domiciled_first_pos` also shifts the fields that were historically placed relative to them (for example `address_second` and `household_person`), so old configs render exactly as before.


## Usage - run it locally

> [!TIP]
> Use `config-private.yaml` and generate it locally to use this setup privately.

Edit `config-private.yaml` with your details, then run (if the file does not exist yet, the first run creates it from the sample):

```bash
./start.sh
```

That's it. The script installs dependencies, generates `result.pdf`, and opens it. Run with no arguments, it uses your local `config-private.yaml`. Re-run it any time you change `config-private.yaml`.

To run the generator step manually instead (after installing dependencies from [Initial setup](#initial-setup)):

```bash
node src/main.js             # uses config-private.yaml, writes result.pdf
node src/main.js config.yaml # or pass a config path explicitly
```

The same steps are also available as pnpm scripts:

```bash
pnpm run init-config     # create config-private.yaml from the sample, without generating a PDF
pnpm run generate        # generate result.pdf from config-private.yaml
pnpm run generate-sample # generate result.pdf from the sample config.yaml (what CI runs)
```

`pnpm run init-config` never overwrites an existing `config-private.yaml`, so it is safe to re-run. It only adds the header comments that mark the file as private and local-only, if they are missing:

```yaml
# ローカル実行時のみ使用される非公開の設定ファイルです。
# Private configuration file that is only used for local execution.
```


## Usage - run via GitHub Actions

Two workflows build the PDF in CI:

* **`.github/workflows/pr.yml`** - runs on every pull request against `main`, builds the PDF, and uploads it as a workflow artifact you can download from the run's summary page.
* **`.github/workflows/push.yml`** - runs on every push to `main`, builds the PDF, and publishes it as a new [Release][] (tagged with a timestamp) with `marriage_registration.pdf` attached.

Both workflows run `node src/main.js config.yaml`, building the PDF from the committed sample `config.yaml`. So the typical flow is: edit `config.yaml`, commit, and push to `main`. If all goes well, the generated PDF appears in the [Release][] section. No secrets or extra configuration are required - the workflows use the built-in `GITHUB_TOKEN`.

> [!CAUTION]
> `push.yml` publishes the generated PDF as a **public** Release, and it uses only the committed `config.yaml`.


## GitHub directory

The `.github/` directory holds the repository's GitHub automation configuration.

| File                                    | Trigger                                   | Role                                                                                                                                                                    |
| --------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/dependabot.yml`                | Daily (scheduled)                         | [Dependabot][] config. Checks the `npm` ecosystem (which covers pnpm) daily and opens pull requests when dependency updates exist.                                      |
| `.github/workflows/pr.yml`              | Pull requests against `main`              | Builds the PDF with `node src/main.js config.yaml` and uploads it as a workflow artifact (`marriage_registration`). Download `result.pdf` from the run's summary page.  |
| `.github/workflows/push.yml`            | Pushes to `main`                          | Builds the PDF and creates a **public** [Release][] tagged with a timestamp, with `marriage_registration.pdf` attached.                                                 |
| `.github/workflows/pr-lint-autofix.yml` | Pull requests (opened, updated, reopened) | Runs `pnpm lint` (Prettier and markdownlint), then commits and pushes the autofixes back to the PR branch. Runs only for pull requests from within the same repository. |

All workflows run on Node.js 24 with pnpm and authenticate with the built-in `GITHUB_TOKEN`, so no extra secrets are required.

[Dependabot]: https://docs.github.com/code-security/dependabot
