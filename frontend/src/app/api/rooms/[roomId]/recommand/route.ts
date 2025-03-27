import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

// 환경 변수 설정
const HuggingFaceAPI_URL = "https://ia6vqd09v0caiezp.us-east4.gcp.endpoints.huggingface.cloud";
const HuggingFaceHEADERS = {
  "Accept": "application/json",
  "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
  "Content-Type": "application/json"
};

// Pinecone 클라이언트 초기화
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || '',
});

console.log("PINECONE_API_KEY DONE", process.env.PINECONE_API_KEY);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

console.log("GEMINI_API_KEY DONE", process.env.GEMINI_API_KEY);

// 임베딩 생성 함수 - 오류 처리 강화
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    // 입력값 검증
    if (!texts || texts.length === 0 || !texts[0].trim()) {
      throw new Error('유효한 텍스트가 필요합니다');
    }

    console.log('임베딩 생성 요청:', texts[0].substring(0, 50) + '...');
    
    const response = await axios.post(HuggingFaceAPI_URL, {
      inputs: texts,
      parameters: { normalize: true },
      options: { wait_for_model: true } // 모델 로딩 기다림
    }, { headers: HuggingFaceHEADERS });

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
    throw error;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    // 1. 요청 파라미터 추출
    const { query } = await req.json();
    const roomId = params.roomId;
    
    console.log("API 요청 받음:", { roomId, query });

    // 2. 환경 변수 체크
    if (!process.env.HUGGINGFACE_API_KEY) {
      throw new Error("HUGGINGFACE_API_KEY가 설정되지 않았습니다.");
    }

    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY가 설정되지 않았습니다.");
    }

    // 3. Pinecone 인덱스 연결
    const indexName = process.env.PINECONE_INDEX || 'csv-rag-index-bge-m3';
    console.log("인덱스 연결 시작:", indexName);
    
    // 인덱스 접근
    const index = pc.index(indexName);
    console.log("인덱스 연결 완료:", indexName);
    
    // 인덱스 통계 확인
    try {
      const indexStats = await index.describeIndexStats();
      console.log("전체 인덱스 통계:", indexStats);
      
      const recordCount = indexStats.totalRecordCount || indexStats.namespaces?.['']?.recordCount || 0;
      console.log("인덱스 전체 레코드 수:", recordCount);
      
      if (recordCount === 0) {
        console.warn("경고: 인덱스에 데이터가 없습니다!");
      }
    } catch (statsError) {
      console.error("인덱스 통계 조회 오류:", statsError);
    }
    
    // 4. 임베딩 생성
    console.log("임베딩 생성 시작");
    const queryEmbedding = await getEmbeddings([query]);
    console.log("임베딩 생성 완료");
    
    // 임베딩 유효성 검사
    if (!queryEmbedding || !queryEmbedding[0] || queryEmbedding[0].length === 0) {
      throw new Error("유효한 임베딩을 생성할 수 없습니다");
    }

    // 임베딩 차원 수 확인 로그
    console.log("임베딩 차원 수:", queryEmbedding[0].length);
    
    // 5. Pinecone 검색
    console.log("Pinecone 검색 시작");
    
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

    // 결과 병합 후 상위 15개만 사용
    allMatches.sort((a, b) => ((b.score || 0) - (a.score || 0)));
    const matches = allMatches.slice(0, 15);
    
    console.log("Pinecone 검색 완료, 결과 수:", matches.length);
    
    // 첫 번째 결과의 메타데이터 구조 확인
    if (matches && matches.length > 0) {
      console.log("첫 번째 검색 결과 점수:", matches[0].score);
    }
    
    // 6. 결과 필터링 - 점수 기준 추가
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
    
    // 7. 결과 처리
    let locationsData = [];
    
    if (validMatches.length > 0) {
      // 메타데이터 형식에 따라 정보 구성
      const locationsInfo = validMatches
        .map((match: any) => {
          const meta = match.metadata!;
          if (meta.content) return meta.content;
          
          // content가 없을 경우 다른 필드로 구성
          return `${meta.name || '장소'} - ${meta.category || '기타'} - ${meta.address || ''} - ${meta.lat || ''} - ${meta.lng || ''} - ${meta.description || ''}`;
        })
        .join('\n');
        
      console.log("Gemini 추천 생성 시작");
      // 8. Gemini를 사용한 추천 생성
      const recommendModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
      const recommendationPrompt = `
      당신은 JSON 데이터만 출력하는 API입니다. 마크다운이나 다른 포맷을 사용하지 마세요.
      
      다음 서울 장소 정보를 바탕으로, 장소 정보에 있는 설명만 참고해서 사용자 요청에 가장 맞는 3곳만 판단해서 추천해줘. 
      장소 정보에 있는 설명만 참고하고 임의로 추측해서 판단하지 마. 
      위도, 경도 정보는 주어진 장소 정보에서 추출하세요.
      
      설명(description)은 100자 이내로 간결하게 작성하고, 가장 중요한 특징 1-2개만 포함하세요.
      중복되는 문장이나 비슷한 표현을 반복하지 마세요.
      
      사용자 요청: ${query}
      
      장소 정보:
      ${locationsInfo}
      
      다음 정확한 JSON 형식으로만 응답하세요:
      {"locations":[{"name":"장소 이름","latitude":37.123456,"longitude":127.123456,"category":"카테고리","description":"간결한 설명 (100자 이내)"}]}
      
      JSON 형식만 출력하고 다른 설명이나 마크다운 코드 블록을 사용하지 마세요.`;

      try {
        const { response } = await recommendModel.generateContent(recommendationPrompt);
        const responseText = response.text()
          .replace(/```json/g, '')  // json 코드 블록 시작 태그 제거
          .replace(/```/g, '')      // 코드 블록 종료 태그 제거
          .trim();                  // 앞뒤 공백 제거
        
        console.log("Gemini 응답:", responseText.substring(0, 100) + "...");
        
        try {
          const result = JSON.parse(responseText);
          console.log("Gemini 추천 생성 완료");
          
          if (result && result.locations && Array.isArray(result.locations)) {
            locationsData = result.locations
              .filter((loc: any) => 
                loc.name && 
                (typeof loc.latitude === 'number' || typeof loc.latitude === 'string') && 
                (typeof loc.longitude === 'number' || typeof loc.longitude === 'string')
              )
              .map((loc: any) => ({
                ...loc,
                latitude: typeof loc.latitude === 'string' ? parseFloat(loc.latitude) : loc.latitude,
                longitude: typeof loc.longitude === 'string' ? parseFloat(loc.longitude) : loc.longitude
              }));
          }
        } catch (parseError) {
          console.error("Gemini 응답 파싱 오류:", parseError);
          console.log("응답 원문:", responseText);
        }
      } catch (geminiError) {
        console.error("Gemini API 오류:", geminiError);
      }
    }
    
    // 9. 기본 데이터 처리
    if (locationsData.length === 0) {
      locationsData = getDummyLocations(query);
      console.log("검색 결과 없음, 기본 데이터 사용");
    }

    // 10. 응답 형식 변환
    const formattedLocations = locationsData.map((loc: any) => ({
      name: loc.name,
      description: formatDescription(loc.description) || '',
      category: loc.category || '관광지',
      coordinates: {
        lat: loc.latitude,
        lng: loc.longitude
      }
    }));

    // 11. 중심점 계산
    const center = calculateCentroid(formattedLocations);

    return NextResponse.json({
      locations: formattedLocations,
      center: center
    });

  } catch (error: any) {
    console.error('API 처리 오류:', error);
    
    // 오류 시 기본 데이터 반환
    const dummyLocations = getDummyLocations();

    return NextResponse.json({
      message: '내부 서버 오류',
      error: error.message,
      locations: dummyLocations.map(loc => ({
        ...loc,
        description: formatDescription(loc.description)
      })),
      center: calculateCentroid(dummyLocations.map(loc => ({
        coordinates: { lat: loc.latitude, lng: loc.longitude }
      })))
    }, { status: 500 });
  }
}

