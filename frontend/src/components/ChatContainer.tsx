'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChatMessage } from "@/components/ChatMessage"
import { Send } from 'lucide-react'
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

interface ChatContainerProps {
  messages: Message[]
  currentUser: {
    id: string
    name: string
    avatar?: string
  }
  onSendMessage: (content: string) => void
  className?: string
  isAIChat?: boolean
}

export function ChatContainer({
  messages,
  currentUser,
  onSendMessage,
  className,
  isAIChat = false
}: ChatContainerProps) {
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()) {
      onSendMessage(input.trim())
      setInput("")
    }
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            isOwn={message.sender.id === currentUser.id}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isAIChat ? "AI에게 메시지 보내기..." : "메시지 보내기..."}
            className="flex-1"
          />
          <Button type="submit" size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )
} 