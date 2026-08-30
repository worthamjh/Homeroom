#!/usr/bin/env bash
# Create an isolated worktree for another bot to work in.
#
#   ./scripts/new-bot-worktree.sh bot3
#
# Each bot gets its own checkout of this repo on its own branch, so two
# bots can never edit the same files or fight over the git index. See
# CLAUDE.md ("One worktree per agent") for the rules that go with this.
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: $0 <name>   (e.g. $0 bot3)" >&2
  exit 1
fi

# Kept outside the OneDrive folder on purpose: a second node_modules
# inside a synced folder means OneDrive churning through tens of
# thousands of files, and locking some of them mid-write.
ROOT="C:/Users/Worth/homeroom-worktrees"
DEST="$ROOT/$NAME"
REPO="$(git rev-parse --show-toplevel)"

if [ -e "$DEST" ]; then
  echo "error: $DEST already exists" >&2
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/$NAME"; then
  echo "error: branch '$NAME' already exists -- pick another name" >&2
  exit 1
fi

mkdir -p "$ROOT"
git worktree add "$DEST" -b "$NAME"

# The two things a fresh worktree does NOT get, because both are
# gitignored and worktrees don't share them.
if [ -f "$REPO/.env.local" ]; then
  cp "$REPO/.env.local" "$DEST/.env.local"
  echo "copied .env.local"
else
  echo "WARNING: no .env.local to copy -- the app won't have env vars there" >&2
fi

echo "installing dependencies (worktrees don't share node_modules)..."
( cd "$DEST" && npm install --silent )

cat <<EOF

Ready. Point the bot at this folder:

    $DEST

It is on branch '$NAME'. It commits there; main stays Jay's.
Keep it current with:  git -C "$DEST" merge main
Remove it when merged: git worktree remove "$DEST"
EOF
