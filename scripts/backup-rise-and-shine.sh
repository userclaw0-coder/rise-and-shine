#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="/home/clawofhank/rise-and-shine"
BACKUP_ROOT="/home/clawofhank/backups/rise-and-shine"
STAMP="$(date +%F_%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"

mkdir -p "$DEST"

# Use rsync for fast incremental-ish copies and excludes for heavy/generated dirs.
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'n8n_data' \
  --exclude 'background/How started - where going_files' \
  "$SRC_DIR/" "$DEST/"

# Preserve full git refs history (branches/tags) for rollback/fallback.
git -C "$SRC_DIR" bundle create "$DEST/repo.bundle" --all

# Keep a machine-readable manifest for verification.
{
  echo "timestamp=$STAMP"
  echo "source=$SRC_DIR"
  echo "dest=$DEST"
  echo "host=$(hostname)"
  echo "branch=$(git -C \"$SRC_DIR\" rev-parse --abbrev-ref HEAD)"
  echo "head=$(git -C \"$SRC_DIR\" rev-parse HEAD)"
  echo "files=$(find "$DEST" -type f | wc -l)"
} > "$DEST/BACKUP_MANIFEST.txt"

# Keep most recent 21 backups
(ls -1dt "$BACKUP_ROOT"/* 2>/dev/null || true) | tail -n +22 | xargs -r rm -rf

echo "Backup complete: $DEST"
