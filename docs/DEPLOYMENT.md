# Deployment Guide

## Deployment Target

OurDAO Frontend is a **Next.js 16 application** that requires a **Node.js server runtime** for full functionality. It cannot run as a static export because:

- `src/app/api/documents/route.ts` is a server-side API route that handles document uploads to Pinata
- Security headers in `next.config.ts` are emitted by the Next.js server
- `PINATA_JWT` is a server-only secret that must live in the server environment

## Runtime Requirements

- **Node.js**: >= 18.0.0 (LTS recommended)
- **npm**: >= 9.0.0
- **Platform**: Any platform supporting Node.js (Vercel, Railway, Docker, self-hosted)

## Environment Variables

### Build-time Variables (NEXT_PUBLIC_*)

These are inlined at build time and cannot be changed at runtime:

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_CONTRACT_ID` | Deployed OurDAO contract ID | _(empty)_ |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Soroban RPC endpoint | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | Network passphrase | testnet |
| `NEXT_PUBLIC_IPFS_GATEWAY` | IPFS gateway URL(s) | Pinata gateway |
| `NEXT_PUBLIC_BACKEND_URL` | OurDAO backend URL | `http://localhost:4000` |
| `NEXT_PUBLIC_SITE_URL` | Public site origin | `http://localhost:3000` |
| `NEXT_PUBLIC_FEATURE_FLAGS` | Comma-separated names of the risky changes to enable in this build | _(empty → all flags off)_ |

### Runtime Variables (Server-only)

These are read at runtime and never exposed to the client:

| Variable | Purpose | Required |
|----------|---------|----------|
| `PINATA_JWT` | Pinata credential for document pinning | Yes (for uploads) |

## Security Headers

The following security headers are configured in `next.config.ts` and applied by the Next.js server:

- `Content-Security-Policy` (enforced)
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `frame-ancestors 'none'` (CSP)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `poweredByHeader: false`

**Note**: If deploying to a static host (not recommended), these headers must be configured separately at the hosting layer.

## Deployment Options

### Option 1: Docker (Recommended for self-hosted)

```bash
# Build the Docker image
docker build -t ourdao-frontend .

# Run the container
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_CONTRACT_ID=YOUR_CONTRACT_ID \
  -e NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org \
  -e NEXT_PUBLIC_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" \
  -e PINATA_JWT=YOUR_PINATA_JWT \
  -e NEXT_PUBLIC_BACKEND_URL=https://your-backend.example.com \
  -e NEXT_PUBLIC_SITE_URL=https://your-domain.example.com \
  ourdao-frontend
```

### Option 2: Vercel

1. Connect your GitHub repository to Vercel
2. Set environment variables in the Vercel dashboard
3. Deploy automatically on push to `main`

### Option 3: Self-hosted (Node.js)

```bash
npm install
npm run build
npm start
```

## Build and Run Recipe

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your values

# 3. Build for production
npm run build

# 4. Start the server
npm start
```

The app will be available at `http://localhost:3000` by default.

## Build-time vs Runtime Variables

| Type | Examples | When Set | Changeable at Runtime |
|------|----------|----------|----------------------|
| Build-time | `NEXT_PUBLIC_*` | During `npm run build` | No |
| Runtime | `PINATA_JWT` | When server starts | Yes |

**Important**: Changing `NEXT_PUBLIC_*` values requires a full rebuild and redeployment.

## After a deploy

- **Something is wrong and you need to undo it:** see
  [ROLLBACK.md](ROLLBACK.md) — the flag-off, redeploy-previous-build, and
  roll-forward lanes, and what can't be rolled back at all.
- **The contract was redeployed:** see
  [CONTRACT-REDPLOYMENT.md](CONTRACT-REDPLOYMENT.md) — what has to change in
  this repo, and in what order.
- **You shipped something risky behind a flag:** see
  [FEATURE_FLAGS.md](FEATURE_FLAGS.md) for how flags work and how to remove one.
