'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, regenerateInviteCode } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { joinRoomRealtime, leaveRoomRealtime, subscribeToPreferencesCompleted } from '@/lib/supabase/realtime'
import { toast } from 'sonner'
import { Share2, Copy, RefreshCw, Loader2, ArrowLeft, UserPlus } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState('members')
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
      // 세션 정보 가져오기
      const { data: sessionData } = await supabase.auth.getSession();
      
      // 백엔드 API 호출하여 경로 생성 시작
      const response = await fetch(`/api/rooms/${roomId}/generate-routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session?.access_token || ''}`
        }
      })
      
      // 응답 데이터 로깅 (디버깅용)
      const responseText = await response.text();
      console.log('API 응답:', response.status, responseText);
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('JSON 파싱 오류:', e);
      }
      
      if (!response.ok) {
        let errorMessage = '경로 생성 중 오류가 발생했습니다';
        
        if (responseData && responseData.error) {
          errorMessage = responseData.error;
        }
        
        throw new Error(errorMessage);
      }
      
      // 경로 추천 화면으로 이동
      router.push(`/rooms/${roomId}/routes`)
    } catch (err: any) {
      console.error('경로 생성 오류:', err);
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

  // 친구 추가 함수
  const handleAddFriend = (userId: string) => {
    // 친구 추가 로직 구현
    toast.success('친구 추가 요청을 보냈습니다.');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      {/* 상단 헤더 */}
      <div className="border-b border-gray-200">
        <div className="flex items-center p-4">
          <Link href="/" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">{room?.title || '방제목'}</h1>
        </div>
      </div>
      
      {/* 탭 메뉴 */}
      <Tabs defaultValue="members" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-gray-200">
          <TabsList className="w-full grid grid-cols-2 bg-transparent h-auto p-0">
            <TabsTrigger 
              value="members" 
              className="py-3 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none"
            >
              참여 인원
            </TabsTrigger>
            <TabsTrigger 
              value="routes" 
              className="py-3 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none"
            >
              경로추천안
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="members" className="p-0 m-0">
          {/* 참여자 리스트 */}
          <div className="p-4">
            {members.map(member => (
              <div key={member.id} className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                    {(member.nickname || member.email || '익명')?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">
                      {member.nickname || member.email?.split('@')[0] || '익명 사용자'}
                      {member.user_id === currentUser?.id && ' (나)'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {member.user_id === room?.owner_id ? '방장' : '참여자'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center">
                  {member.status === 'ready' ? (
                    <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full mr-2">완료</span>
                  ) : (
                    <span className="text-xs bg-amber-100 text-amber-600 px-2 py-1 rounded-full mr-2">진행 중</span>
                  )}
                  {member.user_id !== currentUser?.id && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleAddFriend(member.user_id)}
                      className="h-8 w-8"
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* 초대 링크 */}
          {isOwner && room?.invite_code && (
            <div className="p-4 border-t border-gray-200">
              <p className="text-sm font-medium mb-2">초대 링크</p>
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
              
              <div className="flex justify-center gap-2 mt-4">
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
          )}
          
          {/* 경로 생성 시작 버튼 (방장만) */}
          {isOwner && (
            <div className="p-4 border-t border-gray-200">
              <Button
                onClick={handleStartGeneration}
                disabled={generating}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {generating ? (
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    경로 생성 중...
                  </div>
                ) : '경로 생성 시작'}
              </Button>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="routes" className="p-0 m-0">
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-lg font-medium">성향 테스트 진행 중</p>
              <p className="text-sm text-gray-500 mt-2">
                모든 참여자가 성향 테스트를 완료하면 경로가 추천됩니다
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      {error && (
        <div className="mt-4 p-4 bg-red-50 text-red-500 rounded-md text-center">
          {error}
        </div>
      )}
      
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <h3 className="text-lg font-bold mb-2">주의</h3>
              <p className="mb-4">아직 모든 참여자가 준비되지 않았습니다. 계속 진행하시겠습니까?</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowWarning(false)}>
                  취소
                </Button>
                <Button onClick={handleStartGeneration}>
                  계속 진행
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
} 