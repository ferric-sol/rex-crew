#!/usr/bin/env bash
# Install rex-crew from this checkout: the script and the worker extension are copied to ~/.config/rex/crew (the
# paths rex-crew and pi expect), and rex-crew is linked into ~/.local/bin. A file that differs from the installed one
# is backed up beside it first (<file>.bak-<time>). Copies, not symlinks: pi loads the extension from its own path,
# and its imports (typebox, the pi types) resolve there.
#
#   ./install.sh            install
#   ./install.sh --check    say what differs, change nothing
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="${REX_CREW_HOME:-$HOME/.config/rex/crew}"
bin="${REX_CREW_BIN:-$HOME/.local/bin}"
check=""; [ "${1:-}" != --check ] || check=1

put() { # src dst mode
  if [ -f "$2" ] && cmp -s "$1" "$2"; then echo "same:      $2"; return; fi
  if [ -n "$check" ]; then echo "differs:   $2"; return; fi
  mkdir -p "$(dirname "$2")"
  [ ! -f "$2" ] || cp -p "$2" "$2.bak-$(date +%Y%m%d-%H%M%S)"
  install -m "$3" "$1" "$2"
  echo "installed: $2"
}

put "$here/bin/rex-crew" "$dest/rex-crew" 755
put "$here/extension/crew.ts" "$dest/crew.ts" 644

if [ "$(readlink "$bin/rex-crew" 2>/dev/null)" = "$dest/rex-crew" ]; then echo "same:      $bin/rex-crew -> $dest/rex-crew"
elif [ -n "$check" ]; then echo "differs:   $bin/rex-crew"
else mkdir -p "$bin"; ln -sfn "$dest/rex-crew" "$bin/rex-crew"; echo "linked:    $bin/rex-crew -> $dest/rex-crew"; fi

for t in rex pi jq git; do command -v "$t" >/dev/null || echo "missing on PATH: $t"; done
[ -f "$HOME/.pi/agent/advisor.json" ] || echo "no ~/.pi/agent/advisor.json: workers run without the advisor (see examples/advisor.json)"
