import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
// import { Pinecone } from '@pinecone-database/pinecone';
// import { PineconeStore } from '@langchain/pinecone';
// import { OpenAIEmbeddings } from '@langchain/openai';
// import { ChatOpenAI } from '@langchain/openai';
// import { PromptTemplate } from '@langchain/core/prompts';
// import { StringOutputParser } from '@langchain/core/output_parsers';
// import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
// import { formatDocumentsAsString } from 'langchain/util/document';
// import { JsonOutputParser } from "@langchain/core/output_parsers";
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

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

// Gemini API 응답을 위한 인터페이스
interface LocationResponse {
  name: string;
  latitude: number | string;
  longitude: number | string;
  category?: string;
  description?: string;
  address?: string;
}

// 단일 텍스트 임베딩 생성
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(HuggingFace_API_URL, {
      method: "POST",
      headers: HuggingFace_HEADERS,
      body: JSON.stringify({
        inputs: text,
        parameters: {}
      }),
      // 중요: Next.js 가져오기 캐시 방지
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const result = await response.json();
    // 응답 형식에 따라 조정
    return Array.isArray(result[0]) ? result[0] : result;
  } catch (error) {
    console.error("임베딩 생성 오류:", error);
    throw error;
  }
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


// Initialize Pinecone client
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || '',
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Sentence transformer model for embeddings
const HuggingFace_API_URL = "https://ia6vqd09v0caiezp.us-east4.gcp.endpoints.huggingface.cloud";
const HuggingFace_HEADERS = {
  "Accept": "application/json",
  "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
  "Content-Type": "application/json"
};

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    // 입력값 검증
    if (!texts || texts.length === 0 || !texts[0].trim()) {
      throw new Error('유효한 텍스트가 필요합니다');
    }

    console.log('임베딩 생성 요청:', texts[0].substring(0, 50) + '...');
    
    const response = await axios.post(HuggingFace_API_URL, {
      inputs: texts,
      parameters: { normalize: true },
      options: { wait_for_model: true } // 모델 로딩 기다림
    }, { headers: HuggingFace_HEADERS });

    if (response.status !== 200) {
      throw new Error(`API 호출 실패: ${response.statusText}`);
    }

    // 응답 검증
    if (!response.data || !Array.isArray(response.data)) {
      console.error('임베딩 응답 형식 오류:', response.data);
      throw new Error('임베딩 응답 형식이 올바르지 않습니다');
    }

    console.log(`임베딩 생성 완료: ${response.data.length} 항목, 차원 수: ${
      Array.isArray(response.data[0]) ? response.data[0].length : 'N/A'
    }`);

    return response.data as number[][];
  } catch (error) {
    console.error('임베딩 생성 중 오류 발생:', error);
    // 임시 임베딩 생성 (임의의 작은 벡터)
    return texts.map(() => Array(384).fill(0).map(() => Math.random() * 0.01));
  }
}

