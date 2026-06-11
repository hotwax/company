import { defineStore } from 'pinia'
import { api, logger } from '@common'
import { hasError } from '@/utils'
import type { ChatItem } from '@/components/chat/ChatContainer.vue'

export type CatalogTool = {
  toolId: string;
  toolName: string;
  description: string;
  effectEnumId: string;
  requiresApproval: string; // tool default 'Y' | 'N'
}

export type SelectedTool = CatalogTool & { autoApprove: boolean }

export type ModelOption = { providerName: string; modelName: string }

export const useComposerStore = defineStore('composer', {
  state: () => ({
    agentId: '',
    agentName: '',
    instructions: '',
    providerName: '',
    modelName: '',
    reasoningEffort: 'none',
    statusId: '',
    selectedTools: [] as SelectedTool[],
    toolCatalog: [] as CatalogTool[],
    modelOptions: [] as ModelOption[],
    reasoningEffortOptions: ['none', 'low', 'medium', 'high'] as string[],
    previewItems: [] as ChatItem[],
    saving: false,
    previewing: false,
    enhancing: false
  }),

  getters: {
    isDraftSaved: (state) => !!state.agentId,
    canActivate: (state) => !!state.agentId && !!state.agentName.trim() && state.statusId === 'AI_AGENT_DRAFT'
  },

  actions: {
    async fetchModelOptions() {
      try {
        const resp = await api({ url: 'ai/models', method: 'get' }) as any
        if (hasError(resp)) throw resp.data
        this.modelOptions = resp.data.modelList || []
        this.reasoningEffortOptions = resp.data.reasoningEffortList || this.reasoningEffortOptions
        if (!this.modelName && this.modelOptions.length) {
          const dflt = this.modelOptions.find((option: ModelOption) =>
            option.providerName === resp.data.defaultProviderName && option.modelName === resp.data.defaultModelName)
          const pick = dflt || this.modelOptions[0]
          this.providerName = pick.providerName
          this.modelName = pick.modelName
        }
      } catch (error) {
        logger.error(error)
      }
    },

    async fetchToolCatalog() {
      try {
        const resp = await api({ url: 'ai/tools', method: 'get', params: { maxResults: 200 } }) as any
        if (hasError(resp)) throw resp.data
        this.toolCatalog = resp.data.capabilityList || []
      } catch (error) {
        logger.error(error)
      }
    },

    async saveDraft() {
      this.saving = true
      try {
        const data: any = {
          agentName: this.agentName.trim(),
          systemPrompt: this.instructions,
          providerName: this.providerName,
          modelName: this.modelName,
          reasoningEffort: this.reasoningEffort
        }
        let resp: any
        if (this.agentId) {
          resp = await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}`, method: 'put', data })
        } else {
          resp = await api({ url: 'ai/agents', method: 'post', data })
        }
        if (hasError(resp)) throw resp.data
        if (resp.data?.agentId) this.agentId = resp.data.agentId
        if (!this.statusId) this.statusId = 'AI_AGENT_DRAFT'
        await this.syncGrants()
        return true
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.saving = false
      }
    },

    // Diff-sync grants against the server. Desired effective approval = autoApprove ? 'N' : 'Y';
    // an override is written only when that differs from the tool default. Clearing an override
    // recreates the grant (entity-auto store ignores null parameters).
    async syncGrants() {
      if (!this.agentId) return
      const resp = await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}`, method: 'get' }) as any
      if (hasError(resp)) throw resp.data
      const current: any[] = resp.data.toolList || []
      this.statusId = resp.data.agent?.statusId || this.statusId

      for (const cur of current) {
        if (!this.selectedTools.some((tool) => tool.toolId === cur.toolId)) {
          await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/tools/${encodeURIComponent(cur.toolId)}`, method: 'delete' })
        }
      }
      for (const tool of this.selectedTools) {
        const cur = current.find((c: any) => c.toolId === tool.toolId)
        const desiredEffective = tool.autoApprove ? 'N' : 'Y'
        const override = desiredEffective === (tool.requiresApproval || 'N') ? null : desiredEffective
        const curOverride = cur ? (cur.requiresApprovalOverride || null) : undefined
        if (cur && curOverride !== override && override === null) {
          await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/tools/${encodeURIComponent(tool.toolId)}`, method: 'delete' })
        }
        if (!cur || curOverride !== override) {
          const data: any = { toolId: tool.toolId }
          if (override) data.requiresApprovalOverride = override
          await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/tools`, method: 'post', data })
        }
      }
    },

    async sendPreviewMessage(testMessage: string) {
      this.previewing = true
      try {
        await this.saveDraft()
        this.previewItems.push({ id: `user-${Date.now()}`, type: 'message', userName: 'You', content: testMessage })
        const resp = await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/preview`, method: 'post', data: { testMessage } }) as any
        if (hasError(resp)) throw resp.data
        const heldCalls = resp.data.heldCalls || []
        heldCalls.forEach((held: any, index: number) => {
          let args = held.arguments
          try { args = JSON.stringify(JSON.parse(held.arguments), null, 2) } catch { /* keep raw string */ }
          this.previewItems.push({ id: `held-${Date.now()}-${index}`, type: 'toolCall', toolName: `${held.toolName} (held)`, args })
        })
        if (resp.data.assistantMessage) {
          this.previewItems.push({ id: `agent-${Date.now()}`, type: 'agentMessage', content: resp.data.assistantMessage })
        }
        return true
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.previewing = false
      }
    },

    async enhanceInstructions() {
      this.enhancing = true
      try {
        const resp = await api({ url: 'ai/instructions/enhance', method: 'post',
          data: { instructions: this.instructions, agentName: this.agentName || undefined } }) as any
        if (hasError(resp) || !resp.data?.enhancedInstructions) throw resp?.data
        this.instructions = resp.data.enhancedInstructions
        return true
      } catch (error) {
        logger.error(error)
        throw error
      } finally {
        this.enhancing = false
      }
    },

    async activate() {
      const resp = await api({ url: `ai/agents/${encodeURIComponent(this.agentId)}/activate`, method: 'post', data: {} }) as any
      if (hasError(resp)) throw resp.data
      this.statusId = 'AI_AGENT_ACTIVE'
      return true
    },

    clearComposerState() {
      this.$reset()
    }
  },

  persist: true
})
