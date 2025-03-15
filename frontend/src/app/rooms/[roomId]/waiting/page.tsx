'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, regenerateInviteCode } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { joinRoomRealtime, leaveRoomRealtime, subscribeToPreferencesCompleted } from '@/lib/supabase/realtime'
import { toast } from 'sonner'
import { Share2, Copy, RefreshCw, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'

type Member = {
  id: string;
  user_id: string;
  nickname?: string;
  status: 'pending' | 'ready';
  email?: string;
}

type Room = {
  id: string;
  title: string;
  owner_id: string;
  expected_members: number;
  invite_code?: string;
}

export default function WaitingPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [regeneratingCode, setRegeneratingCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const router = useRouter()
  const { roomId } = params

  useEffect(() => {
    const init = async () => {
      try {
        // 현재 사용자 확인
        const { user, error: authError } = await getCurrentUser()
        
        if (authError || !user) {
          router.push('/')
          return
        }
        
        setCurrentUser(user)
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .single()
        
        if (roomError) throw roomError
        
        setRoom(roomData)
        setIsOwner(roomData.owner_id === user.id)
        
        // 멤버 정보 가져오기
        await fetchMembers()
        
        // Supabase Realtime 연결
        joinRoomRealtime(roomId)
        
        // 사용자 준비 상태 업데이트 이벤트 리스너
        subscribeToPreferencesCompleted(roomId, ({ userId, nickname }) => {
          setMembers(prev => prev.map(member => 
            member.user_id === userId 
              ? { ...member, status: 'ready' } 
              : member
          ))
        })
        
        // 데이터베이스 변경 사항 구독 (room_members 테이블)
        const roomMembersChannel = supabase
          .channel('room_members_changes')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'room_members',
              filter: `room_id=eq.${roomId}`,
            },
            (payload) => {
              // 멤버 상태가 업데이트되면 멤버 목록 새로고침
              fetchMembers()
            }
          )
          .subscribe()
        
        setLoading(false)
        
        return () => {
          // 정리 함수
          leaveRoomRealtime(roomId)
          roomMembersChannel.unsubscribe()
        }
      } catch (err: any) {
        setError(err.message || '정보를 가져오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
  }, [roomId, router])

  const fetchMembers = async () => {
    try {
      // 멤버 정보 가져오기
      const { data: membersData, error: membersError } = await supabase
        .from('room_members')
        .select('id, user_id, nickname, status')
        .eq('room_id', roomId)
      
      if (membersError) throw membersError
      
      // 사용자 이메일 정보 가져오기
      const userIds = membersData.map(m => m.user_id)
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email')
        .in('id', userIds)
      
      if (usersError) throw usersError
      
      // 멤버 정보와 사용자 정보 합치기
      const membersWithEmail = membersData.map(member => {
        const user = usersData?.find(u => u.id === member.user_id)
        return {
          ...member,
          email: user?.email
        }
      })
      
      setMembers(membersWithEmail)
    } catch (err: any) {
      console.error('멤버 정보 가져오기 오류:', err)
    }
  }

  const handleStartGeneration = async () => {
    // 모든 멤버가 준비되었는지 확인
    const allReady = members.every(member => member.status === 'ready')
    
    if (!allReady && !showWarning) {
      setShowWarning(true)
      return
    }
    
    setGenerating(true)
    setShowWarning(false)
    
    try {
      // 백엔드 API 호출하여 경로 생성 시작
      const response = await fetch(`/api/rooms/${roomId}/generate-routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '경로 생성 중 오류가 발생했습니다')
      }
      
      // 경로 추천 화면으로 이동
      router.push(`/rooms/${roomId}/routes`)
    } catch (err: any) {
      setError(err.message || '경로 생성 중 오류가 발생했습니다')
      setGenerating(false)
    }
  }

  // 초대 링크 복사 함수
  const copyInviteLink = () => {
    if (!room?.invite_code) return;
    
    const inviteLink = `${window.location.origin}/invite/${room.invite_code}`;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success('초대 링크가 클립보드에 복사되었습니다.');
    
    setTimeout(() => setCopied(false), 2000);
  };

  // 초대 코드 재생성 함수
  const handleRegenerateInviteCode = async () => {
    if (!currentUser || !room) return;
    
    setRegeneratingCode(true);
    
    try {
      const result = await regenerateInviteCode(roomId, currentUser.id);
      
      if (result.success) {
        // 방 정보 업데이트
        setRoom(prev => prev ? { ...prev, invite_code: result.inviteCode } : null);
        toast.success('초대 코드가 재생성되었습니다.');
      } else {
        toast.error(result.error?.message || '초대 코드 재생성 중 오류가 발생했습니다.');
      }
    } catch (error: any) {
      toast.error(error.message || '초대 코드 재생성 중 오류가 발생했습니다.');
    } finally {
      setRegeneratingCode(false);
    }
  };

  // SNS 공유 함수
  const shareToSNS = (platform: 'kakao' | 'twitter' | 'facebook') => {
    if (!room?.invite_code) return;
    
    const inviteLink = `${window.location.origin}/invite/${room.invite_code}`;
    const title = `${room.title} - 당일치기 여행에 초대합니다!`;
    
    switch (platform) {
      case 'kakao':
        // 카카오톡 공유 (카카오 SDK 필요)
        if (typeof window !== 'undefined' && (window as any).Kakao && (window as any).Kakao.Share) {
          (window as any).Kakao.Share.sendDefault({
            objectType: 'text',
            text: title,
            link: {
              mobileWebUrl: inviteLink,
              webUrl: inviteLink,
            },
          });
        } else {
          toast.error('카카오톡 공유 기능을 사용할 수 없습니다.');
        }
        break;
        
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(inviteLink)}`, '_blank');
        break;
        
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteLink)}`, '_blank');
        break;
    }
  };

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
        <h1 className="text-3xl font-bold text-blue-600 mb-2 text-center">{room?.title}</h1>
        <p className="text-center text-gray-600 mb-6">참여자 대기 중</p>
        
        {isOwner && room?.invite_code && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>초대 링크</CardTitle>
              <CardDescription>
                친구들을 초대하여 함께 여행을 계획해보세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input 
                    value={`${window.location.origin}/invite/${room.invite_code}`}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyInviteLink}
                    disabled={copied}
                  >
                    {copied ? (
                      <span className="text-green-500">✓</span>
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRegenerateInviteCode}
                    disabled={regeneratingCode}
                    title="초대 코드 재생성"
                  >
                    {regeneratingCode ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => shareToSNS('kakao')}
                    className="bg-yellow-400 hover:bg-yellow-500 text-black"
                  >
                    카카오톡 공유
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => shareToSNS('twitter')}
                    className="bg-blue-400 hover:bg-blue-500 text-white"
                  >
                    트위터 공유
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => shareToSNS('facebook')}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    페이스북 공유
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        <Card>
          <CardHeader>
            <CardTitle>참여자 목록</CardTitle>
            <CardDescription>
              모든 참여자가 준비되면 경로 생성을 시작할 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 font-medium text-sm py-2 border-b">
                <div>이름</div>
                <div>상태</div>
                <div>역할</div>
              </div>
              
              {members.map(member => (
                <div key={member.id} className="grid grid-cols-3 text-sm py-2 border-b border-gray-100">
                  <div className="truncate">
                    {member.nickname || member.email || '익명 사용자'}
                    {member.user_id === currentUser?.id && ' (나)'}
                  </div>
                  <div>
                    {member.status === 'ready' ? (
                      <span className="text-green-500 font-medium">준비 완료</span>
                    ) : (
                      <span className="text-amber-500">대기 중</span>
                    )}
                  </div>
                  <div>
                    {member.user_id === room?.owner_id ? '방장' : '참여자'}
                  </div>
                </div>
              ))}
              
              <div className="text-sm text-gray-500 mt-4">
                <p>현재 {members.length}명 참여 중 (예상 인원: {room?.expected_members}명)</p>
                <p>준비 완료: {members.filter(m => m.status === 'ready').length}명</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            {isOwner ? (
              <Button
                onClick={handleStartGeneration}
                disabled={generating}
                className="w-full"
              >
                {generating ? '경로 생성 중...' : '경로 생성 시작'}
              </Button>
            ) : (
              <p className="text-center text-gray-500">
                방장이 경로 생성을 시작하기를 기다리는 중입니다
              </p>
            )}
          </CardFooter>
        </Card>
        
        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-500 rounded-md text-center">
            {error}
          </div>
        )}
        
        {showWarning && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>주의</CardTitle>
                <CardDescription>
                  아직 모든 참여자가 준비되지 않았습니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p>일부 참여자가 아직 성향 테스트를 완료하지 않았습니다. 계속 진행하시겠습니까?</p>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowWarning(false)}>
                  취소
                </Button>
                <Button onClick={handleStartGeneration}>
                  계속 진행
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </main>
  )
} 