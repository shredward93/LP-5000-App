#!/usr/bin/env bash
# Clones the exact ButterCut commit this app is built against. The XML export
# tooling (franken_bit_export.rb + EXPORT_NOTES.md) lives in this repo under
# assets/xml-export/ — not copied into the ButterCut clone — so there's only
# ever one copy to keep up to date.
#
#   bash buttercut_bootstrap.sh [install_dir]
#
# install_dir defaults to ~/Buttercut.
set -euo pipefail

PINNED_COMMIT="ddd5e9ae1912c88fe9ac28d8674a0fbfe319b16b"
INSTALL_DIR="${1:-$HOME/Buttercut}"
REPO_URL="https://github.com/barefootford/buttercut.git"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "==> $INSTALL_DIR already exists, fetching pinned commit..."
  git -C "$INSTALL_DIR" fetch origin "$PINNED_COMMIT" --quiet || \
    git -C "$INSTALL_DIR" fetch origin main --quiet
else
  echo "==> Cloning ButterCut into $INSTALL_DIR..."
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
fi

echo "==> Checking out pinned commit $PINNED_COMMIT..."
git -C "$INSTALL_DIR" checkout --quiet "$PINNED_COMMIT"

echo ""
echo "==> Done. ButterCut is at $INSTALL_DIR (commit ${PINNED_COMMIT:0:7})."
echo "==> XML export tooling: assets/xml-export/ in this LP 5000 repo (see EXPORT_NOTES.md)."
echo ""
echo "Still needed (this script deliberately doesn't automate these — they"
echo "involve interactive/password steps): Ruby 3.3.6, Python 3.12.8, FFmpeg"
echo "with drawtext, WhisperX, and Ruby gems (nokogiri etc.)."
echo ""
echo "Open $INSTALL_DIR in Claude Code / VS Code and ask it to"
echo "\"check my installation\" — that runs ButterCut's own setup skill,"
echo "which walks through each dependency interactively."
echo ""
echo "Note: if 'bundle install'/'bundle exec' complains about a nokogiri"
echo "version mismatch, plain 'ruby' (without bundle exec) works fine as a"
echo "fallback — that's what franken_bit_export.rb itself relies on."
