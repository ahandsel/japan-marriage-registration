# Give every template a fully tuned layout YAML


## Summary

Every bundled template should have its own `src/layout/<variant>.yaml` in which every `pos`, `size`, and `step` value is tuned against that template's printed grid. Today only `red.yaml` meets that bar. `cinnamoroll.yaml` is partially tuned: ten entries still carry the `red` coordinates verbatim, so they render in the wrong place on the Cinnamoroll form. `black.pdf` has no layout file at all, so every one of its coordinates is inherited.

Each template should also have its own pnpm scripts covering the three steps of working on it: create the config, create the layout YAML, then generate the PDF. Those scripts and the `--init-layout` flag behind them already exist in the working tree, but they were never reviewed and they carry the defects listed under [Landed tooling to re-check](#landed-tooling-to-re-check). Treat that section as work, not as background.

Do the privacy cleanup first. It is unrelated to layout tuning, but it is in the same working tree and it is the only item here that cannot be undone once pushed.


## ⚠️ Privacy cleanup (do this first)

Real personal information is currently staged for commit, and the ignore rules do not cover the filenames in use:

* `save.yaml` is staged (`git status` shows `A`) and holds real details: family name, given name, address, and both parents' names. It is a copy of `config-private.yaml` under a name that `config-private*.yaml` does not match.
* `failed-result.pdf` is staged, 264 KB, and was rendered from that same data. `result*.pdf` does not match it either.
* `p.yaml` is untracked but unignored, and carries the private-config header plus real details for both spouses. One `git add .` commits it.

Actions:

1. `git rm --cached save.yaml failed-result.pdf` before any commit on this branch. Verify with `git diff --cached --name-only` that nothing else in the index holds real data.
2. Widen `.gitignore` so the rule is about content, not two exact prefixes. Any local config or generated PDF must be ignored regardless of what it is called: keep `config-private*.yaml` and `result*.pdf`, and add the working names actually in use (`save.yaml`, `p.yaml`, `failed-*.pdf`), or move all local scratch files into one ignored directory such as `local/` and ignore that.
3. Confirm `config.yaml` (tracked, published by CI) and `config-cute.yaml` (tracked) still contain placeholders only. Both did at the time of writing.


## Current state

Templates in `src/template/`:

| Template                                   | Layout file                   | Status                                  |
| ------------------------------------------ | ----------------------------- | --------------------------------------- |
| `jp-marriage-registration-red.pdf`         | `src/layout/red.yaml`         | Fully tuned                             |
| `jp-marriage-registration-cinnamoroll.pdf` | `src/layout/cinnamoroll.yaml` | Partially tuned, 10 entries still `red` |
| `black.pdf`                                | none                          | Untuned, and misnamed                   |

All three PDFs are one A3 landscape page of the same size (1190.5 x 841.9 points), so a coordinate is never off-page; a wrong coordinate lands somewhere else on the same sheet, which is why every check here has to be visual.

A template with no layout file falls back to `red.yaml`, with a console notice (`layoutPathForTemplate` in `src/layout.js`). The fallback is fine for user-supplied custom PDFs, but a bundled template should never rely on it.


## Untuned entries in `cinnamoroll.yaml`

These entries are byte-identical to `red.yaml`, which is strong evidence they were never moved onto the Cinnamoroll grid. It is evidence, not proof: a coordinate could be correct on both forms by coincidence, so confirm each one visually rather than assuming it is wrong.

* `notification` (届出) - `year` `[141, 716]`, `month` `[181, 716]`, `day` `[210, 716]`, `to` `[141, 680]`
* `husband.relationship` / `wife.relationship` (続き柄) - `[351, 385]` and `[551, 385]`
* `national_census` (国勢調査) - `year` `[278, 186]`, `husband_job` `[258, 168]`, `wife_job` `[458, 168]`
* `other.text` (その他) - `[170, 145]`, size 12, step 15

The `notification` group is the largest move, not a nudge: the header comment in `cinnamoroll.yaml` records the form body as `y 32.7-686.8`, and those four fields sit at `y 680` and `y 716`, at or above the top edge of the body. Find where 届出年月日 and 届出先 are actually printed on this form before adjusting.

Also worth confirming visually while in there:

* `household_person` (世帯主) - `AGENTS.md` lists 世帯主 among the fields that "still sit on the red grid", but the value already differs: `[300, 512]` / `[487, 512]` on cinnamoroll against `[231, 501]` / `[432, 501]` on red. The `cinnamoroll.yaml` header comment does not name 世帯主 either way; it only says "everything else". So the `AGENTS.md` sentence is the wrong one. Confirm the position renders correctly, then fix that sentence.
* `wife.job_type_checks.positions` - these reuse the husband's x values (236.8 to 380.8) at y 213.5. The inline comment says that is intentional because the Cinnamoroll 職業 block stacks the wife's row directly under the husband's, unlike `red`. Confirm against the printed form.

To re-derive the list at any time, compare the two resolved layouts leaf by leaf rather than reading the files side by side:

```bash
node -e '
const YAML=require("yaml"),fs=require("fs");
const a=YAML.parse(fs.readFileSync("src/layout/red.yaml","utf8"));
const b=YAML.parse(fs.readFileSync("src/layout/cinnamoroll.yaml","utf8"));
(function walk(x,y,p){
  if(!x||typeof x!=="object")return;
  if(Array.isArray(x)||Array.isArray(x.pos)){
    if(JSON.stringify(x)===JSON.stringify(y))console.log(p,JSON.stringify(y));
    return;
  }
  for(const k of Object.keys(x))walk(x[k],y?.[k],p+"."+k);
})(a,b,"");
'
```

That prints exactly the ten entries above today. It should print nothing when this ticket is done.


## The `black` template

`black.pdf` was added without a layout file, without scripts, and without following the naming convention. `node src/main.js --list-templates` shows the inconsistency:

```text
black                                 src/template/black.pdf
jp-marriage-registration-cinnamoroll  src/template/jp-marriage-registration-cinnamoroll.pdf
jp-marriage-registration-red          src/template/jp-marriage-registration-red.pdf
```

`-t black` resolves and renders, because templates are keyed by file stem, but every coordinate comes from `red.yaml` via the fallback. Work needed:

1. Rename the file to `jp-marriage-registration-black.pdf` so the short variant name, the layout filename, and the script names all line up. The already-scaffolded `src/layout/black.yaml` assumes that name in its own header comment, because `scaffoldHeader` in `src/layout.js` hardcodes the prefix; today that header points at a file that does not exist.
2. Tune `src/layout/black.yaml` field by field. It is a copy of the `red` grid with a warning comment on top, so it validates and renders while being wrong everywhere.
3. Add the three `black:*` scripts.

If tuning a third grid is more than this ticket should carry, say so explicitly and either keep `black.pdf` out of `src/template/` until its layout exists, or split it into a follow-up ticket. What is not acceptable is leaving a bundled template silently borrowing another form's grid.


## Landed tooling to re-check

The scripts and flags below already exist. Nothing about them has been reviewed, so each item names what was checked and what was not.

Verified working:

* `--init-layout` on a template that already has a layout leaves the file byte-identical (md5 unchanged on `red.yaml`) and reports that it left it alone.
* `--init-layout` on a template with no layout writes a file that passes validation and renders on the next run.
* An explicit config path that does not exist fails with a clear message, not an ENOENT stack trace.

Not verified, and part of this ticket:

* **`:pdf` scripts fight the new default output name.** `main.js` now defaults to `result-<template>-<HH-MM-SS>.pdf` specifically so repeated local runs never overwrite each other, and `start.sh` reads the name back from the `Wrote:` line. The `:pdf` scripts pass `--output result-<variant>.pdf`, which throws that away and overwrites on every run. CI pins `-o result.pdf` deliberately, because the artifact and release asset names must be stable; local scripts have no such reason. Drop `--output` from all three `:pdf` scripts.
* **Scaffolded layouts are not in the repo's formatting.** `--init-layout` writes `{pos: [220, 590], size: 24}`, while the hand-tuned files and Prettier both use `{ pos: [220, 590], size: 24 }`. A freshly scaffolded file therefore fails `prettier --check` and gets rewritten by `pnpm lint` or by `pr-lint-autofix.yml`. Fix at the source: `flowCollectionPadding: true` in `toYaml` in `src/layout.js`.
* **`--init-layout` advertises a script that does not exist.** After scaffolding, it tells the user to run `pnpm run <variant>:pdf`. For a brand-new variant that script has not been added yet, so the first thing the user is told to do fails. Either print the equivalent `node src/main.js -t <variant>` command, or make adding the three scripts part of the same change and say so in the message.
* **Per-template config lookup only sees `-t`.** `resolveConfigPath` runs before the config is parsed, so it cannot consult the `template:` key. `pnpm run generate` with `template: cinnamoroll` inside `config-private.yaml` silently uses the shared config, never `config-private-cinnamoroll.yaml`. That ordering is unavoidable; document the behaviour so it is not rediscovered as a bug.
* **"Doubles as a validation check" is narrower than it sounds.** `--init-layout` resolves the layout with an empty config, so it validates the YAML file only. A broken `layout:` override in a private config is not caught. Either say so, or resolve against the config that variant would actually use.
* **The script surface now overlaps.** `cute` duplicates `cinnamoroll:pdf`, `init-config` duplicates `red:config`, and `generate` / `generate-sample` predate all of it. `config-cute.yaml` is tracked, pins `template: cinnamoroll`, and is referenced by no script at all. Decide what is retired and what is kept, then make `AGENTS.md` and both READMEs match. Retiring a documented command is a breaking change for anyone following the current README, so mention removals in the commit body.
* **`--init-config -t <variant>` was deliberately not run during review**, because it seeds from `config-private.yaml` and would have written another copy of real personal data to disk. Verify it with a placeholder `config-private.yaml`, not with real details.


## Scope

1. Tune every entry listed under [Untuned entries](#untuned-entries-in-cinnamorollyaml) against `jp-marriage-registration-cinnamoroll.pdf` and update `cinnamoroll.yaml`.
2. Remove the "⚠️ Only partially tuned" warning from the `cinnamoroll.yaml` header comment once it no longer applies, and rewrite the grid notes to describe the finished layout.
3. Give `black.pdf` a conventional filename, a tuned `src/layout/black.yaml`, and its three scripts.
4. Fix the defects under [Landed tooling to re-check](#landed-tooling-to-re-check).
5. Update the docs, which currently describe none of this: the `AGENTS.md` "How the code works" paragraph still calls cinnamoroll partially tuned and still lists 世帯主 as untuned, and the `AGENTS.md` "Common commands" list and both READMEs mention neither the per-template scripts nor `--init-layout`. Neither README ever called cinnamoroll partially tuned, so there is nothing to correct there, only something to add.
6. Establish the rule going forward, in `AGENTS.md`: adding a bundled template to `src/template/` requires, in the same change, the conventional `jp-marriage-registration-<variant>.pdf` filename, a fully tuned `src/layout/<variant>.yaml`, and the three `<variant>:*` scripts.
7. Do the privacy cleanup above.


## Per-template pnpm scripts

Each bundled template gets three scripts, named `<variant>:<step>`, in the order you actually work in: create the config, create the layout YAML, then generate the PDF.

| Script                        | Runs                                                    | Result                                                     |
| ----------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm run red:config`         | `node src/main.js --init-config --template red`         | Writes `config-private-red.yaml` when missing              |
| `pnpm run red:layout`         | `node src/main.js --init-layout --template red`         | Validates `src/layout/red.yaml`; writes it only if missing |
| `pnpm run red:pdf`            | `node src/main.js --template red`                       | `result-red-<HH-MM-SS>.pdf`                                |
| `pnpm run cinnamoroll:config` | `node src/main.js --init-config --template cinnamoroll` | Writes `config-private-cinnamoroll.yaml` when missing      |
| `pnpm run cinnamoroll:layout` | `node src/main.js --init-layout --template cinnamoroll` | Validates `src/layout/cinnamoroll.yaml`                    |
| `pnpm run cinnamoroll:pdf`    | `node src/main.js --template cinnamoroll`               | `result-cinnamoroll-<HH-MM-SS>.pdf`                        |
| `pnpm run black:config`       | `node src/main.js --init-config --template black`       | Writes `config-private-black.yaml` when missing            |
| `pnpm run black:layout`       | `node src/main.js --init-layout --template black`       | Writes `src/layout/black.yaml` on first run                |
| `pnpm run black:pdf`          | `node src/main.js --template black`                     | `result-black-<HH-MM-SS>.pdf`                              |

The `:config` and `:layout` steps are both write-once and never overwrite: layout files are hand-tuned and their per-coordinate comments would not survive a YAML round trip, and a config holds details the user typed. The `:pdf` step relies on the timestamped default output name, so nothing is overwritten there either.

Behaviour these scripts depend on, for reference:

* **`--init-config` honours `-t`.** With a template it targets `config-private-<variant>.yaml` and pins the `template:` key inside the file to that variant. It seeds from the existing `config-private.yaml` when there is one, so switching templates does not mean re-typing every detail, and from the sample `config.yaml` otherwise. Without `-t` the behaviour is unchanged.
* **Per-template config lookup.** With no explicit config argument, a run uses `config-private-<variant>.yaml` when `-t` named a variant and that file exists, and falls back to `config-private.yaml` otherwise, so a single shared config keeps working and `./start.sh` is unaffected.
* **Privacy.** Every `config-private-<variant>.yaml` holds real personal information exactly like `config-private.yaml` does, and every `result*.pdf` is a rendering of it. Both stay ignored.


## Out of scope

* Changing the layout schema.
* Removing the `red` fallback. User-supplied custom template PDFs still need it.
* Auto-tuning coordinates. `--init-layout` only scaffolds; positioning stays a manual, visual task.
* Changing the CI output name. `pr.yml` and `push.yml` pin `-o result.pdf` on purpose.


## How to verify

There is no test suite; coordinates can only be checked visually.

```bash
pnpm run cinnamoroll:config # config-private-cinnamoroll.yaml
pnpm run cinnamoroll:layout # validates src/layout/cinnamoroll.yaml
pnpm run cinnamoroll:pdf    # result-cinnamoroll-<HH-MM-SS>.pdf
```

Fill the config with a value in every affected field - 届出日、届出先、続き柄、世帯主、国勢調査の職業、その他 - and confirm each string lands inside its printed box, then repeat for `red` and `black` to confirm no regression. Use placeholder data only, and do not attach a PDF generated from real personal information to this ticket.

Also check that:

* The leaf-diff command above prints nothing for `red` against `cinnamoroll`, and nothing for `red` against `black`.
* `<variant>:layout` on a template that already has a layout leaves the file byte-identical, including its comments. Compare with `md5`, not by eye.
* `<variant>:layout` on a template with no layout file writes one that passes validation on the next run, and that the written file already passes `prettier --check`.
* Two consecutive `<variant>:pdf` runs produce two files, not one overwritten file.
* A run with no per-template config still picks up `config-private.yaml`, and `./start.sh` opens the file it actually generated.
* `node src/main.js config.yaml -o result.pdf` still works, since that is the exact command both workflows run.
* `pnpm lint` is clean. It runs Prettier first and `markdownlint-cli2 --fix` second, and markdownlint wins, so asterisk bullets and two blank lines above each heading are the committed shape for Markdown even though Prettier alone reports otherwise.


## Definition of done

* Every bundled template has its own layout YAML, and the leaf-diff command finds no entry shared with another template's grid.
* A generated PDF for each of the three templates shows every field inside its printed box.
* `black.pdf` follows the `jp-marriage-registration-<variant>.pdf` convention.
* All three templates have working `:config`, `:layout`, and `:pdf` scripts, the `:pdf` scripts no longer pin an output name, and `.gitignore` covers every file they produce.
* Scaffolded layout files pass `prettier --check` as written.
* `AGENTS.md` states the one-layout-file-per-template rule, documents the per-template scripts and `--init-layout` in "Common commands", corrects the 世帯主 sentence, and no longer flags cinnamoroll as partially tuned. Both READMEs document the scripts.
* No file holding real personal information is tracked or staged, and the ignore rules cover the local filenames actually in use.
