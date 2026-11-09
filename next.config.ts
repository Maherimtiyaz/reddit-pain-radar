import type { NextConfig } from "next";

/**
 * Response-body protection that the individual headers below cannot express:
 * `frame-ancestors` mirrors the legacy `X-Frame-Options`, `base-uri` stops an
 * injected `<base>` from re-pointing every relative URL, `form-action` keeps a
 * compromised form from posting credentials off-site, and `object-src 'none'`
 * removes plugin content.
 *
 * `script-src` still needs `'unsafe-inline'`: Next streams inline bootstrap and
 * hydration data, and a nonce would force every route to be dynamic. That is a
 * documented trade-off, not a claim that inline script is safe — the real
 * defence against XSS here is React escaping all user content and the app
 * never rendering untrusted HTML.
 *
 * Applied in production only so Turbopack's dev client (HMR websockets,
 * injected dev scripts) is unaffected.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Do not advertise the framework in response headers.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The app ships no `unsafe-eval`-free CSP yet; these are the safe
          // baseline every deployment should carry.
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]
            : []),
        ],
      },
    ];
  },
  experimental: {
    // Part of the 16.4.0 -> 16.4.3 security upgrade: opts this app into the
    // agent-driven upgrade flow so future advisories surface the same way.
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
