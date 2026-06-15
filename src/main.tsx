import React from 'react'
import ReactDOM from 'react-dom/client'
import { Bot, Check, Download, Edit3, Eye, EyeOff, KeyRound, Loader2, Menu, MessageSquarePlus, Pin, Plus, Search, Send, Settings, Sparkles, Trash2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createAssistantFromPreset, exportState, loadAssistantPresets, loadProviderConfig, loadState, makeId, saveProviderConfig, saveState } from './storage'
import type { Assistant, AssistantPreset, Message, ProviderConfig, Topic } from './types'
import './styles.css'

const MESSAGE_LIMIT = 24

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

type UpstreamChatChunk = {
  choices?: Array<{
    delta?: {
      content?: string | Array<string | { text?: string }>
    }
  }>
  error?: {
    message?: string
  }
}

function now() {
  return new Date().toISOString()
}

function compactDate(value: string | null) {
  if (!value) return '暂无消息'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function topicTitleFrom(text: string) {
  const firstLine = text.trim().split('\n').find(Boolean) || '新的聊天'
  return firstLine.length > 24 ? `${firstLine.slice(0, 24)}...` : firstLine
}

function parseSse(buffer: string): { events: StreamEvent[]; rest: string } {
  const chunks = buffer.split('\n\n')
  const rest = chunks.pop() || ''
  const events: StreamEvent[] = []
  for (const chunk of chunks) {
    const data = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')
    if (!data) continue
    try {
      events.push(JSON.parse(data) as StreamEvent)
    } catch {
      // Ignore malformed stream fragments.
    }
  }
  return { events, rest }
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, '')
}

function extractUpstreamDelta(payload: UpstreamChatChunk): string {
  const content = payload.choices?.[0]?.delta?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === 'string' ? part : part.text || '').join('')
  }
  return ''
}

