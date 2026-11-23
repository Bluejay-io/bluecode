// Suffixes where each subdomain is its own site, so `app.vercel.app` stays whole. The full public
// suffix list (tldts) would add ~46 KB gzipped to the web bundle for one label.
const SHARED_HOSTS = [
  "vercel.app",
  "netlify.app",
  "github.io",
  "pages.dev",
  "workers.dev",
  "web.app",
  "firebaseapp.com",
  "herokuapp.com",
  "onrender.com",
  "fly.dev",
  "railway.app",
  "ngrok.app",
  "ngrok-free.app",
  "ngrok.io",
  "trycloudflare.com",
  "ts.net",
];
const COUNTRY_SECOND_LEVELS = new Set(["ac", "co", "com", "edu", "gov", "net", "ne", "or", "org"]);

/** The site a page belongs to: `admin.shopify.com` reads `shopify.com`; dev servers keep their port. */
export function siteName(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const hostname = parsed.hostname.replace(/\.$/, "");
  const labels = hostname.split(".");
  const isIp = hostname.startsWith("[") || /^\d+(\.\d+){3}$/.test(hostname);
  // A port means a dev server, where the port tells two apart on one machine.
  if (isIp || parsed.port || labels.length < 2 || hostname.endsWith(".localhost")) {
    return parsed.host;
  }
  const shared = SHARED_HOSTS.find((suffix) => hostname.endsWith(`.${suffix}`));
  if (shared) return labels.slice(-(shared.split(".").length + 1)).join(".");
  const [secondLevel = "", topLevel = ""] = labels.slice(-2);
  const countryPair = topLevel.length === 2 && COUNTRY_SECOND_LEVELS.has(secondLevel);
  return labels.slice(countryPair ? -3 : -2).join(".");
}
