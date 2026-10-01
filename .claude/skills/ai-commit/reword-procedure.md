# Reword procedure

Reword operations are applied by [`apply-commit.mjs`][].
Do not run manual `git rebase -i` or `GIT_SEQUENCE_EDITOR` commands.


## Prerequisite checks

The gather payload and the apply script run the same checks before any reword:

* The commit exists and is reachable from `HEAD`.
* The commit is not a merge commit.
* No merge commits exist between the commit and `HEAD`.
* No rebase is already in progress.
* The working tree and index are clean.

If any check fails, stop and report it.


## Failure handling

When a reword rebase fails, `apply-commit.mjs` aborts the rebase automatically and reports the failure, leaving the branch unchanged.
After a successful rebase, it verifies that the branch tree and commit count are unchanged.
If the branch still looks wrong after a reported failure, inspect `git reflog` to recover.

[`apply-commit.mjs`]: scripts/apply-commit.mjs
