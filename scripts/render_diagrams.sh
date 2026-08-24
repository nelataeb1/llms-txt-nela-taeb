#!/usr/bin/env bash
# Renders the deck's Mermaid sources to dark-theme PNGs (no coloured nodes).
#
#   npm i -g @mermaid-js/mermaid-cli   # or npx -y @mermaid-js/mermaid-cli
#   scripts/render_diagrams.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/deck/diagrams"
MMDC="${MMDC:-mmdc}"

for src in "$DIR"/*.mmd; do
  name="$(basename "$src" .mmd)"
  "$MMDC" -i "$src" -o "$DIR/$name.png" \
    -c "$DIR/mermaid-theme.json" -b transparent -w 2400 -s 2
done
