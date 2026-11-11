# Free CDN for website photos and videos (Cloudflare)

Every upload is stored on Cloudinary (see `.env.example`). Public website media (doctor photos, blog covers,
gallery, homepage videos) is already served from Cloudinary's own CDN, but the Free plan has 25 credits a month
(1 credit ≈ 1 GB of traffic). One homepage video watched 1,000 times can use most of that.

A Cloudflare Worker on your own subdomain (e.g. `media.example.com`) sits in front of Cloudinary and caches
each file at Cloudflare. Cloudinary is only asked again when a Cloudflare location doesn't have the file yet, so
almost all traffic is free. Patient reports and WhatsApp media are private and never go through it.

Cloudflare Free plan limits: 100,000 Worker requests a day, files up to 512 MB. Browsers keep each file for a
year, so a visitor coming back doesn't count again. If you ever outgrow it, Workers Paid is $5 a month.

## One-time setup

### 1. Put a domain on Cloudflare
The Worker needs a domain whose DNS is on Cloudflare (a free `*.workers.dev` address can't use the cache).
- Cloudflare dashboard → **Add a domain** → pick the **Free** plan.
- At your domain registrar, change the nameservers to the two Cloudflare shows you. Cloudflare copies the
  existing DNS records first; check they're all there before switching.
- Wait until the domain shows **Active**.

### 2. Create the Worker
- **Workers & Pages** → **Create** → **Create Worker** → name it `ezaaz-media` → **Deploy**.
- **Edit code**, replace everything with the contents of `cdn/media-worker.js`, then **Deploy**.
- **Settings → Variables and Secrets** → **Add**: type *Text*, name `CLOUD_NAME`, value = your
  `CLOUDINARY_CLOUD_NAME` from `.env` → **Deploy**.

### 3. Give it the media subdomain
- Worker → **Settings → Domains & Routes** → **Add** → **Custom domain** → `media.example.com` (your domain).
  Cloudflare creates the DNS record and HTTPS certificate itself; don't add a DNS record by hand.

### 4. Test it
Open any doctor photo URL from the website and swap the start:

    https://res.cloudinary.com/<cloud name>/image/upload/v123/ezaaz/doctors/abc.jpg
    https://media.example.com/image/upload/v123/ezaaz/doctors/abc.jpg

The second one should show the same photo. Open it twice, then check the response headers in the browser's
developer tools (Network tab): the second time `cf-cache-status` is `HIT`.

For a video (iPhones only play videos served in parts), run this twice; both times the first line must say `206`:

    curl -sI -H "Range: bytes=0-1" https://media.example.com/video/upload/v123/ezaaz/site/abc.mp4

### 5. Switch the website to it
In `client/.env.production` add:

    VITE_MEDIA_CDN_URL=https://media.example.com

Rebuild and upload the client (`npm run build`). Every Cloudinary photo and video on the website (and in the
admin panel) now loads through Cloudflare. Remove the line and rebuild to go back to Cloudinary directly.
The database keeps the original Cloudinary URLs, so nothing else changes.

## Good to know
- Replacing a photo or video gives it a new URL, so visitors never see an old version.
- A deleted file stays in Cloudflare's cache for a while, but no page links to it any more. If it must disappear
  at once, Cloudflare → your domain → **Caching → Configuration → Custom Purge** → paste its media URL.
- The videos built into the website (`client/src/assets`, e.g. the 38 MB homepage video) and the PDFs in
  `client/public/docs` are served by the website hosting, not Cloudinary. To cache those too, put the website's
  own domain on Cloudflare as in step 1 with the DNS record **Proxied** (orange cloud). Cloudflare caches MP4 and
  PDF files by default.
