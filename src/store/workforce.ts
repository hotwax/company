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
  userFullName?: string;
  lastActivityDate?: number;
  derivedStatus: 'pending' | 'running' | 'error' | 'idle';
  pendingToolName?: string;
}

function toChatItems(detail: any): ChatItem[] {
  const items: ChatItem[] = []
  const userName = detail?.conversation?.userFullName || detail?.conversation?.userId || 'User'
  for (const msg of detail?.messageList || []) {
    if (msg.role === 'user') {
      items.push({ id: `msg-${msg.messageSeqId}`, type: 'message', userName, content: msg.content })
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls?.length) {
        for (const toolCall of msg.toolCalls) {
          items.push({ id: `tc-${msg.messageSeqId}-${toolCall.id}`, type: 'toolCall', toolName: toolCall.name,
            args: JSON.stringify(toolCall.arguments ?? {}, null, 2) })
        }
      }
      if (msg.content) {
        items.push({ id: `agent-${msg.messageSeqId}`, type: 'agentMessage', content: msg.content })
      }
    }
    // role 'tool' results are not rendered as bubbles; the tool-call card carries the action
  }
  for (const req of detail?.pendingRequestList || []) {
    let args = req.arguments
    try { args = JSON.stringify(JSON.parse(req.arguments), null, 2) } catch { /* keep raw string */ }
    items.push({ id: `perm-${req.toolCallRequestId}`, type: 'permission', permissionId: req.toolCallRequestId,
      toolName: req.toolName, message: `${req.toolName}\n${args}` })
  }
  if (detail?.latestRun?.errorText && ['AI_RUN_FAILED', 'AI_RUN_ABORTED', 'AI_RUN_TRUNCATED'].includes(detail?.latestRun?.statusId)) {
    items.push({ id: `err-${detail.latestRun.agentRunId}`, type: 'agentMessage', content: detail.latestRun.errorText })
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
      const userName = this.detail?.conversation?.userFullName || 'You'
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
