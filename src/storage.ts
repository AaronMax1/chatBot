import rawAssistantPresets from './data/cherry-studio-agents-zh.json'
import type { Assistant, AssistantPreset, Message, ProviderConfig, Topic } from './types'

const KEY = 'assistant-chat-web.v1'
const PROVIDER_KEY = 'assistant-chat-web.provider.v1'
const DEFAULT_BASE_URL = '/v1'
const DEFAULT_MODEL = 'gpt-5.5'

type StoredState = {
  assistants: Assistant[]
  topics: Topic[]
  messages: Message[]
}

type RawAssistantPreset = {
  id?: string | number
  name?: string
  prompt?: string
  emoji?: string
  description?: string
  group?: string[] | string
}

function now() {
  return new Date().toISOString()
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

export function loadAssistantPresets(): AssistantPreset[] {
  return (rawAssistantPresets as RawAssistantPreset[])
    .map((item, index): AssistantPreset | null => {
      if (!item.name || !item.prompt) return null
      const rawId = item.id === undefined || item.id === null ? String(index + 1) : String(item.id)
      return {
        id: `cherry-zh-${rawId}`,
        name: item.name,
        prompt: item.prompt,
        emoji: typeof item.emoji === 'string' && item.emoji.trim() ? item.emoji.trim() : null,
        description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null,
        tags: normalizeTags(item.group),
        order: index + 1,
      }
    })
    .filter((item): item is AssistantPreset => !!item)
}

export function createAssistantFromPreset(preset: AssistantPreset, model = 'gpt-5.5'): Assistant {
  const timestamp = now()
  return {
    id: makeId('assistant'),
    name: preset.name,
    emoji: preset.emoji || preset.name.slice(0, 2),
    description: preset.description || '',
    prompt: preset.prompt,
    model,
    temperature: 0.7,
    tags: preset.tags,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createDefaultState(): StoredState {
  const timestamp = now()
  const assistantId = makeId('assistant')
  const topicId = makeId('topic')
  return {
    assistants: [
      {
        id: assistantId,
        name: '通用助手',
        emoji: 'AI',
        description: '适合日常问答、写作和方案讨论。',
        prompt: '你是一个简洁、可靠的中文助手。回答要直接、有条理，必要时主动说明假设。',
        model: 'gpt-5.5',
        temperature: 0.7,
        tags: ['聊天', '写作'],
        isDefault: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: makeId('assistant'),
        name: '产品顾问',
        emoji: 'PM',
        description: '帮助梳理需求、拆分功能和优化表达。',
        prompt: '你是资深产品顾问。你会先澄清目标，再给出可执行建议。保持中文回答，避免空泛表述。',
        model: 'gpt-5.5',
        temperature: 0.5,
        tags: ['产品', '需求'],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    topics: [
      {
        id: topicId,
        assistantId,
        name: '新的聊天',
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessageAt: null,
        messageCount: 0,
      },
    ],
    messages: [],
  }
}

export function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return createDefaultState()
    const parsed = JSON.parse(raw) as StoredState
    if (!Array.isArray(parsed.assistants) || !Array.isArray(parsed.topics) || !Array.isArray(parsed.messages)) {
      return createDefaultState()
    }
    return parsed
  } catch {
    return createDefaultState()
  }
}

export function saveState(state: StoredState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function loadProviderConfig(): ProviderConfig {
  try {
    const raw = localStorage.getItem(PROVIDER_KEY)
    if (!raw) {
      return {
        apiKey: '',
        baseUrl: DEFAULT_BASE_URL,
        model: DEFAULT_MODEL,
      }
    }
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim() ? parsed.baseUrl : DEFAULT_BASE_URL,
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model : DEFAULT_MODEL,
    }
  } catch {
    return {
      apiKey: '',
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
    }
  }
}

export function saveProviderConfig(config: ProviderConfig) {
  localStorage.setItem(PROVIDER_KEY, JSON.stringify(config))
}

export function exportState(state: StoredState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `assistants-chat-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
