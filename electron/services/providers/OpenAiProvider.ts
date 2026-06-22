import { getSettingSync } from '../SettingsAccessor';
import type { AgentProvider, ProviderExecuteOptions, ProviderExecuteResult, ProviderErrorKind } from './types';

const DEFAULT_MODEL = 'gpt-4o';

function errorKindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'http_5xx';
  if (status >= 400) return 'http_4xx';
  return 'unknown';
}

/**
 * Provider OpenAI — chamada REST direta ao endpoint /v1/chat/completions,
 * usando a chave salva em Settings → Chaves → OpenAI API Key (`keys.openai`).
 */
export class OpenAiProviderImpl implements AgentProvider {
  readonly id = 'openai' as const;

  async isConfigured(): Promise<boolean> {
    return getSettingSync('keys.openai', '').trim().length > 0;
  }

  /** Aliases do Claude CLI (sonnet/opus/haiku) não fazem sentido na OpenAI — cai num default seguro. */
  private normalizeModel(model: string): string {
    const looksLikeClaudeAlias = ['sonnet', 'opus', 'haiku'].includes(model) || model.startsWith('claude-');
    return looksLikeClaudeAlias ? DEFAULT_MODEL : model;
  }

  async execute(opts: ProviderExecuteOptions): Promise<ProviderExecuteResult> {
    const start = Date.now();
    const model = this.normalizeModel(opts.model);
    const apiKey = getSettingSync('keys.openai', '');

    if (!apiKey) {
      return {
        ok: false,
        output: '',
        meta: { provider: this.id, model, durationMs: 0 },
        error: {
          message: 'OpenAI API Key não configurada. Vá em Settings → Chaves → OpenAI API Key.',
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
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.3,
          max_tokens: opts.maxTokens ?? 12000,
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
            message: apiMessage ?? `OpenAI API respondeu HTTP ${res.status}`,
            kind: errorKindForStatus(res.status),
            raw: JSON.stringify(body),
          },
        };
      }

      const text = (body as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? '';

      if (!text.trim()) {
        return {
          ok: false,
          output: '',
          meta: { provider: this.id, model, durationMs },
          error: { message: 'OpenAI API retornou uma resposta sem texto.', kind: 'unknown', raw: JSON.stringify(body) },
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
            ? `Timeout ou cancelamento: OpenAI API não respondeu em ${opts.timeoutSeconds ?? 300}s ou a execução foi cancelada.`
            : `Falha de rede ao chamar OpenAI API: ${(err as Error).message}`,
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

export const OpenAiProvider = new OpenAiProviderImpl();