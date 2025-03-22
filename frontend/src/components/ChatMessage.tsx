'use client'
// chatmessage의 CSS나 UI를 수정해야 할 경우 여기서 수정

import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from "@/lib/utils"

interface Message {
  id: string
  content: string
  sender: {
    id: string
    name: string
    avatar?: string
  }
  timestamp: Date
  isAI?: boolean
}

interface ChatMessageProps {
  message: Message
  isOwn: boolean
  className?: string
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isOwn, className }) => {
  // 현재 시간부터 메시지 시간까지의 거리 계산 (예: "3분 전")
  const timeAgo = formatDistanceToNow(new Date(message.timestamp), { 
    addSuffix: true,
    locale: ko 
  })
  
  if (isOwn) {
    // 자신의 메시지
    return (
      <div className="flex flex-col items-end mb-4">
        <div className="flex items-end">
          <div className="mr-2 text-xs text-gray-500">{timeAgo}</div>
          <div className={cn(
            "bg-blue-500 text-white py-2 px-4 rounded-lg max-w-xs break-words",
            className
          )}>
            {message.content}
          </div>
        </div>
      </div>
    )
  } else if (message.isAI) {
    // AI 메시지
    return (
      <div className="flex flex-col items-start mb-4">
        <div className="flex items-start mb-1">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center mr-2">
            AI
          </div>
          <div>
            <div className="font-medium text-xs text-gray-600">AI 어시스턴트</div>
          </div>
        </div>
        <div className="flex items-end ml-10">
          <div className={cn(
            "bg-gray-200 py-2 px-4 rounded-lg max-w-xs break-words",
            className
          )}>
            {message.content}
          </div>
          <div className="ml-2 text-xs text-gray-500">{timeAgo}</div>
        </div>
      </div>
    )
  } else {
    // 다른 사용자 메시지
    return (
      <div className="flex flex-col items-start mb-4">
        <div className="flex items-start mb-1">
          <div className={cn(
            "w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-2",
            message.sender.avatar ? "" : "text-sm"
          )}>
            {message.sender.avatar ? (
              <img src={message.sender.avatar} alt={message.sender.name} className="w-8 h-8 rounded-full" />
            ) : (
              message.sender.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <div className="font-medium text-xs text-gray-600">{message.sender.name}</div>
          </div>
        </div>
        <div className="flex items-end ml-10">
          <div className={cn(
            "bg-gray-200 py-2 px-4 rounded-lg max-w-xs break-words",
            className
          )}>
            {message.content}
          </div>
          <div className="ml-2 text-xs text-gray-500">{timeAgo}</div>
        </div>
      </div>
    )
  }
}

export default ChatMessage 