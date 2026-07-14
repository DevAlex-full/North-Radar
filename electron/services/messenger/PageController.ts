import { type Page, type BrowserContext } from 'playwright';
import type { MessengerLogger } from './MessengerLogger';
import { messengerError, classifyPlaywrightError, type MessengerError } from './BrowserErrorHandler';
import { Selectors } from './Selectors';

const STEP = 'page';

/** Timeout padrão para aguardar seletores (ms). Configurável pelo caller. */
const DEFAULT_SELECTOR_TIMEOUT_MS = 15_000;
/** Timeout para navegação completa de página (ms). */
const DEFAULT_NAV_TIMEOUT_MS = 30_000;

/**
 * Operações de baixo nível sobre uma Page do Playwright.
 *
 * Responsabilidades:
 * - Navegar para uma URL
 * - Aguardar que um seletor apareça
 * - Verificar a URL atual
 * - Abrir uma nova página no contexto da sessão
 *
 * NÃO conhece nada sobre o domínio do Workana (URLs específicas, seletores
 * de negócio, fluxo de autenticação) — isso é responsabilidade de
 * NavigationController.
 */
export class PageController {
  constructor(private readonly logger: MessengerLogger) {}

  /** Abre uma nova aba no contexto da sessão. */
  async newPage(context: BrowserContext): Promise<Page | MessengerError> {
    try {
      const page = await context.newPage();
      this.logger.info(STEP, 'Nova aba aberta.');
      return page;
    } catch (e) {
      const err = classifyPlaywrightError(e);
      this.logger.error(STEP, `Falha ao abrir nova aba: ${err.message}`);
      return err;
    }
  }

  /**
   * Navega para `url` e aguarda `domcontentloaded`.
   * Retorna `null` em sucesso, `MessengerError` em falha.
   */
  async navigate(page: Page, url: string): Promise<null | MessengerError> {
    try {
      this.logger.info(STEP, `Navegando para: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DEFAULT_NAV_TIMEOUT_MS });
      this.logger.info(STEP, `Página carregada: ${page.url()}`);
      return null;
    } catch (e) {
      const err = classifyPlaywrightError(e);
      this.logger.error(STEP, `Falha de navegação para "${url}": ${err.message}`);
      return err;
    }
  }

  /**
   * Aguarda um seletor ficar visível. Retorna `true` se encontrado antes do
   * timeout, `false` caso contrário (sem lançar exceção — o caller decide o
   * que fazer com a ausência).
   */
  async waitForSelector(
    page: Page,
    selector: string,
    timeoutMs = DEFAULT_SELECTOR_TIMEOUT_MS,
  ): Promise<boolean> {
    try {
      await page.waitForSelector(selector, { timeout: timeoutMs, state: 'visible' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verifica se ALGUM dos seletores do array está visível na página,
   * sem esperar timeout completo para cada um. Retorna o primeiro encontrado
   * ou null se nenhum aparecer até o timeout total.
   */
  async findFirstVisible(
    page: Page,
    selectors: string[],
    timeoutMs = DEFAULT_SELECTOR_TIMEOUT_MS,
  ): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const sel of selectors) {
        try {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            return sel;
          }
        } catch {
          // seletor inválido ou contexto fechado — ignora e tenta o próximo
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  }

  /** URL atual da página. */
  currentUrl(page: Page): string {
    return page.url();
  }

  /** Verifica se a URL atual contém o fragmento informado. */
  urlContains(page: Page, fragment: string): boolean {
    return page.url().includes(fragment);
  }

  /**
   * Verifica se algum seletor de captcha está presente.
   * Não espera — verificação imediata ($ sem waitFor).
   */
  async hasCaptcha(page: Page): Promise<boolean> {
    const captchaSelectors = [
      Selectors.captcha.recaptchaIframe,
      Selectors.captcha.hcaptchaIframe,
      Selectors.captcha.turnstileIframe,
      Selectors.captcha.challengeBlock,
    ];
    for (const sel of captchaSelectors) {
      try {
        const el = await page.$(sel);
        if (el) return true;
      } catch {
        // ignora
      }
    }
    return false;
  }
}

/** Type guard para diferenciar Page de MessengerError */
export function isPage(v: Page | MessengerError): v is Page {
  return typeof (v as Page).goto === 'function';
}