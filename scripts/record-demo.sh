#!/bin/sh
# Re-records docs/assets/demo.gif from the real CLI. Needs vhs and ffmpeg on PATH.
# It packs this repository, installs the tarball into an empty project, and lets docs/demo.tape
# run `npx proactive-gate simulate` there, so the GIF shows what a reader's terminal shows.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
npm run build --silent
tgz=$(npm pack --silent --ignore-scripts | tail -1)
dir=$(mktemp -d)
mv "$tgz" "$dir/"
( cd "$dir" && npm init -y >/dev/null && npm install --silent --ignore-scripts "./$tgz" )
DEMO_DIR="$dir" vhs docs/demo.tape
rm -rf "$dir"
bytes=$(wc -c < docs/assets/demo.gif | tr -d ' ')
echo "docs/assets/demo.gif: $bytes bytes"
