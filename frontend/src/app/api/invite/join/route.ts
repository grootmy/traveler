import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { roomId, nickname } = await request.json();
    
    if (!roomId) {
      return NextResponse.json({ error: '방 ID가 필요합니다' }, { status: 400 });
    }
    
    if (!nickname || typeof nickname !== 'string' || nickname.trim() === '') {
      return NextResponse.json({ error: '닉네임이 필요합니다' }, { status: 400 });
    }
    
    // Supabase 클라이언트 생성
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set(name, value, options) {
            cookieStore.set(name, value, options);
          },
          remove(name, options) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          },
        },
      }
    );
    
    // 익명 ID 가져오기 (쿠키에 저장된 경우)
    const { data: { session } } = await supabase.auth.getSession();
    
    // 사용자가 이미 로그인된 경우
    if (session?.user) {
      const userId = session.user.id;
      
      // 이미 방에 참여 중인지 확인
      const { data: existingMember, error: checkError } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (checkError) {
        throw checkError;
      }
      
      // 이미 참여 중이면 성공 반환
      if (existingMember) {
        return NextResponse.json({ success: true, roomId });
      }
      
      // 사용자 정보 가져오기
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('nickname')
        .eq('textid', userId)
        .maybeSingle();
      
      if (userError) {
        console.error('사용자 정보 조회 오류:', userError);
      }
      
      const nickname = userData?.nickname || '익명 사용자';
      console.log('초대 링크로 참여: 사용자 정보', { userId, nickname, roomId });
      
      // 방 멤버로 추가 (로그인 사용자)
      const { error: joinError } = await supabase
        .from('room_members')
        .insert({
          room_id: roomId,
          user_id: userId,
          nickname: nickname,
          joined_at: new Date().toISOString(),
          is_anonymous: false
        });
      
      if (joinError) {
        console.error('방 참여 오류:', joinError);
        throw joinError;
      }
      
      console.log('방 참여 성공:', { userId, roomId });
      
      return NextResponse.json({ success: true, roomId });
    } 
    // 익명 사용자인 경우
    else {
      // 익명 사용자 ID 쿠키 가져오기
      let anonymousId = cookieStore.get('anonymous_id')?.value;
      
      // 익명 사용자 정보 찾기 (이미 이전에 방에 참여했는지 확인)
      if (anonymousId) {
        const { data: existingMember, error: checkError } = await supabase
          .from('room_members')
          .select('*')
          .eq('room_id', roomId)
          .eq('anonymous_id', anonymousId)
          .maybeSingle();
        
        if (!checkError && existingMember) {
          // 이미 참여 중이면 닉네임만 업데이트
          const { error: updateError } = await supabase
            .from('room_members')
            .update({ nickname })
            .eq('textid', existingMember.textid)
            .eq('room_id', roomId);
          
          if (updateError) throw updateError;
          
          return NextResponse.json({ success: true, roomId });
        }
      } else {
        // 새 익명 ID 생성
        anonymousId = crypto.randomUUID();
        // 쿠키에 익명 ID 저장 (7일간 유효)
        cookieStore.set('anonymous_id', anonymousId, {
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
          httpOnly: true,
          sameSite: 'lax',
        });
      }
      // 방 멤버로 추가 (익명 사용자)
      const { data: memberData, error: joinError } = await supabase
        .from('room_members')
        .insert({
          room_id: roomId,
          nickname,
          anonymous_id: anonymousId,
          joined_at: new Date().toISOString(),
          is_anonymous: true
        })
        .select()
        .single();
      
      if (joinError) throw joinError;
      
      // ID를 안전하게 담은 쿠키 생성 (저장된 멤버 ID로)
      cookieStore.set(`room_member_${roomId}`, memberData.textid, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30일
        httpOnly: true,
        sameSite: 'lax', 
      });
      
      return NextResponse.json({ 
        success: true, 
        roomId,
        memberId: memberData.textid
      });
    }
  } catch (error: any) {
    console.error('방 참여 오류:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || '방 참여 중 오류가 발생했습니다' 
    }, { status: 500 });
  }
}

// 이 라우트가 항상 동적으로 렌더링되어야 함을 명시
export const dynamic = 'force-dynamic'; 