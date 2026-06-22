import { ClaudeExecutionService } from '../ClaudeExecutionService';
import type { AgentProvider, ProviderExecuteOptions, ProviderExecuteResult } from './types';

/**
 * Provider LEGADO — encapsula o ClaudeExecutionService já existente (spawn do
 * `claude` CLI) atrás da interface comum da Provider Layer, SEM alterar o
 * ClaudeExecutionService em si. É o provider padrão para agentes criados
 * antes da Provider Layer existir (campo `agents.provider` default
 * 'claude-cli') — garante zero quebra de comportamento para quem já usa o app.
 */
export class ClaudeCliProviderImpl implements AgentProvider {
  readonly id = 'claude-cli' as const;

  /**
   * O Claude CLI não usa uma "chave de API" gerenciada pelo North Radar (a
   * autenticação é da própria CLI, fora do nosso controle) — por isso sempre
   * reporta como configurado. Falhas reais de auth/PATH aparecem no `execute`,
   * via stderr do processo, como sempre aconteceu.
   */
  async isConfigured(): Promise<boolean> {
    return true;
  }

  async execute(opts: ProviderExecuteOptions): Promise<ProviderExecuteResult> {
    const start = Date.now();
    const handle = ClaudeExecutionService.execute({
      prompt: opts.prompt,
      model: opts.model,
      maxTokens: opts.maxTokens,
      timeoutSeconds: opts.timeoutSeconds,
      env: {
        // Renomeado de FREELA_RADAR_* (legado) — informativo, sem efeito
        // funcional; visível só se alguém inspecionar o processo `claude`.
        NORTH_RADAR_AGENT: opts.context?.agentSlug ?? '',
        NORTH_RADAR_RUN_ID: opts.context?.runId != null ? String(opts.context.runId) : '',
      },
    });

    if (opts.onChunk) {
      handle.on('stdout', (chunk: string) => opts.onChunk?.(chunk));
    }

    const onAbort = () => handle.kill();
    opts.signal?.addEventListener('abort', onAbort);

    const result = await handle.done;
    opts.signal?.removeEventListener('abort', onAbort);
    const durationMs = Date.now() - start;

    if (result.code === 0 && result.stdout.trim()) {
      return {
        ok: true,
        output: result.stdout.trim(),
        meta: { provider: this.id, model: opts.model, durationMs },
      };
    }

    // Mesma situação de hoje (stderr vazio em algumas falhas de spawn no
    // Windows) — mas agora reportada com `kind` explícito em vez de só texto
    // cru, para o log estruturado da Etapa 5 ter o que mostrar.
    const hasStderr = result.stderr && result.stderr.trim().length > 0;
    return {
      ok: false,
      output: result.stdout ?? '',
      meta: { provider: this.id, model: opts.model, durationMs },
      error: {
        message: hasStderr
          ? result.stderr.trim()
          : `Processo do Claude CLI encerrou com código ${result.code} sem mensagem de erro (stderr vazio) — verifique se o CLI está instalado e autenticado.`,
        kind: hasStderr ? 'unknown' : 'spawn',
        raw: result.stderr || result.stdout || undefined,
      },
    };
  }
}

export const ClaudeCliProvider = new ClaudeCliProviderImpl();