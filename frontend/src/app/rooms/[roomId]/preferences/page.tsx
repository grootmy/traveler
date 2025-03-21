'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { notifyPreferencesCompletedRealtime } from '@/lib/supabase/realtime'

type PreferenceOption = {
  id: string;
  label: string;
}

const travelPreferences: PreferenceOption[] = [
  { id: 'nature', label: '자연/풍경' },
  { id: 'culture', label: '문화/역사' },
  { id: 'food', label: '맛집/카페' },
  { id: 'shopping', label: '쇼핑' },
  { id: 'activity', label: '액티비티' },
]

const foodPreferences: PreferenceOption[] = [
  { id: 'korean', label: '한식' },
  { id: 'western', label: '양식' },
  { id: 'chinese', label: '중식' },
  { id: 'japanese', label: '일식' },
  { id: 'cafe', label: '카페/디저트' },
]

const relationshipOptions: PreferenceOption[] = [
  { id: 'friend', label: '친구' },
  { id: 'couple', label: '연인' },
  { id: 'family', label: '가족' },
  { id: 'coworker', label: '직장동료' },
  { id: 'solo', label: '혼자' },
]

export default function PreferencesPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roomTitle, setRoomTitle] = useState('')
  const [selectedTravelPrefs, setSelectedTravelPrefs] = useState<string[]>([])
  const [selectedFoodPrefs, setSelectedFoodPrefs] = useState<string[]>([])
  const [selectedRelationship, setSelectedRelationship] = useState<string>('')
  const [user, setUser] = useState<any>(null)
  const [nickname, setNickname] = useState<string>('')
  const router = useRouter()
  const { roomId } = params

  useEffect(() => {
    const init = async () => {
      try {
        // 현재 사용자 확인
        const { user, error: authError } = await getCurrentUser()
        
        if (authError) throw authError
        
        setUser(user)
        
        // 익명 사용자인 경우 저장된 닉네임 가져오기
        if (user && user.app_metadata?.provider === 'anonymous') {
          const savedNickname = localStorage.getItem(`nickname_${roomId}`)
          if (savedNickname) {
            setNickname(savedNickname)
          }
        }
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('title')
          .eq('textid', roomId)
          .single()
        
        if (roomError) throw roomError
        
        setRoomTitle(roomData.title)
        
        // 이미 성향 테스트를 완료했는지 확인
        if (user) {
          const { data: memberData, error: memberError } = await supabase
            .from('room_members')
            .select('status, preferences, relationship')
            .eq('room_id', roomId)
            .eq('user_id', user.id)
            .single()
          
          if (!memberError && memberData) {
            // 이미 완료한 경우 기존 데이터 로드
            if (memberData.status === 'ready' && memberData.preferences) {
              const prefs = memberData.preferences
              if (prefs.travel) setSelectedTravelPrefs(prefs.travel)
              if (prefs.food) setSelectedFoodPrefs(prefs.food)
              if (memberData.relationship) setSelectedRelationship(memberData.relationship)
              
              // 이미 완료했으면 대기 화면으로 이동
              router.push(`/rooms/${roomId}/waiting`)
              return
            }
          }
        }
        
        setLoading(false)
      } catch (err: any) {
        setError(err.message || '정보를 가져오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
  }, [roomId, router])

  const handlePreferenceToggle = (prefType: 'travel' | 'food', id: string) => {
    if (prefType === 'travel') {
      if (selectedTravelPrefs.includes(id)) {
        setSelectedTravelPrefs(selectedTravelPrefs.filter(p => p !== id))
      } else {
        setSelectedTravelPrefs([...selectedTravelPrefs, id])
      }
    } else {
      if (selectedFoodPrefs.includes(id)) {
        setSelectedFoodPrefs(selectedFoodPrefs.filter(p => p !== id))
      } else {
        setSelectedFoodPrefs([...selectedFoodPrefs, id])
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedRelationship) {
      setError('관계를 선택해주세요')
      return
    }
    
    if (selectedTravelPrefs.length === 0) {
      setError('최소 하나 이상의 여행 취향을 선택해주세요')
      return
    }
    
    if (selectedFoodPrefs.length === 0) {
      setError('최소 하나 이상의 음식 취향을 선택해주세요')
      return
    }
    
    if (!user) {
      setError('로그인이 필요합니다')
      return
    }
    
    setSubmitting(true)
    setError(null)
    
    try {
      const preferences = {
        travel: selectedTravelPrefs,
        food: selectedFoodPrefs
      }
      
      // 성향 정보 저장
      const { error: updateError } = await supabase
        .from('room_members')
        .update({
          preferences,
          relationship: selectedRelationship,
          status: 'ready'
        })
        .eq('room_id', roomId)
        .eq('user_id', user.id)
      
      if (updateError) throw updateError
      
      // Supabase Realtime으로 완료 알림
      const displayName = user.email || nickname
      await notifyPreferencesCompletedRealtime(roomId, user.id, displayName)
      
      // 대기 화면으로 이동
      router.push(`/rooms/${roomId}/waiting`)
    } catch (err: any) {
      setError(err.message || '성향 정보 저장 중 오류가 발생했습니다')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-blue-600 mb-2 text-center">{roomTitle}</h1>
        <p className="text-center text-gray-600 mb-6">여행 성향 테스트</p>
        
        <Card>
          <CardHeader>
            <CardTitle>여행 성향 설문</CardTitle>
            <CardDescription>
              당신의 여행 취향을 알려주세요. 이 정보는 최적의 경로를 추천하는데 사용됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <label className="text-sm font-medium">
                  함께하는 사람과의 관계
                </label>
                <div className="flex flex-wrap gap-2">
                  {relationshipOptions.map(option => (
                    <Button
                      key={option.id}
                      type="button"
                      variant={selectedRelationship === option.id ? "default" : "outline"}
                      onClick={() => setSelectedRelationship(option.id)}
                      className="flex-grow"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              
              <Tabs defaultValue="travel" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="travel">여행 취향</TabsTrigger>
                  <TabsTrigger value="food">음식 취향</TabsTrigger>
                </TabsList>
                <TabsContent value="travel" className="mt-4">
                  <div className="text-sm mb-2">선호하는 여행 스타일을 선택해주세요 (여러 개 선택 가능)</div>
                  <div className="flex flex-wrap gap-2">
                    {travelPreferences.map(pref => (
                      <Button
                        key={pref.id}
                        type="button"
                        variant={selectedTravelPrefs.includes(pref.id) ? "default" : "outline"}
                        onClick={() => handlePreferenceToggle('travel', pref.id)}
                        className="flex-grow"
                      >
                        {pref.label}
                      </Button>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="food" className="mt-4">
                  <div className="text-sm mb-2">선호하는 음식 종류를 선택해주세요 (여러 개 선택 가능)</div>
                  <div className="flex flex-wrap gap-2">
                    {foodPreferences.map(pref => (
                      <Button
                        key={pref.id}
                        type="button"
                        variant={selectedFoodPrefs.includes(pref.id) ? "default" : "outline"}
                        onClick={() => handlePreferenceToggle('food', pref.id)}
                        className="flex-grow"
                      >
                        {pref.label}
                      </Button>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
              
              {error && (
                <div className="text-sm text-red-500 mt-2">{error}</div>
              )}
              
              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? '저장 중...' : '완료'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
} 