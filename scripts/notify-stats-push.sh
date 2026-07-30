#!/usr/bin/env bash
# notify-stats-push.sh — Telegram the download stats whenever main gets a new commit.
#
# Git has no post-push hook, and the repo's GitHub Action is disabled on purpose,
# so this polls the remote instead. That also means it fires for any push to main
# regardless of who made it or which machine it came from.
#
# It reads the "Overall Download Statistics" table straight out of README.md at
# the new commit -- the same table `npm:readme` regenerates -- so the message
# always matches what actually landed, rather than re-querying the database.
#
#   notify-stats-push.sh              # notify only if main moved
#   notify-stats-push.sh --force      # notify for current main regardless
#   notify-stats-push.sh --dry-run    # print the message, send nothing
set -uo pipefail

REPO=pyramation-studio/lib-count
TELEGRAM_CHAT=788455883
STATE=~/.openclaw/state/lib-count-last-main.txt

FORCE=0; DRY=0
for a in "$@"; do
  [ "$a" = "--force" ] && FORCE=1
  [ "$a" = "--dry-run" ] && DRY=1
done

# The bot account cannot see every repo; the personal token is what sync uses too.
TOKEN=$(gh auth token -u pyramation 2>/dev/null || true)
[ -n "$TOKEN" ] && export GH_TOKEN="$TOKEN"

SHA=$(gh api "repos/$REPO/commits/main" --jq '.sha' 2>/dev/null)
if [ -z "$SHA" ]; then echo "could not read main from $REPO" >&2; exit 1; fi

LAST=$(cat "$STATE" 2>/dev/null || echo "")
if [ "$SHA" = "$LAST" ] && [ "$FORCE" -eq 0 ]; then
  echo "main unchanged (${SHA:0:7}) — nothing to report"
  exit 0
fi

SUBJECT=$(gh api "repos/$REPO/commits/main" --jq '.commit.message' 2>/dev/null | head -1)
WHEN=$(gh api "repos/$REPO/commits/main" --jq '.commit.author.date' 2>/dev/null | cut -c1-10)

# Pull README at that exact commit so the numbers match the commit, not the local
# checkout. Written to a file rather than piped: the parser below arrives on stdin
# as a heredoc, so stdin is already taken.
README_FILE=$(mktemp)
trap 'rm -f "$README_FILE"' EXIT
gh api "repos/$REPO/contents/README.md?ref=$SHA" --jq '.content' 2>/dev/null \
  | base64 --decode > "$README_FILE" 2>/dev/null
if [ ! -s "$README_FILE" ]; then echo "could not fetch README at $SHA" >&2; exit 1; fi

MSG=$(SUBJECT="$SUBJECT" WHEN="$WHEN" SHA="$SHA" REPO="$REPO" README_FILE="$README_FILE" python3 - <<'PY'
import os, sys

readme = open(os.environ["README_FILE"]).read()

# The table under "Overall Download Statistics": Category | Total | Monthly | Weekly
rows = []
in_section = False
for line in readme.splitlines():
    if line.strip().startswith("##") and "Overall Download Statistics" in line:
        in_section = True
        continue
    if in_section:
        if line.strip().startswith("#"):          # next heading ends the section
            break
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        name = cells[0].replace("**", "")
        if name.lower() in ("category",) or set(name) <= set("- "):
            continue                              # header / separator
        rows.append((name, cells[1], cells[2], cells[3]))

if not rows:
    sys.exit("no stats table found in README")

sha = os.environ["SHA"]
lines = [f"📦 lib-count stats updated — {os.environ['WHEN']}", ""]

# Lead with the overall row, then the category breakdown.
total = next((r for r in rows if r[0].lower() == "total"), None)
cats = [r for r in rows if r is not total]

if total:
    lines += [
        "*Overall*",
        f"  Total:   {total[1]}",
        f"  Monthly: {total[2]}",
        f"  Weekly:  {total[3]}",
        "",
    ]
if cats:
    lines.append("*By category*")
    for name, t, m, w in cats:
        lines.append(f"  {name} — total {t} · monthly {m} · weekly {w}")
    lines.append("")

lines.append(f"{os.environ['SUBJECT'].strip()}")
lines.append(f"https://github.com/{os.environ['REPO']}/commit/{sha[:7]}")
print("\n".join(lines))
PY
)

if [ -z "$MSG" ]; then echo "failed to build message" >&2; exit 1; fi

echo "$MSG"

if [ "$DRY" -eq 1 ]; then echo; echo "(dry run — not sent, state not advanced)"; exit 0; fi

openclaw message send --channel telegram --target "$TELEGRAM_CHAT" -m "$MSG" 2>&1 | tail -1
mkdir -p "$(dirname "$STATE")"
echo "$SHA" > "$STATE"
echo "state advanced to ${SHA:0:7}"
