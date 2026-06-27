// Lazy thumbnail proxy. Given a TikTok video URL (?u=), looks up the public
// oEmbed cover image and 302-redirects the <img> to it. Cached for a day. On
// any failure returns a transparent pixel so the card's placeholder shows
// through (no broken-image icon, no client JS needed).

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function pixel() {
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "public, max-age=600",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("u");
  if (!target || !/^https?:\/\/(www\.)?tiktok\.com\//.test(target)) {
    return pixel();
  }

  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(target)}`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const data = (await res.json()) as { thumbnail_url?: string };
      if (data.thumbnail_url) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: data.thumbnail_url,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }
  } catch {
    // fall through to pixel
  }
  return pixel();
}
