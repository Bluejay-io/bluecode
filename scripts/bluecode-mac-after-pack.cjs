// BlueCode: signs the packed macOS app with our own certificate. electron-builder
// only signs with identities macOS trusts, and a CI runner cannot be made to trust
// a self-signed certificate, so the build leaves its own signing off and this does
// it. Nothing changes the app between this hook and the dmg and zip being made.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const prepareServerCompileCache = require("./prepare-server-compile-cache.cjs");

module.exports = async (context) => {
  await prepareServerCompileCache(context);

  const identity = process.env.BLUECODE_MAC_SIGN_IDENTITY?.trim();
  if (context.electronPlatformName !== "darwin" || !identity) return;

  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const keychain = process.env.BLUECODE_MAC_SIGN_KEYCHAIN?.trim();
  const codesign = (args) => {
    const result = spawnSync("/usr/bin/codesign", args, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`codesign ${args[0]} failed: ${result.error || result.stderr}`);
    }
  };
  codesign([
    "--force",
    "--deep",
    "--timestamp=none",
    "--sign",
    identity,
    ...(keychain ? ["--keychain", keychain] : []),
    app,
  ]);
  codesign(["--verify", "--deep", "--strict", app]);
  console.log(`[bluecode-sign] Signed ${path.basename(app)} with ${identity}`);
};
