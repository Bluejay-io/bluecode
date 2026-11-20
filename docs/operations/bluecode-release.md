# BlueCode releases

BlueCode is a fork of T3 Code published from `Bluejay-io/bluecode`. This page
covers what differs from upstream's [release process](release.md).

## One channel

There is only a stable channel. Every push to `main` that touches more than
docs runs [bluecode-release.yml](../../.github/workflows/bluecode-release.yml),
which publishes the next patch version (`v1.0.N`) as the repository's latest
GitHub Release. To cut a release without a push, run the workflow by hand:
`gh workflow run bluecode-release.yml`.

A release carries the macOS app for Apple Silicon and Intel (`.dmg`, `.zip`,
`latest-mac.yml`, blockmaps) and the `t3` CLI archives for macOS arm64 and
Linux x64, which SSH environments install on remote hosts. The Linux desktop
package is built and opened as a check but not published.

The release job needs the repository to stay public: installed apps download
updates from its releases without signing in.

## Signing

Releases are signed with a self-signed certificate, "BlueCode Release Signing",
not an Apple Developer ID, and are not notarized.

- The certificate and its password are the repository secrets
  `BLUECODE_MAC_CERT_P12` (base64) and `BLUECODE_MAC_CERT_PASSWORD`. The only
  other copy is on the machine that created them, in
  `~/.config/bluecode/signing/`. Back that folder up.
- macOS only applies an update signed with the certificate the installed app
  was signed with. A release signed with a different certificate, or unsigned,
  strands every install: they keep downloading the update and failing to apply
  it, and need a manual reinstall. The build job fails rather than publish one.
- Because the app is not notarized, macOS blocks a copy downloaded with a
  browser until the user allows it under System Settings, Privacy & Security.
  [scripts/install-bluecode.sh](../../scripts/install-bluecode.sh) avoids that.
- Moving to an Apple Developer ID later changes the signing identity, so it is
  a one-time manual reinstall for everyone.

## Never change after the first release

The app id `io.bluejay.bluecode`, the app name `BlueCode`, and the signing
certificate. The update chain and the macOS keychain entry that encrypts saved
connections are tied to them.

## Upstream's workflows

Upstream's other workflow files stay in the tree unchanged, so merging T3 Code
never conflicts on them, and are disabled in the repository's Actions settings.
`bluecode-release.yml` disables any new one a merge brings in. The workflows
BlueCode runs are `ci.yml`, `bluecode-release.yml` and the reusable
`release-desktop.yml`; the first and last are upstream's with small edits
marked `BlueCode:`.

## Pulling in T3 Code

[scripts/bluecode-sync-upstream.sh](../../scripts/bluecode-sync-upstream.sh)
merges upstream `main` into the `sync/upstream` branch, opens or updates its
pull request, and sets it to merge itself. `main` requires CI's `Check` job, so
GitHub merges the pull request when CI passes, as a merge commit, and that
merge publishes a release. Nobody has to look at a green sync.

A scheduled task runs the script every day and steps in only when something
needs a decision: a merge conflict, a failed check, or a release that did not
publish. Conflict resolutions and fixes are commits on the sync branch, which
later runs build on until it merges.

The script runs from a checkout with a signed-in `gh` rather than in Actions:
the organization does not let Actions open pull requests, and an Actions token
may not push the workflow changes upstream merges contain.

Do not squash a sync pull request. Upstream's commits must stay ancestors of
`main`, or the next sync replays all of them.

BlueCode must not add database migrations with ids in upstream's sequence. The
server skips migrations by number, so a fork migration would both collide with
upstream's next one and stop newer T3 Code databases from importing.
