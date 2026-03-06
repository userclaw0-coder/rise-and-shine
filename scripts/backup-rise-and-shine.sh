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

# Keep a machine-readable manifest for verification.
{
  echo "timestamp=$STAMP"
  echo "source=$SRC_DIR"
  echo "dest=$DEST"
  echo "host=$(hostname)"
  echo "files=$(find "$DEST" -type f | wc -l)"
} > "$DEST/BACKUP_MANIFEST.txt"

echo "Backup complete: $DEST"
