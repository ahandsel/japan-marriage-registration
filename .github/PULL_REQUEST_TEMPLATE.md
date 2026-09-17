<!-- markdownlint-disable-file MD041 -->

## What this changes

<!--
One or two sentences.
Say what the change does, not how.
-->

## Why

<!--
The problem this solves.
Link an issue or a ticket under docs/ when there is one.
-->

## How it was verified

<!--
pnpm test proves that each value lands where its layout entry says, not that the entry matches the printed form, so a green check never verifies a coordinate.
Say what you actually ran and looked at, for example:
pnpm run generate config.yaml -o /tmp/check.pdf, then inspected the 住所 rows on the black template.
-->

## Checklist

* [ ] No real personal information in any tracked file. `git ls-files 'config-private*' 'result*'` prints nothing, and every tracked config carries placeholders only.
* [ ] A coordinate or layout change was verified by regenerating the PDF and looking at it, and the template inspected is named above.
* [ ] A new layout entry was added in all four places: `src/layout.js`, `red.yaml`, `black.yaml`, and `cinnamoroll.yaml`.
* [ ] A cross-cutting change covers every matching site: husband and wife, `witness1` and `witness2`, and all three layout files.
* [ ] A documentation change was made to both `README.md` and `README.en.md`.
* [ ] `AGENTS.md` still describes the repository accurately.
* [ ] `pnpm lint` passes.
* [ ] This pull request targets `main`, and nothing was committed directly to `main`.
