import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader/index.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource-variable/inter/index.css";
import "./globals.css";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "The Dash", template: "%s · The Dash" },
  description: "A letter about life, becoming, and everything in between. A personal letter from Col Atwood.",
  alternates: { types: { "application/rss+xml": `${appUrl}/rss.xml` } },
  openGraph: { type: "website", siteName: "The Dash" },
};

export const viewport: Viewport = {
  themeColor: "#f7f3ec",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
