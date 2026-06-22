import { ClaudeCliProvider } from './ClaudeCliProvider';
import { AnthropicApiProvider } from './AnthropicApiProvider';
import { OpenAiProvider } from './OpenAiProvider';
import { GeminiProvider } from './GeminiProvider';
import type { AgentProvider, ProviderId, ProviderExecuteOptions, ProviderExecuteResult } from './types';

/**
 * Resolve e executa o provider correto para um agente. Este é o ÚNICO ponto
 * de entrada que AgentRunner.ts e TeamPipeline.ts devem chamar — nenhum dos
 * dois deve importar ClaudeExecutionService ou qualquer provider diretamente.
 *
 * Default explícito: 'claude-cli' — preserva 100% do comportamento atual para
 * agentes que não têm `provider` salvo (criados antes desta migration).
 */
class ProviderRegistryImpl {
  private providers: Record<ProviderId, AgentProvider> = {
    'claude-cli': ClaudeCliProvider,
    anthropic: AnthropicApiProvider,
    openai: OpenAiProvider,
    gemini: GeminiProvider,
  };

  resolve(providerId: string | null | undefined): AgentProvider {
    const id = (providerId ?? 'claude-cli') as ProviderId;
    return this.providers[id] ?? this.providers['claude-cli'];
  }

  async execute(
    providerId: string | null | undefined,
    opts: ProviderExecuteOptions,
  ): Promise<ProviderExecuteResult> {
    const provider = this.resolve(providerId);

    const configured = await provider.isConfigured();
    if (!configured) {
      return {
        ok: false,
        output: '',
        meta: { provider: provider.id, model: opts.model, durationMs: 0 },
        error: {
          message: `Provider "${provider.id}" não está configurado (chave de API ausente em Settings → Chaves).`,
          kind: 'auth',
        },
      };
    }

    return provider.execute(opts);
  }
}

export const ProviderRegistry = new ProviderRegistryImpl();
export type { ProviderId, ProviderExecuteOptions, ProviderExecuteResult, AgentProvider } from './types';