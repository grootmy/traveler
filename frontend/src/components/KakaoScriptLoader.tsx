'use client';

import Script from "next/script";

export default function KakaoScriptLoader() {
  const handleLoad = () => {
    // 카카오 SDK 초기화
    if (typeof window !== 'undefined' && (window as any).Kakao) {
      if (!(window as any).Kakao.isInitialized()) {
        (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_API_KEY);
      }
    }
  };

  return (
    <Script
      src="https://t1.kakaocdn.net/kakao_js_sdk/2.6.0/kakao.min.js"
      integrity="sha384-6MFdIr0zOira1CHQkedUqJVql0YtcZA1P0nbPrQYJXVJZUkTk/oX4U9GhUIs3/z8"
      crossOrigin="anonymous"
      strategy="lazyOnload"
      onLoad={handleLoad}
    />
  );
} 