import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Nordic look: Hanken Grotesk carries both body and display (headlines = weight 700, tight tracking);
// JetBrains Mono carries Trend Score, metrics and labels. --font-display maps to --font-sans in CSS.
const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const mono = JetBrains_Mono({
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
