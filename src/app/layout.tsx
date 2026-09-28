import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { Providers } from '@/components/providers'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

const SITE_NAME = "OurDAO"
const SITE_TITLE = "OurDAO - Member-Owned Lending on Stellar"
const SITE_DESCRIPTION =
  "A member-owned lending DAO on Stellar Soroban with a name registry, content-hash document metadata, commit-reveal private voting, and staking."
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · OurDAO",
  },
  description: SITE_DESCRIPTION,
  keywords: "DeFi, DAO, lending, Stellar, Soroban, peer-to-peer",
  authors: [{ name: "OurDAO" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OurDAO"
  },
  formatDetection: {
    telephone: false
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "msapplication-TileColor": "#4f46e5",
    "msapplication-config": "/browserconfig.xml"
  }
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // WCAG 1.4.4 (Resize Text) requires users be able to pinch-zoom to at
  // least 200%. maximumScale: 1 + userScalable: false previously blocked
  // that entirely (issue #65) — removed so the browser's default zoom
  // range applies.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e17" },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ServiceWorkerRegistration />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
