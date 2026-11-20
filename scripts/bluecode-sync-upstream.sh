#!/usr/bin/env bash
# Merges the latest T3 Code into the `sync/upstream` branch, opens or updates
# the pull request for it on Bluejay-io/bluecode, and sets it to merge itself
# once CI passes. That merge releases a new BlueCode version.
#
# Run from a BlueCode checkout that has `origin` (Bluejay-io/bluecode) and
# `upstream` (pingdotgg/t3code) remotes and a signed-in `gh`. It runs here and
# not in GitHub Actions because the Bluejay-io organization does not let
# Actions open pull requests, and upstream merges change workflow files, which
# an Actions token may not push.
#
# The merge happens in a worktree beside this checkout, so this checkout's
# files and branch are left alone.
#
#   bluecode-sync-upstream.sh             merge and publish
#   bluecode-sync-upstream.sh --continue  publish a merge or fix committed in the worktree
#   bluecode-sync-upstream.sh --open      check the open sync branch out in the worktree, to fix it
#
# Exit codes: 0 nothing to do, or the pull request is open and will merge on green.
#             2 the merge has conflicts; the worktree is left at the printed
#               path for someone to resolve, commit, and rerun with --continue.
set -euo pipefail

repo="Bluejay-io/bluecode"
branch="sync/upstream"
root="$(git rev-parse --show-toplevel)"
worktree="$(dirname "$root")/$(basename "$root")-upstream-sync"

# Two schedulers can fire this at once; the second one has nothing to add.
exec 9>"$(git rev-parse --git-common-dir)/bluecode-sync-upstream.lock"
if ! flock -n 9; then
  echo "Another upstream sync is running."
  exit 0
fi

publish() {
  git -C "$worktree" push --force origin "HEAD:refs/heads/$branch"
  local behind title body
  behind="$(git -C "$worktree" rev-list --count origin/main..upstream/main)"
  title="Sync upstream T3 Code ($(git -C "$worktree" rev-parse --short upstream/main))"
  body="Merges ${behind} new upstream commit(s) from pingdotgg/t3code \`main\` into BlueCode.

This pull request merges itself once CI passes, which publishes a new BlueCode release. Opened by \`scripts/bluecode-sync-upstream.sh\`."
  if [[ -n "$(gh pr list --repo "$repo" --head "$branch" --state open --json number --jq '.[0].number // empty')" ]]; then
    gh pr edit "$branch" --repo "$repo" --title "$title" --body "$body"
  else
    gh pr create --repo "$repo" --base main --head "$branch" --title "$title" --body "$body"
  fi
  # A merge commit, never a squash: upstream's commits must stay ancestors of
  # main, or the next sync would replay all of them.
  gh pr merge "$branch" --repo "$repo" --auto --merge
  git worktree remove --force "$worktree"
}

merge() {
  local ref="$1"
  if git -C "$worktree" merge-base --is-ancestor "$ref" HEAD; then return 0; fi
  if git -C "$worktree" merge --no-ff --no-edit "$ref"; then return 0; fi
  if ! git -C "$worktree" rev-parse --quiet --verify MERGE_HEAD >/dev/null; then
    git worktree remove --force "$worktree"
    echo "Merging $ref failed for a reason other than conflicts; see the output above." >&2
    exit 1
  fi
  local conflicts
  conflicts="$(git -C "$worktree" diff --name-only --diff-filter=U)"
  if [[ -z "$conflicts" ]]; then
    echo "Every conflict with $ref was resolved the way it was last time."
    git -C "$worktree" -c core.hooksPath=/dev/null commit --no-edit
    return 0
  fi
  echo
  echo "$ref conflicts with the sync branch in:"
  echo "$conflicts" | sed 's/^/  /'
  echo
  echo "Resolve them in $worktree, commit the merge, then run: $0 --continue"
  exit 2
}

# Merges whatever is not in the sync branch yet, then publishes it.
finish() {
  merge origin/main
  merge upstream/main
  publish
}

if [[ "${1:-}" == "--continue" ]]; then
  [[ -d "$worktree" ]] || { echo "No sync in progress at $worktree." >&2; exit 1; }
  if [[ -n "$(git -C "$worktree" status --porcelain)" ]]; then
    echo "Commit the resolved merge or the fix in $worktree first." >&2
    exit 1
  fi
  finish
  exit 0
fi

if [[ -d "$worktree" ]]; then
  echo "A sync is already in progress at $worktree. Finish it with --continue or remove the worktree." >&2
  exit 1
fi

git fetch --no-tags origin main
has_branch=false
if git fetch --no-tags origin "+refs/heads/$branch:refs/remotes/origin/$branch" 2>/dev/null; then
  has_branch=true
fi

if [[ "${1:-}" == "--open" ]]; then
  "$has_branch" || { echo "There is no open sync branch to fix." >&2; exit 1; }
  git worktree add --force -B "$branch" "$worktree" "origin/$branch"
  echo "Fix and commit in $worktree, then run: $0 --continue"
  exit 0
fi

# A blobless clone holds upstream's commits without their files. The merge needs
# them, and fetching them on demand mid-merge fails, so fetch them up front.
git fetch --no-tags --no-filter upstream main
missing="$(GIT_NO_LAZY_FETCH=1 git rev-list --objects --missing=print origin/main..upstream/main | sed -n 's/^?//p')"
if [[ -n "$missing" ]]; then
  git -c fetch.negotiationAlgorithm=noop fetch upstream --no-tags --no-write-fetch-head \
    --recurse-submodules=no --stdin <<<"$missing"
fi

if git merge-base --is-ancestor upstream/main origin/main; then
  echo "BlueCode already contains upstream main."
  exit 0
fi
if "$has_branch" &&
  git merge-base --is-ancestor upstream/main "origin/$branch" &&
  git merge-base --is-ancestor origin/main "origin/$branch"; then
  echo "The sync branch already contains upstream main and BlueCode main."
  exit 0
fi

# An unmerged sync branch carries conflict resolutions and fixes, so build on
# it instead of starting over from main.
start="origin/main"
if "$has_branch"; then start="origin/$branch"; fi
git worktree add --force -B "$branch" "$worktree" "$start"

# rerere replays a conflict resolution made before when the same conflict returns.
git config rerere.enabled true
git config rerere.autoUpdate true

finish
