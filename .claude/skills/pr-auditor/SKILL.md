---
name: pr-auditor
description: Blunt merge audit of a code branch or pull request written by an AI coding agent, treating its description, comments, and green checks as claims to verify, and reporting severity-ranked findings without editing anything. Use when the user asks to audit, review, or gate a diff, wants a merge-readiness verdict, or suspects AI-generated defects such as an invented API, a silent fallback, a coordinate that was never verified against the printed form, or real PII in a tracked file.
---

# PR auditor

Gate a merge the way a skeptical staff engineer would: decide whether this branch is safe to merge, and justify the verdict from the code's actual behavior.

An AI coding agent wrote this branch.
So the pull request description, the commit messages, the code comments, and the green checks are **claims** rather than facts, each one asserted by the agent about its own work.
Confirm or refute every claim against the code.
In this repository the green CI check is an especially weak claim: CI only proves that the PDF builds from `config.yaml`, never that a single coordinate lands where the printed form needs it.

Three rules hold for the whole run.

* **Blunt.** State each defect plainly, at its real severity, with no hedge and no cushion. Praise only what is technically load-bearing. A softened finding is a finding nobody fixes.
* **Reproduce.** Prefer reproducing a defect over reasoning about it: regenerate the PDF, run the script, revert the hunk, grep for the caller. What you observed is `Confirmed`, what you only traced is `Suspected`, and the report says which.
* **Report only.** Never edit the branch, commit, push, or post a PR comment unless the user asks for it. Never make a defect go away by weakening a check, widening an exception, or adding a fallback.


## Step 0: The privacy gate

Run this before anything else, because a leak outranks every other finding and CI publishes the sample output as a **public** GitHub Release.

* Scan every tracked change in the diff for real PII: names, birthdates, addresses, phone numbers, and family register (本籍) values. `config.yaml` must contain placeholders only.
* `git ls-files 'config-private*' 'result*'` must print nothing; a private config or a generated PDF that became tracked is a leak even when its content looks like a sample.
* `git check-ignore config-private.yaml result-red-00-00-00.pdf` must report both as ignored; a `.gitignore` edit that narrows either pattern is a leak waiting to happen.
* Check the diff of every CI workflow: a change that makes CI read anything other than `config.yaml`, or publish anything beyond the sample PDF, widens the public surface.

Real PII in any tracked file, or a change that lets CI publish it, is a Confirmed **Critical** finding, and the report leads with it.


## Step 1: Establish the target and the intended behavior

Resolve four inputs: the branch or pull request under audit, the base branch, the linked issue or ticket (see `docs/`), and any extra context the user gave.
Default to the current branch against `main`.
Name whatever you assumed and proceed; do not stall on a missing input.

```bash
PR=123 # the pull request number under audit

gh auth status
gh pr view "$PR" --json title,body,baseRefName,headRefName,files,commits
gh pr diff "$PR"
```

Fall back to `git log --oneline origin/main..HEAD` and `git diff origin/main...HEAD` when there is no pull request, or when `gh` is unavailable or unauthenticated.
With no shell at all, treat the diff presented to you as complete, and record in the report that every command gate below became an inspection.

The description says what the agent believes it built; the issue or ticket says what was asked for.
Where the two disagree is the first place a plausible implementation hides.

Done when you can state the intended behavior and the change actually made in one sentence each, and have named every input you assumed.


## Step 2: Read past the diff

A diff shows what changed and never whether the change is right.
For every symbol the diff touches, read four things outside the changed hunks.

* **Callers.** `grep -rn '<symbol>' --exclude-dir=node_modules .` for each renamed, retyped, or removed symbol, so a signature change cannot silently strand one.
* **The whole module,** not the hunk, because the invariant a change breaks usually lives above or below it. For a layout change that means the header comment of `src/layout/<variant>.yaml`, which records the measured grid and every quirk of that template.
* **The nearest existing implementation of the same kind of thing:** the sibling section function in `src/main.js`, or the same entry in another template's layout file, which is the convention this change is supposed to match. Remember that husband and wife share one section function and differ only in layout data.
* **The documentation that covers it:** `AGENTS.md`, `config.yaml` comments, and both READMEs, and what they actually promise.

Done when every changed symbol has its callers enumerated, and you can name the repository convention each changed file is supposed to follow.


