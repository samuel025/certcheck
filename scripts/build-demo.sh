#!/usr/bin/env bash
# Builds dist-demo/index.html: the same site but with FirstTape's zero-address demo config, so the browser tests (which assume "contracts not deployed")
# keep working while site/ft/config.js holds the real addresses. Serve it:  cd dist-demo && python3 -m http.server 8083
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cp -r site/. "$T"/; cp tests/ft/fixtures/config.demo.js "$T/ft/config.js"
SITE_DIR="$T" OUT_DIR="$PWD/dist-demo" node scripts/bundle.js | head -1