async function getRecommendedPlacesWithRAG(region: string, existingPlaces: string[], count: number = 3, query: string = '') {
  try {
    const indexName = process.env.PINECONE_INDEX || 'csv-rag-index-bge-m3';
    // Pinecone 2.x: Index(indexName) -> index(indexName)
    const index = pc.index(indexName);

    // Generate query embedding
    console.log("1. 임베딩 생성 시작");
    const queryEmbedding = await getEmbeddings([query]);
    console.log("2. 임베딩 생성 완료", queryEmbedding.length);

    // 임베딩 유효성 검증
    if (!queryEmbedding || !queryEmbedding[0] || !queryEmbedding[0].length) {
      console.error("유효하지 않은 임베딩 생성. 로컬 추천으로 대체합니다.");
      return getLocalRecommendedPlaces(region, existingPlaces, count);
    }

    // 5. Pinecone 검색
    console.log("3. Pinecone 검색 시작");
    
    // 여러 네임스페이스에서 검색
    const namespaces = ['eat', 'shopping', 'tour', 'nature', 'interpark', 'civic'];
    
    // 타입 명시적 지정
    interface PineconeMatch {
      id: string;
      score?: number;
      metadata?: Record<string, any>;
    }
    
    let allMatches: PineconeMatch[] = [];

    for (const namespace of namespaces) {
      try {
        // 네임스페이스별 인덱스 접근
        const namespaceIndex = index.namespace(namespace);
        
        const results = await namespaceIndex.query({
          vector: queryEmbedding[0],
          topK: 5,
          includeMetadata: true
        });
        
        if (results.matches && results.matches.length > 0) {
          allMatches = [...allMatches, ...results.matches];
        }
      } catch (nsError) {
        console.error(`네임스페이스 '${namespace}' 검색 오류:`, nsError);
      }
    }

    // 결과 병합 후 상위 10개만 사용
    allMatches.sort((a, b) => ((b.score || 0) - (a.score || 0)));
    const matches = allMatches.slice(0, 10);
    
    console.log("4. Pinecone 검색 완료, 결과 수:", matches.length);
    
    // 첫 번째 결과의 메타데이터 구조 확인
    if (matches && matches.length > 0) {
      console.log("첫 번째 검색 결과 점수:", matches[0].score);
    }
    
    // 결과 필터링 - 점수 기준 추가
    let validMatches = matches
      .filter((match: any) => match.score && match.score > 0.6) // 유사도 점수 기준 필터링
      .filter((match: any) => match.metadata); // 메타데이터 존재 확인
    
    console.log("유사도 필터링 후 결과 수:", validMatches.length);
    
    // 결과가 없는 경우 점수 기준 낮춤
    if (validMatches.length === 0) {
      validMatches = matches
        .filter((match: any) => match.metadata);
      console.log("메타데이터 필터링만 적용 후 결과 수:", validMatches.length);
    }

      // Process search results - Pinecone 2.x 응답 형식에 맞춤
      const locationsInfo = validMatches
        .map((match: any) => {
          const meta = match.metadata!;
          if (meta.content) return meta.content;
          
          // content가 없을 경우 다른 필드로 구성
          return `${meta.name || '장소'} - ${meta.category || '기타'} - ${meta.address || ''} - ${meta.lat || ''} - ${meta.lng || ''} - ${meta.description || ''}`;
        })
        .join('\n');

    // Classify query using Gemini
    const classifyModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    const classifyPrompt = `
    Classify the following user request into one of these categories: 'civic', 'nature', 'shopping', 'tour', 'eat', 'special', 'interpark'.
    User request: ${query}
    Category:`;
    const classifyResponse = await classifyModel.generateContent(classifyPrompt);
    const category = classifyResponse.response.text().trim().toLowerCase();

    // Generate recommendations using Gemini
    const recommendModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    
    const prompt = `지역: ${region}
관심 카테고리: ${category}
검색어: ${query}
이미 선택된 장소(제외): ${existingPlaces.join(', ')}
추천 필요 개수: ${count}

위 정보를 바탕으로 관광 명소를 추천해주세요.

Location = {
  "name": string,
  "latitude": number,
  "longitude": number,
  "category": string,
  "description": string
}

Return: Array<Location>`;

    console.log("Gemini 프롬프트:", prompt);
    
    try {
      const response = await recommendModel.generateContent(prompt);
      const responseText = response.response.text();
      console.log("Gemini 응답 원본:", responseText.substring(0, 100) + "...");
      
      // 응답에서 JSON 배열 부분 추출
      let jsonText = responseText;
      // JSON 형식이 아닌 경우 처리
      if (!jsonText.trim().startsWith('[') && !jsonText.trim().startsWith('{')) {
        // JSON 배열 찾기 시도
        const arrayMatch = jsonText.match(/\[\s*{[\s\S]*}\s*\]/);
        if (arrayMatch) {
          jsonText = arrayMatch[0];
        } else {
          // JSON 객체 찾기 시도
          const objectMatch = jsonText.match(/\{\s*"locations"\s*:\s*\[[\s\S]*\]\s*\}/);
          if (objectMatch) {
            jsonText = objectMatch[0];
          }
        }
      }
      
      let locations: LocationResponse[] = [];
      
      try {
        // 직접 배열로 반환된 경우
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed)) {
          locations = parsed as LocationResponse[];
        } 
        // locations 키가 있는 객체로 반환된 경우
        else if (parsed && parsed.locations && Array.isArray(parsed.locations)) {
          locations = parsed.locations as LocationResponse[];
        } else {
          throw new Error("예상치 못한 응답 형식");
        }
        
        // 좌표 값이 문자열로 되어 있을 경우 숫자로 변환
        locations = locations.map((loc: LocationResponse) => ({
          ...loc,
          latitude: typeof loc.latitude === 'string' ? parseFloat(loc.latitude) : loc.latitude,
          longitude: typeof loc.longitude === 'string' ? parseFloat(loc.longitude) : loc.longitude
        }));
        
        const validLocations = locations.filter((loc: LocationResponse) => 
          loc.name && 
          typeof loc.latitude === 'number' && !isNaN(loc.latitude) &&
          typeof loc.longitude === 'number' && !isNaN(loc.longitude) &&
          loc.latitude >= -90 && loc.latitude <= 90 &&
          loc.longitude >= -180 && loc.longitude <= 180
        );

        if (validLocations.length === 0) {
          throw new Error("유효한 위치 정보가 없습니다");
        }

        const shuffled = [...validLocations].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
      } catch (parseError) {
        console.error('JSON 파싱 오류:', parseError, 'JSON 텍스트:', jsonText.substring(0, 100) + "...");
        throw new Error("API 응답을 파싱할 수 없습니다");
      }
    } catch (geminiError) {
      console.error('Gemini API 오류:', geminiError);
      return getLocalRecommendedPlaces(region, existingPlaces, count);
    }
  } catch (error) {
    console.error('RAG recommendation processing error:', error);
    return getLocalRecommendedPlaces(region, existingPlaces, count);
  }
}