## Step 3: Run the gates

An unrun gate is not a pass, and a passing gate is not a correct change.
Run each command from the repository root, or record the gate as unverified.
Always pass `config.yaml` explicitly and write output to the scratchpad with `-o`, so an audit never reads a private config and never drops a PDF into the repository root.

| Gate                                                                            | Catches                                                                        | Note                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `node src/main.js config.yaml -o <scratchpad>/audit-red.pdf`                    | A broken generate path, an invalid config key, a layout that fails validation  | The same command every CI workflow runs                                                                    |
| `node src/main.js config.yaml -t <variant> -o <scratchpad>/audit-<variant>.pdf` | The same breakage in a specific template                                       | Run for every variant whose layout, template PDF, or `package.json` scripts the diff touches               |
| `node src/main.js --list-templates`                                             | Broken template discovery after a rename or addition                           | A bundled template must also ship its three `<variant>:*` scripts                                          |
| `node src/main.js --init-layout -t <variant>`                                   | An invalid `src/layout/<variant>.yaml`                                         | Validates only the layout file itself, never a `layout:` override block inside a config                    |
| `pnpm lint`                                                                     | Prettier and markdownlint drift, including curly quotes and em dashes in `.md` | Autofixing: run only on a clean tree, read the resulting diff as the finding, restore with `git restore .` |
| Open every generated audit PDF                                                  | A coordinate that lands on the wrong printed box                               | There is no test suite; visual inspection is the only behavioral check the layout data has                 |

To check a placement without eyeballing it, `pdftotext -bbox-layout src/template/jp-marriage-registration-black.pdf out.xhtml` lists every printed label with exact coordinates; the `black` template has a text layer, `red` does not, and `pdftotext` measures y from the top of the page while the layout files measure it from the bottom (`y_layout = page_height - y_pdftotext`).

A failing gate is a finding only when this branch caused it, so reproduce it on the base ref before reporting it.

```bash
git status --porcelain # must print nothing before you switch refs
git switch --detach origin/main
node src/main.js config.yaml -o < scratchpad > /base.pdf # or whichever gate failed
git switch -
```

A failure that reproduces on the base is pre-existing; say so, and keep it out of the verdict.

Done when every gate above has either run or been recorded as unverified, and every failure has been classified as introduced or pre-existing.


## Step 4: Audit the change

Two passes: the lenses, then the failure modes that plausible code hides behind.


### The lenses

| Lens             | Look for                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Correctness      | A misread requirement, a logic error, an invalid assumption, an unhandled edge case, an off-by-one                                   |
| Regression       | Behavior an old config depends on: a removed key, a broken `*_pos` legacy override, a witness-less config that no longer renders     |
| Privacy          | Anything from Step 0, plus a code path that could write PII into a tracked or CI-published file                                      |
| State and timing | An unawaited promise, an order dependence between steps, a first-run copy of `config.yaml` that clobbers an existing private config  |
| Failure paths    | Error handling and what the user sees when a config key, template, font, or layout file is missing or malformed                      |
| Types and APIs   | A `pdf-lib`, `@pdf-lib/fontkit`, or `yaml` API used against its documented contract; check `node_modules`, not the name              |
| Performance      | Work repeated per field that belongs once per run, such as re-embedding the font or re-reading a file inside a loop                  |
| Reach            | Japanese text that the subset font cannot render, and drift between `README.md` and `README.en.md`                                   |
| Maintainability  | A positioning number in `main.js` instead of layout YAML, duplicated logic, dead code, naming that fights the repository's terms     |
| Scope            | Any change the stated goal does not require                                                                                          |
| Verification     | A layout or coordinate change whose PR description does not say the PDF was regenerated and inspected                                |
| Docs             | A comment, `README.md`, `README.en.md`, `AGENTS.md` section, `config.yaml` comment, or layout header that no longer matches the code |


### Where plausible code fails

**Plausible** is the failure mode, not the standard.
An AI agent optimizes for code that reads as correct, so the defects it leaves are the ones that survive a skim.
Hunt each of these by name.

