#!/usr/bin/env bash
# One-command local runner for the marriage registration generator.
# Creates a virtualenv (if needed), installs dependencies, generates result.pdf,
# and opens it. Re-run this any time after editing config-private.yaml.
set -euo pipefail

cd "$(dirname "$0")"

VENV_DIR="venv"

# Create the virtualenv on first run.
if [ ! -d "$VENV_DIR" ]; then
  echo "==> Creating virtualenv in $VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi

# Install/refresh dependencies.
echo "==> Installing dependencies"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r requirements.txt

# Generate the PDF.
echo "==> Generating result.pdf"
"$VENV_DIR/bin/python" src/main.py

echo "==> Done: $(pwd)/result.pdf"

# Open it (macOS: open, Linux: xdg-open) - skip if neither exists.
if command -v open >/dev/null 2>&1; then
  open result.pdf
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open result.pdf
fi
