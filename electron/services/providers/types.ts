/**
 * Provider Layer — interface comum que desacopla AgentRunner/TeamPipeline de
 * "como" um agente é executado. Cada agente escolhe seu provider (campo
 * `agents.provider`); o ProviderRegistry resolve qual implementação chamar.
 *
 * Claude CLI continua existindo como provider LEGADO (ClaudeCliProvider),
 * encapsulando o ClaudeExecutionService já existente sem alterá-lo.
 *
 * 'workana-messenger' é um provider de natureza DIFERENTE dos demais: em vez
 * de chamar uma API/CLI de LLM, ele executa automação via Playwright (abrir o
 * projeto no Workana com a sessão salva e enviar a proposta). O `prompt`
 * recebido é o texto final da proposta (saída do Pitch Agent no handoff); o
 * `output` é uma confirmação textual/estruturada do envio, não texto gerado
 * por IA. Ele implementa a MESMA interface `AgentProvider` — é assim que o
 * Messenger nasce como um agente normal do Studio (Soul/System/Operational,
 * provider/model, etc.), preparado para futuramente entrar no Pipeline como
 * PRD → ADR → Pitch → Messenger, sem precisar de uma arquitetura paralela.
 *
 * Nesta etapa, o provider existe apenas para deixar a Provider Layer e o
 * Studio preparados (campo `provider` aceita o valor, UI já lista o nome) —
 * a implementação de `execute()` ainda não envia nenhuma proposta de verdade
 * (ver WorkanaMessengerProvider.ts).
 */

export type ProviderId = 'claude-cli' | 'anthropic' | 'openai' | 'gemini' | 'workana-messenger';

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