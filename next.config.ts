import type { NextConfig } from "next";
import { version } from "./package.json";

/**
 * Build image remote patterns from IPFS gateway configuration.
 * 
 * Note: CSP and other security headers are now generated in src/middleware.ts
 * to support per-request nonce generation for script-src. The buildCsp function
 * has been removed; see middleware.ts for the new nonce-based policy.
 */

function buildImageRemotePatterns() {
  const ipfsGateways = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  const patterns: {
    protocol?: "http" | "https";
    hostname: string;
    port?: string;
    pathname?: string;
  }[] = [];
  const seen = new Set<string>();

  for (const raw of ipfsGateways) {
    try {
      const u = new URL(raw);
      const protocol = (u.protocol.replace(":", "") as "http" | "https") || "https";
      const hostname = u.hostname;
      const port = u.port || undefined;
      let pathname = u.pathname;
      if (!pathname || pathname === "/") {
        pathname = "/**";
      } else {
        pathname = pathname.endsWith("/") ? `${pathname}**` : `${pathname}/**`;
      }

      const key = `${protocol}://${hostname}:${port ?? ""}${pathname}`;
      if (!seen.has(key)) {
        seen.add(key);
        patterns.push({
          protocol,
          hostname,
          ...(port ? { port } : {}),
          pathname,
        });
      }
    } catch {
      // Ignore malformed env values — don't break the build
    }
  }

  return patterns;
}

export { buildImageRemotePatterns };

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {},
  // Emits `.map` files beside the client chunks in `.next/static`, which is
  // what lets `scripts/bundle-size.mjs composition` attribute shipped bytes to
  // the package that produced them (#266) — Turbopack's minified chunks name
  // no modules, so without a map a size regression can be detected but not
  // explained.
  //
  // Opt-in rather than always on: source maps for the whole client roughly
  // double build output and add time, and only the bundle job needs them. The
  // `bundle-size` npm script and the CI job set ANALYZE_BUNDLE=1.
  productionBrowserSourceMaps: process.env.ANALYZE_BUNDLE === "1",
  // Surfaced in the UI by src/lib/build-info.ts so a bug report can name the
  // build and match it to a CHANGELOG.md entry (#250). The SHA comes from the
  // deploy platform (Vercel) or CI (GitHub Actions); absent locally.
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "",
  },
  // `page.dev.tsx` routes (the /dev/components catalogue, #253) exist only
  // under `next dev`. `next build` sets NODE_ENV=production, so there the file
  // is an ordinary non-route file nothing imports, and it never reaches the
  // production bundle.
  pageExtensions:
    process.env.NODE_ENV === "production"
      ? ["tsx", "ts", "jsx", "js"]
      : ["dev.tsx", "tsx", "ts", "jsx", "js"],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: buildImageRemotePatterns(),
  },
  // Security headers (including CSP) are now set in src/middleware.ts to
  // support per-request nonce generation for script-src. See middleware.ts
  // for the nonce-based CSP policy and rationale.
};

export default nextConfig;
