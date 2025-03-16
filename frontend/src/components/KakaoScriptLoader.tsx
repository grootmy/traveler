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
          (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY);
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
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY }&autoload=false`;
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
    } else if (typeof window !== 'undefined' && (window as any).kakao) {
      setMapScriptLoaded(true);
      // 이미 로드된 경우 초기화 확인
      if ((window as any).kakao.maps && !(window as any).kakao.maps.Map) {
        (window as any).kakao.maps.load(() => {
          console.log("카카오맵 API 초기화 완료");
        });
      }
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
    
    // 5초 후에 다시 확인하여 로드되지 않았으면 재시도
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        if (!(window as any).kakao || !(window as any).kakao.maps) {
          console.log("카카오맵 API가 로드되지 않았습니다. 다시 시도합니다.");
          loadKakaoMapScript();
        }
        
        if (!(window as any).Kakao) {
          console.log("카카오 SDK가 로드되지 않았습니다. 다시 시도합니다.");
          // SDK는 Script 컴포넌트로 로드되므로 여기서는 상태만 확인
        }
      }
    }, 5000);
    
    return () => {
      // 정리 함수
      clearTimeout(timer);
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