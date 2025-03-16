'use client';

import Script from "next/script";
import { useEffect } from "react";

export default function KakaoScriptLoader() {
  const handleLoad = () => {
    // 카카오 SDK 초기화
    if (typeof window !== 'undefined' && (window as any).Kakao) {
      if (!(window as any).Kakao.isInitialized()) {
        (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_API_KEY);
        console.log("카카오 SDK 초기화 완료");
      }
    }
  };
  
  useEffect(() => {
    // 페이지 로드 시 카카오맵 API 로드 상태 확인
    if (typeof window !== 'undefined' && !(window as any).kakao) {
      console.log("카카오맵 API가 로드되지 않았습니다. 수동으로 로드합니다.");
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY || 'a717481ad17ed66a13a2c9820884397a'}&autoload=true`;
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

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