import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://reelate.co"),
  title: "Reelate — AI Short Video Generator",
  description:
    "Turn any topic into a ready-to-post short video with AI voiceover and subtitles in minutes.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    siteName: "Reelate",
    type: "website",
    title: "Reelate — AI Short Video Generator",
    description:
      "Turn any topic into a ready-to-post short video with AI voiceover and subtitles in minutes.",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4c63a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${bricolage.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
