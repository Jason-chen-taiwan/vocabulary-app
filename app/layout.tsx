import type { Metadata, Viewport } from "next";
import Script from "next/script";
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
  metadataBase: new URL("https://0stack.org"),
  title: "VocabApp 字彙學習",
  description: "免費 TOEIC 單字學習 PWA：FSRS 科學排程、遊戲化成就、離線複習，跨裝置同步。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "VocabApp" },
  icons: { apple: "/icons/icon-192.png" },
  openGraph: {
    type: "website",
    siteName: "VocabApp",
    title: "VocabApp 字彙學習",
    description: "免費 TOEIC 單字學習 PWA：FSRS 科學排程、遊戲化成就、離線複習。",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#FF6A3D",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-Hant"
      className={`${nunito.variable} ${notoTC.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 早捕捉 beforeinstallprompt：Chrome 在 React hydration 前就觸發，必須在框架載入前先攔下存全域，否則安裝鈕永遠抓不到事件。 */}
        <Script id="pwa-install-capture" strategy="beforeInteractive">
          {`(function(){
  window.__deferredInstallPrompt = window.__deferredInstallPrompt || null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    window.__deferredInstallPrompt = e;
    window.dispatchEvent(new Event('pwa-bip-captured'));
  });
  window.addEventListener('appinstalled', function(){
    window.__deferredInstallPrompt = null;
    window.__pwaInstalled = true;
  });
})();`}
        </Script>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
