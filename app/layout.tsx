import type { Metadata } from "next";
import { Nunito, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

const notoTC = Noto_Sans_TC({
  weight: ["400", "500", "700"],
  variable: "--font-noto-tc",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "VocabApp 字彙學習",
  description: "考試導向的英文字彙學習 PWA",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-Hant"
      className={`${nunito.variable} ${notoTC.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<PwaRegister /></body>
    </html>
  );
}
