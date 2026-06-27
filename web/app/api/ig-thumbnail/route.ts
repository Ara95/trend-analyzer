// Instagram thumbnail proxy. The cover urls we store (metrics.thumbnail) point at Instagram's CDN,
// which is referrer-checked (hotlink-protected) — a browser <img> often gets blocked. So instead of
// redirecting (like the TikTok oEmbed route), we FETCH the image server-side, where there's no
// browser referrer, and stream the bytes back same-origin. Cached for a day. On any failure (incl.
// the signed url having expired) we return a transparent pixel so the card's placeholder shows
// through. NOTE: this fixes hotlink/referrer/CORS, not expiry — an expired url is gone until the next
// collect run refreshes it; run collect more often than the urls expire.

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function pixel() {
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "public, max-age=600" },
  });
}

// SSRF guard: only proxy Instagram's own CDN hosts, never an arbitrary url.
function isInstagramCdn(target: string): boolean {
  try {
    const u = new URL(target);
    if (u.protocol !== "https:") return false;
    return /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("u");
  if (!target || !isInstagramCdn(target)) return pixel();

  try {
    const res = await fetch(target, {
      // No referrer header server-side → bypasses IG's hotlink check. A UA avoids some 403s.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; trend-analyzer/1.0)" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.startsWith("image/")) {
      const body = await res.arrayBuffer();
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
      });
    }
  } catch {
    // fall through to pixel (timeout, expired url, network error)
  }
  return pixel();
}
