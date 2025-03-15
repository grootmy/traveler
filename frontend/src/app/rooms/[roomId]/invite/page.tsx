'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function InvitePage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [roomTitle, setRoomTitle] = useState('')
  const router = useRouter()
  const { roomId } = params

  useEffect(() => {
    const checkAuth = async () => {
      const { user, error: authError } = await getCurrentUser()
      
      if (authError || !user) {
        router.push('/')
        return
      }
      
      await fetchRoomInfo(roomId)
    }
    
    checkAuth()
  }, [roomId, router])

  const fetchRoomInfo = async (roomId: string) => {
    try {
      // 방 정보 가져오기
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single()
      
      if (roomError) throw roomError
      
      setRoomTitle(roomData.title)
      
      // 초대 코드 가져오기
      const { data: inviteData, error: inviteError } = await supabase
        .from('room_invites')
        .select('invite_code')
        .eq('room_id', roomId)
        .single()
      
      if (inviteError) throw inviteError
      
      setInviteCode(inviteData.invite_code)
      setInviteLink(`${window.location.origin}/invite/${inviteData.invite_code}`)
      setLoading(false)
    } catch (err: any) {
      setError(err.message || '초대 정보를 가져오는 중 오류가 발생했습니다')
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('클립보드 복사 실패:', err)
    }
  }

  const shareKakao = () => {
    if (window.Kakao && window.Kakao.Share) {
      window.Kakao.Share.sendDefault({
        objectType: 'text',
        text: `${roomTitle} 당일치기 여행에 초대합니다!`,
        link: {
          mobileWebUrl: inviteLink,
          webUrl: inviteLink,
        },
      })
    } else {
      alert('카카오톡 공유 기능을 사용할 수 없습니다.')
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
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-blue-600 mb-6 text-center">초대하기</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>{roomTitle}</CardTitle>
            <CardDescription>
              친구들을 당일치기 여행에 초대해보세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">초대 링크</label>
              <div className="flex">
                <Input
                  value={inviteLink}
                  readOnly
                  className="rounded-r-none"
                />
                <Button
                  onClick={copyToClipboard}
                  className="rounded-l-none"
                  variant={copied ? "secondary" : "default"}
                >
                  {copied ? '복사됨' : '복사'}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">초대 코드</label>
              <div className="flex items-center justify-center bg-muted p-4 rounded-md">
                <span className="text-xl font-bold tracking-widest">{inviteCode}</span>
              </div>
            </div>
            
            <div className="pt-4">
              <p className="text-sm text-center mb-4">소셜 미디어로 공유하기</p>
              <div className="flex justify-center gap-4">
                <Button
                  onClick={shareKakao}
                  className="bg-yellow-400 hover:bg-yellow-500 text-black"
                >
                  카카오톡 공유
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button asChild>
              <Link href={`/rooms/${roomId}/preferences`}>
                다음 단계로
              </Link>
            </Button>
          </CardFooter>
        </Card>
        
        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-500 rounded-md text-center">
            {error}
          </div>
        )}
      </div>
    </main>
  )
} 