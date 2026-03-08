import type { NextConfig } from "next";

// CSP is only applied in production to avoid blocking Next.js dev mode features
const isDev = process.env.NODE_ENV === 'development'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

// Only add CSP in production - dev mode needs eval for hot reload
if (!isDev) {
  securityHeaders.push({
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'unsafe-inline' needed for theme script in layout.tsx to prevent flash
      // 'blob:' needed for Web Workers (Monte Carlo simulation)
      // Firebase Auth loads scripts from apis.google.com + accounts.google.com
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://apis.google.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // Google user avatars served from *.googleusercontent.com
      "img-src 'self' data: blob: https://*.googleusercontent.com",
      // html-to-image fetches Google Fonts to embed in canvas for copy-as-image
      // Firebase Auth + Firestore + Google Fonts + OAuth endpoints
      "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://login.microsoftonline.com",
      // Web Workers are loaded as blob URLs
      "worker-src 'self' blob:",
      // Firebase Auth popup/redirect + OAuth provider pages
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://login.microsoftonline.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  })
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
