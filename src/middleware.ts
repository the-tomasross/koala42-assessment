import { defineMiddleware } from 'astro:middleware';

// Security headers. On Cloudflare these lived in public/_headers; a Node
// server has to send them itself.
const HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "frame-ancestors 'none'",
  // Company pages carry names of real people from the public register.
  // A demo has no reason to put them into search engines.
  'X-Robots-Tag': 'noindex, nofollow',
};

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  for (const [name, value] of Object.entries(HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
});
