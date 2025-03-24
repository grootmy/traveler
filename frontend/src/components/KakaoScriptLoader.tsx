'use client';

import Script from "next/script";
import { useEffect } from "react";

// Window 인터페이스 확장 - 카카오 관련 속성 추가
declare global {
  interface Window {
    Kakao?: {
      init: (apiKey: string) => void;
      isInitialized: () => boolean;
      maps?: any;
    };
    kakao: {
      maps: {
        load: (callback: () => void) => void;
        Map: any;
        LatLng: any;
        Marker: any;
        MarkerImage: any;
        Size: any;
        Point: any;
        Polyline: any;
        event: {
          addListener: (instance: any, eventName: string, handler: Function) => any;
          removeListener: (listener: any) => void;
        };
        MapTypeId: Record<string, any>;
      }
    };
  }
}

// 전역 상태 관리
let kakaoInitialized = false;

export default function KakaoScriptLoader() {
  const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.6.0/kakao.min.js";
  const KAKAO_MAP_URL = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false&libraries=services,clusterer,drawing`;
  
  // 카카오 SDK 초기화 함수
  const initializeKakao = () => {
    if (typeof window !== 'undefined' && window.Kakao && !kakaoInitialized) {
      if (!window.Kakao.isInitialized()) {
        try {
          window.Kakao.init(process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY || '');
          kakaoInitialized = true;
        } catch (error) {
          console.error("카카오 SDK 초기화 실패:", error);
        }
      } else {
        kakaoInitialized = true;
      }
    }
  };

  // 카카오맵 API 초기화 함수
  const initializeKakaoMaps = () => {
    if (typeof window !== 'undefined' && window.kakao && window.kakao.maps) {
      if (typeof window.kakao.maps.load === 'function') {
        window.kakao.maps.load(() => {});
      }
    }
  };

  // 스크립트 로드 완료 핸들러
  const handleKakaoSDKLoad = () => initializeKakao();
  const handleKakaoMapLoad = () => initializeKakaoMaps();

  // 백업 로직 - 혹시 Script 컴포넌트가 제대로 작동하지 않을 경우 대비
  useEffect(() => {
    // 초기 확인
    if (typeof window !== 'undefined') {
      // SDK가 이미 로드되었는지 확인
      if (window.Kakao) {
        initializeKakao();
      }
      
      // 맵 API가 이미 로드되었는지 확인
      if (window.kakao && window.kakao.maps) {
        initializeKakaoMaps();
      }
    }
    
    // 3초 후 재확인
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        if (window.Kakao && !kakaoInitialized) {
          initializeKakao();
        }
        
        if (window.kakao && window.kakao.maps) {
          initializeKakaoMaps();
        }
      }
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {/* 카카오 SDK 로드 */}
      <Script
        id="kakao-sdk-script"
        src={KAKAO_SDK_URL}
        integrity="sha384-6MFdIr0zOira1CHQkedUqJVql0YtcZA1P0nbPrQYJXVJZUkTk/oX4U9GhUIs3/z8"
        crossOrigin="anonymous"
        strategy="beforeInteractive"
        onLoad={handleKakaoSDKLoad}
      />
      
      {/* 카카오맵 API 로드 */}
      <Script
        id="kakao-maps-script"
        src={KAKAO_MAP_URL}
        strategy="afterInteractive"
        onLoad={handleKakaoMapLoad}
      />
    </>
  );
} 