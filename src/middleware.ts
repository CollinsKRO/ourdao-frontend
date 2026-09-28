import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Generate a cryptographically random nonce for CSP script-src.
 * Uses Web Crypto API for secure random generation.
 */
function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Buffer.from(array).toString('base64')
}

/**
 * Build CSP with a per-request nonce for script-src.
 * 
 * This middleware generates a unique nonce for each request and injects it
 * into the CSP header. Next.js will automatically pick up the nonce and apply
 * it to inline scripts during hydration when using the App Router.
 * 
 * The nonce approach with 'strict-dynamic' provides strong XSS protection:
 * - Only scripts with the correct nonce can execute
 * - 'strict-dynamic' allows those scripts to load additional scripts
 * - 'unsafe-inline' is removed, blocking injected inline scripts
 * 
 * style-src keeps 'unsafe-inline' because Next.js still requires it for
 * inline styles in the App Router. This is documented separately from the
 * script-src policy.
 * 
 * img-src is restricted to specific origins:
 * - 'self' for static assets served from this domain
 * - data: for inline data URIs (e.g., base64-encoded images)
 * - blob: for dynamically-generated previews (DocumentViewer uses URL.createObjectURL)
 * - IPFS gateway origins for user-uploaded document images
 * 
 * This prevents arbitrary HTTPS origins from being used as image sources,
 * which would leak the viewer's IP and referer to external hosts.
 */
function buildCspWithNonce(nonce: string): string {
  const rpcUrl = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'
  const ipfsGateways = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)

  const origins = new Set<string>()

  for (const raw of [rpcUrl, backendUrl, ...ipfsGateways]) {
    try {
      const u = new URL(raw)
      origins.add(u.origin)
    } catch {
      // Ignore malformed env values
    }
  }

  const wsOrigins = new Set<string>()
  for (const o of origins) {
    try {
      const u = new URL(o)
      if (u.protocol === 'http:') wsOrigins.add(`ws://${u.host}`)
      if (u.protocol === 'https:') wsOrigins.add(`wss://${u.host}`)
    } catch {
      // ignore
    }
  }

  const connectSrc = [
    "'self'",
    ...Array.from(origins),
    ...Array.from(wsOrigins),
    'ws://localhost:*',
    'wss://localhost:*',
  ].join(' ')

  // img-src: restrict to known origins instead of allowing all https:
  // - 'self' for static assets from public/ and generated images
  // - data: for inline base64-encoded images
  // - blob: for dynamically-generated previews (DocumentViewer uses URL.createObjectURL)
  // - IPFS gateway origins for user-uploaded documents
  const imgSrc = ["'self'", 'data:', 'blob:', ...Array.from(origins)].join(' ')

  const directives = [
    "default-src 'self'",
    // Nonce-based script policy with strict-dynamic for XSS protection.
    // The nonce is automatically applied to Next.js hydration scripts.
    // 'strict-dynamic' allows nonce-tagged scripts to load additional scripts.
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    // style-src still requires 'unsafe-inline' for Next.js App Router inline styles.
    // This is separate from the script-src policy and documented explicitly.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "media-src 'self' blob: data:",
  ]

  return directives.join('; ')
}

export function middleware(request: NextRequest) {
  const nonce = generateNonce()
  const csp = buildCspWithNonce(nonce)

  // Clone the request headers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Set CSP header on response
  response.headers.set('Content-Security-Policy', csp)

  // Set other security headers (previously in next.config.ts headers())
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()'
  )
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (static files)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|xml)).*)',
  ],
}
