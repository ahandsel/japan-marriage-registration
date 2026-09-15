---
name: code-review
description: Audit a pull request in this repository against the merge gate and report the findings without editing anything. Use when reviewing a PR or a branch diff, and when checking article frontmatter, publish status, English and Japanese parity, or style-guide compliance on changed pages.
---

# Code review

Audit a pull request against this repository's merge **gate**, then report what fails it.

The gate has two halves.
The automated half is `pnpm check` and the PR linter, which cover formatting, the build, parity, and redirects.
This skill owns the other half: whether each changed page is correct, publish-ready, and consistent with the product and the style guides.

**Report only.**
Never edit a file, never commit, and never push.
Publishing a page and rewording reader-facing copy are the author's calls, so hand back each finding with the exact fix rather than applying it.

Two rules hold for the whole run.

* **Evidence.** Every finding names a `path:line`, a command's output, or the row of a canonical source it contradicts. A finding you cannot cite is a suspicion, not a finding.
* **Canonical.** The sources named below hold the rules. Cite them instead of restating a rule from memory, and when a repo skill owns a domain, load that skill rather than re-deriving what it knows.


## Step 1: Establish the diff

Collect the complete list of changed paths.

```bash
PR=123 # the pull request number under review

gh auth status
gh pr diff "$PR" --name-only
gh pr view "$PR" --json title,body,files
```

Fall back to `git diff --name-only origin/main...HEAD` when `gh` is unavailable or unauthenticated.
With no shell at all, treat the changed files presented to you as the complete diff, and record in the report that every command gate below became an inspection.

Then read past the diff.
A page's frontmatter, its counterpart in the other language, and the pages it links to all sit outside the changed hunks and all decide whether the change is correct.

Done when you hold the full list of changed paths and know whether a shell is available.


## Step 2: Run the automated gates

An unrun gate is not a pass.
Run each command from the repository root, or use the substitute and mark the gate unverified.

