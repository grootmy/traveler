'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import KakaoMap from '@/components/KakaoMap'
import { generateRoomCode } from '@/lib/utils'

export default function CreateRoom() {
  const [title, setTitle] = useState('')
  const [budget, setBudget] = useState(50000)
  const [expectedMembers, setExpectedMembers] = useState(2)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [region, setRegion] = useState('서울 강남구')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState({ lat: 37.5665, lng: 126.9780 })
  const router = useRouter()

  const handleBudgetChange = (value: number[]) => {
    setBudget(value[0])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { user, error: authError } = await getCurrentUser()
      
      if (authError || !user) {
        throw new Error('인증되지 않은 사용자입니다')
      }
      
      // 방 생성
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert({
          owner_id: user.id,
          title,
          budget,
          expected_members: expectedMembers,
          start_time: startTime,
          end_time: endTime,
          region,
          status: 'active'
        })
        .select()
      
      if (roomError) {
        throw roomError
      }
      
      const roomId = roomData[0].id
      
      // 초대 코드 생성
      const inviteCode = generateRoomCode()
      
      const { error: inviteError } = await supabase
        .from('room_invites')
        .insert({
          room_id: roomId,
          invite_code: inviteCode,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7일 후 만료
        })
      
      if (inviteError) {
        throw inviteError
      }
      
      // 방장을 방 멤버로 추가
      await supabase
        .from('room_members')
        .insert({
          room_id: roomId,
          user_id: user.id,
          status: 'ready'
        })
      
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
                  예산: {budget.toLocaleString()}원
                </label>
                <Slider
                  defaultValue={[50000]}
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="startTime" className="text-sm font-medium">
                    시작 시간
                  </label>
                  <Input
                    id="startTime"
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="endTime" className="text-sm font-medium">
                    종료 시간
                  </label>
                  <Input
                    id="endTime"
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="region" className="text-sm font-medium">
                  활동 지역
                </label>
                <Input
                  id="region"
                  placeholder="활동 지역을 입력하세요 (예: 강남구, 송파구)"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  지도에서 위치 확인
                </label>
                <div className="h-[300px] rounded-md overflow-hidden">
                  <KakaoMap
                    height="300px"
                    center={mapCenter}
                    useStaticMap={true}
                    level={9}
                    mapTypeId="ROADMAP"
                  />
                </div>
              </div>
              
              {error && (
                <div className="text-sm text-red-500 mt-2">{error}</div>
              )}
              
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? '생성 중...' : '방 생성하기'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
} 