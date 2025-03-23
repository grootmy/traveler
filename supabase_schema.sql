-- 사용자 테이블
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  nickname TEXT,
  avatar_url TEXT
);

-- 사용자 프로필 보안 정책 설정
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "사용자는 자신의 프로필만 업데이트할 수 있습니다" ON public.users
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "사용자 프로필은 모두가 볼 수 있습니다" ON public.users
  FOR SELECT USING (true);

-- 사용자 생성 시 프로필 자동 생성을 위한 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 사용자 선호도 테이블
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(user_id)
);

-- 사용자 선호도 보안 정책 설정
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "사용자는 자신의 선호도만 업데이트할 수 있습니다" ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- 방 테이블
CREATE TABLE IF NOT EXISTS public.rooms (
  textid UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  owner_id UUID REFERENCES public.users(id) NOT NULL,
  district TEXT,
  purpose_category TEXT,
  budget_min INTEGER,
  budget_max INTEGER,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  expected_members INTEGER DEFAULT 1,
  code TEXT UNIQUE,
  status TEXT DEFAULT 'waiting' NOT NULL, -- 'waiting', 'in_progress', 'completed' 등의 상태
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 방 보안 정책 설정
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "방은 모두가 볼 수 있습니다" ON public.rooms
  FOR SELECT USING (true);
CREATE POLICY "방은 소유자만 업데이트할 수 있습니다" ON public.rooms
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "방은 소유자만 삭제할 수 있습니다" ON public.rooms
  FOR DELETE USING (auth.uid() = owner_id);
CREATE POLICY "인증된 사용자는 방을 생성할 수 있습니다" ON public.rooms
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 방 멤버 테이블
CREATE TABLE IF NOT EXISTS public.room_members (
  textid UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(textid) NOT NULL,
  user_id UUID REFERENCES public.users(id) NOT NULL,
  nickname TEXT,
  relationship TEXT,
  preferences JSONB,
  is_ready BOOLEAN DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(room_id, user_id)
);

-- 방 멤버 보안 정책 설정
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "방 멤버 조회 권한" ON public.room_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE room_members.room_id = rm.room_id AND rm.user_id = auth.uid()
    )
  );
CREATE POLICY "방 참여 권한" ON public.room_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "방 멤버 정보 수정 권한" ON public.room_members
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 경로 테이블
CREATE TABLE IF NOT EXISTS public.routes (
  textid UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(textid) NOT NULL,
  route_data JSONB NOT NULL,
  travel_time INTEGER, -- 분 단위
  total_cost INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 경로 보안 정책 설정
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "경로는 방 멤버만 볼 수 있습니다" ON public.routes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_members.room_id = routes.room_id
      AND room_members.user_id = auth.uid()
    )
  );
CREATE POLICY "경로는 서버만 생성할 수 있습니다" ON public.routes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 경로 투표 테이블
CREATE TABLE IF NOT EXISTS public.route_votes (
  textid UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID REFERENCES public.routes(textid) NOT NULL,
  user_id UUID REFERENCES public.users(id) NOT NULL,
  vote_value INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(route_id, user_id)
);

-- 투표 보안 정책 설정
ALTER TABLE public.route_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "투표는 방 멤버만 볼 수 있습니다" ON public.route_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.routes
      JOIN public.room_members ON routes.room_id = room_members.room_id
      WHERE routes.textid = route_votes.route_id
      AND room_members.user_id = auth.uid()
    )
  );
CREATE POLICY "사용자는 자신의 투표만 생성할 수 있습니다" ON public.route_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "사용자는 자신의 투표만 업데이트할 수 있습니다" ON public.route_votes
  FOR UPDATE USING (auth.uid() = user_id);

-- 선택된 경로 테이블
CREATE TABLE IF NOT EXISTS public.selected_routes (
  textid UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(textid) UNIQUE NOT NULL,
  route_id UUID REFERENCES public.routes(textid) NOT NULL,
  selected_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 최종 선택 경로 보안 정책 설정
ALTER TABLE public.selected_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "최종 선택 경로는 방 멤버만 볼 수 있습니다" ON public.selected_routes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_members.room_id = selected_routes.room_id
      AND room_members.user_id = auth.uid()
    )
  );
CREATE POLICY "방 소유자만 최종 경로를 선택할 수 있습니다" ON public.selected_routes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rooms
      WHERE rooms.textid = selected_routes.room_id
      AND rooms.owner_id = auth.uid()
    )
  );

