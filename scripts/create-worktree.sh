#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <branch-name> [base-branch]" >&2
  exit 1
fi

branch="$1"
base="${2:-develop}"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
worktree_dir="$repo_root/.worktrees/${branch//\//-}"

mkdir -p "$repo_root/.worktrees"

git -C "$repo_root" fetch --all --prune >/dev/null 2>&1 || true

git -C "$repo_root" worktree add -b "$branch" "$worktree_dir" "$base"

if [[ -f "$repo_root/.env.local" && ! -e "$worktree_dir/.env.local" ]]; then
  ln -s "$repo_root/.env.local" "$worktree_dir/.env.local"
fi

echo "Created worktree: $worktree_dir"
echo "Branch: $branch"
echo "Base: $base"
