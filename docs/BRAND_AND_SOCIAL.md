# Brand assets & social sharing

## Files (`public/`)

| File | Use |
|------|-----|
| `brand/rise-shine-logo-full.png` | Source wordmark (512×512). Used in-app via `components/BrandMark.js`. |
| `brand/favicon-32.png` | Small PNG favicon. |
| `favicon.ico` | Classic browser tab icon. |
| `brand/apple-touch-icon.png` | 180×180, iOS home screen. |
| `brand/icon-192.png`, `brand/icon-512.png` | PWA / `site.webmanifest`. |
| `og-image.png` | **1200×630** Open Graph + Twitter large card image (logo on `#1a2226`). |

After replacing `brand/rise-shine-logo-full.png`, regenerate derivatives:

```bash
python3 scripts/generate-brand-assets.py
```

## Environment

Set **`NEXT_PUBLIC_SITE_URL`** to your production origin (no trailing slash), e.g. `https://rise-and-shine.example.com`, so `og:image` and Twitter `image` meta tags use absolute URLs (required by Facebook and most crawlers). Vercel provides `VERCEL_URL` as a fallback during build when this is unset.

## In-app

- **Dashboard:** sidebar lockup + mobile header icon (`DashboardLayout`).
- **Login & marketing landing:** centered lockup / icon (`login.js`, `index.js`).
