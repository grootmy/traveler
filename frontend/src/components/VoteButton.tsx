'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoteButtonProps {
  placeId: string;
  voteType: 'up' | 'down';
  initialCount?: number;
  userVoted?: boolean;
  disabled?: boolean;
  onVote: (placeId: string, voteType: 'up' | 'down') => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 붐업/붐다운 투표 버튼 컴포넌트
 * 장소나 경로에 대한 투표를 할 수 있는 버튼 컴포넌트입니다.
 */
export default function VoteButton({
  placeId,
  voteType,
  initialCount = 0,
  userVoted = false,
  disabled = false,
  onVote,
  className,
  size = 'md'
}: VoteButtonProps) {
  const [hover, setHover] = useState(false)
  
  const handleVote = () => {
    if (!disabled) {
      onVote(placeId, voteType)
    }
  }
  
  // 사이즈별 아이콘 크기 설정
  const getIconSize = () => {
    switch (size) {
      case 'sm': return 'h-3 w-3';
      case 'lg': return 'h-5 w-5';
      default: return 'h-4 w-4';
    }
  }
  
  // 사이즈별 버튼 패딩 설정
  const getButtonSize = () => {
    switch (size) {
      case 'sm': return 'h-7 px-2 py-1 text-xs';
      case 'lg': return 'px-4 py-2';
      default: return 'px-3 py-1.5';
    }
  }
  
  return (
    <Button
      variant={userVoted ? "default" : "outline"}
      size="sm"
      className={cn(
        getButtonSize(),
        userVoted && voteType === 'up' && 'bg-green-600 hover:bg-green-700',
        userVoted && voteType === 'down' && 'bg-red-600 hover:bg-red-700',
        hover && !userVoted && voteType === 'up' && 'text-green-600',
        hover && !userVoted && voteType === 'down' && 'text-red-600',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onClick={handleVote}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={disabled}
    >
      {voteType === 'up' ? (
        <ThumbsUp className={cn('mr-1', getIconSize())} />
      ) : (
        <ThumbsDown className={cn('mr-1', getIconSize())} />
      )}
      <span>{initialCount}</span>
    </Button>
  )
} 