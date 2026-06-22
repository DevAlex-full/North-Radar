/**
 * Provider Layer — interface comum que desacopla AgentRunner/TeamPipeline de
 * "como" um agente é executado. Cada agente escolhe seu provider (campo
 * `agents.provider`); o ProviderRegistry resolve qual implementação chamar.
 *
 * Claude CLI continua existindo como provider LEGADO (ClaudeCliProvider),
 * encapsulando o ClaudeExecutionService já existente sem alterá-lo.
 */

export type ProviderId = 'claude-cli' | 'anthropic' | 'openai' | 'gemini';

export interface ProviderExecuteOptions {
  prompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
  /** Callback de streaming — chamado a cada chunk recebido, quando o provider suportar. */
  onChunk?: (chunk: string) => void;
  /** Permite cancelamento real (mata o processo do Claude CLI / aborta a request HTTP). */
  signal?: AbortSignal;
  /**
   * Contexto informativo (slug do agente, runId) — hoje usado só pelo
   * ClaudeCliProvider para repassar como env vars ao processo `claude` (puramente
   * de debug/inspeção, sem efeito funcional). Providers HTTP ignoram este campo.
   */
  context?: { agentSlug?: string; runId?: number };
}

export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'spawn'
  | 'http_4xx'
  | 'http_5xx'
  | 'unknown';

export interface ProviderError {
  message: string;
  kind: ProviderErrorKind;
  /** Corpo de erro da API ou stack — sempre preservado, nunca descartado. */
  raw?: string;
}

/** Resultado SEMPRE estruturado — nunca "stderr vazio = Processo encerrou com código 1". */
export interface ProviderExecuteResult {
  ok: boolean;
  output: string;
  meta: {
    provider: ProviderId;
    model: string;
    durationMs: number;
  };
  error?: ProviderError;
}

export interface AgentProvider {
  readonly id: ProviderId;
  /** Valida se a chave/CLI necessária está configurada, sem executar nada. */
  isConfigured(): Promise<boolean>;
  execute(opts: ProviderExecuteOptions): Promise<ProviderExecuteResult>;
}