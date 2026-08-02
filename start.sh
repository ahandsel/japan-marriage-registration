#!/usr/bin/env bash
# One-command local runner for the marriage registration generator.
# Installs Node.js dependencies (if needed), generates the PDF (named
# result-<template>-<HH-MM-SS>.pdf unless -o is passed), and opens it.
# Re-run this any time after editing config-private.yaml.
set -euo pipefail

cd "$(dirname "$0")"

# Install/refresh dependencies (pnpm preferred; falls back to npm).
echo "==> Installing dependencies"
if command -v pnpm > /dev/null 2>&1; then
  pnpm install --silent
elif command -v corepack > /dev/null 2>&1; then
  corepack enable > /dev/null 2>&1 || true
  corepack pnpm install --silent
else
  npm install --no-audit --no-fund --silent
fi

# Generate the PDF. Extra arguments are forwarded to main.js, e.g.
#   ./start.sh --template cinnamoroll
echo "==> Generating the PDF"
generator_output="$(node src/main.js "$@")"
printf '%s\n' "$generator_output"

# main.js names the output result-<template>-<HH-MM-SS>.pdf by default (or
# whatever -o was forwarded), so read the actual name back from its last
# "Wrote: <path>" line instead of hardcoding one here.
result_pdf="$(printf '%s\n' "$generator_output" | sed -n 's/^Wrote: //p' | tail -n 1)"

if [ -z "$result_pdf" ] || [ ! -f "$result_pdf" ]; then
  echo "==> No PDF was generated (nothing to open)."
  exit 0
fi

echo "==> Done: $(pwd)/${result_pdf}"

# Open it (macOS: open, Linux: xdg-open) - skip if neither exists.
if command -v open > /dev/null 2>&1; then
  open "$result_pdf"
elif command -v xdg-open > /dev/null 2>&1; then
  xdg-open "$result_pdf"
fi
