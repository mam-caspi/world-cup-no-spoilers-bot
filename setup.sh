#!/usr/bin/env bash
# One-time setup: creates a GitHub repo from this folder and pushes it.
# You stay in control of login — the GitHub CLI opens your browser to
# authenticate. Nothing here stores your password.
#
# How to run (on your Mac):
#   1. Open Terminal
#   2. cd into this folder (drag the folder onto the Terminal after typing "cd ")
#   3. bash setup.sh
set -e
cd "$(dirname "$0")"

REPO_NAME="${1:-world-cup-no-spoilers-bot}"

# --- ensure tools exist ---
if ! command -v git >/dev/null 2>&1; then
  echo "Git not found. Install Xcode command line tools: xcode-select --install"; exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) not found."
  if command -v brew >/dev/null 2>&1; then
    echo "Installing it with Homebrew..."; brew install gh
  else
    echo "Install it from https://cli.github.com/ (or run: brew install gh) and re-run."; exit 1
  fi
fi

# --- log in to GitHub (opens your browser) ---
if ! gh auth status >/dev/null 2>&1; then
  echo "Logging you into GitHub (a browser window will open)..."
  gh auth login
fi

# --- init repo + first commit ---
git init -b main >/dev/null 2>&1 || true
git add .
git commit -m "FIFA highlights bot" >/dev/null 2>&1 || git commit -m "update" || true

# --- create the repo on GitHub and push ---
# PUBLIC is recommended: GitHub Actions minutes are unlimited on public repos.
gh repo create "$REPO_NAME" --public --source=. --remote=origin --push

echo ""
echo "✅ Done! Your repo is created and pushed."
echo "Next steps:"
echo "  1. Open the repo on GitHub → Actions tab → enable workflows if prompted."
echo "  2. Run 'Update FIFA highlight links' manually with the 'backfill' box ticked"
echo "     to fill in all matches that already finished."
echo "  3. From then on it runs automatically every 30 minutes."
