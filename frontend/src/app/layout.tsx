import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import KakaoScriptLoader from "@/components/KakaoScriptLoader";
import dynamic from 'next/dynamic';

// 클라이언트 컴포넌트를 동적으로 import
const SocketInitializer = dynamic(
  () => import('@/components/SocketInitializer').then((mod) => mod.SocketInitializer),
  { ssr: false }
);

export const metadata: Metadata = {
  title: "당일치기",
  description: "당일치기 여행 경로 추천 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode 
}>) {
  return (
    <html lang="ko" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        <SocketInitializer />
        {children}
        <Toaster />
        <KakaoScriptLoader />
      </body>
    </html>
  );
}