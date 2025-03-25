import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { formatDocumentsAsString } from 'langchain/util/document';
import { JsonOutputParser } from "@langchain/core/output_parsers";

// 지오코딩 API 설정 (Kakao Maps API 사용)
const KAKAO_API_KEY = process.env.KAKAO_API_KEY || '';

// 장소 인터페이스 정의
interface Place {
  textid: string;
  name: string;
  category: string;
  description: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  image_url?: string;
}

// 장소명을 좌표로 변환하는 함수
async function geocodePlace(placeName: string, placeAddress?: string) {
  try {
    // 검색어 생성 (주소가 제공된 경우 이름과 주소 조합)
    const searchQuery = placeAddress ? `${placeAddress}` : placeName;
    
    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(searchQuery)}`,
      {
        headers: {
          Authorization: `KakaoAK ${KAKAO_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('지오코딩 API 호출 실패');
    }

    const data = await response.json();
    
    if (data.documents && data.documents.length > 0) {
      const place = data.documents[0];
      return {
        lat: parseFloat(place.y), // 위도
        lng: parseFloat(place.x), // 경도
        address: place.address_name || '',
        place_name: place.place_name || placeName,
      };
    }
    
    throw new Error(`"${searchQuery}" 장소를 찾을 수 없습니다`);
  } catch (error) {
    console.error('지오코딩 오류:', error);
    // 실패 시 더미 좌표 반환 (서울시청 기준)
    return {
      lat: 37.5665, 
      lng: 126.9780,
      address: '서울특별시 중구 세종대로 110',
      place_name: placeName,
    };
  }
}

// RAG 기반 추가 장소 추천 함수 - LangChain과 Pinecone 사용
async function getRecommendedPlacesWithRAG(region: string, existingPlaces: string[], count: number = 3, query: string = '') {
  try {
    // 환경 변수 체크
    if (!process.env.OPENAI_API_KEY || !process.env.PINECONE_API_KEY) {
      console.error("OpenAI 또는 Pinecone API 키가 설정되지 않음");
      return getLocalRecommendedPlaces(region, existingPlaces, count);
    }
    
    // Pinecone 클라이언트 초기화
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY || '',
    });
    
    const indexName = process.env.PINECONE_INDEX || 'csv-rag-test';
    const index = pinecone.Index(indexName);
    
    // OpenAI 임베딩 초기화
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    
    // 벡터 스토어 초기화
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      textKey: 'text',
    });
    
    // 검색기 초기화
    const retriever = vectorStore.asRetriever({
      k: 5, // 관련성 높은 상위 5개 문서 검색
      searchType: "similarity"
    });
    
    // LLM 초기화
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0,
      modelName: 'gpt-4o-mini',
    });
    
    // JsonOutputParser 설정
    const parser = new JsonOutputParser();
    
    // 프롬프트 템플릿 정의
    const promptTemplate = `당신은 여행 경로 생성 전문가입니다.
다음 검색 정보를 바탕으로 최적의 여행 장소를 추천해주세요.
현재 지역은 서울시 ${region}이며, 필요한 추천 장소 개수는 ${count}개입니다.

검색 정보:
{context}

추천 시 다음 장소들은 제외해주세요(이미 선택된 장소): ${existingPlaces.join(', ')}

모든 장소에는 반드시 정확한 위도(latitude)와 경도(longitude) 좌표가 포함되어야 합니다.
다음 형식의 JSON으로 응답해주세요:

\`\`\`json
{{
  "locations": [
    {{
      "name": "장소 이름",
      "textid": "장소 고유 ID",
      "latitude": 37.123456,
      "longitude": 127.123456
    }}
  ]
}}
\`\`\`

locations 배열에는 추천 장소 정보만 포함되어야 합니다.
전체 응답은 반드시 유효한 JSON 형식이어야 합니다.`;

    const prompt = PromptTemplate.fromTemplate(promptTemplate);
    
    // RAG 체인 생성 (LCEL 방식)
    const ragChain = RunnableSequence.from([
      {
        context: retriever.pipe(formatDocumentsAsString),
        question: new RunnablePassthrough(),
      },
      prompt,
      model,
      parser,
    ]);
    
    // 쿼리 실행
    console.log("LLM 쿼리 실행 중...");
    const enhancedQuery = `${region} 여행 장소 추천: ${query}`;
    const result = await ragChain.invoke(enhancedQuery);
    console.log("LLM 응답 받음:", result);
    
    // 결과 처리
    if (result && result.locations && Array.isArray(result.locations) && result.locations.length > 0) {
      // 유효한 위치 데이터 필터링
      const validLocations = result.locations.filter(loc => 
        loc.name && 
        typeof loc.latitude === 'number' && !isNaN(loc.latitude) &&
        typeof loc.longitude === 'number' && !isNaN(loc.longitude) &&
        loc.latitude >= -90 && loc.latitude <= 90 &&
        loc.longitude >= -180 && loc.longitude <= 180
      );
      
      if (validLocations.length === 0) {
        throw new Error("유효한 위치 정보가 없습니다");
      }
      
      // 필요한 수만큼 랜덤하게 선택
      const shuffled = [...validLocations].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    } else {
      throw new Error("응답 형식이 올바르지 않습니다");
    }
  } catch (error) {
    console.error('RAG 추천 처리 오류:', error);
    // 오류 발생 시 로컬 추천 장소로 대체
    return getLocalRecommendedPlaces(region, existingPlaces, count);
  }
}

