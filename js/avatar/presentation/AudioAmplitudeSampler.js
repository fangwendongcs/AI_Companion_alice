const AUDIO_GRAPH_KEY = '__aliceAudioAmplitudeGraph';

export function createAudioAmplitudeSampler(audioSource = null) {
  if (!audioSource) return null;
  if (typeof audioSource.getAmplitude === 'function') {
    return createFunctionSampler(audioSource.getAmplitude);
  }
  const audioElement = audioSource.audioElement || audioSource.element || null;
  if (!audioElement) return null;
  return createMediaElementSampler(audioElement);
}

function createFunctionSampler(getAmplitude) {
  return {
    type: 'function',
    getAmplitude() {
      return clampAmplitude(getAmplitude());
    },
    dispose() {}
  };
}

function createMediaElementSampler(audioElement) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    const graph = audioElement[AUDIO_GRAPH_KEY] || createMediaElementGraph(audioElement, AudioContextClass);
    audioElement[AUDIO_GRAPH_KEY] = graph;
    return {
      type: 'media-element',
      getAmplitude() {
        if (graph.context.state === 'suspended') {
          void graph.context.resume?.();
        }
        graph.analyser.getByteFrequencyData(graph.frequencyData);
        let total = 0;
        for (let index = 0; index < graph.frequencyData.length; index += 1) {
          total += graph.frequencyData[index];
        }
        return clampAmplitude(total / graph.frequencyData.length / 255);
      },
      dispose() {}
    };
  } catch (_error) {
    return null;
  }
}

function createMediaElementGraph(audioElement, AudioContextClass) {
  const context = new AudioContextClass();
  const source = context.createMediaElementSource(audioElement);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);
  analyser.connect(context.destination);
  return {
    context,
    source,
    analyser,
    frequencyData
  };
}

function clampAmplitude(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
