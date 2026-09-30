#!/usr/bin/env bash
# Rotate a log file and stamp the rotated copy through SELLAT.
#
# This is the pattern sellat.app runs on its own infrastructure: every hour
# the web server's access log is rotated and its SHA-256 is stamped, so each
# archived log file has independent proof of what it contained and when.
# Every batch root is anchored on Polygon and attested on Bitcoin, so each
# archived hour has a proof nobody can backdate — removing or altering one
# archived file later leaves bytes that match no proof.
#
# Usage (e.g. from cron, hourly):
#   SELLAT_API_TOKEN=... ./seal-log.sh /var/log/nginx/access.log /var/log/nginx/archive
#
# Requires: sellat-cli in PATH (npm install -g sellat-cli), and an API key
# created from your account at https://sellat.app/dashboard#api-keys

set -euo pipefail

LOG_FILE="${1:?usage: seal-log.sh <log-file> <archive-dir>}"
ARCHIVE_DIR="${2:?usage: seal-log.sh <log-file> <archive-dir>}"

mkdir -p "$ARCHIVE_DIR"

STAMP_NAME="$(basename "$LOG_FILE").$(date -u +%Y%m%d-%H%M)"
ARCHIVED="$ARCHIVE_DIR/$STAMP_NAME"

# Copy-then-truncate keeps the writing process's file descriptor valid.
cp "$LOG_FILE" "$ARCHIVED"
truncate -s 0 "$LOG_FILE"

# The archived file is hashed locally; only the SHA-256 is submitted.
sellat stamp "$ARCHIVED" --name "log/$STAMP_NAME"
