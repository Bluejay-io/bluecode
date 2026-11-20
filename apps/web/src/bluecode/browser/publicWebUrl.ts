import { isPublicFaviconHost } from "@t3tools/shared/hostClassification";

import { isWebUrl } from "~/browser/webUrl";

/** A public site any browser reaches, as opposed to a server only the environment can reach. */
export function isPublicWebUrl(url: string): boolean {
  return isWebUrl(url) && isPublicFaviconHost(new URL(url).hostname);
}
