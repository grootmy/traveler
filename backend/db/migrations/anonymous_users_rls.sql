-- room_members 테이블에 대한 RLS 정책 업데이트

-- 먼저 기존 RLS 정책 제거 (있다면)
DROP POLICY IF EXISTS "사용자는 자신의 멤버십 정보를 볼 수 있음" ON public.room_members;
DROP POLICY IF EXISTS "room_owners_can_view_members" ON public.room_members;
DROP POLICY IF EXISTS "방 참여자는 같은 방 멤버를 볼 수 있음" ON public.room_members;
DROP POLICY IF EXISTS "사용자는 자신의 멤버십을 추가할 수 있음" ON public.room_members;
DROP POLICY IF EXISTS "사용자는 자신의 멤버십을 수정할 수 있음" ON public.room_members;
DROP POLICY IF EXISTS "사용자는 자신의 멤버십을 삭제할 수 있음" ON public.room_members;

-- RLS 활성화 (아직 활성화되지 않은 경우)
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

-- 조회 정책 (누구나 공개된 방의 멤버 목록을 볼 수 있음)
CREATE POLICY "모든 사용자는 공개된 방의 멤버를 볼 수 있음" 
ON public.room_members FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.rooms
    WHERE rooms.textid = room_members.room_id
    AND rooms.status != 'closed'
  )
);

-- 사용자 자신의 멤버십 정보 조회 정책 (로그인 사용자)
CREATE POLICY "로그인 사용자는 자신의 멤버십 정보를 볼 수 있음" 
ON public.room_members FOR SELECT 
TO authenticated
USING (user_id = auth.uid());

-- 익명 사용자의 멤버십 정보 조회 정책
CREATE POLICY "익명 사용자는 쿠키로 자신의 멤버십 정보를 볼 수 있음" 
ON public.room_members FOR SELECT 
TO anon
USING (
  anonymous_id::text = current_setting('request.cookie.anonymous_id', true)::text
);

-- 로그인 사용자 삽입 정책
CREATE POLICY "로그인 사용자는 자신의 멤버십을 추가할 수 있음" 
ON public.room_members FOR INSERT 
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.rooms
    WHERE rooms.textid = room_members.room_id
    AND rooms.status != 'closed'
  )
);

-- 익명 사용자 삽입 정책 (서버 측 API를 통해서만 가능하도록 제한)
CREATE POLICY "익명 사용자는 API를 통해 멤버십을 추가할 수 있음" 
ON public.room_members FOR INSERT 
TO anon
WITH CHECK (
  user_id IS NULL AND
  is_anonymous = true AND
  EXISTS (
    SELECT 1 FROM public.rooms
    WHERE rooms.textid = room_members.room_id
    AND rooms.status != 'closed'
  )
);

-- 로그인 사용자 수정 정책
CREATE POLICY "로그인 사용자는 자신의 멤버십을 수정할 수 있음" 
ON public.room_members FOR UPDATE 
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 익명 사용자 수정 정책
CREATE POLICY "익명 사용자는 쿠키로 자신의 멤버십을 수정할 수 있음" 
ON public.room_members FOR UPDATE 
TO anon
USING (anonymous_id::text = current_setting('request.cookie.anonymous_id', true)::text)
WITH CHECK (anonymous_id::text = current_setting('request.cookie.anonymous_id', true)::text);

-- 로그인 사용자 삭제 정책
CREATE POLICY "로그인 사용자는 자신의 멤버십을 삭제할 수 있음" 
ON public.room_members FOR DELETE 
TO authenticated
USING (user_id = auth.uid());

-- 익명 사용자 삭제 정책
CREATE POLICY "익명 사용자는 쿠키로 자신의 멤버십을 삭제할 수 있음" 
ON public.room_members FOR DELETE 
TO anon
USING (anonymous_id::text = current_setting('request.cookie.anonymous_id', true)::text); 