// 쿼리에 따른 기본 데이터 반환 함수
function getDummyLocations(query?: string): any[] {
  if (query?.includes("카페") || query?.includes("커피")) {
    return [
      {
        name: "스타벅스 광화문점",
        description: "인기 있는 커피 체인점",
        latitude: 37.5736,
        longitude: 126.9769,
        category: "카페"
      },
      {
        name: "블루보틀 삼청점",
        description: "미국 스페셜티 커피 브랜드",
        latitude: 37.5817,
        longitude: 126.9837,
        category: "카페"
      }
    ];
  } else if (query?.includes("맛집") || query?.includes("식당") || query?.includes("음식")) {
    return [
      {
        name: "광장시장",
        description: "전통시장과 다양한 길거리 음식",
        latitude: 37.5701,
        longitude: 126.9988,
        category: "음식점"
      },
      {
        name: "을지로 노가리 골목",
        description: "레트로 분위기의 맥주와 노가리",
        latitude: 37.5665,
        longitude: 126.9925,
        category: "음식점"
      }
    ];
  } else {
    return [
      {
        name: "경복궁",
        description: "조선시대의 정궁",
        latitude: 37.5796,
        longitude: 126.9770,
        category: "역사"
      },
      {
        name: "남산타워",
        description: "서울 전망대",
        latitude: 37.5511,
        longitude: 126.9882,
        category: "관광"
      }
    ];
  }
}

// 중심점 계산 함수
function calculateCentroid(locations: Array<any>) {
  if (!locations || locations.length === 0) {
    // 기본값으로 서울시청 좌표 반환
    return { lat: 37.5665, lng: 126.9780 };
  }
  
  const validLocations = locations.filter(loc => 
    loc.coordinates && 
    typeof loc.coordinates.lat === 'number' && !isNaN(loc.coordinates.lat) &&
    typeof loc.coordinates.lng === 'number' && !isNaN(loc.coordinates.lng) &&
    loc.coordinates.lat >= -90 && loc.coordinates.lat <= 90 &&
    loc.coordinates.lng >= -180 && loc.coordinates.lng <= 180
  );
  
  if (validLocations.length === 0) {
    return { lat: 37.5665, lng: 126.9780 };
  }
  
  const sumLat = validLocations.reduce((sum, loc) => sum + loc.coordinates.lat, 0);
  const sumLng = validLocations.reduce((sum, loc) => sum + loc.coordinates.lng, 0);
  
  return {
    lat: sumLat / validLocations.length,
    lng: sumLng / validLocations.length
  };
}

// 설명 텍스트를 보기 좋게 포맷팅하는 함수
function formatDescription(description: string): string {
  if (!description) return '';
  
  // 너무 긴 설명 자르기 (150자 제한)
  if (description.length > 150) {
    description = description.substring(0, 147) + '...';
  }
  
  // 문장을 정리하고 불필요한 반복 제거
  const sentences = description.split(/\.\s+/);
  const uniqueSentences = [...new Set(sentences)];
  
  // 다시 조합
  return uniqueSentences.join('. ').replace(/\.\./g, '.').trim();
}

// 이 라우트가 항상 동적으로 렌더링되어야 함을 명시
export const dynamic = 'force-dynamic';
