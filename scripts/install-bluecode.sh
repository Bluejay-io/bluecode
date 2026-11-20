#!/bin/sh
# Installs the BlueCode desktop app on macOS from the latest GitHub Release.
#
#   curl -fsSL https://raw.githubusercontent.com/Bluejay-io/bluecode/main/scripts/install-bluecode.sh | sh
#
# BlueCode is signed with its own certificate, not an Apple Developer ID, so
# macOS refuses to open a copy a browser downloaded until it is allowed in
# System Settings. curl sets no quarantine flag, so this install opens directly.
#
# Environment:
#   BLUECODE_VERSION      exact version to install (default: the latest release)
#   BLUECODE_INSTALL_DIR  where BlueCode.app goes (default: /Applications, or
#                         ~/Applications when that is not writable)
set -eu

repo="Bluejay-io/bluecode"
# SHA-1 of the release signing certificate. Every release carries it, which is
# also what lets the app update itself.
signing_cert="81c245d7ee766e49cb568b3c1cfd2a71d1eb0276"

fail() {
  printf 'BlueCode install: %s\n' "$1" >&2
  exit 1
}

[ "$(uname -s)" = Darwin ] || fail "this installer is for macOS. Other platforms: https://github.com/$repo/releases/latest"
case "$(uname -m)" in
  arm64) arch=arm64 ;;
  x86_64) arch=x64 ;;
  *) fail "unsupported Mac architecture: $(uname -m)" ;;
esac

version="${BLUECODE_VERSION:-}"
if [ -z "$version" ]; then
  # The latest-release page redirects to its tag; no API call, so no rate limit.
  latest="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$repo/releases/latest")" ||
    fail "could not reach GitHub."
  version="${latest##*/tag/v}"
  [ "$version" != "$latest" ] || fail "no BlueCode release has been published yet."
fi
version="${version#v}"

install_dir="${BLUECODE_INSTALL_DIR:-/Applications}"
if [ -z "${BLUECODE_INSTALL_DIR:-}" ] && [ ! -w "$install_dir" ]; then
  install_dir="$HOME/Applications"
fi
mkdir -p "$install_dir"

work="$(mktemp -d "${TMPDIR:-/tmp}/bluecode-install.XXXXXX")"
trap 'rm -rf "$work"' EXIT INT TERM

printf 'Downloading BlueCode %s (%s)...\n' "$version" "$arch"
curl -fL --progress-bar -o "$work/BlueCode.zip" \
  "https://github.com/$repo/releases/download/v$version/BlueCode-$version-$arch.zip" ||
  fail "could not download BlueCode $version for $arch."

ditto -x -k "$work/BlueCode.zip" "$work/app"
app="$work/app/BlueCode.app"
[ -d "$app" ] || fail "the download did not contain BlueCode.app."

codesign --verify --deep --strict "$app" 2>/dev/null || fail "the download's signature is not valid."
codesign -d -r- "$app" 2>&1 | grep -qi "certificate root = H\"$signing_cert\"" ||
  fail "the download is not signed with BlueCode's release certificate."

if pgrep -xq BlueCode; then
  printf 'Quitting the running BlueCode...\n'
  osascript -e 'tell application "BlueCode" to quit' >/dev/null 2>&1 || true
  i=0
  while pgrep -xq BlueCode && [ "$i" -lt 50 ]; do
    sleep 0.2
    i=$((i + 1))
  done
fi

rm -rf "$install_dir/BlueCode.app"
ditto "$app" "$install_dir/BlueCode.app"
xattr -dr com.apple.quarantine "$install_dir/BlueCode.app" 2>/dev/null || true

printf 'Installed BlueCode %s in %s. It updates itself from now on.\n' "$version" "$install_dir"
open "$install_dir/BlueCode.app"
