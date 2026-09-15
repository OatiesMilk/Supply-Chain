#!/usr/bin/env bash
# Fills manifest.json placeholders from environment variables (or a .env file
# in this directory) and packages the Teams app zip. Never modifies the
# original manifest.json — writes to manifest.filled.json instead.
set -euo pipefail

cd "$(dirname "$0")"

# Load teams/.env if present, without overriding already-exported vars.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

missing=()
[ -z "${AZURE_CLIENT_ID:-}" ] && missing+=("AZURE_CLIENT_ID")
[ -z "${APP_URL:-}" ]         && missing+=("APP_URL")
[ -z "${APP_DOMAIN:-}" ]      && missing+=("APP_DOMAIN")

if [ ${#missing[@]} -ne 0 ]; then
  echo "Error: missing required environment variable(s): ${missing[*]}" >&2
  echo "Set them in your shell or in teams/.env, e.g.:" >&2
  echo "  AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" >&2
  echo "  APP_URL=https://portal.microgenesis.com" >&2
  echo "  APP_DOMAIN=portal.microgenesis.com" >&2
  exit 1
fi

for icon in icon-color.png icon-outline.png; do
  if [ ! -f "$icon" ]; then
    echo "Error: $icon not found in teams/ — see README.md for icon requirements." >&2
    exit 1
  fi
done

sed \
  -e "s#{{AZURE_CLIENT_ID}}#${AZURE_CLIENT_ID}#g" \
  -e "s#{{APP_URL}}#${APP_URL}#g" \
  -e "s#{{APP_DOMAIN}}#${APP_DOMAIN}#g" \
  manifest.json > manifest.filled.json

# Teams requires the manifest to be named exactly "manifest.json" inside the
# zip, so stage the filled copy under that name without touching the source.
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp manifest.filled.json "$stage/manifest.json"
cp icon-color.png icon-outline.png "$stage/"

rm -f microgenesis-teams-app.zip
out="$(pwd)/microgenesis-teams-app.zip"

if command -v zip >/dev/null 2>&1; then
  (cd "$stage" && zip -j "$out" manifest.json icon-color.png icon-outline.png)
elif command -v powershell.exe >/dev/null 2>&1; then
  # Windows fallback (e.g. Git Bash without zip): use PowerShell's Compress-Archive.
  win_stage=$(cygpath -w "$stage" 2>/dev/null || echo "$stage")
  win_out=$(cygpath -w "$out" 2>/dev/null || echo "$out")
  powershell.exe -NoProfile -Command \
    "Compress-Archive -Path '$win_stage/manifest.json','$win_stage/icon-color.png','$win_stage/icon-outline.png' -DestinationPath '$win_out' -Force"
else
  echo "Error: neither 'zip' nor 'powershell.exe' is available to build the archive." >&2
  exit 1
fi

echo "Built teams/microgenesis-teams-app.zip"
echo "Upload it in Teams Admin Center -> Manage apps -> Upload custom app."
