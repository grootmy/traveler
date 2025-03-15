# Socket.io에서 Supabase Realtime으로 마이그레이션

이 문서는 당일치기 여행 추천 서비스의 실시간 기능을 Socket.io에서 Supabase Realtime으로 마이그레이션하는 과정을 설명합니다.

## 마이그레이션 개요

기존 Socket.io를 사용한 실시간 기능을 Supabase Realtime으로 대체하여 다음 기능을 구현했습니다:

1. **성향 테스트 완료 알림**: 참여자가 성향 테스트를 완료했을 때 다른 참여자들에게 실시간으로 알림
2. **대기 화면의 참여자 상태 업데이트**: 참여자들의 준비 상태를 실시간으로 업데이트
3. **투표 시스템**: 경로 추천 화면에서 각 참여자의 투표를 실시간으로 반영
4. **경로 선택 알림**: 방장이 최종 경로를 선택했을 때 모든 참여자에게 알림

## 변경된 파일

### 프론트엔드

1. **새로 생성된 파일**:
   - `frontend/src/lib/supabase/realtime.ts`: Supabase Realtime 기능을 구현한 유틸리티 파일

2. **수정된 파일**:
   - `frontend/src/app/rooms/[roomId]/waiting/page.tsx`: 대기 화면에서 Socket.io 대신 Supabase Realtime 사용
   - `frontend/src/app/rooms/[roomId]/preferences/page.tsx`: 성향 테스트 완료 페이지에서 Socket.io 대신 Supabase Realtime 사용
   - `frontend/src/app/rooms/[roomId]/routes/page.tsx`: 경로 추천 화면에서 Socket.io 대신 Supabase Realtime 사용

### 백엔드

1. **새로 생성된 파일**:
   - `backend/src/supabase.ts`: 백엔드에서 Supabase Realtime 기능을 구현한 유틸리티 파일

2. **수정된 파일**:
   - `backend/src/index.ts`: Socket.io 설정 대신 Supabase 연결 설정
   - `backend/src/routes/recommendations.ts`: 실시간 알림을 위한 API 엔드포인트 추가

## 주요 변경 사항

### 1. Supabase Realtime 채널 구독

```typescript
// 방 채널 구독
const channel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: false },
  },
});

// 채널 구독 시작
channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    console.log(`방 ${roomId}에 연결되었습니다.`);
  }
});
```

### 2. 브로드캐스트 메시지 전송

```typescript
// 브로드캐스트 메시지 전송
await channel.send({
  type: 'broadcast',
  event: 'preferences_completed',
  payload: { userId, nickname },
});
```

### 3. 브로드캐스트 메시지 수신

```typescript
// 브로드캐스트 메시지 수신 설정
subscription.channel.on('broadcast', { event: eventName }, (payload: any) => {
  callback(payload);
});
```

### 4. 데이터베이스 변경 사항 구독

```typescript
// 데이터베이스 변경 사항 구독
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
      fetchMembers();
    }
  )
  .subscribe();
```

## 장점

1. **인프라 통합**: Supabase를 데이터베이스와 인증에 이미 사용하고 있으므로, 실시간 기능도 같은 플랫폼에서 관리할 수 있습니다.
2. **서버 간소화**: 별도의 Socket.io 서버를 유지할 필요가 없어 인프라가 간소화됩니다.
3. **확장성**: Supabase의 인프라를 활용하여 자동으로 확장 가능합니다.
4. **데이터베이스 변경 구독**: 데이터베이스 변경 사항을 직접 구독할 수 있어 상태 동기화가 용이합니다.

## 주의 사항

1. **기존 Socket.io 코드 유지**: 기존 Socket.io 관련 파일은 삭제하지 않고 주석 처리하여 필요시 롤백할 수 있도록 했습니다.
2. **채널 관리**: 여러 채널을 효율적으로 관리하기 위해 구독 상태를 추적하는 로직을 구현했습니다.
3. **연결 해제**: 컴포넌트 언마운트 시 모든 구독을 정리하는 로직을 추가했습니다. 