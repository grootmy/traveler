import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { formatDocumentsAsString } from 'langchain/util/document';
import { supabase } from '@/lib/supabase/client';
import { JsonOutputParser } from "@langchain/core/output_parsers";

// 위치 추천 API 엔드포인트
export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    // 1. 요청 파라미터 추출
    const { query } = await req.json();
    const roomId = params.roomId;
    
    console.log("API 요청 받음:", { roomId, query });
    
    // 환경 변수 체크
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY가 설정되지 않음");
      return NextResponse.json({ error: "OpenAI API 키가 설정되지 않았습니다." }, { status: 500 });
    }
    
    if (!process.env.PINECONE_API_KEY) {
      console.error("PINECONE_API_KEY가 설정되지 않음");
      return NextResponse.json({ error: "Pinecone API 키가 설정되지 않았습니다." }, { status: 500 });
    }
    
    // 2. 외부 서비스 초기화 (Pinecone, OpenAI)
    let locationsData;
    
    try {
      // Pinecone 클라이언트 초기화
      const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY || '',
      });
      
      const indexName = process.env.PINECONE_INDEX || 'csv-rag-index';
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
      
      // 3. JsonOutputParser 설정
      const parser = new JsonOutputParser();
      
      // 4. 프롬프트 템플릿 정의 - 중괄호 이스케이프 처리
      const promptTemplate = `당신은 여행 장소 추천 전문가입니다.
다음 검색 정보를 바탕으로 사용자의 질문에 대한 최적의 장소를 추천해주세요.
사용자가 요청한 개수의 장소를 추천해야 합니다. 기본적으로 3개를 추천하되, 사용자가 다른 개수를 명시했다면 그 개수만큼 추천해주세요.

검색 정보:
{context}

사용자 질문: {question}

모든 장소에는 반드시 정확한 위도(latitude)와 경도(longitude) 좌표가 포함되어야 합니다.
다음 형식의 JSON으로 응답해주세요:

\`\`\`json
{{
  "locations": [
    {{
      "name": "장소 이름",
      "latitude": 37.123456,
      "longitude": 127.123456,
      "category": "카테고리",
      "description": "간단한 설명"
    }}
  ]
}}
\`\`\`

locations 배열에는 추천 장소 정보만 포함되어야 합니다.
전체 응답은 반드시 유효한 JSON 형식이어야 합니다.`;

      const prompt = PromptTemplate.fromTemplate(promptTemplate);
      
      // 5. RAG 체인 생성 (LCEL 방식)
      const ragChain = RunnableSequence.from([
        {
          context: retriever.pipe(formatDocumentsAsString),
          question: new RunnablePassthrough(),
        },
        prompt,
        model,
        parser,
      ]);
      
      // 6. 쿼리 실행
      console.log("LLM 쿼리 실행 중...");
      const enhancedQuery = `장소 추천: ${query}`; // 쿼리 개선
      const result = await ragChain.invoke(enhancedQuery);
      console.log("LLM 응답 받음:", result);
      
      // 7. 결과 처리
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
          throw new Error("유효한 위치 정보가 없습니다: " + JSON.stringify(result));
        }
        
        locationsData = validLocations;
      } else {
        // 결과가 기대한 형식이 아닌 경우
        throw new Error("응답 형식이 올바르지 않습니다: " + JSON.stringify(result));
      }
      
      // 8. Supabase에 추천 장소 기록 저장 (필요시 주석 해제)
      // for (const loc of locationsData) {
      //   await supabase
      //     .from('recommended_places')
      //     .insert({
      //       room_id: roomId,
      //       name: loc.name,
      //       description: loc.description || '',
      //       lat: loc.latitude,
      //       lng: loc.longitude,
      //       category: loc.category || '관광지',
      //       query: query
      //     });
      // }
      
    } catch (error: any) {
      console.error('RAG 처리 중 오류:', error);
      
      // 오류 발생 시 더미 데이터 사용
      locationsData = [
        {
          name: "경복궁",
          description: "조선시대의 정궁으로, 서울의 대표적인 관광지입니다.",
          latitude: 37.5796,
          longitude: 126.9770,
          category: "역사"
        },
        {
          name: "명동",
          description: "서울의 대표적인 쇼핑 거리로, 다양한 상점과 음식점이 있습니다.",
          latitude: 37.5633,
          longitude: 126.9822,
          category: "쇼핑"
        },
        {
          name: "남산타워",
          description: "서울의 랜드마크로, 도시 전체를 조망할 수 있는 전망대입니다.",
          latitude: 37.5511,
          longitude: 126.9882,
          category: "관광"
        }
      ];
    }
    
    // 9. 중심점 계산 - LLM 외부에서 직접 계산
    const center = calculateCentroid(locationsData);
    
    // 응답 형식 변환
    const formattedLocations = locationsData.map((loc: any) => ({
      name: loc.name,
      description: loc.description || '',
      category: loc.category || '관광지',
      address: loc.address || '주소 정보 없음',
      coordinates: {
        lat: loc.latitude,
        lng: loc.longitude
      }
    }));
    
    console.log("응답 반환:", formattedLocations);
    
    return NextResponse.json({
      locations: formattedLocations,
      center: {
        lat: center.latitude,
        lng: center.longitude
      }
    });
    
  } catch (error: any) {
    console.error('API 처리 오류:', error);
    
    // 더미 데이터 생성
    const dummyLocations = [
      {
        name: "서울시청",
        description: "서울의 중심부에 위치한 행정 건물입니다.",
        category: "랜드마크",
        address: "서울특별시 중구 세종대로 110",
        coordinates: {
          lat: 37.5665,
          lng: 126.9780
        }
      },
      {
        name: "광화문광장",
        description: "서울의 대표적인 광장이자 역사적 장소입니다.",
        category: "관광지",
        address: "서울특별시 종로구 세종로 사거리",
        coordinates: {
          lat: 37.5759,
          lng: 126.9769
        }
      },
      {
        name: "인사동",
        description: "전통 문화와 예술의 거리로 유명합니다.",
        category: "문화거리",
        address: "서울특별시 종로구 인사동길",
        coordinates: {
          lat: 37.5744,
          lng: 126.9853
        }
      }
    ];
    
    // 더미 데이터의 중심점 계산
    const dummyCenter = {
      lat: 37.5723,
      lng: 126.9801
    };
    
    // 최종 오류 응답
    return NextResponse.json({
      message: '내부 서버 오류',
      error: error.message || '알 수 없는 오류',
      locations: dummyLocations,
      center: dummyCenter
    }, { status: 500 });
  }
}

// 중심점 계산 함수 - LLM 외부에서 직접 계산
function calculateCentroid(locations: Array<{latitude: number, longitude: number}>) {
  if (!locations || locations.length === 0) {
    // 기본값으로 서울시청 좌표 반환
    return { latitude: 37.5665, longitude: 126.9780 };
  }
  
  const validLocations = locations.filter(loc => 
    typeof loc.latitude === 'number' && !isNaN(loc.latitude) &&
    typeof loc.longitude === 'number' && !isNaN(loc.longitude) &&
    loc.latitude >= -90 && loc.latitude <= 90 &&
    loc.longitude >= -180 && loc.longitude <= 180
  );
  
  if (validLocations.length === 0) {
    return { latitude: 37.5665, longitude: 126.9780 };
  }
  
  const sumLat = validLocations.reduce((sum, loc) => sum + loc.latitude, 0);
  const sumLng = validLocations.reduce((sum, loc) => sum + loc.longitude, 0);
  
  return {
    latitude: sumLat / validLocations.length,
    longitude: sumLng / validLocations.length
  };
}
