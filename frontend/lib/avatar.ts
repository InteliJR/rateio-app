import { API_URL } from "../services/api.service";

export function buildAvatarUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }

  const isAbsoluteUrl =
    rawUrl.startsWith("http://") || rawUrl.startsWith("https://");

  if (isAbsoluteUrl) {
    return rawUrl.includes("?") ? rawUrl : withCacheBuster(rawUrl);
  }

  return withCacheBuster(`${API_URL}${rawUrl}`);
}

function withCacheBuster(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}
