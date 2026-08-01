#!/usr/bin/env bash
# One-command local runner for the marriage registration generator.
# Installs Node.js dependencies (if needed), generates result.pdf, and opens
# it. Re-run this any time after editing config-private.yaml.
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
#   ./run.sh --template cinnamoroll
echo "==> Generating result.pdf"
node src/main.js "$@"

echo "==> Done: $(pwd)/result.pdf"

# Open it (macOS: open, Linux: xdg-open) - skip if neither exists.
if command -v open > /dev/null 2>&1; then
  open result.pdf
elif command -v xdg-open > /dev/null 2>&1; then
  xdg-open result.pdf
fi
