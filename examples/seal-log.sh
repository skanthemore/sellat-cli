#!/usr/bin/env bash
# Rotate a log file and stamp the rotated copy through SELLAT.
#
# This is the pattern sellat.app runs on its own infrastructure: every hour
# the web server's access log is rotated and its SHA-256 is stamped, so each
# archived log file has independent proof of what it contained and when.
# Because stamps are chain-linked per API client, the sequence of hourly
# stamps forms an append-only chain — removing or altering one archived hour
# becomes detectable.
#
# Usage (e.g. from cron, hourly):
#   SELLAT_API_TOKEN=... ./seal-log.sh /var/log/nginx/access.log /var/log/nginx/archive
#
# Requires: sellat-cli in PATH (npm install -g sellat-cli), and a token from
# https://sellat.app/developers

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
sellat stamp "$ARCHIVED" --label "log/$STAMP_NAME"
