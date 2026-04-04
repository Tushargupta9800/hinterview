#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-web}"

cd "$ROOT_DIR"

if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/.nvm/nvm.sh"
  nvm use >/dev/null
else
  echo "nvm is required but was not found at ~/.nvm/nvm.sh."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found in PATH."
  exit 1
fi

if [[ "$MODE" != "web" && "$MODE" != "desktop" ]]; then
  echo "Usage: ./run.sh [web|desktop]"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Running build check..."
npm run build

if [[ "$MODE" == "desktop" ]]; then
  echo "Starting desktop development environment..."
  npm run dev
else
  echo "Starting web development environment..."
  npm run dev:web
fi
