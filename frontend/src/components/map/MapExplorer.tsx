import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, MapPin, Circle, Maximize, X } from 'lucide-react';
import KakaoMap, { KakaoMapHandle } from '@/components/KakaoMap';
import PlaceCard from '@/components/PlaceCard';
import { toast } from 'sonner';

// 타입 정의
export interface Place {
  textid: string;
  name: string;
  description: string;
  category: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  image_url?: string;
  price_level?: string;
  rating?: string;
  recommendation_reason?: string;
  is_recommended?: boolean;
}

interface SearchMode {
  type: 'radius' | 'bounds';
  radius?: number; // meters
}

interface CategoryCheckbox {
  id: string;
  label: string;
  color: string;
}

interface MapExplorerProps {
  onSelectPlace?: (place: Place) => void;
  initialCenter?: { lat: number; lng: number };
  initialLevel?: number;
}

// 카테고리 정의 (확장 가능)
const CATEGORIES: CategoryCheckbox[] = [
  { id: '관광지', label: '관광지', color: '#4285F4' },
  { id: '음식점', label: '음식점', color: '#EA4335' },
  { id: '카페', label: '카페', color: '#FBBC05' },
  { id: '쇼핑', label: '쇼핑', color: '#34A853' },
  { id: '숙박', label: '숙박', color: '#8E44AD' },
  { id: '문화시설', label: '문화시설', color: '#F39C12' },
  { id: '레저', label: '레저', color: '#16A085' }
];

// 마커 생성 유틸리티 함수
const createMarkerData = (place: any, categoryColor: string = '#4285F4') => {
  return {
    id: place.textid,
    position: {
      lat: place.location.lat,
      lng: place.location.lng
    },
    title: place.name,
    content: place.description || '',
    category: place.category,
    color: categoryColor
  };
};

// 카테고리 색상 찾기
const getCategoryColor = (category: string): string => {
  const foundCategory = CATEGORIES.find(c => c.id === category);
  return foundCategory?.color || '#4285F4'; // 기본 색상
};

