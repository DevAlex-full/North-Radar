import { getSettingSync } from '../SettingsAccessor';
import type { AgentProvider, ProviderExecuteOptions, ProviderExecuteResult, ProviderErrorKind } from './types';

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'] as const;
const DEFAULT_MODEL = 'gemini-2.5-flash';

function errorKindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'http_5xx';
  if (status >= 400) return 'http_4xx';
  return 'unknown';
}

/**
 * Provider Gemini — chamada REST direta à Generative Language API do Google,
 * usando a chave salva em Settings → Chaves → Gemini API Key (`keys.gemini`).
 * Não depende do Claude CLI nem de qualquer binário externo.
 */
export class GeminiProviderImpl implements AgentProvider {
  readonly id = 'gemini' as const;

  async isConfigured(): Promise<boolean> {
    return getSettingSync('keys.gemini', '').trim().length > 0;
  }

  /** Aceita os 4 modelos suportados; normaliza qualquer outro valor (ex: "sonnet" herdado de antes da migration) para o default. */
  private normalizeModel(model: string): string {
    return (GEMINI_MODELS as readonly string[]).includes(model) ? model : DEFAULT_MODEL;
  }

  async execute(opts: ProviderExecuteOptions): Promise<ProviderExecuteResult> {
    const start = Date.now();
    const model = this.normalizeModel(opts.model);
    const apiKey = getSettingSync('keys.gemini', '');

    if (!apiKey) {
      return {
        ok: false,
        output: '',
        meta: { provider: this.id, model, durationMs: 0 },
        error: {
          message: 'Gemini API Key não configurada. Vá em Settings → Chaves → Gemini API Key.',
          kind: 'auth',
        },
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const timeoutMs = (opts.timeoutSeconds ?? 300) * 1000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onExternalAbort);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: opts.prompt }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.3,
            maxOutputTokens: opts.maxTokens ?? 12000,
          },
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
            message: apiMessage ?? `Gemini API respondeu HTTP ${res.status}`,
            kind: errorKindForStatus(res.status),
            raw: JSON.stringify(body),
          },
        };
      }

      const candidates = (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates;
      const text = candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

      if (!text.trim()) {
        const finishReason = (body as { candidates?: Array<{ finishReason?: string }> })?.candidates?.[0]?.finishReason;
        return {
          ok: false,
          output: '',
          meta: { provider: this.id, model, durationMs },
          error: {
            message: finishReason
              ? `Gemini não retornou texto (finishReason: ${finishReason}).`
              : 'Gemini retornou uma resposta vazia.',
            kind: 'unknown',
            raw: JSON.stringify(body),
          },
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
            ? `Timeout ou cancelamento: Gemini não respondeu em ${opts.timeoutSeconds ?? 300}s ou a execução foi cancelada.`
            : `Falha de rede ao chamar Gemini: ${(err as Error).message}`,
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

export const GeminiProvider = new GeminiProviderImpl();
export const GEMINI_SUPPORTED_MODELS = GEMINI_MODELS;