'use client'

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface ChatMessageProps {
  message: {
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
  isOwn: boolean
  className?: string
}

export function ChatMessage({ message, isOwn, className }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex w-full gap-2 p-2",
        isOwn ? "flex-row-reverse" : "flex-row",
        className
      )}
    >
      <Avatar className="h-8 w-8">
        <AvatarImage src={message.sender.avatar} />
        <AvatarFallback>{message.sender.name[0].toUpperCase()}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex max-w-[75%] flex-col gap-1",
          isOwn ? "items-end" : "items-start"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{message.sender.name}</span>
          <span className="text-xs text-gray-500">
            {message.timestamp.toLocaleTimeString()}
          </span>
        </div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            isOwn
              ? "bg-blue-500 text-white"
              : message.isAI
              ? "bg-green-500 text-white"
              : "bg-gray-100 text-gray-900"
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
} 