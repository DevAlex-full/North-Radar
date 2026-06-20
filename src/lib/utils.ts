export function cn(...args: Array<string | false | null | undefined | Record<string, boolean>>): string {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (typeof a === 'string') {
      out.push(a);
    } else if (typeof a === 'object') {
      for (const [k, v] of Object.entries(a)) if (v) out.push(k);
    }
  }
  return out.join(' ');
}

export function formatBudgetBRL(min?: number | null, max?: number | null, currency = 'BRL') {
  if (min == null && max == null) return '—';
  const fmt = (v: number) => {
    if (currency === 'USD') return `$ ${v.toLocaleString('en-US')}`;
    return `R$ ${v.toLocaleString('pt-BR')}`;
  };
  if (min != null && max != null) return `${fmt(min)} - ${fmt(max).replace(/^R\$\s|^\$\s/, '')}`;
  if (min != null) return `${fmt(min)}+`;
  return fmt(max!);
}

export function relativeTime(input: Date | string | number | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 'agora';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `há ${sec} seg`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const day = Math.floor(hr / 24);
  return `há ${day} d`;
}

/**
 * "27/05/2026 15:30:42" — pt-BR, sempre completo com segundos.
 */
export function formatDateTime(input: Date | string | number | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function safeParseJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) return fallback;
  try { return JSON.parse(input) as T; } catch { return fallback; }
}

export type MatchTier = 'alta' | 'media' | 'baixa' | 'evitar';

export interface MatchTierInfo {
  tier: MatchTier;
  label: string;
  /** Cor de texto (hex), no mesmo padrão das outras cores fixas do app (ex: #16a34a). */
  color: string;
  /** Fundo suave para badges/chips. */
  bg: string;
}

/**
 * Classifica o match_score (0-100) em uma faixa de compatibilidade comercial.
 * Thresholds calibrados para o modelo do North Radar:
 *  - Alta   (>= 60): stack/escopo muito aderente, priorizar
 *  - Média  (35-59): aderência parcial, avaliar caso a caso
 *  - Baixa  (15-34): pouca aderência, baixo retorno provável
 *  - Evitar (< 15): fora do core (ex: red flags como mobile nativo/blockchain) ou sem match
 */
export function classifyMatchScore(score: number | null | undefined): MatchTierInfo {
  const s = score ?? 0;
  if (s >= 60) return { tier: 'alta', label: 'Alta', color: '#16a34a', bg: '#16a34a1a' };
  if (s >= 35) return { tier: 'media', label: 'Média', color: '#ca8a04', bg: '#ca8a041a' };
  if (s >= 15) return { tier: 'baixa', label: 'Baixa', color: '#ea580c', bg: '#ea580c1a' };
  return { tier: 'evitar', label: 'Evitar', color: '#dc2626', bg: '#dc26261a' };
}
