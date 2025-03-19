-- message 칼럼을 content로 변경 (이미 content 칼럼이 있을 경우 실행하지 않음)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'chat_messages' 
        AND column_name = 'message'
    ) THEN
        ALTER TABLE public.chat_messages RENAME COLUMN message TO content;
    END IF;
END $$;

-- id 칼럼을 textid로 변경 (이미 textid 칼럼이 있을 경우 실행하지 않음)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'rooms' 
        AND column_name = 'id'
    ) THEN
        ALTER TABLE public.rooms RENAME COLUMN id TO textid;
    END IF;
END $$;

-- invite_code 칼럼을 code로 변경 (이미 code 칼럼이 있을 경우 실행하지 않음)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'rooms' 
        AND column_name = 'invite_code'
    ) THEN
        ALTER TABLE public.rooms RENAME COLUMN invite_code TO code;
    END IF;
END $$;

-- 외래키 제약조건 업데이트
DO $$
DECLARE
    fk_record RECORD;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'rooms' 
        AND column_name = 'textid'
    ) THEN
        -- 외래 키가 있는 모든 테이블을 수정
        FOR fk_record IN
            SELECT 
                tc.table_name, 
                kcu.column_name,
                tc.constraint_name
            FROM 
                information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu 
                    ON ccu.constraint_name = tc.constraint_name
            WHERE 
                tc.constraint_type = 'FOREIGN KEY' AND
                ccu.table_name = 'rooms' AND
                ccu.column_name = 'id'
        LOOP
            EXECUTE 'ALTER TABLE public.' || fk_record.table_name || ' DROP CONSTRAINT ' || fk_record.constraint_name;
            EXECUTE 'ALTER TABLE public.' || fk_record.table_name || ' ADD CONSTRAINT ' || fk_record.constraint_name || 
                    ' FOREIGN KEY (' || fk_record.column_name || ') REFERENCES public.rooms(textid)';
        END LOOP;
    END IF;
END $$; 