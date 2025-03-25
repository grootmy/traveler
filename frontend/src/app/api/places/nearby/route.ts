import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// 이 라우트가 항상 동적으로 렌더링되어야 함을 명시
export const dynamic = 'force-dynamic';

// 반경 검색 API 엔드포인트
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 파라미터 추출
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radius = parseInt(searchParams.get('radius') || '1000', 10); // 기본 반경 1km
    const categories = searchParams.get('categories')?.split(',') || [];
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    // 필수 파라미터 검증
    if (lat === 0 || lng === 0) {
      return NextResponse.json(
        { error: '유효한 위도/경도가 필요합니다' }, 
        { status: 400 }
      );
    }
    
    // RPC 호출을 위한 파라미터 구성
    const rpcParams: Record<string, any> = {
      p_lat: lat,
      p_lng: lng,
      p_radius: radius,
      p_limit: limit
    };
    
    // 카테고리 필터가 있는 경우 추가
    if (categories.length > 0) {
      rpcParams.p_categories = categories;
    }
    
    // 저장 프로시저(RPC) 호출
    const { data, error } = await supabase.rpc('find_places_within_radius', rpcParams);
    
    if (error) {
      console.error('장소 검색 중 오류 발생:', error);
      throw error;
    }
    
    // 응답 형식화 및 반환
    return NextResponse.json({
      message: '장소 검색 완료',
      data,
      count: data.length,
      params: {
        center: { lat, lng },
        radius,
        categories: categories.length > 0 ? categories : '모든 카테고리'
      }
    });
    
  } catch (error: any) {
    console.error('장소 검색 중 오류 발생:', error);
    
    return NextResponse.json(
      { error: error.message || '서버 오류가 발생했습니다' }, 
      { status: 500 }
    );
  }
} 