function parseOpenAiSse(buffer: string): { events: StreamEvent[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() || ''
  const events: StreamEvent[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const data = trimmed.slice(5).trim()
    if (!data) continue
    if (data === '[DONE]') {
      events.push({ type: 'done' })
      continue
    }
    try {
      const payload = JSON.parse(data) as UpstreamChatChunk
      if (payload.error?.message) {
        events.push({ type: 'error', message: payload.error.message })
        continue
      }
      const text = extractUpstreamDelta(payload)
      if (text) events.push({ type: 'delta', text })
    } catch {
      // Ignore malformed upstream fragments.
    }
  }

  return { events, rest }
}

function AssistantDialog({
  assistant,
  onSave,
  onClose,
}: {
  assistant: Assistant | null
  onSave: (assistant: Assistant) => void
  onClose: () => void
}) {
  const timestamp = now()
  const [draft, setDraft] = React.useState<Assistant>(() => assistant || {
    id: makeId('assistant'),
    name: '',
    emoji: 'AI',
    description: '',
    prompt: '你是一个简洁、可靠的中文助手。',
    model: 'gpt-5.5',
    temperature: 0.7,
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const [tags, setTags] = React.useState(draft.tags.join(', '))

  const canSave = draft.name.trim() && draft.prompt.trim()

  return (
    <div className="modalLayer" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">{assistant ? '编辑助手' : '新建助手'}</p>
            <h2>{assistant ? assistant.name : '自定义聊天助手'}</h2>
          </div>
          <button className="iconButton" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="formGrid">
          <label>
            名称
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：代码审查助手" />
          </label>
          <label>
            标识
            <input value={draft.emoji} onChange={(event) => setDraft({ ...draft, emoji: event.target.value })} placeholder="AI" />
          </label>
          <label className="span2">
            描述
            <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="这位助手擅长什么" />
          </label>
          <label>
            模型
            <input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder="gpt-5.5" />
          </label>
          <label>
            温度
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={draft.temperature}
              onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })}
            />
          </label>
          <label className="span2">
            标签
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="聊天, 写作, 产品" />
          </label>
          <label className="span2">
            系统提示词
            <textarea value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} rows={7} />
          </label>
        </div>
        <div className="modalActions">
          <button className="textButton" onClick={onClose}>取消</button>
          <button
            className="primaryButton"
            disabled={!canSave}
            onClick={() => onSave({
              ...draft,
              name: draft.name.trim(),
              tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
              updatedAt: now(),
            })}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function ProviderDialog({
  config,
  onSave,
  onClose,
}: {
  config: ProviderConfig
  onSave: (config: ProviderConfig) => void
  onClose: () => void
}) {
  const [draft, setDraft] = React.useState(config)
  const [showApiKey, setShowApiKey] = React.useState(false)
  const canSave = draft.apiKey.trim() && draft.baseUrl.trim() && draft.model.trim()

  return (
    <div className="modalLayer" role="dialog" aria-modal="true">
      <div className="modal compactModal">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Model Provider</p>
            <h2>接口设置</h2>
          </div>
          <button className="iconButton" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="formGrid single">
          <label>
            API Key
            <span className="secretInput">
              <input
                value={draft.apiKey}
                type={showApiKey ? 'text' : 'password'}
                autoComplete="off"
                onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                placeholder="sk-..."
              />
              <button
                type="button"
                className="secretToggle"
                onClick={() => setShowApiKey((value) => !value)}
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <label>
            Base URL
            <input
              value={draft.baseUrl}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              placeholder="/v1"
            />
          </label>
          <label>
            默认模型
            <input
              value={draft.model}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
              placeholder="gpt-5.5"
            />
          </label>
          <p className="localHint">配置保存在当前浏览器 localStorage。部署到 Render 时建议使用默认 /v1，由同源代理转发到模型接口。</p>
        </div>
        <div className="modalActions">
          <button className="textButton" onClick={onClose}>取消</button>
          <button
            className="primaryButton"
            disabled={!canSave}
            onClick={() => onSave({
              apiKey: draft.apiKey.trim(),
              baseUrl: draft.baseUrl.trim().replace(/\/$/, ''),
              model: draft.model.trim(),
            })}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function PresetDialog({
  presets,
  existingNames,
  defaultModel,
  onCreateFromPreset,
  onImportAll,
  onManualCreate,
  onClose,
}: {
  presets: AssistantPreset[]
  existingNames: Set<string>
  defaultModel: string
  onCreateFromPreset: (assistant: Assistant) => void
  onImportAll: () => void
  onManualCreate: () => void
  onClose: () => void
}) {
  const [query, setQuery] = React.useState('')
  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const source = normalized
      ? presets.filter((preset) => [
        preset.name,
        preset.description || '',
        preset.prompt,
        ...preset.tags,
      ].join(' ').toLowerCase().includes(normalized))
      : presets
    return source
  }, [presets, query])

  return (
    <div className="modalLayer" role="dialog" aria-modal="true">
      <div className="modal presetModal">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Cherry Studio Presets</p>
            <h2>添加预设角色</h2>
          </div>
          <button className="iconButton" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="presetToolbar">
          <div className="searchBox inModal">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索 ${presets.length} 个角色`} autoFocus />
          </div>
          <div className="presetToolbarActions">
            <button className="subtleButton" onClick={onImportAll}>
              <Download size={16} /> 导入全部
            </button>
            <button className="subtleButton" onClick={onManualCreate}>
              <Plus size={16} /> 手动创建
            </button>
          </div>
          <div className="presetCount">
            显示 {filtered.length} / 共 {presets.length} 个角色
          </div>
        </div>
        <div className="presetList">
          {filtered.map((preset) => {
            const exists = existingNames.has(preset.name)
            return (
              <button
                key={preset.id}
                type="button"
                className="presetItem"
                onClick={() => onCreateFromPreset(createAssistantFromPreset(preset, defaultModel))}
              >
                <span className="avatar">{preset.emoji || preset.name.slice(0, 2)}</span>
                <span className="presetText">
                  <span>
                    <strong>{preset.name}</strong>
                    {exists ? <em>已添加</em> : null}
                  </span>
                  <small>{preset.description || preset.prompt}</small>
                  {preset.tags.length > 0 ? (
                    <span className="tagRow">
                      {preset.tags.slice(0, 4).map((tag) => <i key={tag}>{tag}</i>)}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
          {filtered.length === 0 ? <div className="emptyPreset">没有匹配的角色</div> : null}
          {filtered.length > 0 ? (
            <div className="presetCount bottom">
              已到底部，显示 {filtered.length} / 共 {presets.length} 个角色
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function MessageView({ message }: { message: Message }) {
  const isAssistant = message.role === 'assistant'
  return (
    <div className={`messageRow ${isAssistant ? 'assistant' : 'user'}`}>
      <div className="messageBubble">
        {message.status === 'sending' && !message.content ? (
          <span className="thinking"><Loader2 size={14} /> 思考中</span>
        ) : message.status === 'error' ? (
          <span className="errorText">{message.error || message.content}</span>
        ) : isAssistant ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || ' '}</ReactMarkdown>
        ) : (
          <span>{message.content}</span>
        )}
      </div>
    </div>
  )
}

function App() {
  const initial = React.useMemo(loadState, [])
  const initialProviderConfig = React.useMemo(loadProviderConfig, [])
  const assistantPresets = React.useMemo(loadAssistantPresets, [])
  const [assistants, setAssistants] = React.useState(initial.assistants)
  const [topics, setTopics] = React.useState(initial.topics)
  const [messages, setMessages] = React.useState(initial.messages)
  const [providerConfig, setProviderConfig] = React.useState(initialProviderConfig)
  const [activeAssistantId, setActiveAssistantId] = React.useState(initial.assistants[0]?.id || null)
  const [activeTopicId, setActiveTopicId] = React.useState(initial.topics[0]?.id || null)
  const [assistantSearch, setAssistantSearch] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [dialogAssistant, setDialogAssistant] = React.useState<Assistant | null | undefined>(undefined)
  const [providerDialogOpen, setProviderDialogOpen] = React.useState(false)
  const [presetDialogOpen, setPresetDialogOpen] = React.useState(false)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [status, setStatus] = React.useState('就绪')
  const endRef = React.useRef<HTMLDivElement | null>(null)

  const activeAssistant = assistants.find((assistant) => assistant.id === activeAssistantId) || assistants[0] || null
  const assistantTopics = React.useMemo(() => {
    if (!activeAssistant) return []
    return topics
      .filter((topic) => topic.assistantId === activeAssistant.id)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastMessageAt || b.createdAt).localeCompare(a.lastMessageAt || a.createdAt))
  }, [activeAssistant, topics])
  const activeTopic = assistantTopics.find((topic) => topic.id === activeTopicId) || assistantTopics[0] || null
  const visibleMessages = React.useMemo(() => {
    if (!activeTopic) return []
    return messages
      .filter((message) => message.topicId === activeTopic.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [messages, activeTopic])

  React.useEffect(() => {
    saveState({ assistants, topics, messages })
  }, [assistants, topics, messages])

  React.useEffect(() => {
    saveProviderConfig(providerConfig)
  }, [providerConfig])

  React.useEffect(() => {
    if (activeAssistant && !activeAssistantId) setActiveAssistantId(activeAssistant.id)
    if (assistantTopics.length > 0 && !assistantTopics.some((topic) => topic.id === activeTopicId)) {
      setActiveTopicId(assistantTopics[0].id)
    }
  }, [activeAssistant, activeAssistantId, activeTopicId, assistantTopics])

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [visibleMessages.length, visibleMessages[visibleMessages.length - 1]?.content])

  const filteredAssistants = assistants.filter((assistant) => {
    const query = assistantSearch.trim().toLowerCase()
    if (!query) return true
    return [assistant.name, assistant.description, assistant.prompt, ...assistant.tags].join(' ').toLowerCase().includes(query)
  })

  function createTopic(assistantId = activeAssistant?.id) {
    if (!assistantId) return null
    const timestamp = now()
    const topic: Topic = {
      id: makeId('topic'),
      assistantId,
      name: '新的聊天',
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMessageAt: null,
      messageCount: 0,
    }
    setTopics((current) => [topic, ...current])
    setActiveTopicId(topic.id)
    return topic
  }

  function saveAssistant(assistant: Assistant) {
    setAssistants((current) => {
      const exists = current.some((item) => item.id === assistant.id)
      return exists ? current.map((item) => item.id === assistant.id ? assistant : item) : [assistant, ...current]
    })
    setActiveAssistantId(assistant.id)
    setDialogAssistant(undefined)
  }

  function addPresetAssistant(assistant: Assistant) {
    setAssistants((current) => [assistant, ...current])
    setActiveAssistantId(assistant.id)
    setActiveTopicId(null)
    setPresetDialogOpen(false)
    setStatus(`已添加 ${assistant.name}`)
  }

  function importAllPresetAssistants() {
    const existingNames = new Set(assistants.map((assistant) => assistant.name))
    const additions = assistantPresets
      .filter((preset) => !existingNames.has(preset.name))
      .map((preset) => createAssistantFromPreset(preset, providerConfig.model || 'gpt-5.5'))
    if (additions.length === 0) {
      setStatus('预设角色已全部导入')
      setPresetDialogOpen(false)
      return
    }
    setAssistants((current) => [...additions, ...current])
    setActiveAssistantId(additions[0].id)
    setActiveTopicId(null)
    setPresetDialogOpen(false)
    setStatus(`已导入 ${additions.length} 个角色`)
  }

  function deleteAssistant(assistant: Assistant) {
    if (!confirm(`删除助手 "${assistant.name}" 及其话题？`)) return
    setAssistants((current) => current.filter((item) => item.id !== assistant.id))
    const removedTopicIds = topics.filter((topic) => topic.assistantId === assistant.id).map((topic) => topic.id)
    setTopics((current) => current.filter((topic) => topic.assistantId !== assistant.id))
    setMessages((current) => current.filter((message) => !removedTopicIds.includes(message.topicId)))
    if (activeAssistantId === assistant.id) {
      const next = assistants.find((item) => item.id !== assistant.id)
      setActiveAssistantId(next?.id || null)
      setActiveTopicId(null)
    }
  }

  function deleteTopic(topic: Topic) {
    if (!confirm(`删除话题 "${topic.name}"？`)) return
    setTopics((current) => current.filter((item) => item.id !== topic.id))
    setMessages((current) => current.filter((message) => message.topicId !== topic.id))
    if (activeTopicId === topic.id) setActiveTopicId(null)
  }

  async function send() {
    const content = draft.trim()
    if (!content || !activeAssistant || sending) return
    if (!providerConfig.apiKey.trim() || !providerConfig.baseUrl.trim() || !providerConfig.model.trim()) {
      setStatus('请先配置接口')
      setProviderDialogOpen(true)
      return
    }
    const topic = activeTopic || createTopic(activeAssistant.id)
    if (!topic) return

    const timestamp = now()
    const userMessage: Message = {
      id: makeId('message'),
      assistantId: activeAssistant.id,
      topicId: topic.id,
      role: 'user',
      content,
      status: 'success',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const assistantMessage: Message = {
      id: makeId('message'),
      assistantId: activeAssistant.id,
      topicId: topic.id,
      role: 'assistant',
      content: '',
      status: 'sending',
      createdAt: now(),
      updatedAt: now(),
    }

    setDraft('')
    setSending(true)
    setStatus('连接模型中')
    setMessages((current) => [...current, userMessage, assistantMessage])
    setTopics((current) => current.map((item) => item.id === topic.id ? {
      ...item,
      name: item.messageCount === 0 ? topicTitleFrom(content) : item.name,
      lastMessageAt: timestamp,
      messageCount: item.messageCount + 1,
      updatedAt: timestamp,
    } : item))

    try {
      const history = [...visibleMessages, userMessage].slice(-MESSAGE_LIMIT).map((message) => ({
        role: message.role,
        content: message.content,
      }))
      const response = await fetch(`${normalizeBaseUrl(providerConfig.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${providerConfig.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: activeAssistant.model || providerConfig.model,
          stream: true,
          temperature: activeAssistant.temperature,
          messages: [
            {
              role: 'system',
              content: activeAssistant.prompt || 'You are a helpful assistant.',
            },
            ...history,
          ],
        }),
      })
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error?.message || body?.error || `请求失败：${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      setStatus('正在生成')

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parsed = parseOpenAiSse(buffer)
        buffer = parsed.rest
        for (const event of parsed.events) {
          if (event.type === 'delta') {
            setMessages((current) => current.map((message) => message.id === assistantMessage.id ? {
              ...message,
              content: `${message.content}${event.text}`,
              updatedAt: now(),
            } : message))
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
        }
      }

      setMessages((current) => current.map((message) => message.id === assistantMessage.id ? {
        ...message,
        status: 'success',
        updatedAt: now(),
      } : message))
      setTopics((current) => current.map((item) => item.id === topic.id ? {
        ...item,
        messageCount: item.messageCount + 1,
        lastMessageAt: now(),
        updatedAt: now(),
      } : item))
      setStatus('就绪')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMessages((current) => current.map((item) => item.id === assistantMessage.id ? {
        ...item,
        status: 'error',
        error: message,
        content: message,
        updatedAt: now(),
      } : item))
      setStatus('请求失败')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="appShell">
      <header className="mobileTopbar">
        <button className="iconButton" onClick={() => setSidebarOpen(true)} aria-label="打开菜单"><Menu size={18} /></button>
        <strong>{activeAssistant?.name || 'Assistants'}</strong>
        <button className="iconButton" onClick={() => setPresetDialogOpen(true)} aria-label="添加角色"><Sparkles size={18} /></button>
      </header>

      <aside className={`assistantPane ${sidebarOpen ? 'open' : ''}`}>
        <div className="paneHeader">
          <div>
            <p className="eyebrow">Assistants</p>
            <h1>聊天助手</h1>
          </div>
          <button className="iconButton mobileOnly" onClick={() => setSidebarOpen(false)} aria-label="关闭"><X size={18} /></button>
          <button className="iconButton desktopOnly" onClick={() => setPresetDialogOpen(true)} aria-label="添加角色"><Plus size={18} /></button>
        </div>
        <div className="searchBox">
          <Search size={16} />
          <input value={assistantSearch} onChange={(event) => setAssistantSearch(event.target.value)} placeholder="搜索助手" />
        </div>
        <div className="assistantList">
          {filteredAssistants.map((assistant) => (
            <button
              key={assistant.id}
              className={`assistantItem ${assistant.id === activeAssistant?.id ? 'active' : ''}`}
              onClick={() => {
                setActiveAssistantId(assistant.id)
                setActiveTopicId(null)
                setSidebarOpen(false)
              }}
            >
              <span className="avatar">{assistant.emoji || assistant.name.slice(0, 2)}</span>
              <span className="assistantText">
                <strong>{assistant.name}</strong>
                <small>{assistant.description || assistant.prompt}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="paneFooter">
          <button className="subtleButton" onClick={() => exportState({ assistants, topics, messages })}>
            <Download size={16} /> 导出
          </button>
          <button className="subtleButton" onClick={() => setProviderDialogOpen(true)}>
            <KeyRound size={16} /> 接口
          </button>
          <span>{status}</span>
        </div>
      </aside>

      <aside className="topicPane">
        <div className="paneHeader compact">
          <h2>话题</h2>
          <button className="iconButton" onClick={() => createTopic()} aria-label="新建话题"><MessageSquarePlus size={18} /></button>
        </div>
        <div className="topicList">
          {assistantTopics.length === 0 ? (
            <button className="emptyAction" onClick={() => createTopic()}>
              <MessageSquarePlus size={18} />
              新建话题
            </button>
          ) : assistantTopics.map((topic) => (
            <div key={topic.id} className={`topicItem ${topic.id === activeTopic?.id ? 'active' : ''}`}>
              <button onClick={() => setActiveTopicId(topic.id)}>
                <strong>{topic.name}</strong>
                <small>{topic.messageCount} 条消息 · {compactDate(topic.lastMessageAt)}</small>
              </button>
              <div className="topicActions">
                <button className="miniButton" onClick={() => setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, pinned: !item.pinned } : item))} aria-label="置顶">
                  {topic.pinned ? <Check size={14} /> : <Pin size={14} />}
                </button>
                <button className="miniButton" onClick={() => {
                  const name = prompt('话题名称', topic.name)
                  if (name?.trim()) setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, name: name.trim(), updatedAt: now() } : item))
                }} aria-label="重命名">
                  <Edit3 size={14} />
                </button>
                <button className="miniButton danger" onClick={() => deleteTopic(topic)} aria-label="删除">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="chatPane">
        <div className="chatHeader">
          <div className="titleBlock">
            <span className="avatar large">{activeAssistant?.emoji || <Bot size={18} />}</span>
            <div>
              <h2>{activeTopic?.name || '新的聊天'}</h2>
              <p>{activeAssistant?.name || '未选择助手'} · {activeAssistant?.model || providerConfig.model || '未配置模型'}</p>
            </div>
          </div>
          <div className="headerActions">
            <button className="iconButton" onClick={() => setProviderDialogOpen(true)} aria-label="接口设置">
              <KeyRound size={18} />
            </button>
            <button className="iconButton" onClick={() => activeAssistant && setDialogAssistant(activeAssistant)} aria-label="设置助手">
              <Settings size={18} />
            </button>
          </div>
        </div>

        <div className="messages">
          {visibleMessages.length === 0 ? (
            <div className="emptyState">
              <Bot size={28} />
              <h3>开始聊天</h3>
              <p>选择助手后直接输入问题。助手、话题和消息会保存在当前浏览器。</p>
            </div>
          ) : visibleMessages.map((message) => (
            <MessageView key={message.id} message={message} />
          ))}
          <div ref={endRef} />
        </div>

        <div className="composerWrap">
          <div className="composer">
            <textarea
              value={draft}
              rows={3}
              disabled={!activeAssistant || sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void send()
                }
              }}
              placeholder={activeAssistant ? '输入消息，Enter 发送，Shift+Enter 换行' : '请先新建一个助手'}
            />
            <button className="sendButton" disabled={!draft.trim() || sending || !activeAssistant} onClick={() => void send()} aria-label="发送">
              {sending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </main>

      {dialogAssistant !== undefined ? (
        <AssistantDialog assistant={dialogAssistant} onSave={saveAssistant} onClose={() => setDialogAssistant(undefined)} />
      ) : null}
      {providerDialogOpen ? (
        <ProviderDialog
          config={providerConfig}
          onSave={(config) => {
            setProviderConfig(config)
            setProviderDialogOpen(false)
            setStatus('接口已保存')
          }}
          onClose={() => setProviderDialogOpen(false)}
        />
      ) : null}
      {presetDialogOpen ? (
        <PresetDialog
          presets={assistantPresets}
          existingNames={new Set(assistants.map((assistant) => assistant.name))}
          defaultModel={providerConfig.model || 'gpt-5.5'}
          onCreateFromPreset={addPresetAssistant}
          onImportAll={importAllPresetAssistants}
          onManualCreate={() => {
            setPresetDialogOpen(false)
            setDialogAssistant(null)
          }}
          onClose={() => setPresetDialogOpen(false)}
        />
      ) : null}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
