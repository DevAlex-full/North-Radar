import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';

/**
 * Leitura síncrona de uma setting do SQLite, com fallback. Usado por todos os
 * providers da Provider Layer (Gemini/Anthropic/OpenAI) para ler chaves de API
 * salvas em Settings → Chaves, sem duplicar a query em cada provider.
 *
 * Mesma estratégia (sem cache, lazy) já usada internamente pelo
 * ClaudeExecutionService — settings mudam e o app não precisa reiniciar.
 */
export function getSettingSync(key: string, fallback = ''): string {
  try {
    const db = getDb();
    const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}