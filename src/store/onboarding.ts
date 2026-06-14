import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'

type TranscriptItem = { id: string; role: 'user' | 'assistant'; content: string }

type StartConversationPayload = {
  productStoreId?: string
  retailerName?: string
  storeName?: string
  defaultCurrencyUomId?: string
  companyName?: string
  payToPartyId?: string
}

type ApplyConfigPayload = {
  topicId?: string
  slotKey?: string
}

type OnboardingPackage = {
  productStoreId: string
  retailerName: string
  statusFlag: string
  topics: any[]
  counts: Record<string, number>
}

const emptyPackage = (): OnboardingPackage => ({
  productStoreId: '',
  retailerName: '',
  statusFlag: '',
  topics: [],
  counts: {}
})

// Talks to the oms-onboarding REST API (/rest/s1/onboarding/*). The backend agent (ONB_AGENT)
// runs the discovery conversation, records config into a draft, and proposes live store writes
// that surface here as pending approvals.
export const useOnboardingStore = defineStore('onboarding', {
  state: () => ({
    conversationId: '' as string,
    transcript: [] as TranscriptItem[],
    pendingApprovals: [] as any[],
    pkg: emptyPackage(),
    starting: false,
    sending: false
  }),

  getters: {
    isStarted: (state) => !!state.conversationId,
    counts: (state) => state.pkg.counts || {},
    topics: (state) => state.pkg.topics || []
  },

  actions: {
    async startConversation(payload: StartConversationPayload = {}) {
      this.starting = true
      try {
        const resp = await api({ url: 'onboarding/conversations', method: 'post', data: payload })
        if (!commonUtil.hasError(resp)) {
          this.conversationId = resp.data.conversationId
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
      } finally {
        this.starting = false
      }
      return this.conversationId
    },

    // Start a session and let the agent open the conversation with its first discovery question.
    async startAndGreet(payload: StartConversationPayload = {}) {
      const conversationId = await this.startConversation(payload)
      if (this.conversationId) {
        await this.sendMessage("Hi — I'd like to set up HotWax for my store.")
      }
      return conversationId
    },

    async sendMessage(userMessage: string) {
      if (!this.conversationId) await this.startConversation()
      if (!this.conversationId) return

      this.transcript.push({ id: `u-${Date.now()}`, role: 'user', content: userMessage })
      this.sending = true
      try {
        const resp = await api({
          url: `onboarding/conversations/${this.conversationId}/messages`,
          method: 'post',
          data: { userMessage }
        })
        if (!commonUtil.hasError(resp)) {
          this.applyTurn(resp.data)
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.transcript.push({
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry — I had trouble reaching the onboarding agent. Please try again.'
        })
      } finally {
        this.sending = false
      }
      await this.fetchPackage()
    },

    // Approve (true) or reject (false) a proposed live store write, then resume the agent.
    async decide(toolCallRequestId: string, approved: boolean) {
      this.sending = true
      try {
        const resp = await api({
          url: `onboarding/approvals/${toolCallRequestId}`,
          method: 'post',
          data: { approved }
        })
        if (!commonUtil.hasError(resp)) {
          this.applyTurn(resp.data)
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
      } finally {
        this.sending = false
      }
      await this.fetchPackage()
    },

    applyTurn(data: any) {
      if (data?.assistantMessage) {
        this.transcript.push({
          id: `a-${data.agentRunId || Date.now()}-${this.transcript.length}`,
          role: 'assistant',
          content: data.assistantMessage
        })
      }
      this.pendingApprovals = data?.awaitingApproval ? (data.pendingApprovals || []) : []
    },

    async fetchPackage() {
      if (!this.conversationId) return
      try {
        const resp = await api({ url: `onboarding/conversations/${this.conversationId}/package`, method: 'get' })
        if (!commonUtil.hasError(resp)) {
          this.pkg = { ...emptyPackage(), ...resp.data }
        }
      } catch (error: any) {
        logger.error(error)
      }
    },

    async applyConfig(payload: ApplyConfigPayload = {}) {
      if (!this.conversationId) return

      try {
        const resp = await api({
          url: `onboarding/conversations/${this.conversationId}/apply`,
          method: 'post',
          data: payload
        })
        if (!commonUtil.hasError(resp)) {
          await this.fetchPackage()
          return resp.data
        }

        throw resp.data
      } catch (error: any) {
        logger.error(error)
        throw error
      }
    },

    reset() {
      this.conversationId = ''
      this.transcript = []
      this.pendingApprovals = []
      this.pkg = emptyPackage()
    }
  }
})
