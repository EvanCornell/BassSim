#!/usr/bin/env bash
# Export a public repository tree. Private: this script is never exported.
#
#   scripts/export-public.sh <target-dir>          the web app
#   scripts/export-public.sh --mcp <target-dir>    the MCP server
#
# The target must be missing or empty. Only an explicit allowlist is copied,
# with no git history; comments are stripped from the code; the tree is
# installed, built and checked; then node_modules and dist are removed so the
# directory is ready for `git init`. Any failed check exits non-zero.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$REPO/scripts/export-lib.mjs"

KIND=app
if [[ "${1:-}" == "--mcp" ]]; then KIND=mcp; shift; fi
TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 [--mcp] <target-dir>" >&2
  exit 2
fi
if [[ -e "$TARGET" && -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then
  echo "refusing: $TARGET exists and is not empty" >&2
  exit 1
fi
mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"
case "$TARGET/" in "$REPO"/*)
  echo "refusing: $TARGET is inside this repository" >&2
  exit 1 ;;
esac

fail() { echo "FAIL: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

# Copy repo-relative paths into the target, keeping their place in the tree.
copy() {
  for p in "$@"; do
    [[ -e "$REPO/$p" ]] || fail "allowlisted path $p does not exist"
    mkdir -p "$TARGET/$(dirname "$p")"
    cp -R "$REPO/$p" "$TARGET/$p"
  done
}

step "Copying the $KIND allowlist"
if [[ "$KIND" == app ]]; then
  ENTRIES=(src/main.jsx)
  # Exactly the modules the app imports, so code only the tests use stays out.
  mapfile -t FILES < <(node "$LIB" closure "${ENTRIES[@]}" 2>/dev/null)
  copy "${FILES[@]}" src/assets public index.html vite.config.js package-lock.json .gitignore
  cp "$REPO/release/app/README.md" "$TARGET/README.md"
else
  ENTRIES=(mcp/server.js mcp/http.js)
  mapfile -t FILES < <(node "$LIB" closure "${ENTRIES[@]}" 2>/dev/null)
  # The guide is read at runtime and served as a resource.
  copy "${FILES[@]}" mcp/guide.md package-lock.json
  printf 'node_modules/\n.env\n' > "$TARGET/.gitignore"
  cp "$REPO/release/mcp/README.md" "$TARGET/README.md"
fi
[[ ${#FILES[@]} -gt 0 ]] || fail "no files resolved from ${ENTRIES[*]}"
cp "$REPO/release/LICENSE" "$REPO/release/THIRD_PARTY_NOTICES" "$TARGET/"

step "Writing package.json"
(cd "$REPO" && node "$LIB" pkg "$KIND" "$TARGET/package.json" "${ENTRIES[@]}")

step "Stripping comments"
mapfile -d '' CODE < <(find "$TARGET" -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.mjs' -o -name '*.css' -o -name '*.html' \) -print0)
node "$LIB" strip "${CODE[@]}"

step "Pruning the lockfile to the public dependencies"
(cd "$TARGET" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund --loglevel=error)

step "Installing and building"
(cd "$TARGET" && npm ci --no-audit --no-fund --loglevel=error)
if [[ "$KIND" == app ]]; then
  (cd "$TARGET" && npm run build) || fail "build failed"
else
  # The private smoke tests drive the exported server: stdio, then HTTP.
  (cd "$TARGET" && node "$REPO/mcp/test-client.mjs") || fail "MCP stdio smoke test failed"
  (cd "$TARGET" && node "$REPO/mcp/test-http.mjs") || fail "MCP HTTP smoke test failed"
fi
rm -rf "$TARGET/node_modules" "$TARGET/dist"

step "Checking for private material"
DENY='better-auth|BETTER_AUTH|SMTP|PUBLISH\.md|ARCHITECTURE\.md|SOLVER-ARCHITECTURE|ENGINE-CONTRACT|SPICE-PLAN|analysis-metrics|BACKLOG|TRIAGE\.md|FINDINGS\.md|docs/contracts|api\.json|\.claude|Claude-Session|Co-Authored-By|export-public|export-lib'
if hits="$(grep -rInE "$DENY" "$TARGET" --exclude=package-lock.json)"; then
  echo "$hits" >&2
  fail "denylisted terms found"
fi
# The MCP HTTP server reads its bearer token from SPEAKERSPICE_TOKEN; nothing else may name it.
TOKEN_OK='^(mcp/http\.js|README\.md):'
if hits="$(cd "$TARGET" && grep -rIn SPEAKERSPICE_TOKEN . --exclude=package-lock.json | sed 's#^\./##')"; then
  if [[ "$KIND" == app ]] || grep -vE "$TOKEN_OK" <<<"$hits" >/dev/null; then
    echo "$hits" >&2
    fail "SPEAKERSPICE_TOKEN outside the MCP HTTP server"
  fi
fi
for p in docs test scripts .claude .github mcp/test-client.mjs mcp/test-http.mjs; do
  [[ ! -e "$TARGET/$p" ]] || fail "$p must not be exported"
done
if [[ "$KIND" == app && -e "$TARGET/mcp" ]]; then fail "mcp/ belongs in its own repository"; fi
COMMENTS="$(find "$TARGET" -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.mjs' \) -print0 \
  | xargs -0 grep -lE '^\s*(//|/\*)' || true)"
[[ -z "$COMMENTS" ]] || fail "comments left in: $COMMENTS"

step "Scanning for secrets"
if command -v gitleaks >/dev/null; then
  gitleaks dir "$TARGET" --no-banner || fail "gitleaks found secrets"
else
  echo "(gitleaks not installed; using the built-in pattern scan)"
  node "$LIB" secrets "$TARGET" || fail "secret scan found matches"
fi

step "Summary"
COUNT="$(find "$TARGET" -type f | wc -l | tr -d ' ')"
SIZE="$(du -sh "$TARGET" | cut -f1)"
echo "target:   $TARGET"
echo "files:    $COUNT"
echo "size:     $SIZE"
echo "top level:"
(cd "$TARGET" && ls -A1 | sed 's/^/  /')
echo
echo "OK: $KIND export passed every check."
