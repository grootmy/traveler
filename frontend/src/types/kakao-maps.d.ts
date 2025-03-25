/**
 * Kakao Maps API의 타입 정의
 * DRY 원칙을 위해 여러 파일에서 재사용 가능한 타입 정의
 */

declare namespace KakaoMaps {
  // 좌표 인터페이스
  interface LatLng {
    getLat(): number;
    getLng(): number;
  }

  // 지도 경계 인터페이스
  interface LatLngBounds {
    extend(point: LatLng): void;
  }

  // 마커 인터페이스
  interface Marker {
    setMap(map: Map | null): void;
  }

  // 지도 인터페이스
  interface Map {
    setCenter(latlng: LatLng): void;
    getCenter(): LatLng;
    setLevel(level: number): void;
    getLevel(): number;
    setMapTypeId(mapTypeId: any): void;
    getMapTypeId(): any;
    setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
    relayout(): void;
  }

  // 마커 클러스터러 인터페이스
  interface MarkerClusterer {
    clear(): void;
    addMarkers(markers: Marker[]): void;
  }

  // 폴리라인 인터페이스
  interface Polyline {
    setMap(map: Map | null): void;
  }

  // 이벤트 인터페이스
  interface EventObject {
    addListener(target: any, type: string, handler: Function): any;
    removeListener(listenerId: any): void;
  }

  // 지도 서비스 (장소 검색 등)
  interface PlacesServices {
    keywordSearch(keyword: string, callback: Function, options?: any): void;
  }

  // 서비스 네임스페이스
  interface Services {
    Places: new () => PlacesServices;
    Status: {
      OK: string;
      ZERO_RESULT: string;
      ERROR: string;
    };
  }

  // 전체 Kakao Maps 객체
  interface KakaoMapObject {
    load: (callback: () => void) => void;
    Map: new (container: HTMLElement, options: any) => Map;
    LatLng: new (lat: number, lng: number) => LatLng;
    LatLngBounds: new () => LatLngBounds;
    Marker: new (options: any) => Marker;
    MarkerImage: new (src: string, size: any, options?: any) => any;
    MarkerClusterer: new (options: any) => MarkerClusterer;
    Size: new (width: number, height: number) => any;
    Point: new (x: number, y: number) => any;
    Polyline: new (options: any) => Polyline;
    services: Services;
    event: EventObject;
    MapTypeId: Record<string, any>;
  }
}

// 글로벌 윈도우 객체에 kakao 네임스페이스 확장
declare global {
  interface Window {
    kakao: {
      maps: KakaoMaps.KakaoMapObject;
    };
  }
}

export {}; 