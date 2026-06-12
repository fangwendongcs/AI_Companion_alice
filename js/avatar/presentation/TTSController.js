export const TTSLifecycleStatus = {
  IDLE: 'idle',
  REQUESTED: 'requested',
  PLAYING: 'playing',
  FALLBACK: 'fallback',
  ENDED: 'ended',
  ERROR: 'error'
};

export class TTSController {
  constructor({ log = null } = {}) {
    this.log = log;
    this.state = createInitialTTSState();
  }

  onRequest({ engine = null, affect = null, source = 'audio:request' } = {}) {
    this.state = {
      ...createInitialTTSState(),
      status: TTSLifecycleStatus.REQUESTED,
      engine,
      affect,
      source,
      requestedAt: Date.now()
    };
    return this.getState();
  }

  onStart({ engine = null, affect = null, directive = null, source = 'audio:start' } = {}) {
    this.state = {
      ...this.state,
      status: TTSLifecycleStatus.PLAYING,
      engine: engine || this.state.engine,
      affect: affect || this.state.affect,
      directive: directive || this.state.directive,
      source,
      startedAt: Date.now(),
      endedAt: null,
      error: null
    };
    return {
      ...this.getState(),
      shouldStartLipSync: Boolean(directive?.state === 'speaking')
    };
  }

  onFallback({ engine = null, message = '', error = null, affect = null, source = 'audio:fallback' } = {}) {
    this.state = {
      ...this.state,
      status: TTSLifecycleStatus.FALLBACK,
      engine: engine || this.state.engine,
      affect: affect || this.state.affect,
      source,
      fallback: true,
      error: normalizeTtsError(error, message)
    };
    return this.getState();
  }

  onEnd({ engine = null, fallback = false, source = 'audio:end' } = {}) {
    this.state = {
      ...this.state,
      status: TTSLifecycleStatus.ENDED,
      engine: engine || this.state.engine,
      source,
      fallback: Boolean(fallback || this.state.fallback),
      endedAt: Date.now()
    };
    return {
      ...this.getState(),
      shouldStopLipSync: true
    };
  }

  onError({ engine = null, message = '', error = null, affect = null, source = 'audio:error' } = {}) {
    this.state = {
      ...this.state,
      status: TTSLifecycleStatus.ERROR,
      engine: engine || this.state.engine,
      affect: affect || this.state.affect,
      source,
      error: normalizeTtsError(error, message),
      endedAt: Date.now()
    };
    return {
      ...this.getState(),
      shouldStopLipSync: true
    };
  }

  getState() {
    return { ...this.state };
  }

  destroy() {
    this.state = createInitialTTSState();
    this.log = null;
  }
}

function createInitialTTSState() {
  return {
    status: TTSLifecycleStatus.IDLE,
    engine: null,
    source: null,
    affect: null,
    directive: null,
    fallback: false,
    requestedAt: null,
    startedAt: null,
    endedAt: null,
    error: null
  };
}

function normalizeTtsError(error, message = '') {
  if (!error && !message) return null;
  return {
    message: message || error?.message || 'Audio playback failed',
    code: error?.code || null
  };
}
