'use client';

import Script from "next/script";
import { useEffect, useState } from "react";

export default function KakaoScriptLoader() {
  const [mapScriptLoaded, setMapScriptLoaded] = useState(false);
  const [sdkScriptLoaded, setSdkScriptLoaded] = useState(false);
  
  // 카카오 SDK 초기화 함수
  const initializeKakaoSDK = () => {
    if (typeof window !== 'undefined' && (window as any).Kakao) {
      if (!(window as any).Kakao.isInitialized()) {
        try {
          // 카카오 SDK 초기화
          (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_API_KEY || 'a717481ad17ed66a13a2c9820884397a');
          console.log("카카오 SDK 초기화 완료");
        } catch (error) {
          console.error("카카오 SDK 초기화 실패:", error);
        }
      }
    }
  };
  
  // 카카오맵 API 로드 함수
  const loadKakaoMapScript = () => {
    if (typeof window !== 'undefined' && !(window as any).kakao) {
      console.log("카카오맵 API가 로드되지 않았습니다. 수동으로 로드합니다.");
      const script = document.createElement('script');
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY || 'a717481ad17ed66a13a2c9820884397a'}&autoload=false`;
      script.async = true;
      script.onload = () => {
        console.log("카카오맵 API 로드 완료");
        setMapScriptLoaded(true);
        // 카카오맵 API 초기화
        if ((window as any).kakao && (window as any).kakao.maps) {
          (window as any).kakao.maps.load(() => {
            console.log("카카오맵 API 초기화 완료");
          });
        }
      };
      document.head.appendChild(script);
    } else {
      setMapScriptLoaded(true);
    }
  };
  
  // 카카오 SDK 로드 완료 핸들러
  const handleSdkLoad = () => {
    console.log("카카오 SDK 로드 완료");
    setSdkScriptLoaded(true);
    initializeKakaoSDK();
  };
  
  useEffect(() => {
    // 카카오맵 API 로드
    loadKakaoMapScript();
    
    // 이미 카카오 SDK가 로드되어 있는 경우 초기화
    if (typeof window !== 'undefined' && (window as any).Kakao) {
      setSdkScriptLoaded(true);
      initializeKakaoSDK();
    }
    
    return () => {
      // 정리 함수
    };
  }, []);

  return (
    <>
      {/* 카카오 SDK 로드 */}
      <Script
        src="https://t1.kakaocdn.net/kakao_js_sdk/2.6.0/kakao.min.js"
        integrity="sha384-6MFdIr0zOira1CHQkedUqJVql0YtcZA1P0nbPrQYJXVJZUkTk/oX4U9GhUIs3/z8"
        crossOrigin="anonymous"
        strategy="afterInteractive"
        onLoad={handleSdkLoad}
      />
    </>
  );
} 