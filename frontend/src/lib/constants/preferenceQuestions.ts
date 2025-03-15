export interface PreferenceQuestion {
  id: string;
  question: string;
  type: 'single' | 'multiple' | 'slider' | 'text';
  options?: {
    value: string;
    label: string;
  }[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: any;
}

export const preferenceQuestions: PreferenceQuestion[] = [
  {
    id: 'place_type',
    question: '어떤 유형의 장소를 선호하시나요?',
    type: 'multiple',
    options: [
      { value: 'nature', label: '자연/풍경' },
      { value: 'culture', label: '문화/역사' },
      { value: 'shopping', label: '쇼핑' },
      { value: 'food', label: '맛집/카페' },
      { value: 'activity', label: '액티비티' },
      { value: 'entertainment', label: '엔터테인먼트' }
    ]
  },
  {
    id: 'activity_level',
    question: '선호하는 활동 수준은 어느 정도인가요?',
    type: 'slider',
    min: 1,
    max: 5,
    step: 1,
    defaultValue: 3
  },
  {
    id: 'food_preference',
    question: '어떤 음식을 선호하시나요?',
    type: 'multiple',
    options: [
      { value: 'korean', label: '한식' },
      { value: 'chinese', label: '중식' },
      { value: 'japanese', label: '일식' },
      { value: 'western', label: '양식' },
      { value: 'fusion', label: '퓨전' },
      { value: 'street', label: '길거리 음식' },
      { value: 'cafe', label: '카페/디저트' }
    ]
  },
  {
    id: 'budget_level',
    question: '예산 수준은 어느 정도인가요?',
    type: 'single',
    options: [
      { value: 'low', label: '저렴한 곳 (1인당 3만원 이하)' },
      { value: 'medium', label: '적당한 곳 (1인당 3-7만원)' },
      { value: 'high', label: '고급스러운 곳 (1인당 7만원 이상)' }
    ]
  },
  {
    id: 'crowd_preference',
    question: '사람이 많은 곳과 한적한 곳 중 어디를 선호하시나요?',
    type: 'slider',
    min: 1,
    max: 5,
    step: 1,
    defaultValue: 3
  },
  {
    id: 'transportation',
    question: '선호하는 이동 수단은 무엇인가요?',
    type: 'multiple',
    options: [
      { value: 'walk', label: '도보' },
      { value: 'public', label: '대중교통' },
      { value: 'taxi', label: '택시' },
      { value: 'car', label: '자가용' },
      { value: 'bicycle', label: '자전거' }
    ]
  },
  {
    id: 'photo_spots',
    question: '사진 찍기 좋은 장소를 선호하시나요?',
    type: 'single',
    options: [
      { value: 'yes', label: '네, 꼭 포함해주세요' },
      { value: 'neutral', label: '상관없어요' },
      { value: 'no', label: '아니요, 중요하지 않아요' }
    ]
  },
  {
    id: 'indoor_outdoor',
    question: '실내와 실외 활동 중 어떤 것을 선호하시나요?',
    type: 'slider',
    min: 1,
    max: 5,
    step: 1,
    defaultValue: 3
  },
  {
    id: 'special_needs',
    question: '특별히 고려해야 할 사항이 있나요? (선택사항)',
    type: 'text'
  },
  {
    id: 'must_visit',
    question: '꼭 방문하고 싶은 장소가 있나요? (선택사항)',
    type: 'text'
  }
];

export const relationshipOptions = [
  { value: 'friend', label: '친구' },
  { value: 'family', label: '가족' },
  { value: 'couple', label: '연인' },
  { value: 'colleague', label: '직장동료' },
  { value: 'solo', label: '혼자' },
  { value: 'other', label: '기타' }
]; 