// 로컬 데이터 기반 장소 추천 함수 (RAG 실패 시 대체용)
function getLocalRecommendedPlaces(region: string, existingPlaces: string[], count: number = 3) {
  // 지역별 추천 장소 (RAG 시스템 연동 전 임시 데이터)
  const regionRecommendations: Record<string, Array<{name: string, category: string, description: string}>> = {
    '서울': [
      { name: '경복궁', category: '역사', description: '조선시대의 정궁으로, 아름다운 전통 건축물을 감상할 수 있는 곳입니다.' },
      { name: '남산서울타워', category: '관광', description: '서울의 상징적인 타워로, 도시 전체를 조망할 수 있는 전망대입니다.' },
      { name: '북촌한옥마을', category: '문화', description: '전통 한옥이 밀집한 지역으로, 한국의 전통 문화를 체험할 수 있습니다.' },
      { name: '인사동', category: '쇼핑', description: '전통 공예품과 기념품을 구매할 수 있는 예술의 거리입니다.' },
      { name: '광장시장', category: '음식', description: '다양한 전통 음식을 맛볼 수 있는 유명한 시장입니다.' }
    ],
    '부산': [
      { name: '해운대', category: '자연', description: '아름다운 해변과 다양한 문화 행사가 열리는 부산의 대표 해변입니다.' },
      { name: '광안리', category: '자연', description: '아름다운 광안대교의 야경을 감상할 수 있는 해변입니다.' },
      { name: '감천문화마을', category: '문화', description: '알록달록한 집들이 모여 있어 부산의 산토리니라 불리는 마을입니다.' },
      { name: '자갈치시장', category: '음식', description: '신선한 해산물을 맛볼 수 있는 부산의 대표적인 수산시장입니다.' },
      { name: '용두산공원', category: '관광', description: '부산타워가 있는 공원으로, 부산 시내를 한눈에 볼 수 있습니다.' }
    ],
    '제주': [
      { name: '성산일출봉', category: '자연', description: '유네스코 세계자연유산으로 지정된 아름다운 화산 분화구입니다.' },
      { name: '만장굴', category: '자연', description: '세계적으로 유명한 용암 동굴로, 독특한 지질 구조를 볼 수 있습니다.' },
      { name: '우도', category: '관광', description: '제주 동쪽에 위치한 작은 섬으로, 아름다운 해변과 풍경을 자랑합니다.' },
      { name: '한라산', category: '자연', description: '제주도의 중심에 위치한 휴화산으로, 다양한 등산로와 식물을 만날 수 있습니다.' },
      { name: '협재해수욕장', category: '자연', description: '맑은 에메랄드빛 바다와 하얀 모래사장이 아름다운 해변입니다.' }
    ],
    // 기본값 (지역 정보가 없을 경우)
    '기타': [
      { name: '경복궁', category: '역사', description: '조선시대의 정궁으로, 아름다운 전통 건축물을 감상할 수 있는 곳입니다.' },
      { name: '해운대', category: '자연', description: '아름다운 해변과 다양한 문화 행사가 열리는 부산의 대표 해변입니다.' },
      { name: '성산일출봉', category: '자연', description: '유네스코 세계자연유산으로 지정된 아름다운 화산 분화구입니다.' },
      { name: '전주한옥마을', category: '문화', description: '전통 한옥이 밀집한 지역으로, 한국의 전통 음식과 문화를 체험할 수 있습니다.' },
      { name: '안동하회마을', category: '문화', description: '전통적인 양반 마을로, 민속 문화재와 가옥을 둘러볼 수 있습니다.' }
    ]
  };
  
  // 지역 데이터 가져오기 (없으면 기본값 사용)
  const recommendations = regionRecommendations[region] || regionRecommendations['기타'];
  
  // 이미 있는 장소 제외하고 필요한 수만큼 추천
  const filteredRecommendations = recommendations.filter(
    place => !existingPlaces.includes(place.name)
  );
  
  // 필요한 수만큼 무작위로 선택
  const shuffled = [...filteredRecommendations].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// 중심점 계산 함수
function calculateCentroid(places: Place[]) {
  if (!places || places.length === 0) {
    // 기본값으로 서울시청 좌표 반환
    return { lat: 37.5665, lng: 126.9780 };
  }
  
  const validPlaces = places.filter(place => 
    place.location && 
    typeof place.location.lat === 'number' && !isNaN(place.location.lat) &&
    typeof place.location.lng === 'number' && !isNaN(place.location.lng)
  );
  
  if (validPlaces.length === 0) {
    return { lat: 37.5665, lng: 126.9780 };
  }
  
  const sumLat = validPlaces.reduce((sum, place) => sum + place.location.lat, 0);
  const sumLng = validPlaces.reduce((sum, place) => sum + place.location.lng, 0);
  
  return {
    lat: sumLat / validPlaces.length,
    lng: sumLng / validPlaces.length
  };
}

// 최적 경로 계산 함수 (간단한 구현 - 실제로는 더 복잡한 알고리즘 필요)
function calculateOptimalRoute(places: Place[]) {
  // 이 예제에서는 간단하게 입력된 순서대로 반환
  // 실제 구현에서는 TSP 알고리즘이나 경로 최적화 API를 사용해야 함
  return [...places];
}

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = params;
    console.log("[DEBUG] roomId:", roomId);
    
    // 요청 본문 파싱
    const requestData = await request.json().catch(() => ({}));
    const { forcedPlaces = [] } = requestData; // 프론트엔드에서 전달한 강제 장소 목록 (옵션)
    
    // 쿠키를 사용하여 서버 측 Supabase 클라이언트 생성
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );
    
    // Authorization 헤더에서 토큰 추출
    const authHeader = request.headers.get('Authorization');
    let user;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // 토큰으로 사용자 정보 가져오기
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !authUser) {
        return NextResponse.json(
          { error: '인증되지 않은 사용자입니다.' },
          { status: 401 }
        );
      }
      
      user = authUser;
    } else {
      // 쿠키 기반 인증 시도
      const { data: { user: cookieUser }, error: cookieAuthError } = await supabase.auth.getUser();
      
      if (cookieAuthError || !cookieUser) {
        return NextResponse.json(
          { error: '인증되지 않은 사용자입니다.' },
          { status: 401 }
        );
      }
      
      user = cookieUser;
    }
    
    // 방 정보 가져오기
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*, owner_id, district')
      .eq('textid', roomId)
      .maybeSingle();
    console.log('조회한 방 ID:', roomId);
    console.log('방 데이터:', roomData);
    console.log('방 조회 오류:', roomError);
    if (roomError || !roomData) {
      return NextResponse.json(
        { error: '방을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    
    // 방장 권한 확인 (방 생성자만 경로 생성 가능)
    if (roomData.owner_id !== user.id) {
      return NextResponse.json(
        { error: '방장만 경로 생성을 시작할 수 있습니다.' },
        { status: 403 }
      );
    }
    
    // 1. must_visit_places 테이블에서 "꼭 가야 하는 장소" 데이터 조회
    const { data: mustVisitData, error: mustVisitError } = await supabase
      .from('must_visit_places')
      .select('*')
      .eq('room_id', roomId);
    
    if (mustVisitError) {
      console.error('꼭 가야 하는 장소 조회 오류:', mustVisitError);
      return NextResponse.json(
        { error: '장소 정보를 가져오는 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
    
    // 최종 경로에 포함될 장소 목록 초기화
    let finalPlaces: Place[] = [];
    let existingPlaceNames: string[] = [];
    
    // 2. 꼭 가야 하는 장소 처리 (DB에서 가져온 데이터)
    if (mustVisitData && mustVisitData.length > 0) {
      console.log(`DB에서 가져온 ${mustVisitData.length}개의 지정된 장소가 있습니다.`);
      
      // 각 장소를 지오코딩하여 좌표 얻기
      for (const place of mustVisitData) {
        try {
          // 지오코딩 수행
          const geoResult = await geocodePlace(place.name, place.address);
          
          finalPlaces.push({
            textid: place.textid || uuidv4(),
            name: place.name,
            category: '지정 장소',
            description: '사용자가 지정한 필수 방문 장소입니다.',
            address: place.address || geoResult.address,
            location: {
              lat: geoResult.lat,
              lng: geoResult.lng
            }
          });
          
          existingPlaceNames.push(place.name);
        } catch (geoError) {
          console.error(`'${place.name}' 지오코딩 오류:`, geoError);
        }
      }
    } else {
      console.log('DB에 지정된 장소가 없습니다. 요청에서 받은 장소 정보를 사용합니다.');
    }
    
    // 3. 프론트엔드에서 전달한 강제 장소 처리 (forcedPlaces 배열)
    if (forcedPlaces && forcedPlaces.length > 0) {
      console.log(`요청에서 ${forcedPlaces.length}개의 강제 지정 장소가 있습니다.`);
      
      for (const place of forcedPlaces) {
        // 이미 처리한 장소는 건너뛰기 (중복 방지)
        if (existingPlaceNames.includes(place.name)) {
          console.log(`'${place.name}'는 이미 처리되었습니다. 건너뜁니다.`);
          continue;
        }
        
        try {
          // 지오코딩 수행 (주소 사용)
          const geoResult = await geocodePlace(place.name, place.address);
          
          finalPlaces.push({
            textid: uuidv4(),
            name: place.name,
            category: '꼭 가볼 장소',
            description: '요청 시 지정한 필수 방문 장소입니다.',
            address: place.address || geoResult.address,
            location: {
              lat: geoResult.lat,
              lng: geoResult.lng
            }
          });
          
          existingPlaceNames.push(place.name);
        } catch (geoError) {
          console.error(`'${place.name}' 지오코딩 오류:`, geoError);
        }
      }
    }
    
    // 4. 장소가 3개 미만인 경우 RAG로 추가 장소 추천 받기
    const neededPlaces = Math.max(0, 3 - finalPlaces.length);
    
    if (neededPlaces > 0) {
      console.log(`장소가 ${finalPlaces.length}개 있습니다. ${neededPlaces}개의 추가 장소를 추천합니다.`);
      
      // 선택된 지역에 기반한 쿼리 구성
      const region = roomData.district || '서울';
      const purposeCategory = roomData.purpose_category || '';
      const queryPrefix = purposeCategory ? `${purposeCategory} 관련` : '';
      
      // 지역 기반 추천 (RAG 시스템 사용)
      const recommendedPlacesData = await getRecommendedPlacesWithRAG(
        region, 
        existingPlaceNames, 
        neededPlaces,
        `${queryPrefix} ${region} 관광 명소 추천`
      );
      
      // RAG에서 반환된 장소 정보를 finalPlaces에 추가
      for (const place of recommendedPlacesData) {
        finalPlaces.push({
          textid: uuidv4(),
          name: place.name,
          category: '추천 장소',
          description: place.description || '추천 장소입니다.',
          address: place.address || '주소 정보 없음',
          location: {
            lat: place.latitude || 37.5665,
            lng: place.longitude || 126.9780
          }
        });
      }
    }
    
    // 필수 방문 장소가 없을 경우 오류 반환
    if (finalPlaces.length === 0) {
      return NextResponse.json(
        { error: '경로 생성에 필요한 장소 정보가 부족합니다.' },
        { status: 400 }
      );
    }
    
    // 5. 장소들을 경로에 포함할 형태로 변환
    const routePlacesWithId = finalPlaces.map(place => ({
      textid: place.textid || uuidv4(),
      name: place.name,
      category: place.category,
      address: place.address,
      lat: place.location?.lat,
      lng: place.location?.lng,
      description: place.description
    }));
    
    // 6. shared_routes 테이블에 경로 저장
    try {
      const { error: sharedRouteError } = await supabase
        .from('shared_routes')
        .insert({
          route_id: uuidv4(),
          room_id: roomId,
          user_id: user.id,
          route_name: `${roomData.district || '여행'} 추천 경로`,
          places: routePlacesWithId,
          is_final: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (sharedRouteError) {
        console.error('경로 저장 오류:', sharedRouteError);
        return NextResponse.json(
          { error: `경로 저장 중 오류가 발생했습니다: ${sharedRouteError.message}` },
          { status: 500 }
        );
      }
      
      // 7. 방 상태 업데이트 (경로 생성됨 상태로)
      const { error: updateError } = await supabase
        .from('rooms')
        .update({ status: 'routes_generated' })
        .eq('textid', roomId);
      
      if (updateError) {
        console.error('방 상태 업데이트 오류:', updateError);
        return NextResponse.json(
          { error: `방 상태 업데이트 중 오류가 발생했습니다: ${updateError.message}` },
          { status: 500 }
        );
      }
      
      // 8. 성공 응답 반환
      return NextResponse.json({ 
        success: true,
        message: '경로가 성공적으로 생성되었습니다.',
        route: {
          room_id: roomId,
          places: routePlacesWithId
        }
      });
    } catch (error: any) {
      console.error('경로 생성 오류:', error);
      return NextResponse.json(
        { error: error.message || '경로 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('경로 생성 오류:', error);
    return NextResponse.json(
      { error: error.message || '경로 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 