// Cloudflare Worker (free plan): serves the website's public Cloudinary photos and videos from Cloudflare's cache, so
// each file is fetched from Cloudinary once per Cloudflare location instead of on every visit. Setup: ../CDN_SETUP.md
//
//   https://media.example.com/image/upload/v123/ezaaz/doctors/x.jpg
//   -> https://res.cloudinary.com/<CLOUD_NAME>/image/upload/v123/ezaaz/doctors/x.jpg
//
// Only public uploads in the ezaaz/ folders pass. Patient reports and WhatsApp media are private ("authenticated")
// on Cloudinary and never go through here.

const PUBLIC_MEDIA = /^\/(image|video)\/upload\/(v\d+\/)?ezaaz\/[\w/.-]+$/;
const YEAR = 365 * 24 * 60 * 60;

const rangeOf = (request) => (request.headers.has('Range') ? { Range: request.headers.get('Range') } : {});
const respond = (request, response) => (request.method === 'HEAD' ? new Response(null, response) : response);
const failed = (origin) => new Response(origin.status === 404 ? 'Not found' : 'Media unavailable', { status: origin.status === 404 ? 404 : 502 });

// Every upload gets a new URL (the v123 part), so a file never changes and browsers can keep it for a year
function withHeaders(origin) {
  const response = new Response(origin.body, origin);
  response.headers.set('Cache-Control', `public, max-age=${YEAR}, immutable`);
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.delete('Set-Cookie');
  return response;
}

// Downloads the whole file once into the cache in the background (one at a time per file in this Worker instance)
const filling = new Set();
function fillCache(ctx, cacheKey, originUrl) {
  if (filling.has(cacheKey.url)) return;
  filling.add(cacheKey.url);
  ctx.waitUntil(
    fetch(originUrl)
      .then((full) => full.ok && caches.default.put(cacheKey, withHeaders(full)))
      .catch(() => {})
      .finally(() => filling.delete(cacheKey.url)),
  );
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const url = new URL(request.url);
    if (!PUBLIC_MEDIA.test(url.pathname)) return new Response('Not found', { status: 404 });

    // One cache entry per file (query strings ignored). match() answers Range requests (video seeking) with a 206.
    const cacheKey = new Request(`${url.origin}${url.pathname}`);
    const hit = await caches.default.match(new Request(cacheKey.url, { headers: rangeOf(request) }));
    if (hit) return respond(request, hit);

    const originUrl = `https://res.cloudinary.com/${env.CLOUD_NAME}${url.pathname}`;
    if (request.headers.has('Range')) {
      // Video not cached here yet: pass this range straight through (Safari only plays video served as 206 ranges)
      // and cache the whole file in the background for the next visitor
      fillCache(ctx, cacheKey, originUrl);
      const partial = await fetch(originUrl, { headers: rangeOf(request) });
      return partial.ok ? respond(request, withHeaders(partial)) : failed(partial);
    }

    // Photo (or a full download) not cached yet: send it and cache it at the same time
    const origin = await fetch(originUrl);
    if (!origin.ok) return failed(origin);
    const response = withHeaders(origin);
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return respond(request, response);
  },
};
