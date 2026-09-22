#!/usr/bin/env bash
# Checks that `types/claude-code.d.ts` was written by the Claude Code that
# is installed here.
#
# The declarations are early access and move between releases; the file's
# first line names the build that wrote it. When they drift, the types are
# no longer the authority the repo treats them as, and the fix is to run
# `/plugin-types` in a session rather than to edit the file.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
types="$root/types/claude-code.d.ts"

if [ ! -f "$types" ]; then
  echo "types/claude-code.d.ts is missing; run /plugin-types in a session" >&2
  exit 1
fi

written="$(head -n 1 "$types" | sed -n 's|^// Written by Claude Code \([0-9.]*\)\.$|\1|p')"

if [ -z "$written" ]; then
  echo "cannot read a version from the first line of types/claude-code.d.ts" >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "types written by $written; no claude on PATH to compare against"
  exit 0
fi

installed="$(claude --version | sed -n 's|^\([0-9.]*\).*|\1|p')"

if [ "$written" = "$installed" ]; then
  echo "types match the installed Claude Code ($installed)"
  exit 0
fi

echo "types were written by $written, Claude Code here is $installed" >&2
echo "run /plugin-types in a session to regenerate them" >&2
exit 1
