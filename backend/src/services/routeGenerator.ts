import { ChatOpenAI } from '@langchain/openai';
import { StateGraph, END, START } from '@langchain/langgraph';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

// API 키 확인
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn('경고: OPENAI_API_KEY가 설정되지 않았습니다. .env 파일에 API 키를 설정해주세요.');
}

// 장소 정보 스키마
const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  location: z.object({
    lat: z.number(),
    lng: z.number()
  }),
  address: z.string()
});

// 경로 스키마
const RouteSchema = z.object({
  places: z.array(PlaceSchema),
  travel_time: z.number(),
  total_cost: z.number()
});

// 경로 생성 요청 스키마
export interface RouteGenerationRequest {
  region: string;
  budget?: number;
  startTime?: string;
  endTime?: string;
  preferences: Array<{
    relationship?: string;
    preferences: any;
  }>;
}

// 상태 인터페이스
interface State {
  region: string;
  budget?: number;
  startTime?: string;
  endTime?: string;
  preferences: any[];
  routes?: any[];
  error?: string;
  analysisResult?: any;
}

// 경로 생성 서비스
export class RouteGeneratorService {
  private model: ChatOpenAI;
  
  constructor() {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      openAIApiKey: OPENAI_API_KEY // API 키 명시적 설정
    });
  }
  
  // 경로 생성 그래프 설정
  private setupGraph() {
    // 노드 정의
    const analyzePreferences = this.createAnalyzePreferencesNode();
    const generateRoutes = this.createGenerateRoutesNode();
    const optimizeRoutes = this.createOptimizeRoutesNode();
    
    // 상태 정의
    const GraphState = Annotation.Root({
      region: Annotation<string>(),
      budget: Annotation<number | undefined>(),
      startTime: Annotation<string | undefined>(),
      endTime: Annotation<string | undefined>(),
      preferences: Annotation<any[]>({
        reducer: (current, update) => update || current || [],
        default: () => []
      }),
      routes: Annotation<any[] | undefined>(),
      error: Annotation<string | undefined>(),
      analysisResult: Annotation<any | undefined>()
    });
    
    // 그래프 생성
    const workflow = new StateGraph(GraphState)
      // 노드 추가
      .addNode("analyzePreferences", analyzePreferences)
      .addNode("generateRoutes", generateRoutes)
      .addNode("optimizeRoutes", optimizeRoutes);
    
    // 엣지 설정
    workflow.addEdge(START, "analyzePreferences" as any);
    workflow.addEdge("analyzePreferences" as any, "generateRoutes" as any);
    workflow.addEdge("generateRoutes" as any, "optimizeRoutes" as any);
    workflow.addEdge("optimizeRoutes" as any, END);
    
    // 에러 처리
    workflow.addConditionalEdges(
      "analyzePreferences" as any,
      (state: typeof GraphState.State) => {
        if (state.error) return "error";
        return "generateRoutes";
      },
      {
        error: END,
        generateRoutes: "generateRoutes" as any
      }
    );
    
    workflow.addConditionalEdges(
      "generateRoutes" as any,
      (state: typeof GraphState.State) => {
        if (state.error) return "error";
        return "optimizeRoutes";
      },
      {
        error: END,
        optimizeRoutes: "optimizeRoutes" as any
      }
    );
    
    // 컴파일
    return workflow.compile();
  }
  
  // 선호도 분석 노드
  private createAnalyzePreferencesNode() {
    const template = `
    당신은 여행 계획 전문가입니다. 사용자들의 선호도를 분석하여 최적의 여행 계획을 제안해야 합니다.
    
    지역: {region}
    예산: {budget}
    시작 시간: {startTime}
    종료 시간: {endTime}
    
    참가자들의 선호도:
    {preferences}
    
    위 정보를 바탕으로 참가자들의 선호도를 분석하고, 공통된 관심사와 선호하는 활동을 파악해주세요.
    결과는 JSON 형식으로 반환해주세요.
    `;
    
    const prompt = PromptTemplate.fromTemplate(template);
    
    return async (state: State) => {
      try {
        const input = {
          region: state.region,
          budget: state.budget || '제한 없음',
          startTime: state.startTime || '제한 없음',
          endTime: state.endTime || '제한 없음',
          preferences: JSON.stringify(state.preferences, null, 2)
        };
        
        // 체인 실행
        const output = await prompt.format(input)
          .then(formattedPrompt => this.model.invoke(formattedPrompt))
          .then(response => response.content as string);
        
        const analysisResult = JSON.parse(output);
        return { analysisResult };
      } catch (error) {
        return { error: '선호도 분석 중 오류가 발생했습니다.' };
      }
    };
  }
  
  // 경로 생성 노드
  private createGenerateRoutesNode() {
    const template = `
    당신은 여행 계획 전문가입니다. 사용자들의 선호도 분석 결과를 바탕으로 최적의 여행 경로를 생성해야 합니다.
    
    지역: {region}
    예산: {budget}
    시작 시간: {startTime}
    종료 시간: {endTime}
    
    선호도 분석 결과:
    {analysisResult}
    
    위 정보를 바탕으로 3개의 서로 다른 여행 경로를 생성해주세요. 각 경로는 4-5개의 장소를 포함해야 하며, 
    이동 시간과 총 비용도 계산해주세요.
    
    결과는 다음 JSON 형식으로 반환해주세요:
    [
      {
        "places": [
          {
            "id": "고유 ID",
            "name": "장소 이름",
            "description": "장소 설명",
            "category": "카테고리(문화/역사, 자연/풍경, 쇼핑, 맛집/카페 등)",
            "location": { "lat": 위도, "lng": 경도 },
            "address": "주소"
          },
          ...
        ],
        "travel_time": 이동 시간(분),
        "total_cost": 총 비용(원)
      },
      ...
    ]
    `;
    
    const prompt = PromptTemplate.fromTemplate(template);
    
    return async (state: State) => {
      try {
        const input = {
          region: state.region,
          budget: state.budget || '제한 없음',
          startTime: state.startTime || '제한 없음',
          endTime: state.endTime || '제한 없음',
          analysisResult: JSON.stringify(state.analysisResult, null, 2)
        };
        
        // 체인 실행
        const output = await prompt.format(input)
          .then(formattedPrompt => this.model.invoke(formattedPrompt))
          .then(response => response.content as string);
        
        const routes = JSON.parse(output);
        return { routes };
      } catch (error) {
        return { error: '경로 생성 중 오류가 발생했습니다.' };
      }
    };
  }
  
  // 경로 최적화 노드
  private createOptimizeRoutesNode() {
    const template = `
    당신은 여행 계획 최적화 전문가입니다. 생성된 여행 경로를 검토하고 최적화해야 합니다.
    
    생성된 경로:
    {routes}
    
    위 경로들을 검토하고 다음 사항을 확인해주세요:
    1. 각 경로의 장소들이 지리적으로 효율적인 순서로 배치되어 있는지
    2. 이동 시간과 총 비용이 현실적인지
    3. 각 경로가 충분히 다양한 경험을 제공하는지
    
    필요한 경우 경로를 최적화하고, 최종 결과를 원래 JSON 형식으로 반환해주세요.
    `;
    
    const prompt = PromptTemplate.fromTemplate(template);
    
    return async (state: State) => {
      try {
        const input = {
          routes: JSON.stringify(state.routes, null, 2)
        };
        
        // 체인 실행
        const output = await prompt.format(input)
          .then(formattedPrompt => this.model.invoke(formattedPrompt))
          .then(response => response.content as string);
        
        // 최적화된 경로 파싱 시도
        let optimizedRoutes;
        try {
          optimizedRoutes = JSON.parse(output);
        } catch (e) {
          // JSON 파싱에 실패한 경우 원본 경로 사용
          optimizedRoutes = state.routes;
        }
        
        return { routes: optimizedRoutes };
      } catch (error) {
        return { error: '경로 최적화 중 오류가 발생했습니다.' };
      }
    };
  }
  
  // 경로 생성 메인 함수
  public async generateRoutes(request: RouteGenerationRequest): Promise<any> {
    try {
      const graph = this.setupGraph();
      
      const initialState = {
        region: request.region,
        budget: request.budget,
        startTime: request.startTime,
        endTime: request.endTime,
        preferences: request.preferences
      };
      
      const result = await graph.invoke(initialState);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      return result.routes;
    } catch (error: any) {
      console.error('경로 생성 오류:', error);
      throw new Error(`경로 생성 중 오류가 발생했습니다: ${error.message}`);
    }
  }
}

// 서비스 인스턴스 생성 및 내보내기
export const routeGeneratorService = new RouteGeneratorService(); 