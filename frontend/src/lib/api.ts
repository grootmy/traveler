import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 경로 생성 API
export const generateRoutes = async (roomId: string) => {
  try {
    const response = await api.post('/recommendations/generate', { roomId });
    return response.data;
  } catch (error) {
    console.error('경로 생성 오류:', error);
    throw error;
  }
};

// 챗봇 API
export const sendChatMessage = async (roomId: string, message: string) => {
  try {
    const response = await api.post('/recommendations/chat', { roomId, message });
    return response.data;
  } catch (error) {
    console.error('챗봇 메시지 전송 오류:', error);
    throw error;
  }
};

export default api; 