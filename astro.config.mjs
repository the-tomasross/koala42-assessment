// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Every page reads the database or ARES at request time.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'never',

  // Content policy. Astro hashes its own scripts and styles at build time,
  // so there is no 'unsafe-inline'. frame-ancestors does not work in a meta
  // tag, it is sent as a header from src/middleware.ts.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        'upgrade-insecure-requests',
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },

  vite: {
    plugins: [tailwindcss()],
    ssr: { external: ['better-sqlite3'] },
  },
});
