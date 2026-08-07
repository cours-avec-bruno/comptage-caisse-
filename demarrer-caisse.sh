#!/usr/bin/env sh
# Équivalent du raccourci .bat, pour développer sous Linux ou macOS.
set -e
cd "$(dirname "$0")"

[ -d node_modules ] || npm install
[ -f client/dist/index.html ] || npm run build

exec npm start
