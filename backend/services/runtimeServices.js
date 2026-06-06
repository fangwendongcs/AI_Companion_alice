import { initializeSQLiteDatabase } from '../db/sqliteDatabase.js';
import { MemoryRepository } from '../db/MemoryRepository.js';
import { CompanionAffectService } from './CompanionAffectService.js';
import { DialogueOrchestrationService } from './DialogueOrchestrationService.js';
import { LLMService } from './LLMService.js';
import { MemoryService } from './MemoryService.js';
import { PersonaService } from './PersonaService.js';

export const llmService = new LLMService();
export const sqliteDatabase = await initializeSQLiteDatabase();
export const memoryRepository = new MemoryRepository({ database: sqliteDatabase });
export const memoryService = new MemoryService({ repository: memoryRepository });
export const personaService = new PersonaService();
export const affectService = new CompanionAffectService();
export const dialogueOrchestrationService = new DialogueOrchestrationService({
  llmService,
  memoryService,
  personaService,
  affectService
});
