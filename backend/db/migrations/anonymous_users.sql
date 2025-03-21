-- 익명 사용자 지원을 위한 테이블 수정

-- 1. room_members 테이블에 anonymous_id 컬럼 추가
ALTER TABLE public.room_members
ADD COLUMN IF NOT EXISTS anonymous_id UUID;

-- 2. room_members 테이블의 user_id NULL 허용으로 변경 (익명 사용자용)
ALTER TABLE public.room_members
ALTER COLUMN user_id DROP NOT NULL;

-- 3. room_members 테이블의 UNIQUE 제약 조건 수정
ALTER TABLE public.room_members
DROP CONSTRAINT IF EXISTS room_members_room_id_user_id_key;

-- 4. 새로운 제약 조건 추가 (user_id나 anonymous_id 중 하나는 반드시 있어야 함)
ALTER TABLE public.room_members
ADD CONSTRAINT user_or_anonymous_not_null 
CHECK ((user_id IS NOT NULL) OR (anonymous_id IS NOT NULL));

-- 5. 방에 동일한 user_id가 중복 참여할 수 없음
ALTER TABLE public.room_members
ADD CONSTRAINT unique_user_per_room 
UNIQUE (room_id, user_id) 
WHERE (user_id IS NOT NULL);

-- 6. 방에 동일한 anonymous_id가 중복 참여할 수 없음
ALTER TABLE public.room_members
ADD CONSTRAINT unique_anonymous_per_room 
UNIQUE (room_id, anonymous_id) 
WHERE (anonymous_id IS NOT NULL);

-- 7. nickname 필드 NOT NULL로 설정 (익명 사용자는 닉네임 반드시 필요)
ALTER TABLE public.room_members
ALTER COLUMN nickname SET NOT NULL; 