| Gate                                                                                       | Catches                                                                                                 | Without a shell                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm lint-contents`                                                                       | Prettier and markdownlint violations, including curly quotes, em and en dashes, and non-breaking spaces | Scan the diff for those characters and for heading blank-line spacing  |
| `pnpm check-en-ja-parity`                                                                  | A page with no counterpart, and a pair disagreeing on `excludeFromSidebar`, `order`, or `mermaidHeight` | Pair each changed page by path and compare those three fields yourself |
| `node skills/vitepress-include-lint/scripts/check-vitepress-includes.mjs --paths contents` | A malformed `<!--@include: ...-->` directive or an unresolvable target                                  | Check each include directive in the diff for spacing and a real target |
| `pnpm lint-naming`                                                                         | File and folder names that break the naming rules                                                       | Check new paths for kebab-case and for `.yaml` over `.yml`             |
| `pnpm tree`                                                                                | A stale `docs/site-structure.md` after a page is added, removed, renamed, or moved                      | Confirm the PR commits a regenerated `docs/site-structure.md`          |
| `pnpm check-redirect-coverage --base origin/main`                                          | A moved or deleted page whose old URL now 404s                                                          | Look for a rule in `contents/public/_redirects` covering each old URL  |
| `pnpm test` and `pnpm typecheck`                                                           | Broken check scripts, config, theme, or Pages Functions                                                 | Mark unverified                                                        |
| `pnpm vitepress-build`, then `pnpm check-llms-output` and `pnpm check-redirect-targets`    | An invalid `status` value, a page missing from `llms.txt`, and dead or 404 redirect rules               | Mark unverified                                                        |

`pnpm lint-contents` and `pnpm tree` write files, so run them on a clean tree and read the resulting diff as the finding rather than committing it.
The parity check reads tracked files only, so an unstaged new page shows up as an orphan; stage the PR's files before trusting its output.

Done when every gate above has either run or been recorded as unverified.


## Step 3: Route every changed path

Send each changed path to the canonical source that governs it.

| Changed path                             | Canonical rules                                                                                                         | Load                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `contents/en/**.md`, `contents/ja/**.md` | Step 4 below                                                                                                            | `en-review`, `jp-markdown-doc-reviewer` |
| A page added, moved, renamed, or deleted | The "Bilingual synchronization" section of `AGENTS.md`                                                                  | `docs-sync-en-ja`                       |
| `contents/.vitepress/**`                 | `docs/installation.md`, and the "LLM-facing Markdown output" section of `AGENTS.md`                                     | -                                       |
| `contents/snippets/**`                   | `contents/snippets/README.md`                                                                                           | -                                       |
| `scripts/**`, `skills/*/scripts/**`      | The "Scripts" section of `AGENTS.md`                                                                                    | `script-auditor`                        |
| `skills/**`, `agents/**`                 | The "Skills" and "Agents" sections of `AGENTS.md`                                                                       | `skill-allowlist-syncer`                |
| `.github/workflows/**`                   | The "Continuous integration" section of `AGENTS.md`, and the `paths` mirror pinned by `tests/pr-linter-mirror.test.mjs` | `prompts/audit-gh-workflow.prompt.md`   |
| Any changes                              | Readability, and no nested ternary operators                                                                            | `pr-auditor`                            |
| A folder gaining or losing files         | The folder's own `README.md`                                                                                            | `readme-maintainer`                     |

Open `memory/MEMORY.md` and read the memory files that touch the PR's subject.
They hold the terminology and UI-label calls that no style guide records.

Done when every changed path is routed, and any path you judge to need no review is named as such in the report.


## Step 4: Audit every changed page

Three passes over each changed page under `contents/`.


### Frontmatter

Every article page carries exactly these fields.

| Field                | Required on                                                                  | Rule                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `title`              | Every page                                                                   | Sentence case. The page renders it as the H1 through `# {{$frontmatter.title}}`                               |
| `description`        | Every article page                                                           | One sentence, rendered as the lead paragraph through `{{$frontmatter.description}}`                           |
| `excludeFromSidebar` | Every article page                                                           | `true` hides the page from the sidebar. Set it explicitly, and match the counterpart page                     |
| `status`             | Every page                                                                   | One of `wip`, `ai_translated`, `dep`, `done`. Always explicit, even though a missing value defaults to `done` |
| `order`              | Every `index.md`, and any page whose sidebar position matters                | An integer that defaults to 100. Match the counterpart page                                                   |
| `mermaidHeight`      | Optional, and only on a page whose diagram needs a ceiling other than `70vh` | Any valid CSS `max-height` value. Match the counterpart page                                                  |

The two home pages, `contents/en/index.md` and `contents/ja/index.md`, are the exception: they use `layout: home` with `titleTemplate`, `hero`, and `features`, and carry neither `description` nor `excludeFromSidebar`.

Each of these is a finding: a missing field, a `status` outside the four allowed values (which throws during the build), a field set on one page of a pair but not the other, and a new page that hardcodes its H1 or lead paragraph instead of interpolating the frontmatter.


### Publish status

| Value           | Banner                    | Set it when                                                                                             |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `wip`           | Work in progress          | The page is a new draft, or its content is still incomplete                                             |
| `ai_translated` | AI translation disclaimer | The page is a machine translation. Only the translated page carries it; the source keeps its own status |
| `dep`           | Deprecated                | The page documents something that no longer exists                                                      |
| `done`          | None                      | The page is finished and ready to publish                                                               |

A page is ready for `done` only when every one of these holds.

* Its structure matches the how-to guide or the reference document template.
* Every product and feature name is the current one.
* Its counterpart page exists and says the same thing.
* No TODO comment, placeholder, or template boilerplate survives in the body.

Report a `status: wip` page that clears all five as ready to publish, and recommend the flip to `done` rather than making it.
Report a `status: done` page that fails any of them as a gate failure.
An `ai_translated` page stays as it is until a human has reviewed the translation.


### The checks no script covers

| Check                                                                                                         | Canonical source                                             |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| The table of contents lists the following H2 headings only                                                    | The same templates                                           |
| The `{Internal} Changelog` block stays in English, on Japanese pages too, and gained an entry for this change | `memory/styling-internal-changelog-english.md`               |
| Product and feature names are current                                                                         | `memory/wording-product-feature-naming.md`                   |
| One sentence per source line                                                                                  | `memory/styling-sentence-per-line.md`                        |
| Reference-style links, defined at the end of the file and sorted                                              | The "Link style guidelines" section of `docs/style-guide.md` |
| Banner, Mermaid, and status-banner usage                                                                      | `docs/style-guide.md`                                        |
| A `Badge` keeps its label in LLM output                                                                       | `memory/styling-badge-llm-only-twin.md`                      |

Done when every changed page has a verdict on all three passes.


## Step 5: Verify every finding

Go back over the findings before you write any of them down.

The characteristic failure of an audit like this one is the plausible finding: a rule that sounds like this repository's but is written nowhere, or a violation of a rule the file is exempt from.
So for each finding, name its evidence: the line you read, the command output you saw, or the row of the canonical source it contradicts.
Drop what you cannot cite.
A short report of confirmed findings beats a long one padded with guesses.

Done when every surviving finding carries evidence, and you can say why each dropped one went.


## Step 6: Report the verdict

Order findings by severity, highest first.

* **Blocker.** CI fails, the build breaks, or the page ships something wrong to readers. A missing or invalid frontmatter field, a page with no counterpart, a broken link or include, a `status: done` page that is not ready, or a former product name.
* **Should fix.** A real deviation from a canonical source that does not break the build. Template structure, wording, a mismatched UI label, or a missing changelog entry.
* **Nit.** A preference with no canonical source behind it. Say so, and keep these few.

Give each finding its severity, a `path:line`, what is wrong, the canonical source, and the exact fix.
Then close with a summary table and one verdict.

| ID  | Severity | Location    | Problem | Fix |
| --- | -------- | ----------- | ------- | --- |
| F1  | ...      | `path:line` | ...     | ... |

* **Block merge** when any blocker stands.
* **Request changes** when no blocker stands but should-fix findings remain.
* **Approve** when only nits remain, or nothing does.

End with what you could not verify and why: a gate you had no shell for, a page with no `<!-- Related Phrase Strings keys -->` block to check its labels against, or a name the Phrase copy has not caught up with yet.
With no findings at all, say what you examined and why it passes, rather than inventing a finding to look thorough.
