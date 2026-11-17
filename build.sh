#!/usr/bin/env bash
# Scrawl build script.
#   ./build.sh check    syntax-check every JS file and run the headless sim/recognizer tests
#   ./build.sh dev      run locally (game + rooms) at http://localhost:8787
#   ./build.sh deploy   check, then publish to https://scrawl.rennko.tech (Cloudflare Workers)
set -euo pipefail
cd "$(dirname "$0")"

check() {
  for f in public/js/*.js src/*.js tools/*.mjs; do node --check "$f"; done
  node tools/test.mjs && node tools/allspells.mjs
}

case "${1:-check}" in
  check)  check ;;
  dev)    check && npx -y wrangler@4 dev ;;
  deploy) check && npx -y wrangler@4 deploy ;;
  *) echo "usage: ./build.sh [check|dev|deploy]"; exit 1 ;;
esac
