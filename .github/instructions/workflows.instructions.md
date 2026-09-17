---
applyTo: '.github/workflows/**,.github/dependabot.yml'
---

# GitHub Actions workflows

Three workflows run here, and the "CI" section of `AGENTS.md` describes them.
`pr.yml` runs the test suite and builds the PDF on a pull request and uploads it as an artifact, `push.yml` publishes it as a public release on a push to `main`, and `pr-lint-autofix.yml` runs `pnpm lint` and commits the fixes back.

* **A workflow always builds `config.yaml`**, which holds placeholders only.
  Pointing a workflow at `config-private.yaml` or any other private config would publish real personal information, and `push.yml` publishes to a **public** release.
  This is the first thing to check on any change here.
* **Pin every action to a full commit SHA**, with a trailing comment naming the version, as in `uses: actions/checkout@08c6903... # actions/checkout@v5.0.0, pinned`.
  Verify that the SHA really is the version the comment claims, rather than trusting the comment.
  A floating tag such as `@v4` is not acceptable.
* **Declare `permissions` explicitly on every workflow**, at the narrowest level that works.
  `contents: read` is enough to build; `contents: write` is required only to publish a release or to push lint fixes.
* Do not use `actions/create-release` or `actions/upload-release-asset`.
  Both were archived in 2021. `push.yml` uses `gh release create` instead.
* Never interpolate `${{ ... }}` from user-controlled data, such as a commit message or a pull request title, directly into a `run:` block.
  Pass it through `env:` and reference the shell variable, as `push.yml` does with `COMMIT_MESSAGE`.
* Every workflow runs on Node.js 24 with pnpm, and `pnpm/action-setup` takes no `version` input because it reads `packageManager` from `package.json`.
* A new or renamed workflow file, or a change to what a workflow does, updates the "CI" section of `AGENTS.md`.
* `dependabot.yml` covers both the `npm` and the `github-actions` ecosystems.
  The `github-actions` entry is what keeps the pinned SHAs current, so do not remove it.
