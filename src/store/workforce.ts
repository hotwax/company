import { defineStore } from 'pinia'
import { api, logger } from '@common'
import { hasError } from '@/utils'
import type { ChatItem } from '@/components/chat/ChatContainer.vue'

export type WorkforceConversation = {
  conversationId: string;
  agentId: string;
  agentName: string;
  title: string;
  userId: string;
  lastActivityDate?: number;
  derivedStatus: 'pending' | 'running' | 'error' | 'idle';
  pendingToolName?: string;
}

function toChatItems(detail: any): ChatItem[] {
  const items: ChatItem[] = []
  // detail is the AiConversation 'detail' master: conversation fields at top level, plus nested
  // agent, messages, and runs (each with its tool-call requests).
  const userName = detail?.userId || 'User'
  // The master does not guarantee message order; sort by the (zero-padded) sequence id.
  const messages = [...(detail?.messages || [])].sort(
    (a: any, b: any) => String(a.messageSeqId).localeCompare(String(b.messageSeqId)))
  for (const msg of messages) {
    if (msg.role === 'user') {
      items.push({ id: `msg-${msg.messageSeqId}`, type: 'message', userName, content: msg.content })
    } else if (msg.role === 'assistant') {
      // toolCalls is stored as a JSON string; the backend no longer pre-parses it, so parse here.
      let toolCalls: any[] = []
      if (msg.toolCalls) { try { toolCalls = JSON.parse(msg.toolCalls) } catch { toolCalls = [] } }
      if (toolCalls.length) {
        // Key by position, not toolCall.id: the id is provider-supplied and not guaranteed present, so two
        // calls on one message could otherwise collapse to duplicate Vue keys (`tc-5-undefined`).
        toolCalls.forEach((toolCall: any, index: number) => {
          items.push({ id: `tc-${msg.messageSeqId}-${index}`, type: 'toolCall', toolName: toolCall.name,
            args: JSON.stringify(toolCall.arguments ?? {}, null, 2) })
        })
      }
      if (msg.content) {
        items.push({ id: `agent-${msg.messageSeqId}`, type: 'agentMessage', content: msg.content })
      }
    }
    // role 'tool' results are not rendered as bubbles; the tool-call card carries the action
  }
  // Pending-approval cards + any error bubble come from the latest run (master nests runs -> requests).
  const runs: any[] = detail?.runs || []
  const latestRun = runs.length
    ? runs.reduce((a: any, b: any) => ((b.startedDate || 0) > (a.startedDate || 0) ? b : a))
    : null
  const pendingRequests = (latestRun?.toolCallRequests || []).filter((r: any) => r.statusId === 'AI_TCREQ_PENDING')
  for (const req of pendingRequests) {
    let args = req.arguments
    try { args = JSON.stringify(JSON.parse(req.arguments), null, 2) } catch { /* keep raw string */ }
    items.push({ id: `perm-${req.toolCallRequestId}`, type: 'permission', permissionId: req.toolCallRequestId,
      toolName: req.toolName, message: `${req.toolName}\n${args}` })
  }
  if (latestRun?.errorText && ['AI_RUN_FAILED', 'AI_RUN_ABORTED', 'AI_RUN_TRUNCATED'].includes(latestRun?.statusId)) {
    items.push({ id: `err-${latestRun.agentRunId}`, type: 'agentMessage', content: latestRun.errorText })
  }
  return items
}

export const useWorkforceStore = defineStore('workforce', {
  state: () => ({
    conversations: [] as WorkforceConversation[],
    selectedConversationId: '',
    detail: null as any,
    chatItems: [] as ChatItem[],
    activeAgents: [] as any[],
    sending: false,
    deciding: false
  }),

  actions: {
    async fetchConversations() {
      try {
        const resp = await api({ url: 'ai/conversations', method: 'get', params: { pageSize: 100 } }) as any
        if (hasError(resp)) throw resp.data
        this.conversations = resp.data.conversationList || []
      } catch (error) {
        logger.error(error)
      }
    },

    async fetchConversationDetail(conversationId?: string) {
      const id = conversationId || this.selectedConversationId
      if (!id || this.sending || this.deciding) return
      try {
        const resp = await api({ url: `ai/conversations/${encodeURIComponent(id)}`, method: 'get' }) as any
        // The user may have switched conversations while this was in flight; drop the stale response so a
        // slow fetch for the previous thread can't clobber the now-selected one.
        if (id !== this.selectedConversationId) return
        if (hasError(resp)) throw resp.data
        this.detail = resp.data
        this.chatItems = toChatItems(resp.data)
      } catch (error) {
        logger.error(error)
      }
    },

    async selectConversation(conversationId: string) {
      this.selectedConversationId = conversationId
      this.detail = null
      this.chatItems = []
      await this.fetchConversationDetail(conversationId)
    },

    async sendMessage(content: string) {
      if (!this.selectedConversationId) return
      this.sending = true
      const userName = 'You'
      this.chatItems.push({ id: `optimistic-${Date.now()}`, type: 'message', userName, content })
      try {
        const resp = await api({ url: `ai/conversations/${encodeURIComponent(this.selectedConversationId)}/messages`,
          method: 'post', data: { userMessage: content } }) as any
        if (hasError(resp)) throw resp.data
        return resp.data
      } finally {
        this.sending = false
        await this.fetchConversationDetail()
        await this.fetchConversations()
      }
    },

    async decideToolCall(toolCallRequestId: string, approved: boolean) {
      this.deciding = true
      try {
        const action = approved ? 'approve' : 'reject'
        const resp = await api({ url: `ai/toolCallRequests/${encodeURIComponent(toolCallRequestId)}/${action}`,
          method: 'post', data: {} }) as any
        if (hasError(resp)) throw resp.data
        return resp.data
      } finally {
        this.deciding = false
        await this.fetchConversationDetail()
        await this.fetchConversations()
      }
    },

    async fetchActiveAgents() {
      try {
        const resp = await api({ url: 'ai/agents', method: 'get', params: { statusId: 'AI_AGENT_ACTIVE', pageSize: 100 } }) as any
        // the entity-list REST method returns the rows directly as a JSON array
        this.activeAgents = Array.isArray(resp?.data) ? resp.data : (resp?.data?.aiAgentList || [])
      } catch (error) {
        logger.error(error)
      }
    },

    async startConversation(agentId: string) {
      const resp = await api({ url: 'ai/conversations', method: 'post', data: { agentId } }) as any
      if (hasError(resp) || !resp.data?.conversationId) throw resp?.data
      await this.fetchConversations()
      await this.selectConversation(resp.data.conversationId)
      return resp.data.conversationId
    },

    clearWorkforceState() {
      this.$reset()
    }
  }
})
