# BlueCode

This repository is BlueCode, a fork of T3 Code published from `Bluejay-io/bluecode`. AGENTS.md is
upstream's and still applies. This file covers what the fork changes about how you work here.

## Pushing to main ships to users

Every push to `origin/main` that touches more than docs publishes the next version as a GitHub
Release, and installed desktop apps update to it. Batch your commits and push once. Run
`vp run check:changed` first. See [docs/operations/bluecode-release.md](docs/operations/bluecode-release.md).

- Local branch `bluecode` tracks `origin/main`. `upstream` is `pingdotgg/t3code`.
- Pass `--repo Bluejay-io/bluecode` to every `gh` command that opens or edits a pull request or
  issue. Nothing from this fork goes to `pingdotgg/t3code`.
- Commit with the repository's configured author email (a GitHub noreply address). The repository
  is public; do not put a personal email, hostname, pairing URL, or token in a commit.

## Never change

The app id `io.bluejay.bluecode`, the app name `BlueCode` passed to Electron, the data home
`~/.bluecode`, the `bluecode://` scheme, and the release signing certificate. Updates, the macOS
keychain entry that encrypts saved connections, and every existing install depend on them.

## Keeping upstream mergeable

T3 Code is merged in every day: a scheduled task runs `scripts/bluecode-sync-upstream.sh`, and
the pull request it opens merges itself when CI passes. Keep the diff against upstream small and
easy to re-apply, and never squash a sync pull request.

- Put fork-only code in its own files (`apps/web/src/bluecode/`, `scripts/bluecode-*`,
  `.github/workflows/bluecode-*`). Where you must edit an upstream file, keep the edit small and
  mark it with a one-line `// BlueCode: <why>` comment.
- Do not delete or reformat upstream files you are not changing. Upstream's unused workflows stay
  in the tree and are disabled in the repository's Actions settings.
- Do not add database migrations. Ids are skipped by number, so a fork migration collides with
  upstream's next one and stops newer T3 Code databases from importing.

## Naming

The product is BlueCode in everything the OS shows: app name, icons, window title, installer.
Copy inside the app still says "T3 Code" in most places on purpose; the maintainer asked for the
visual rebrand only. Do not bulk-rename strings or translations unless asked. The command-line
tool is still `t3`, and its environment variables are still `T3CODE_*`, except the desktop app's
home override, which is `BLUECODE_HOME`.