-- 채팅 메시지 테이블
CREATE TABLE IF NOT EXISTS public.chat_messages (
  textid UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(textid) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_ai BOOLEAN DEFAULT false,
  is_ai_chat BOOLEAN DEFAULT false,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 채팅 메시지 보안 정책 설정
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 기존 정책 제거
DROP POLICY IF EXISTS "채팅 메시지는 방 멤버만 볼 수 있습니다" ON public.chat_messages;
DROP POLICY IF EXISTS "팀 채팅 메시지는 방 멤버 모두가 볼 수 있습니다" ON public.chat_messages;
DROP POLICY IF EXISTS "AI 채팅 메시지는 해당 사용자만 볼 수 있습니다" ON public.chat_messages;

-- 일반 채팅 메시지 (팀 채팅)는 방 멤버 모두가 볼 수 있음
CREATE POLICY "팀 채팅 메시지는 방 멤버 모두가 볼 수 있습니다" ON public.chat_messages
  FOR SELECT USING (
    is_ai_chat = false AND
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_members.room_id = chat_messages.room_id
      AND room_members.user_id = auth.uid()
    )
  );

-- AI 채팅 메시지는 작성자만 볼 수 있음 (1:1 개인 채팅)
CREATE POLICY "AI 채팅 메시지는 작성자와 대화한 본인만 볼 수 있습니다" ON public.chat_messages
  FOR SELECT USING (
    is_ai_chat = true AND (
      -- 사용자가 작성한 메시지는 본인만 볼 수 있음
      user_id = auth.uid() OR
      -- AI가 응답한 메시지는 관련 사용자만 볼 수 있음 (chat_messages 테이블에서 바로 이전 메시지가 현재 사용자의 메시지인 경우)
      (is_ai = true AND 
       EXISTS (
         SELECT 1 FROM public.chat_messages AS prev_msg
         WHERE prev_msg.room_id = chat_messages.room_id
         AND prev_msg.user_id = auth.uid()
         AND prev_msg.is_ai_chat = true
         AND prev_msg.created_at < chat_messages.created_at
         ORDER BY prev_msg.created_at DESC
         LIMIT 1
       )
      )
    )
  );

-- 인증된 사용자는 채팅 메시지를 보낼 수 있음
CREATE POLICY "인증된 사용자는 채팅 메시지를 보낼 수 있습니다" ON public.chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_members.room_id = chat_messages.room_id
      AND room_members.user_id = auth.uid()
    )
  );

-- 서버 함수는 AI 메시지를 저장할 수 있음
CREATE POLICY "서버 함수는 AI 메시지를 저장할 수 있습니다" ON public.chat_messages
  FOR INSERT WITH CHECK (
    is_ai = true AND
    user_id IS NULL
  );

-- 채팅 메시지 메타데이터 테이블 추가
-- 특정 AI 메시지가 어떤 사용자의 질문에 대한 응답인지 추적
CREATE TABLE IF NOT EXISTS public.chat_message_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.chat_messages(textid) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 메타데이터 보안 정책 설정
ALTER TABLE public.chat_message_metadata ENABLE ROW LEVEL SECURITY;

-- 메타데이터 조회 권한 - 본인의 메타데이터만 볼 수 있음
CREATE POLICY "사용자는 자신의 메시지 메타데이터만 볼 수 있습니다" ON public.chat_message_metadata
  FOR SELECT USING (user_id = auth.uid());

-- 메타데이터 생성 권한 - 인증된 사용자 및 서버 함수
CREATE POLICY "인증된 사용자는 메시지 메타데이터를 생성할 수 있습니다" ON public.chat_message_metadata
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    (user_id = auth.uid() OR auth.uid() IN (SELECT owner_id FROM public.rooms))
  );

-- 메타데이터 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_message_metadata_message_id ON public.chat_message_metadata(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_metadata_user_id ON public.chat_message_metadata(user_id);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON public.rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(code);
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON public.room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_room_id ON public.routes(room_id);
CREATE INDEX IF NOT EXISTS idx_route_votes_route_id ON public.route_votes(route_id);
CREATE INDEX IF NOT EXISTS idx_route_votes_user_id ON public.route_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_selected_routes_room_id ON public.selected_routes(room_id);
CREATE INDEX IF NOT EXISTS idx_selected_routes_route_id ON public.selected_routes(route_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id); 