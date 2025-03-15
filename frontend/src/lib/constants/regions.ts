export interface Region {
  value: string;
  label: string;
  description?: string;
}

export const regions: Region[] = [
  {
    value: 'seoul',
    label: '서울',
    description: '대한민국의 수도로, 다양한 관광지와 문화 명소가 있습니다.'
  },
  {
    value: 'busan',
    label: '부산',
    description: '해운대, 광안리 등 아름다운 해변과 맛있는 해산물로 유명합니다.'
  },
  {
    value: 'jeju',
    label: '제주',
    description: '아름다운 자연 경관과 독특한 문화를 가진 섬입니다.'
  },
  {
    value: 'gangneung',
    label: '강릉',
    description: '경포대 해변과 커피 거리로 유명한 동해안의 도시입니다.'
  },
  {
    value: 'gyeongju',
    label: '경주',
    description: '신라의 고도로, 불국사, 석굴암 등 역사적 명소가 많습니다.'
  },
  {
    value: 'jeonju',
    label: '전주',
    description: '한옥마을과 전통 음식으로 유명한 전통 도시입니다.'
  },
  {
    value: 'sokcho',
    label: '속초',
    description: '설악산과 아름다운 해변이 있는 동해안의 관광 도시입니다.'
  },
  {
    value: 'yeosu',
    label: '여수',
    description: '아름다운 밤바다와 해상 케이블카로 유명한 남해안의 도시입니다.'
  },
  {
    value: 'incheon',
    label: '인천',
    description: '국제공항이 있는 항구 도시로, 차이나타운과 송도가 유명합니다.'
  },
  {
    value: 'daegu',
    label: '대구',
    description: '약령시장과 근대 문화 거리가 있는 내륙 도시입니다.'
  },
  {
    value: 'daejeon',
    label: '대전',
    description: '과학 도시로 알려져 있으며, 엑스포 과학공원이 유명합니다.'
  },
  {
    value: 'gwangju',
    label: '광주',
    description: '예술과 문화의 도시로, 국립아시아문화전당이 있습니다.'
  },
  {
    value: 'suwon',
    label: '수원',
    description: '수원화성과 화성행궁이 있는 역사적인 도시입니다.'
  },
  {
    value: 'andong',
    label: '안동',
    description: '하회마을과 전통 문화가 잘 보존된 도시입니다.'
  },
  {
    value: 'tongyeong',
    label: '통영',
    description: '한려해상국립공원과 미륵도가 있는 아름다운 항구 도시입니다.'
  }
]; 