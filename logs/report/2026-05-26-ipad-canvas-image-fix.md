# iPad Canvas Image Fix - 2026-05-26

## Symptom

- Canvas images rendered on desktop after production deployment.
- The same canvas images did not render on iPad.

## Findings

- Railway Spring logs showed the backend started successfully.
- Vercel logs did not show frontend runtime errors because the React app is served as static assets.
- Railway Postgres canvas data contained image URLs pointing to an internal LAN address: `http://192.168.0.18:8080/uploads/...`.
- Those URLs are not valid for all production clients and can be blocked from the HTTPS Vercel app, especially on iPad/Safari.

## Fix

- Changed canvas image upload handling in the React app to store images as data URLs for canvas elements.
- Converted existing Railway canvas image URLs from internal `/uploads/...` URLs to data URLs using the local upload files.
- Applied the same data conversion to the local Docker PostgreSQL database.
- Redeployed the React app to Vercel production.

## Verification

- Railway DB internal canvas image URLs: 0
- Railway DB data URL canvas images: 10
- Railway Spring health endpoint returned HTTP 200 with status `UP`.
- Vercel `/canvas` route returned HTTP 200.
- Production JS bundle includes the new data URL upload path.
- Vercel production deployment status: `READY`

## Notes

- This fix makes canvas images independent from Railway container-local upload storage.
- Blog/document uploads still use the upload endpoint and may need a separate persistent object storage strategy later.
- Vercel build completed with existing non-blocking optional `canvas` dependency warnings.
