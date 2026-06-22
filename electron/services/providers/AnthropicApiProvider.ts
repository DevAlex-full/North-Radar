import { getSettingSync } from '../SettingsAccessor';
import type { AgentProvider, ProviderExecuteOptions, ProviderExecuteResult, ProviderErrorKind } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const API_VERSION = '2023-06-01';

function errorKindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'http_5xx';
  if (status >= 400) return 'http_4xx';
  return 'unknown';
}

/**
 * Provider Anthropic — chamada REST direta ao endpoint /v1/messages,
 * usando a chave salva em Settings → Chaves → Anthropic API Key (`keys.anthropic`).
 * Independente do Claude CLI (que usa autenticação própria via login da CLI,
 * não esta API key).
 */
export class AnthropicApiProviderImpl implements AgentProvider {
  readonly id = 'anthropic' as const;

  async isConfigured(): Promise<boolean> {
    return getSettingSync('keys.anthropic', '').trim().length > 0;
  }

  /** Aliases puros (sonnet/opus/haiku) do Claude CLI não são nomes de modelo válidos na API — mapeia para um default seguro. */
  private normalizeModel(model: string): string {
    if (/^claude-.+-\d/.test(model)) return model; // já parece um nome completo de API (ex: claude-sonnet-4-6)
    return DEFAULT_MODEL;
  }

  async execute(opts: ProviderExecuteOptions): Promise<ProviderExecuteResult> {
    const start = Date.now();
    const model = this.normalizeModel(opts.model);
    const apiKey = getSettingSync('keys.anthropic', '');

    if (!apiKey) {
      return {
        ok: false,
        output: '',
        meta: { provider: this.id, model, durationMs: 0 },
        error: {
          message: 'Anthropic API Key não configurada. Vá em Settings → Chaves → Anthropic API Key.',
          kind: 'auth',
        },
      };
    }

    const timeoutMs = (opts.timeoutSeconds ?? 300) * 1000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onExternalAbort);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 12000,
          temperature: opts.temperature ?? 0.3,
          messages: [{ role: 'user', content: opts.prompt }],
        }),
      });

      const body = await res.json().catch(() => ({}) as Record<string, unknown>);
      const durationMs = Date.now() - start;

      if (!res.ok) {
        const apiMessage = (body as { error?: { message?: string } })?.error?.message;
        return {
          ok: false,
          output: '',
          meta: { provider: this.id, model, durationMs },
          error: {
            message: apiMessage ?? `Anthropic API respondeu HTTP ${res.status}`,
            kind: errorKindForStatus(res.status),
            raw: JSON.stringify(body),
          },
        };
      }

      const content = (body as { content?: Array<{ type: string; text?: string }> })?.content;
      const text = content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') ?? '';

      if (!text.trim()) {
        return {
          ok: false,
          output: '',
          meta: { provider: this.id, model, durationMs },
          error: { message: 'Anthropic API retornou uma resposta sem texto.', kind: 'unknown', raw: JSON.stringify(body) },
        };
      }

      return { ok: true, output: text.trim(), meta: { provider: this.id, model, durationMs } };
    } catch (err) {
      const durationMs = Date.now() - start;
      const isAbort = (err as Error).name === 'AbortError';
      return {
        ok: false,
        output: '',
        meta: { provider: this.id, model, durationMs },
        error: {
          message: isAbort
            ? `Timeout ou cancelamento: Anthropic API não respondeu em ${opts.timeoutSeconds ?? 300}s ou a execução foi cancelada.`
            : `Falha de rede ao chamar Anthropic API: ${(err as Error).message}`,
          kind: isAbort ? 'timeout' : 'unknown',
          raw: String(err),
        },
      };
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}

export const AnthropicApiProvider = new AnthropicApiProviderImpl();