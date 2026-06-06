import { EVENT_NAMES } from '../config/appConfig.js';

export class MemoryPanelController {
  constructor({ refs, registry, apiClient, eventBus, getState, readFormConfig, patchState, statusView }) {
    this.refs = refs;
    this.registry = registry;
    this.apiClient = apiClient;
    this.eventBus = eventBus;
    this.getState = getState;
    this.readFormConfig = readFormConfig;
    this.patchState = patchState;
    this.statusView = statusView;
  }

  init() {
    if (!this.refs.memoryRefreshBtn) return;
    this.registry.addEventListener(this.refs.memoryRefreshBtn, 'click', () => this.refresh());
    this.registry.addEventListener(this.refs.memoryClearSessionBtn, 'click', () => this.clear('session'));
    this.registry.addEventListener(this.refs.memoryClearAvatarBtn, 'click', () => this.clear('avatar'));
    if (this.eventBus) {
      this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_ASSISTANT, () => this.refresh()));
    }
    void this.refresh();
  }

  async refresh() {
    try {
      const { sessionId, avatarId } = this.getMemoryContext();
      const payload = await this.apiClient.json(`/api/memory?sessionId=${encodeURIComponent(sessionId)}&avatarId=${encodeURIComponent(avatarId)}&limit=12`, {
        source: 'memory',
        timeoutMs: 8000
      });
      const longTerm = payload.longTerm || {};
      this.renderItems(longTerm.items || []);
      this.patchState?.({
        memory: {
          ...(this.getState().memory || {}),
          sessionId,
          longTermCount: longTerm.count || 0,
          longTerm
        }
      }, 'memory:panel');
      this.showStatus(`已读取 ${longTerm.count || 0} 条长期记忆。`, 'success');
    } catch (error) {
      this.showStatus(`记忆读取失败：${String(error.message || error).slice(0, 90)}`, 'error');
    }
  }

  async clear(scope) {
    try {
      const { sessionId, avatarId } = this.getMemoryContext();
      const payload = await this.apiClient.json(`/api/memory?sessionId=${encodeURIComponent(sessionId)}&avatarId=${encodeURIComponent(avatarId)}&scope=${scope}`, {
        method: 'DELETE',
        source: 'memory',
        timeoutMs: 8000
      });
      this.renderItems([]);
      this.patchState?.({
        memory: {
          ...(this.getState().memory || {}),
          sessionId,
          longTermCount: 0,
          longTerm: { used: false, status: 'ready', count: 0, items: [] }
        }
      }, 'memory:clear');
      this.showStatus(`已清除 ${payload.cleared || 0} 条${scope === 'avatar' ? '角色' : '当前会话'}长期记忆。`, 'success');
    } catch (error) {
      this.showStatus(`记忆清除失败：${String(error.message || error).slice(0, 90)}`, 'error');
    }
  }

  getMemoryContext() {
    const formConfig = this.readFormConfig?.() || {};
    const state = this.getState?.() || {};
    return {
      sessionId: formConfig.sessionId || state.memory?.sessionId || 'default',
      avatarId: formConfig.avatarId || state.currentAvatarId || 'alice'
    };
  }

  renderItems(items) {
    if (!this.refs.memoryItemsList) return;
    this.refs.memoryItemsList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'memory-item empty';
      empty.textContent = '暂无长期记忆。';
      this.refs.memoryItemsList.append(empty);
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'memory-item';
      const meta = document.createElement('span');
      meta.className = 'memory-item__meta';
      meta.textContent = `${item.type || 'fact'} · ${item.scope || 'session'}`;
      const content = document.createElement('span');
      content.className = 'memory-item__content';
      content.textContent = item.content || '';
      row.append(meta, content);
      this.refs.memoryItemsList.append(row);
    });
  }

  showStatus(message, type) {
    if (this.refs.memoryPanelStatus) {
      this.refs.memoryPanelStatus.textContent = message;
      this.refs.memoryPanelStatus.className = `llm-status ${type || ''}`.trim();
      return;
    }
    this.statusView?.showLLM?.(type || 'success', message);
  }
}
