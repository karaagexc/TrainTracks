import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PanicLogger } from "@/components/PanicLogger";
import { SecurityGuard } from "@/components/SecurityGuard";

const cabin = localFont({
  src: [
    { path: "./fonts/Cabin-Regular-TTF.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Cabin-Medium-TTF.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Cabin-SemiBold-TTF.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Cabin-Bold-TTF.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Cabin-Italic-TTF.woff2", weight: "400", style: "italic" },
    { path: "./fonts/Cabin-MediumItalic-TTF.woff2", weight: "500", style: "italic" },
    { path: "./fonts/Cabin-SemiBoldItalic-TTF.woff2", weight: "600", style: "italic" },
    { path: "./fonts/Cabin-BoldItalic-TTF.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-cabin",
});

export const metadata: Metadata = {
  title: "Metro Manila Rail",
  description: "Track your trip on LRT-1, LRT-2, and MRT-3",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${cabin.variable} font-sans antialiased bg-black text-white overflow-hidden overscroll-none`}
        style={{ backgroundColor: "#000000", height: "100vh", width: "100vw", position: "fixed" }}
      >
        <PanicLogger />
        <SecurityGuard />
        <noscript>
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: '#000',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'var(--font-cabin), Cabin, system-ui, sans-serif',
            gap: '1.5rem',
          }}>
            <div style={{ fontSize: '5rem' }}>⚡</div>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.05em' }}>
              JavaScript Required
            </h1>
            <p style={{ color: '#a1a1aa', maxWidth: '24rem', fontSize: '1.125rem' }}>
              This app requires JavaScript to run. Please enable JavaScript in your browser settings and reload the page.
            </p>
            <div style={{ position: 'absolute', bottom: '2rem', fontSize: '0.75rem', color: '#3f3f46', fontFamily: 'monospace' }}>
              ERROR_JAVASCRIPT_DISABLED
            </div>
          </div>
        </noscript>
        <div className="w-full h-full relative overflow-hidden bg-black" suppressHydrationWarning>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </body>
    </html>
  );
}
