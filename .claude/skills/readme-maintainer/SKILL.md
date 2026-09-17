---
name: readme-maintainer
description: Audit the repository for missing or outdated top-level folder `README.md` files. Use after adding new folders, moving files between folders, renaming files, or whenever folder contents change in a way that may make existing READMEs inaccurate.
---

# README maintainer skill

Ensure every non-empty, git-tracked **top-level** folder in this repository has a `README.md` that accurately describes its contents and purpose.

This skill enforces the project rule that each top-level folder should contain a `README.md` describing its contents and purpose, and that READMEs are kept up to date with any changes to the folder's contents or purpose.

A nested folder does not get a README of its own.
It is documented in a section of its top-level parent's README instead, the way `src/README.md` covers `src/fonts/`, `src/layout/`, and `src/template/`.
Create a README inside a nested folder only when the user asks for that folder by name.


## Scope

In scope:

* Top-level folders that contain at least one file tracked by git, directly or in a subfolder (for example `scripts/`, `docs/`, `src/`).
* `.claude/skills/`, the one nested exception, whose `README.md` indexes the skills; the individual skill folders use `SKILL.md` as their entry point and never get a README.

Out of scope (skip these, do not create a README):

* The repository root (`README.md` already exists and is hand-curated).
* **Every nested folder** (for example `src/template/` or a single skill's `scripts/` folder), apart from the `.claude/skills/` exception above.
  Its contents belong in a section of the top-level parent's README.
  The user can override this for a specific folder by asking for it by name, and only that folder then comes into scope.
* Dot folders that hold tool configuration only, such as `.github/` and `.vscode/`.
* Folders that are empty or only contain other empty folders (no tracked files anywhere beneath).
* Folders that exist only because of build or cache artifacts (for example `__pycache__/`, `node_modules/`).
* Folders that contain only a single `README.md` and no other tracked content (the README would only describe itself).


## Workflow

1. **Discovery**
   * Run `git ls-files` to list all tracked files.
   * Derive the set of top-level folders that contain at least one tracked file, directly or in a subfolder.
   * Note each in-scope folder's nested subfolders, because the parent README has to cover them.
   * Filter out the folders listed in "Out of scope" above.

2. **Coverage check**
   * For each in-scope folder, check whether `<folder>/README.md` exists and is tracked by git.
   * Build a list of folders that are missing a README.

3. **Freshness check**
   * For each in-scope folder that already has a README, compare the README against the folder's current contents:
     * List the tracked files and every nested subfolder beneath it.
     * Read the README and extract the items it references (filenames, subfolder names, table rows, reference-style links).
     * Flag a README as stale when:
       * The README references files or subfolders that no longer exist.
       * Files or subfolders exist that are not mentioned in the README (when the README is structured as an index of contents).
       * A nested subfolder has no section or entry describing it.
       * The README's stated purpose contradicts what is actually in the folder.
   * Use `git log -1 --format=%cs -- <folder>/README.md` and `git log -1 --format=%cs -- <folder>` to see whether the folder changed more recently than its README; treat that as a signal to re-read, not as proof of staleness on its own.

4. **Report**

   Before making changes, present a short plan to the user:
   * Missing READMEs - list the folders.
   * Stale READMEs - list the folders and what looks out of date.
   * Folders that are up to date - one-line summary count.

   Ask the user to confirm before writing or editing files when more than a few changes are needed. For a single missing README in a folder the user just touched, proceed directly.

5. **Create or update**
   * For missing READMEs, create a new `README.md` that follows the style described below.
   * For stale READMEs, edit only the parts that are out of date. Do not rewrite the whole file when a targeted edit is enough.
   * Update any index files that link to the affected folder, for example [skills/README.md][] when adding a skill, `scripts/README.md` when adding a script.

6. **Verify**
   * Re-read every README that was created or edited.
   * Confirm that every file and subfolder reference resolves to a real path.
   * Run `pnpm lint` to catch markdown and formatting issues.


## README style

Follow the project's writing and markdown rules from `AGENTS.md`. In particular:

* Use straight quotes, not curly quotes.
* Do not use contractions.
* Use the Oxford comma.
* Use sentence case for headings.
* Use a plain hyphen, never en-dash or em-dash.
* Do not split a sentence across a line break - break only at sentence boundaries so each line contains whole sentences.
* Use `*` for unordered list items, with 2-space indentation for nested lists.
* Leave 2 blank lines above headings and 1 blank line below.
* Prefer reference-style links collected at the bottom of the file.


### Suggested structure

```markdown
# <Folder name in sentence case>

<One or two sentence description of what this folder contains and its purpose.>

## Contents

- [item-1](item-1) - <one-line description>
- [item-2](item-2) - <one-line description>
```

For folders that act as an index of many siblings (for example `skills/` or `scripts/`), use a markdown table with `Name` and `Description` columns, matching the existing convention in [skills/README.md][] and `scripts/README.md`.

For folders whose contents are tightly themed, a short prose paragraph plus a bullet list is enough.


### Folders that have nested subfolders

The parent README is the only README, so it has to carry what a nested folder's own README would have said.
`src/README.md` is the worked example of this shape:

* The `## Contents` table lists the files and the nested subfolders together, and each subfolder row is a one-liner that links down the page.
* Each nested subfolder then gets its own `##` section holding the detail: what the folder is for, its files, and the rules that apply when working in it.
* Reference-style links resolve from the parent, so a nested file is written as `layout/red.yaml`, not `red.yaml`.

Keep a subfolder section proportional to the folder.
A subfolder holding two files needs a short paragraph and a bullet list, not a section with its own subheadings.


## Edge cases

* **Renamed file or folder** - update both the folder's own README and any other READMEs or docs that link to the old path, so no reference is left dangling.
* **Folder added but not yet populated** - if the folder is tracked because of a `.gitkeep` only, skip it.
* **Folder with sensitive or generated content** - describe the purpose without listing individual files when listing them would be noisy or could leak data.
* **Conflicting prior README** - if a README looks intentionally minimal, preserve that style; do not expand it without reason.
* **Index folder with many entries** - keep entries sorted alphabetically unless the existing file uses a deliberate grouping; preserve the existing grouping.
* **A nested folder the user asks for by name** - treat that one folder as in scope, create its README, and then trim the parent's section on it to a pointer so the detail lives in one place only.
  Do not take the request as permission to add READMEs to its sibling folders.
* **A folder excluded from Prettier** - `.prettierignore` covers `src/fonts/`, so a markdown table there is never auto-aligned and fails the `MD060` table-column-style rule. Use a bullet list in such a folder instead.


## Constraints

* Do not create READMEs for folders listed in "Out of scope".
* Do not create a README in a nested folder unless the user asks for that folder by name.
* Do not rewrite a README that is already accurate just to change its style.
* Do not invent descriptions for files that have not been read; open the file first.
* Do not add a table of contents to a README that is short enough to scan at a glance.

[skills/README.md]: ../README.md
