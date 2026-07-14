/**
 * Logger estruturado para a camada de automação do Workana Messenger.
 *
 * Separado do ActivityLogger (que grava em banco) — este logger coleta
 * entradas em memória durante a execução e as devolve no resultado final
 * (como parte do `output` do ProviderExecuteResult), além de opcionalmente
 * repassar para um callback de streaming (onChunk) que o AgentRunner já usa
 * para mostrar progresso em tempo real no Studio.
 *
 * Design intencional: sem estado global, sem singleton. Cada execução do
 * Messenger cria uma instância nova — clean slate por chamada.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  step: string;
  message: string;
}

export class MessengerLogger {
  private readonly entries: LogEntry[] = [];
  private readonly onChunk?: (chunk: string) => void;

  constructor(onChunk?: (chunk: string) => void) {
    this.onChunk = onChunk;
  }

  info(step: string, message: string): void {
    this.append('info', step, message);
  }

  warn(step: string, message: string): void {
    this.append('warn', step, message);
  }

  error(step: string, message: string): void {
    this.append('error', step, message);
  }

  private append(level: LogLevel, step: string, message: string): void {
    const ts = new Date().toISOString();
    const entry: LogEntry = { ts, level, step, message };
    this.entries.push(entry);

    const line = `[${ts}] [${level.toUpperCase()}] [${step}] ${message}`;

    // Repassa para o streaming do AgentRunner (visível no Studio em tempo real)
    this.onChunk?.(line + '\n');

    // Log local para debug do processo Electron
    if (level === 'error') {
      console.error(`[WorkanaMessenger] ${line}`);
    } else {
      console.log(`[WorkanaMessenger] ${line}`);
    }
  }

  /** Todas as entradas coletadas — usadas para montar o `output` final. */
  getEntries(): readonly LogEntry[] {
    return this.entries;
  }

  /**
   * Formata o log completo como texto markdown — vai para o `output` do
   * ProviderExecuteResult, ficando visível no Studio e nos artefatos.
   */
  toMarkdown(): string {
    if (this.entries.length === 0) return '_Nenhum log registrado._';
    const lines = this.entries.map(
      (e) => `- \`[${e.level.toUpperCase()}]\` **${e.step}**: ${e.message}`,
    );
    return `## Log de execução — Workana Messenger\n\n${lines.join('\n')}\n`;
  }
}