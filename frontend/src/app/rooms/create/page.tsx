'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, createRoom, generateRoutes } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { generateRoomCode } from '@/lib/utils'
import { Loader2, Plus, X, Calendar, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { format, addMonths, startOfToday, endOfDay, isAfter, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

const CATEGORIES = [
  '친목/수다',
  '데이트',
  '관광/여행',
  '맛집 탐방',
  '쇼핑',
  '문화생활',
  '기타'
];

const SEOUL_DISTRICTS = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', 
  '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', 
  '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', 
  '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
];

export default function CreateRoom() {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [budgetMin, setBudgetMin] = useState(30000)
  const [budgetMax, setBudgetMax] = useState(50000)
  const [expectedMembers, setExpectedMembers] = useState(2)
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState<string>(format(new Date(), 'HH:mm'))
  const [endTime, setEndTime] = useState<string>(format(new Date(new Date().setHours(new Date().getHours() + 3)), 'HH:mm'))
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([])
  const [mustVisitPlaces, setMustVisitPlaces] = useState<Array<{name: string, address: string}>>([])
  const [newPlaceName, setNewPlaceName] = useState('')
  const [newPlaceAddress, setNewPlaceAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // 오늘 날짜와 한 달 후 날짜 계산
  const today = startOfToday()
  const maxDate = format(addMonths(today, 1), 'yyyy-MM-dd')
  
  // 전체 datetime 문자열 생성 함수
  const formatDateTimeForSubmit = (date: string, time: string) => {
    return `${date}T${time}:00`;
  }
  
  // 시작 시간이 종료 시간보다 이후인지 확인하는 함수
  const isStartTimeAfterEndTime = () => {
    const startDateTime = parseISO(`${selectedDate}T${startTime}:00`);
    const endDateTime = parseISO(`${selectedDate}T${endTime}:00`);
    return isAfter(startDateTime, endDateTime);
  }

  const handleBudgetChange = (value: number[]) => {
    setBudgetMin(value[0])
    setBudgetMax(value[1])
  }

  const handleDistrictsChange = (districts: string[]) => {
    setSelectedDistricts(districts)
  }

  const addMustVisitPlace = () => {
    if (!newPlaceName.trim() || !newPlaceAddress.trim()) {
      toast.error('장소 이름과 주소를 모두 입력해주세요');
      return;
    }

    setMustVisitPlaces([
      ...mustVisitPlaces,
      { name: newPlaceName, address: newPlaceAddress }
    ]);

    setNewPlaceName('');
    setNewPlaceAddress('');
  }

  const removeMustVisitPlace = (index: number) => {
    setMustVisitPlaces(mustVisitPlaces.filter((_, i) => i !== index));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!category) {
      setError('만남의 목적을 선택해주세요');
      setLoading(false);
      return;
    }

    if (selectedDistricts.length === 0) {
      setError('활동 지역을 선택해주세요');
      setLoading(false);
      return;
    }
    
    if (isStartTimeAfterEndTime()) {
      setError('시작 시간이 종료 시간보다 늦을 수 없습니다');
      setLoading(false);
      return;
    }

    try {
      const { user, error: authError } = await getCurrentUser()
      
      if (authError || !user) {
        throw new Error('인증되지 않은 사용자입니다')
      }
      
      // 여러 지역이 선택된 경우 첫 번째 지역으로 생성
      const primaryDistrict = selectedDistricts[0];
      
      // 방 생성
      const { data: roomData, error: roomError } = await createRoom(user.id, {
        title,
        purpose_category: category,
        expected_members: expectedMembers,
        budget_min: budgetMin,
        budget_max: budgetMax,
        start_time: formatDateTimeForSubmit(selectedDate, startTime),
        end_time: formatDateTimeForSubmit(selectedDate, endTime),
        district: primaryDistrict
      });
      
      if (roomError) {
        throw roomError;
      }
      
      if (!roomData || roomData.length === 0) {
        throw new Error('방 생성에 실패했습니다');
      }

      const roomId = roomData[0].textid;
      
      // 추가 선택된 지역 저장 (2개 이상일 경우)
      if (selectedDistricts.length > 1) {
        for (let i = 1; i < selectedDistricts.length; i++) {
          const { error: additionalDistrictError } = await supabase
            .from('additional_districts')
            .insert({
              room_id: roomId,
              district_name: selectedDistricts[i]
            });
          
          if (additionalDistrictError) {
            console.error('추가 지역 저장 오류:', additionalDistrictError);
          }
        }
      }
      
      // 꼭 가야하는 장소 추가
      if (mustVisitPlaces.length > 0) {
        for (const place of mustVisitPlaces) {
          const { error: placeError } = await supabase
            .from('must_visit_places')
            .insert({
              room_id: roomId,
              name: place.name,
              address: place.address
            });
          
          if (placeError) {
            console.error('장소 추가 오류:', placeError);
          }
        }
      }
      
      // 방 생성 및 부가 정보 저장 완료 후 경로 생성 API 호출
      try {
        const { data: generatedRoutes, error: generationError } = await generateRoutes(roomId);
        
        if (generationError) {
          console.error('경로 생성 오류:', generationError);
          // 경로 생성 실패시에도 방 생성은 완료된 것으로 처리
        } else {
          console.log('경로가 성공적으로 생성되었습니다:', generatedRoutes);
        }
      } catch (routeError) {
        console.error('경로 생성 중 예외 발생:', routeError);
        // 경로 생성 실패시에도 방 생성은 완료된 것으로 처리
      }
      
      router.push(`/rooms/${roomId}/invite`)
    } catch (err: any) {
      setError(err.message || '방 생성 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-blue-600 mb-6">방 생성하기</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>새로운 당일치기 계획</CardTitle>
            <CardDescription>
              당일치기 여행 정보를 입력해주세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  방 제목
                </label>
                <Input
                  id="title"
                  placeholder="방 제목을 입력하세요"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  만남의 목적
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <Button 
                      key={cat}
                      type="button"
                      variant={category === cat ? "default" : "outline"}
                      onClick={() => setCategory(cat)}
                      className="text-sm h-9"
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  1인 예산 범위: {budgetMin.toLocaleString()}원 ~ {budgetMax.toLocaleString()}원
                </label>
                <Slider
                  defaultValue={[budgetMin, budgetMax]}
                  min={10000}
                  max={200000}
                  step={5000}
                  onValueChange={handleBudgetChange}
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="expectedMembers" className="text-sm font-medium">
                  예상 인원
                </label>
                <Input
                  id="expectedMembers"
                  type="number"
                  min={1}
                  max={10}
                  value={expectedMembers}
                  onChange={(e) => setExpectedMembers(parseInt(e.target.value))}
                  required
                />
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    날짜 선택
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Calendar className="h-4 w-4 text-gray-400" />
                    </div>
                    <Input
                      type="date"
                      min={format(today, 'yyyy-MM-dd')}
                      max={maxDate}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      시작 시간
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Clock className="h-4 w-4 text-gray-400" />
                      </div>
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      종료 시간
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Clock className="h-4 w-4 text-gray-400" />
                      </div>
                      <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  활동 지역 (서울 구별)
                </label>
                <div className="mt-6">
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-5">
                    {SEOUL_DISTRICTS.map((district) => (
                      <button
                        key={district}
                        type="button"
                        onClick={() => handleDistrictsChange([district])}
                        className={`px-3 py-2 text-sm rounded-lg border ${
                          selectedDistricts.includes(district)
                            ? 'bg-blue-100 border-blue-500 text-blue-700'
                            : 'border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {district}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium mb-2 block">
                  꼭 가야하는 장소 (선택사항)
                </label>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="장소 이름"
                    value={newPlaceName}
                    onChange={(e) => setNewPlaceName(e.target.value)}
                  />
                  <Input
                    placeholder="장소 주소"
                    value={newPlaceAddress}
                    onChange={(e) => setNewPlaceAddress(e.target.value)}
                  />
                  <Button 
                    type="button" 
                    onClick={addMustVisitPlace}
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                {mustVisitPlaces.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-sm text-gray-500">추가된 장소 목록:</p>
                    <div className="space-y-2">
                      {mustVisitPlaces.map((place, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                          <div>
                            <p className="font-medium">{place.name}</p>
                            <p className="text-sm text-gray-500">{place.address}</p>
                          </div>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon"
                            onClick={() => removeMustVisitPlace(index)}
                          >
                            <X className="h-4 w-4 text-gray-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {error && (
                <div className="text-sm text-red-500 mt-2">{error}</div>
              )}
              
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    생성 중...
                  </>
                ) : '방 생성하기'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
} 