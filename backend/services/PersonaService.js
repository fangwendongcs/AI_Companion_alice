import { DEFAULT_AVATAR_PERSONAS, DEFAULT_PERSONA_ID } from '../config/avatarPersonas.js';

const DEFAULT_AVATAR_ID = 'alice';
const MAX_TEXT_CHARS = 1200;

export class PersonaService {
  constructor({ personas = DEFAULT_AVATAR_PERSONAS } = {}) {
    this.personas = personas;
  }

  getPersona(avatarId = DEFAULT_AVATAR_ID) {
    const normalizedAvatarId = normalizeId(avatarId, DEFAULT_AVATAR_ID);
    const persona = this.personas[normalizedAvatarId] || this.personas[DEFAULT_AVATAR_ID] || {};
    return toPublicPersona({
      ...persona,
      avatarId: normalizedAvatarId,
      personaId: persona.personaId || DEFAULT_PERSONA_ID
    });
  }

  listPersonas() {
    return Object.keys(this.personas).map((avatarId) => this.getPersona(avatarId));
  }
}

export function toPromptPersona(persona = {}) {
  return {
    personaId: normalizeId(persona.personaId, DEFAULT_PERSONA_ID),
    avatarId: normalizeId(persona.avatarId, DEFAULT_AVATAR_ID),
    name: normalizeText(persona.name, 'Alice'),
    summary: normalizeText(persona.summary, ''),
    prompt: normalizeText(persona.prompt, ''),
    tone: normalizeText(persona.tone, 'warm_playful'),
    boundaries: normalizeText(persona.boundaries, ''),
    defaultVoice: persona.defaultVoice || {},
    defaultMotion: persona.defaultMotion || {},
    memoryStrategy: normalizeText(persona.memoryStrategy, 'session_scoped_conservative')
  };
}

function toPublicPersona(persona) {
  const promptPersona = toPromptPersona(persona);
  return {
    ...promptPersona,
    prompt: promptPersona.prompt.slice(0, MAX_TEXT_CHARS),
    boundaries: promptPersona.boundaries.slice(0, MAX_TEXT_CHARS)
  };
}

function normalizeId(value, fallback) {
  const text = String(value || fallback).trim();
  return text.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || fallback;
}

function normalizeText(value, fallback) {
  return String(value || fallback).trim().slice(0, MAX_TEXT_CHARS);
}
