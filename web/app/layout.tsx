import type { Metadata } from "next";
import { Schibsted_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";

// Nordic, editorial look: Schibsted Grotesk carries both body and display (headlines = weight 700,
// tight tracking); Geist Mono carries the Trend Score, metrics and labels. --font-display maps to
// --font-sans in CSS (@theme inline), so the single sans face powers both facets.
const sans = Schibsted_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Orbit",
  description:
    "Sök ett ämne och hitta de mest framgångsrika TikTok- och Reels-videorna — spara dina favoriter i samlingar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${sans.variable} ${mono.variable} h-full`}
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
