export function resolveBrowserReachableUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  // Only the project's cloud platforms are valid API destinations, never a LAN host.
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !url.hostname.endsWith(".up.railway.app")) {
    throw new Error("Flownote API requires a public Railway HTTPS URL.");
  }
  return typeof window !== "undefined" ? `${window.location.origin}/web-api` : url.origin;
}

export function requireBrowserReachableUrl(name: string, value: string | undefined): string {
  const url = resolveBrowserReachableUrl(value);
  if (!url) throw new Error(`${name} must be configured with a public Railway HTTPS URL.`);
  return url;
}
