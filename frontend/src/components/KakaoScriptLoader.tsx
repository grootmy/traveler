'use client';

import Script from "next/script";
import { useEffect, useState } from "react";

// 전역 플래그를 추가하여 중복 로딩 방지
let kakaoMapScriptLoaded = false;
let kakaoSDKInitialized = false;

export default function KakaoScriptLoader() {
  const [mapScriptLoaded, setMapScriptLoaded] = useState(false);
  const [sdkScriptLoaded, setSdkScriptLoaded] = useState(false);
  
  // 카카오 SDK 초기화 함수
  const initializeKakaoSDK = () => {
    if (typeof window !== 'undefined' && (window as any).Kakao && !kakaoSDKInitialized) {
      if (!(window as any).Kakao.isInitialized()) {
        try {
          // 카카오 SDK 초기화
          (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY);
          console.log("카카오 SDK 초기화 완료");
          kakaoSDKInitialized = true;
        } catch (error) {
          console.error("카카오 SDK 초기화 실패:", error);
        }
      } else {
        kakaoSDKInitialized = true;
      }
    }
  };
  
  // 카카오맵 API 로드 함수
  const loadKakaoMapScript = () => {
    // 이미 로드된 경우 중복 방지
    if (kakaoMapScriptLoaded) return;
    
    if (typeof window !== 'undefined' && !(window as any).kakao) {
      console.log("카카오맵 API가 로드되지 않았습니다. 수동으로 로드합니다.");
      const script = document.createElement('script');
      script.id = 'kakao-map-script';
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false&libraries=services,clusterer,drawing`;
      script.async = true;
      script.onload = () => {
        console.log("카카오맵 API 로드 완료");
        kakaoMapScriptLoaded = true;
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
      console.log("카카오맵 API가 이미 로드되어 있습니다.");
      kakaoMapScriptLoaded = true;
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
    // 직접 스크립트 태그 로드 방식으로 변경
    loadKakaoMapScript();
    
    // 이미 카카오 SDK가 로드되어 있는 경우 초기화
    if (typeof window !== 'undefined' && (window as any).Kakao) {
      setSdkScriptLoaded(true);
      initializeKakaoSDK();
    }
    
    // 3초 후에 다시 확인하여 로드되지 않았으면 재시도
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        // 카카오맵 API가 로드되지 않은 경우 재시도
        if (!(window as any).kakao || !(window as any).kakao.maps) {
          console.log("카카오맵 API가 로드되지 않았습니다. 다시 시도합니다.");
          // 기존 스크립트 태그가 있으면 제거
          const existingScript = document.getElementById('kakao-map-script');
          if (existingScript) {
            existingScript.remove();
          }
          loadKakaoMapScript();
        }
        
        // 카카오 SDK가 로드되지 않은 경우 로그만 출력
        if (!(window as any).Kakao) {
          console.log("카카오 SDK가 로드되지 않았습니다.");
        }
      }
    }, 3000);
    
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
        strategy="beforeInteractive"
        onLoad={handleSdkLoad}
      />
    </>
  );
} 