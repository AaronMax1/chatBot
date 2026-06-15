export type Role = 'user' | 'assistant'

export type Assistant = {
  id: string
  name: string
  emoji: string
  description: string
  prompt: string
  model: string
  temperature: number
  tags: string[]
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

export type ProviderConfig = {
  apiKey: string
  baseUrl: string
  model: string
}

export type AssistantPreset = {
  id: string
  name: string
  prompt: string
  emoji: string | null
  description: string | null
  tags: string[]
  order: number
}

export type Topic = {
  id: string
  assistantId: string
  name: string
  pinned: boolean
  createdAt: string
  updatedAt: string
  lastMessageAt: string | null
  messageCount: number
}

export type Message = {
  id: string
  assistantId: string
  topicId: string
  role: Role
  content: string
  status: 'success' | 'sending' | 'error'
  error?: string
  createdAt: string
  updatedAt: string
}