const MapExplorer: React.FC<MapExplorerProps> = ({
  onSelectPlace,
  initialCenter = { lat: 37.5665, lng: 126.9780 }, // 서울 중심 기본값
  initialLevel = 7
}) => {
  // 상태 변수
  const [searchMode, setSearchMode] = useState<SearchMode>({ type: 'bounds' });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState(initialCenter);
  const [mapLevel, setMapLevel] = useState(initialLevel);
  const [mapBounds, setMapBounds] = useState<any>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [searchRadius, setSearchRadius] = useState(1000); // 1km 기본값
  
  // 지도 참조
  const mapRef = useRef<KakaoMapHandle>(null);
  
  // 현재 지도 중앙으로 이동
  const moveToCurrentCenter = useCallback(() => {
    if (mapRef.current) {
      const center = mapRef.current.getCenter();
      if (center) {
        setMapCenter(center);
      }
    }
  }, []);
  
  // 선택된 카테고리 토글
  const toggleCategory = useCallback((categoryId: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
    });
  }, []);
  
  // 모든 카테고리 선택/해제
  const toggleAllCategories = useCallback((selectAll: boolean) => {
    if (selectAll) {
      setSelectedCategories(CATEGORIES.map(cat => cat.id));
    } else {
      setSelectedCategories([]);
    }
  }, []);
  
  // 반경 검색 실행
  const searchByRadius = useCallback(async () => {
    if (!mapCenter) return;
    
    setLoading(true);
    try {
      // API 요청 URL 생성
      const url = new URL('/api/places/nearby', window.location.origin);
      url.searchParams.append('lat', mapCenter.lat.toString());
      url.searchParams.append('lng', mapCenter.lng.toString());
      url.searchParams.append('radius', searchRadius.toString());
      
      if (selectedCategories.length > 0) {
        url.searchParams.append('categories', selectedCategories.join(','));
      }
      
      // API 호출
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('장소 검색 실패');
      }
      
      const result = await response.json();
      
      // 결과 처리
      setPlaces(result.data || []);
      
      // 마커 생성
      const newMarkers = (result.data || []).map((place: Place) => {
        return createMarkerData(place, getCategoryColor(place.category));
      });
      
      setMarkers(newMarkers);
      
      // 결과 토스트 메시지
      toast.success(`${result.count}개의 장소를 찾았습니다`);
      
    } catch (error: any) {
      console.error('반경 검색 오류:', error);
      toast.error(error.message || '검색 중 오류가 발생했습니다');
      setPlaces([]);
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }, [mapCenter, searchRadius, selectedCategories]);
  
  // 현재 지도 영역 내 검색 실행
  const searchWithinBounds = useCallback(async () => {
    if (!mapBounds) {
      // 현재 지도 영역 가져오기
      if (mapRef.current) {
        const bounds = mapRef.current.getBounds();
        if (!bounds) {
          toast.error('지도 영역을 가져올 수 없습니다');
          return;
        }
        setMapBounds(bounds);
      } else {
        toast.error('지도가 준비되지 않았습니다');
        return;
      }
    }
    
    setLoading(true);
    try {
      // 현재 지도의 남서쪽, 북동쪽 좌표 가져오기
      const bounds = mapRef.current?.getBounds();
      if (!bounds) {
        throw new Error('지도 영역을 가져올 수 없습니다');
      }
      
      const sw = bounds.sw;
      const ne = bounds.ne;
      
      // API 요청 URL 생성
      const url = new URL('/api/places/within-bounds', window.location.origin);
      url.searchParams.append('swLat', sw.lat.toString());
      url.searchParams.append('swLng', sw.lng.toString());
      url.searchParams.append('neLat', ne.lat.toString());
      url.searchParams.append('neLng', ne.lng.toString());
      
      if (selectedCategories.length > 0) {
        url.searchParams.append('categories', selectedCategories.join(','));
      }
      
      // API 호출
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('장소 검색 실패');
      }
      
      const result = await response.json();
      
      // 결과 처리
      setPlaces(result.data || []);
      
      // 마커 생성
      const newMarkers = (result.data || []).map((place: Place) => {
        return createMarkerData(place, getCategoryColor(place.category));
      });
      
      setMarkers(newMarkers);
      
      // 결과 토스트 메시지
      toast.success(`${result.count}개의 장소를 찾았습니다`);
      
    } catch (error: any) {
      console.error('영역 검색 오류:', error);
      toast.error(error.message || '검색 중 오류가 발생했습니다');
      setPlaces([]);
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }, [mapBounds]);
  
  // 검색 실행 (현재 모드에 따라)
  const executeSearch = useCallback(() => {
    if (searchMode.type === 'radius') {
      searchByRadius();
    } else {
      searchWithinBounds();
    }
  }, [searchMode, searchByRadius, searchWithinBounds]);
  
  // 선택한 장소 처리
  const handleSelectPlace = useCallback((place: Place) => {
    setSelectedPlace(place);
    
    if (onSelectPlace) {
      onSelectPlace(place);
    }
    
    // 지도 중심 이동
    if (mapRef.current && place.location) {
      mapRef.current.setCenter(place.location);
      mapRef.current.setLevel(3); // 더 가까이 줌
    }
  }, [onSelectPlace]);
  
  // 마커 클릭 이벤트 처리
  const handleMarkerClick = useCallback((markerId: string) => {
    const place = places.find(p => p.textid === markerId);
    if (place) {
      handleSelectPlace(place);
    }
  }, [places, handleSelectPlace]);
  
  // 초기 카테고리 선택 (모든 카테고리)
  useEffect(() => {
    setSelectedCategories(CATEGORIES.map(cat => cat.id));
  }, []);
  
  // 지도 영역이 변경될 때 bounds 업데이트
  const handleMapDragEnd = useCallback(() => {
    if (mapRef.current) {
      const bounds = mapRef.current.getBounds();
      if (bounds) {
        setMapBounds(bounds);
      }
      
      const center = mapRef.current.getCenter();
      if (center) {
        setMapCenter(center);
      }
    }
  }, []);
  
  // 지도 확대/축소 시 레벨 업데이트
  const handleZoomChanged = useCallback(() => {
    if (mapRef.current) {
      const level = mapRef.current.getLevel();
      if (level !== undefined) {
        setMapLevel(level);
      }
    }
  }, []);
  
  // 선택된 장소 정보 카드 닫기
  const handleCloseDetail = useCallback(() => {
    setSelectedPlace(null);
  }, []);
  
  // 검색 모드 변경
  const changeSearchMode = useCallback((mode: 'radius' | 'bounds') => {
    setSearchMode({ type: mode, radius: mode === 'radius' ? searchRadius : undefined });
  }, [searchRadius]);
  
  // 검색 반경 변경
  const handleRadiusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSearchRadius(parseInt(e.target.value, 10));
  }, []);
  
  return (
    <div className="h-full flex flex-col">
      {/* 컨트롤 패널 */}
      <div className="p-4 border-b flex flex-col gap-3">
        <h2 className="font-bold text-lg">장소 검색</h2>
        
        {/* 검색 모드 선택 */}
        <div className="flex space-x-2">
          <Button 
            variant={searchMode.type === 'bounds' ? 'default' : 'outline'}
            size="sm" 
            className="flex items-center gap-1"
            onClick={() => changeSearchMode('bounds')}
          >
            <Maximize className="h-4 w-4" />
            현재 지도 영역
          </Button>
          <Button 
            variant={searchMode.type === 'radius' ? 'default' : 'outline'}
            size="sm" 
            className="flex items-center gap-1"
            onClick={() => changeSearchMode('radius')}
          >
            <Circle className="h-4 w-4" />
            반경 검색
          </Button>
        </div>
        
        {/* 반경 선택 (반경 검색 모드에서만 표시) */}
        {searchMode.type === 'radius' && (
          <div className="flex items-center gap-2">
            <label htmlFor="radius" className="text-sm">반경:</label>
            <select 
              id="radius" 
              value={searchRadius} 
              onChange={handleRadiusChange}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="500">500m</option>
              <option value="1000">1km</option>
              <option value="2000">2km</option>
              <option value="5000">5km</option>
              <option value="10000">10km</option>
            </select>
          </div>
        )}
        
        {/* 카테고리 필터 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">카테고리 필터</span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => toggleAllCategories(true)}
              >
                모두 선택
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => toggleAllCategories(false)}
              >
                모두 해제
              </Button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(category => (
              <div key={category.id} className="flex items-center gap-1.5">
                <Checkbox 
                  id={`category-${category.id}`}
                  checked={selectedCategories.includes(category.id)}
                  onCheckedChange={() => toggleCategory(category.id)}
                />
                <label 
                  htmlFor={`category-${category.id}`}
                  className="text-sm cursor-pointer flex items-center"
                >
                  <span 
                    className="inline-block w-3 h-3 rounded-full mr-1"
                    style={{ backgroundColor: category.color }}
                  ></span>
                  {category.label}
                </label>
              </div>
            ))}
          </div>
        </div>
        
        {/* 검색 버튼 */}
        <Button 
          className="w-full mt-2" 
          onClick={executeSearch}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              검색 중...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              장소 검색
            </>
          )}
        </Button>
      </div>
      
      {/* 검색 결과 영역 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs defaultValue="map" className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start px-4 pt-2">
            <TabsTrigger value="map">지도</TabsTrigger>
            <TabsTrigger value="list">목록 ({places.length})</TabsTrigger>
          </TabsList>
          
          {/* 지도 탭 */}
          <TabsContent value="map" className="flex-1 relative p-0 m-0">
            <KakaoMap
              ref={mapRef}
              width="100%"
              height="100%"
              initialCenter={mapCenter}
              initialLevel={mapLevel}
              markers={markers}
              onClick={(lat, lng) => console.log('지도 클릭:', lat, lng)}
              onMarkerClick={handleMarkerClick}
              onDragEnd={handleMapDragEnd}
              onZoomChanged={handleZoomChanged}
            />
            
            {/* 현재 위치 버튼 */}
            <Button 
              variant="secondary"
              size="icon"
              className="absolute top-3 right-3 z-10"
              onClick={moveToCurrentCenter}
            >
              <MapPin className="h-4 w-4" />
            </Button>
            
            {/* 선택된 장소 정보 카드 */}
            {selectedPlace && (
              <div className="absolute bottom-4 left-0 right-0 mx-auto w-[90%] max-w-md z-10">
                <Card>
                  <CardContent className="p-4 relative">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={handleCloseDetail}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    
                    <div className="mb-1">
                      <Badge className="mb-1" style={{ backgroundColor: getCategoryColor(selectedPlace.category) }}>
                        {selectedPlace.category}
                      </Badge>
                      <h3 className="font-bold text-lg">{selectedPlace.name}</h3>
                      <p className="text-sm text-gray-500">{selectedPlace.address}</p>
                    </div>
                    
                    <p className="text-sm">{selectedPlace.description}</p>
                    
                    {selectedPlace.rating && (
                      <div className="mt-2">
                        <span className="text-sm font-medium">평점: {selectedPlace.rating}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
          
          {/* 목록 탭 */}
          <TabsContent value="list" className="flex-1 overflow-y-auto p-0 m-0">
            <div className="p-4 space-y-4">
              {places.length > 0 ? (
                places.map(place => (
                  <PlaceCard
                    key={place.textid}
                    place={place}
                    onClick={() => handleSelectPlace(place)}
                    showActions={false}
                  />
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>검색 결과가 없습니다.</p>
                  <p className="text-sm mt-2">다른 지역이나 카테고리로 검색해보세요.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default MapExplorer; 