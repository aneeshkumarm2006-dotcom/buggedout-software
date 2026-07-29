import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { DeferredToaster } from "@/components/ui/deferred-toaster";
import { siteAsset } from "@/lib/site-assets";

import "./globals.css";

/**
 * Phase 7.2 — a bold display face for headings, Inter for body.
 *
 * Archivo is the closest grotesque to the wordmark on the key art: heavy,
 * slightly narrow, flat-sided, and still legible at the 12–14px an admin table
 * sets it at, which the poster faces (Anton, Bebas) are not. Both are variable
 * fonts, so the two files cover every weight either one is used at.
 *
 * `next/font` self-hosts both at build time — no request leaves the browser for
 * fonts.gstatic.com, and no swap-in shift on first paint.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const DESCRIPTION = "Bet free virtual coins on live real-world animal events.";

/**
 * `metadataBase` is what turns a relative asset path into the absolute URL a
 * link preview needs (8.1). It has to be known at build time and cannot come
 * from the request, so: the deploy's own env var, then the production domain.
 * Vercel sets `VERCEL_PROJECT_PRODUCTION_URL` to the bare host, without a
 * scheme. `siteAsset` may now return an already-absolute CDN URL, which
 * `metadataBase` correctly leaves alone.
 */
const siteUrl =
  process.env.AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://buggedout.com");

const ogImage = siteAsset("ogImage");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "BuggedOut",
    template: "%s · BuggedOut",
  },
  description: DESCRIPTION,
  // `favicon.ico` and `apple-icon.png` sit next to this file and are picked up
  // by the app-icon file convention — they need no entry here.
  openGraph: {
    type: "website",
    siteName: "BuggedOut",
    title: "BuggedOut",
    description: DESCRIPTION,
    url: "/",
    images: [{ url: ogImage, width: 1200, height: 630, alt: "BuggedOut" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BuggedOut",
    description: DESCRIPTION,
    images: [ogImage],
  },
};

export const viewport: Viewport = {
  // Matches `--background`, so the browser chrome on a phone continues the page
  // instead of drawing a grey band above it.
  themeColor: "#050f0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // `dark` is set here too so the first paint is dark before next-themes hydrates.
      className={`dark ${inter.variable} ${archivo.variable} h-full antialiased`}
      // The marble wash in `globals.css` is a stylesheet rule, and a stylesheet
      // cannot ask `site-assets.ts` where the file went. Handing it down as a
      // custom property keeps that one decision in one place like every other
      // asset, rather than leaving a hardcoded path in the CSS.
      style={{ "--bg-marble": `url("${siteAsset("bgMarble")}")` } as React.CSSProperties}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <DeferredToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