// 로컬 데이터 기반 장소 추천 함수 (RAG 실패 시 대체용)
function getLocalRecommendedPlaces(region: string, existingPlaces: string[], count: number = 3): LocationResponse[] {
  // 지역별 추천 장소 (RAG 시스템 연동 전 임시 데이터)
  const regionRecommendations: Record<string, LocationResponse[]> = {
    '서울': [
      { name: '경복궁', category: '역사', description: '조선시대의 정궁으로, 아름다운 전통 건축물을 감상할 수 있는 곳입니다.', latitude: 37.5796, longitude: 126.9770, address: '서울특별시 종로구 사직로 161' },
      { name: '남산서울타워', category: '관광', description: '서울의 상징적인 타워로, 도시 전체를 조망할 수 있는 전망대입니다.', latitude: 37.5511, longitude: 126.9882, address: '서울특별시 용산구 남산공원길 105' },
      { name: '북촌한옥마을', category: '문화', description: '전통 한옥이 밀집한 지역으로, 한국의 전통 문화를 체험할 수 있습니다.', latitude: 37.5823, longitude: 126.9861, address: '서울특별시 종로구 계동길 37' },
      { name: '인사동', category: '쇼핑', description: '전통 공예품과 기념품을 구매할 수 있는 예술의 거리입니다.', latitude: 37.5743, longitude: 126.9850, address: '서울특별시 종로구 인사동길' },
      { name: '광장시장', category: '음식', description: '다양한 전통 음식을 맛볼 수 있는 유명한 시장입니다.', latitude: 37.5701, longitude: 126.9988, address: '서울특별시 종로구 종로 88' }
    ],
    '부산': [
      { name: '해운대', category: '자연', description: '아름다운 해변과 다양한 문화 행사가 열리는 부산의 대표 해변입니다.', latitude: 35.1586, longitude: 129.1600, address: '부산광역시 해운대구 해운대해변로 264' },
      { name: '광안리', category: '자연', description: '아름다운 광안대교의 야경을 감상할 수 있는 해변입니다.', latitude: 35.1545, longitude: 129.1189, address: '부산광역시 수영구 광안해변로 219' },
      { name: '감천문화마을', category: '문화', description: '알록달록한 집들이 모여 있어 부산의 산토리니라 불리는 마을입니다.', latitude: 35.0990, longitude: 129.0100, address: '부산광역시 사하구 감내2로 203' },
      { name: '자갈치시장', category: '음식', description: '신선한 해산물을 맛볼 수 있는 부산의 대표적인 수산시장입니다.', latitude: 35.0970, longitude: 129.0300, address: '부산광역시 중구 자갈치해안로 52' },
      { name: '용두산공원', category: '관광', description: '부산타워가 있는 공원으로, 부산 시내를 한눈에 볼 수 있습니다.', latitude: 35.1006, longitude: 129.0323, address: '부산광역시 중구 용두산길 37-55' }
    ],
    '제주': [
      { name: '성산일출봉', category: '자연', description: '유네스코 세계자연유산으로 지정된 아름다운 화산 분화구입니다.', latitude: 33.4586, longitude: 126.9421, address: '제주특별자치도 서귀포시 성산읍 일출로 284-12' },
      { name: '만장굴', category: '자연', description: '세계적으로 유명한 용암 동굴로, 독특한 지질 구조를 볼 수 있습니다.', latitude: 33.5280, longitude: 126.7715, address: '제주특별자치도 제주시 구좌읍 만장굴길 182' },
      { name: '우도', category: '관광', description: '제주 동쪽에 위치한 작은 섬으로, 아름다운 해변과 풍경을 자랑합니다.', latitude: 33.5030, longitude: 126.9521, address: '제주특별자치도 제주시 우도면' },
      { name: '한라산', category: '자연', description: '제주도의 중심에 위치한 휴화산으로, 다양한 등산로와 식물을 만날 수 있습니다.', latitude: 33.3616, longitude: 126.5292, address: '제주특별자치도 제주시 아라동' },
      { name: '협재해수욕장', category: '자연', description: '맑은 에메랄드빛 바다와 하얀 모래사장이 아름다운 해변입니다.', latitude: 33.3939, longitude: 126.2402, address: '제주특별자치도 제주시 한림읍 협재리 2497-1' }
    ],
    // 기본값 (지역 정보가 없을 경우)
    '기타': [
      { name: '경복궁', category: '역사', description: '조선시대의 정궁으로, 아름다운 전통 건축물을 감상할 수 있는 곳입니다.', latitude: 37.5796, longitude: 126.9770, address: '서울특별시 종로구 사직로 161' },
      { name: '해운대', category: '자연', description: '아름다운 해변과 다양한 문화 행사가 열리는 부산의 대표 해변입니다.', latitude: 35.1586, longitude: 129.1600, address: '부산광역시 해운대구 해운대해변로 264' },
      { name: '성산일출봉', category: '자연', description: '유네스코 세계자연유산으로 지정된 아름다운 화산 분화구입니다.', latitude: 33.4586, longitude: 126.9421, address: '제주특별자치도 서귀포시 성산읍 일출로 284-12' },
      { name: '전주한옥마을', category: '문화', description: '전통 한옥이 밀집한 지역으로, 한국의 전통 음식과 문화를 체험할 수 있습니다.', latitude: 35.8185, longitude: 127.1535, address: '전라북도 전주시 완산구 기린대로 99' },
      { name: '안동하회마을', category: '문화', description: '전통적인 양반 마을로, 민속 문화재와 가옥을 둘러볼 수 있습니다.', latitude: 36.5366, longitude: 128.5231, address: '경상북도 안동시 풍천면 하회로 56' }
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
// function calculateOptimalRoute(places: Place[]) {
//   // 이 예제에서는 간단하게 입력된 순서대로 반환
//   // 실제 구현에서는 TSP 알고리즘이나 경로 최적화 API를 사용해야 함
//   return [...places];
// }

export const dynamic = 'force-dynamic';

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
          category: place.category || '추천 장소',
          description: place.description || '추천 장소입니다.',
          address: place.address || '주소 정보 없음',
          location: {
            lat: typeof place.latitude === 'number' ? place.latitude : 37.5665,
            lng: typeof place.longitude === 'number' ? place.longitude : 126.9780
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