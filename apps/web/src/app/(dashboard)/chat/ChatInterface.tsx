'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  MessageSquare,
  Send,
  Plus,
  Trash2,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{ id: string; title: string }>
}

interface Conversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

interface ChatInterfaceProps {
  initialConversations: Conversation[]
  memoCount: number
}

export function ChatInterface({ initialConversations, memoCount }: ChatInterfaceProps) {
  useRouter() // Keep for potential navigation
  const [conversations, setConversations] = useState(initialConversations)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadConversation = async (conversationId: string) => {
    setIsLoadingMessages(true)
    setActiveConversationId(conversationId)

    const supabase = createClient()
    const { data: messageData } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }) as { data: Array<{
        id: string
        role: string
        content: string
        sources: Array<{ id: string; title: string }> | null
      }> | null }

    if (messageData) {
      setMessages(
        messageData.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          sources: m.sources || undefined,
        }))
      )
    }

    setIsLoadingMessages(false)
  }

  const startNewConversation = () => {
    setActiveConversationId(null)
    setMessages([])
    setInput('')
  }

  const deleteConversation = async (conversationId: string) => {
    const supabase = createClient()
    await supabase.from('conversations').delete().eq('id', conversationId)

    setConversations(conversations.filter((c) => c.id !== conversationId))
    if (activeConversationId === conversationId) {
      startNewConversation()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    // Add user message to UI immediately
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
    }
    setMessages((prev) => [...prev, tempUserMessage])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationId: activeConversationId,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()

      // Update conversation ID if new
      if (!activeConversationId && data.conversationId) {
        setActiveConversationId(data.conversationId)
        // Refresh conversations list
        const supabase = createClient()
        const { data: newConversations } = await supabase
          .from('conversations')
          .select('id, title, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(20)
        if (newConversations) {
          setConversations(newConversations)
        }
      }

      // Add assistant message
      const assistantMessage: Message = {
        id: data.messageId || `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        sources: data.sources,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <button
            onClick={startNewConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length > 0 ? (
            <ul className="space-y-1">
              {conversations.map((conv) => (
                <li key={conv.id} className="group">
                  <button
                    onClick={() => loadConversation(conv.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeConversationId === conv.id
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate text-sm">
                      {conv.title || 'New conversation'}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(conv.id)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 text-sm text-center py-4">
              No conversations yet
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-800">
          <p className="text-xs text-slate-500">
            {memoCount} memo{memoCount !== 1 ? 's' : ''} available for context
          </p>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          ) : messages.length > 0 ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${
                    message.role === 'user' ? 'justify-end' : ''
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] ${
                      message.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-3'
                        : 'bg-slate-800 text-slate-200 rounded-2xl rounded-bl-md px-4 py-3'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-700">
                        <p className="text-xs text-slate-400 mb-2">Sources:</p>
                        <div className="flex flex-wrap gap-2">
                          {message.sources.map((source) => (
                            <a
                              key={source.id}
                              href={`/memos/${source.id}`}
                              className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-700 rounded text-xs text-slate-300 hover:bg-slate-600"
                            >
                              <FileText className="w-3 h-3" />
                              {source.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-indigo-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Ask about your meetings
              </h2>
              <p className="text-slate-400 max-w-md mb-6">
                I can help you find information from your meeting memos, summarize
                discussions, and answer questions about your deal pipeline.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                {[
                  'What companies have I met with this month?',
                  'Summarize my recent meetings about AI startups',
                  'What action items are pending?',
                  'Which deals are in due diligence?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-left"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-800">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your meetings..."
                disabled={isLoading}
                className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
