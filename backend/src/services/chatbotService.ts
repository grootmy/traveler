import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

// API 키 확인
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn('경고: OPENAI_API_KEY가 설정되지 않았습니다. .env 파일에 API 키를 설정해주세요.');
}

// 챗봇 서비스 인터페이스
export interface ChatbotRequest {
  roomId: string;
  userId: string;
  message: string;
  selectedRoute?: any;
  previousMessages?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

// 챗봇 서비스 클래스
export class ChatbotService {
  private model: ChatOpenAI;
  
  constructor() {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      openAIApiKey: OPENAI_API_KEY // API 키 명시적 설정
    });
  }
  
  // 챗봇 응답 생성
  public async generateResponse(request: ChatbotRequest): Promise<string> {
    try {
      // 프롬프트 템플릿 생성
      const template = `
      당신은 여행 도우미 AI 챗봇입니다. 사용자의 여행 계획을 돕고 질문에 답변해주세요.
      
      ${request.selectedRoute ? `
      선택된 여행 경로 정보:
      ${JSON.stringify(request.selectedRoute, null, 2)}
      ` : '아직 선택된 여행 경로가 없습니다.'}
      
      이전 대화 내용:
      ${request.previousMessages ? request.previousMessages.map(msg => 
        `${msg.role === 'user' ? '사용자' : '챗봇'}: ${msg.content}`
      ).join('\n') : '이전 대화 내용이 없습니다.'}
      
      사용자: ${request.message}
      
      위 질문에 친절하고 도움이 되는 답변을 제공해주세요. 여행 경로에 대한 정보가 있다면 그것을 활용하여 더 구체적인 답변을 제공해주세요.
      답변은 한국어로 작성해주세요.
      `;
      
      const prompt = PromptTemplate.fromTemplate(template);
      
      // 응답 생성
      const formattedPrompt = await prompt.format({});
      const modelResponse = await this.model.invoke(formattedPrompt);
      const response = modelResponse.content as string;
      
      return response;
    } catch (error: any) {
      console.error('챗봇 응답 생성 오류:', error);
      return `죄송합니다. 응답을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.`;
    }
  }
}

// 서비스 인스턴스 생성 및 내보내기
export const chatbotService = new ChatbotService(); 