* Code that satisfies the wording of the task and not the requirement behind it.
* An invented API, configuration field, flag, or library behavior. Check each against the installed source under `node_modules` or the vendor's documentation, never against how the name reads.
* A `try`/`catch`, `?.`, or `|| default` that turns a defect into a silent success, such as a missing config key that silently renders as an empty box.
* A layout entry copied verbatim from another template's file instead of measured against its own printed grid; `AGENTS.md` promises no entry is shared between templates.
* A new bundled template that leans on the `red` layout fallback, skips the conventional filename, or ships without its three `<variant>:*` scripts; that fallback exists for user-supplied PDFs only.
* A template quirk silently violated: text drawn into the cinnamoroll form's pre-printed 品川区長殿 or missing 世帯主 row, or a witness `is_banchi_address` set on the black form, whose witness row prints no 番地/番/号.
* A second implementation of a utility the repository already has. Grep for the behavior before accepting a new helper.
* A test-shaped claim with nothing behind it: this repository has no test suite, so "tests pass" and a green CI check prove only that the sample PDF builds.
* A change made to turn CI green rather than to fix the behavior the failure names.
* An abstraction, refactor, or rename the task did not require, including deriving one field's position from another; every layout entry is absolute by design.
* A partial migration: the new path added, the old path left live, and callers split between the two.
* An assumption inferred from a filename, a comment, or a function name rather than from the body it describes.
* A cross-cutting change applied to some matching sites and not the rest: husband but not wife, witness1 but not witness2, one layout file but not the docs that describe it. Grep for every site and count them.

Done when every lens has been applied to the diff and every failure mode above has been checked by name, with the checks that found nothing left out of the report.


## Step 5: Confirm or downgrade every finding

Take each finding back to the code before writing any of it down.

* Can you name the input, state, or sequence that triggers it? If not, it is not a finding.
* Did you observe it or infer it? Observed is `Confirmed`, inferred is `Suspected`, and the report never blurs the two. A coordinate defect you saw in the rendered PDF is Confirmed; one you computed from the YAML alone is Suspected.
* Is the rule you cite this project's, or one you brought with you? Cite `AGENTS.md`, `.prettierrc.json5`, `.markdownlint-cli2.jsonc`, a layout header comment, or a neighboring implementation.
* Is the fix you propose the smallest safe correction, or a rewrite dressed as one?

Drop what you cannot support.
A short report of confirmed defects beats a long one padded with plausible ones.

Done when every surviving finding carries a severity, a confidence, and its evidence, and you can say why each dropped one went.


## Step 6: Report the verdict


### Severity

* **Critical.** Real PII in a tracked or CI-published file, data loss, or a crash on a common path. Must fix before merge.
* **High.** Incorrect behavior or a regression hit under realistic conditions, including a field rendered on the wrong printed box, since the output is a legal document a city office will reject. Should fix before merge.
* **Medium.** A real defect on an edge path, an unverified coordinate change, or a maintainability risk. Fix soon.
* **Low.** A minor issue with limited impact.

A style preference is not a finding unless it changes correctness, maintainability, consistency, or safety.


### Findings

Order findings by severity, highest first, and give each a stable ID (`F1`, `F2`, and so on).

* **Severity:** Critical, High, Medium, or Low
* **Confidence:** Confirmed or Suspected
* **Location:** `path:line`
* **Problem:** What is wrong
* **Impact:** What fails, and under which conditions
* **Evidence:** The code path, command output, rendered PDF, or repository convention behind the finding
* **Fix:** The smallest safe correction
* **Check:** The gate or inspection that would catch this defect and prevent its regression

Then repeat every finding in one machine-readable table, same order, one line per cell, for PR-comment automation.
Write "No findings." in place of the table when there are none.

| ID  | Severity | Confidence | Location    | Problem | Fix |
| --- | -------- | ---------- | ----------- | ------- | --- |
| F1  | ...      | ...        | `path:line` | ...     | ... |


### The verdict

Pick exactly one by this gate.

* **Block merge.** A Confirmed Critical finding stands.
* **Request changes.** A Confirmed High finding stands, or a Suspected Critical finding you could not rule out.
* **Approve with minor changes.** Only Medium and Low findings remain.
* **Approve.** Nothing meaningful remains.

An unresolved Suspected finding that could move a tier takes the more conservative verdict, and the report says so explicitly.

Close with five things: what the branch changes, the most serious risks, the changes required before merge, the checks that are missing or too weak, and the assumptions you could not verify.
With no findings at all, name what you examined and why the branch is safe.
Do not invent a finding to look thorough.
