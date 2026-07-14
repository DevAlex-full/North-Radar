import type { ProviderError, ProviderErrorKind } from '../providers/types';

/**
 * Traduz exceções do Playwright e erros de navegação em `ProviderError`
 * estruturado — exatamente o formato que o Provider Layer já usa para os
 * outros providers (LLM HTTP errors, timeouts, etc.).
 *
 * Centraliza toda a lógica de "o que deu errado?" para que os controllers
 * nunca precisem fazer `throw` genérico nem construir ProviderError inline.
 */
export type MessengerErrorCode =
  | 'session_missing'     // Nenhum state.json salvo
  | 'session_expired'     // Redirecionou para /login
  | 'captcha_detected'    // Captcha encontrado na página
  | 'project_not_found'   // URL da vaga não carregou / 404
  | 'project_unavailable' // Vaga fechada, pausada ou indisponível
  | 'already_proposed'    // Proposta já enviada para este projeto
  | 'button_not_found'    // Botão "Enviar proposta" não encontrado (layout mudou?)
  | 'navigation_timeout'  // Playwright timeout ao navegar
  | 'playwright_error'    // Erro genérico do Playwright
  | 'screenshot_error'    // Falha ao salvar screenshot (não impede o fluxo)
  | 'unknown';

export interface MessengerError {
  code: MessengerErrorCode;
  message: string;
  raw?: string;
}

/**
 * Constrói um MessengerError estruturado a partir de qualquer exceção lançada
 * pelo Playwright ou pela navegação, classificando pelo tipo de erro quando
 * possível.
 */
export function classifyPlaywrightError(err: unknown): MessengerError {
  const msg = err instanceof Error ? err.message : String(err);
  const raw = err instanceof Error ? err.stack : undefined;

  // Playwright timeout
  if (msg.includes('Timeout') || msg.includes('timeout') || msg.includes('waiting for')) {
    return { code: 'navigation_timeout', message: `Timeout de navegação: ${msg}`, raw };
  }

  // Contexto/página fechada inesperadamente
  if (msg.includes('Target closed') || msg.includes('context was destroyed') || msg.includes('page has been closed')) {
    return { code: 'playwright_error', message: `Navegador ou página fechado inesperadamente: ${msg}`, raw };
  }

  // Executável não encontrado
  if (msg.includes('Executable') || msg.includes('executable') || msg.includes('not found')) {
    return { code: 'playwright_error', message: `Navegador não encontrado: ${msg}`, raw };
  }

  return { code: 'unknown', message: msg, raw };
}

/** Converte um MessengerError para o ProviderError esperado pelo Provider Layer. */
export function toProviderError(err: MessengerError): ProviderError {
  const kind: ProviderErrorKind = (() => {
    switch (err.code) {
      case 'session_missing':
      case 'session_expired':
        return 'auth';
      case 'navigation_timeout':
        return 'timeout';
      default:
        return 'unknown';
    }
  })();

  return {
    message: `[${err.code}] ${err.message}`,
    kind,
    raw: err.raw,
  };
}

/** Cria um MessengerError com código e mensagem explícitos (sem classificação automática). */
export function messengerError(code: MessengerErrorCode, message: string, raw?: string): MessengerError {
  return { code, message, raw };
}