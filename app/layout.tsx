import type { Metadata } from "next";
import { Noto_Serif_SC, Noto_Sans_SC } from "next/font/google";
import BottomNav from "./components/BottomNav";
import UserMenu from "./components/UserMenu";
import "./globals.css";

const notoSerif = Noto_Serif_SC({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const notoSans = Noto_Sans_SC({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dream Keeper · 梦里的记忆",
  description: "把梦从转瞬即逝的图像，变成可留存的记忆。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSerif.variable} ${notoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-20">
        <UserMenu />
        <main className="flex-1 w-full max-w-2xl mx-auto px-6">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
