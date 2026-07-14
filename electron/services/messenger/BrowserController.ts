import fs from 'node:fs';
import { type Browser, type BrowserContext } from 'playwright';
import { launchBrowser, type BrowserChannelPref } from '../BrowserLauncher';
import { getSettingSync } from '../SettingsAccessor';
import type { MessengerLogger } from './MessengerLogger';
import { messengerError, type MessengerError } from './BrowserErrorHandler';

const STEP = 'browser';
const WORKANA_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
}

/**
 * Gerencia o ciclo de vida do Browser e BrowserContext para o Messenger.
 *
 * Responsabilidades:
 * - Abrir o browser com a sessão salva (storageState do Playwright)
 * - Verificar que o arquivo de sessão existe antes de abrir
 * - Fechar o browser de forma segura ao final (sucesso ou erro)
 *
 * NÃO conhece nada sobre páginas, navegação ou seletores — isso é
 * responsabilidade de PageController e NavigationController.
 */
export class BrowserController {
  constructor(private readonly logger: MessengerLogger) {}

  /**
   * Abre o browser carregando a sessão persistida.
   * Retorna um BrowserSession ou lança MessengerError se a sessão não existe.
   * O caller é responsável por chamar `close()` após o uso.
   */
  async open(sessionFilePath: string): Promise<BrowserSession | MessengerError> {
    this.logger.info(STEP, 'Verificando sessão salva…');

    if (!fs.existsSync(sessionFilePath)) {
      const err = messengerError(
        'session_missing',
        'Nenhuma sessão do Workana encontrada. Faça login em Settings → Workana.',
      );
      this.logger.error(STEP, err.message);
      return err;
    }

    this.logger.info(STEP, `Sessão encontrada: ${sessionFilePath}`);

    try {
      const channel = (getSettingSync('playwright.browser_channel', 'auto') || 'auto') as BrowserChannelPref;

      this.logger.info(STEP, `Abrindo navegador (canal: ${channel}, headless: true)…`);

      const browser = await launchBrowser({
        headless: true,
        channel,
        onLog: (msg, level) => this.logger[level](STEP, msg),
      });

      const context = await browser.newContext({
        storageState: sessionFilePath,
        userAgent: WORKANA_UA,
        locale: 'pt-BR',
        viewport: { width: 1280, height: 800 },
      });

      this.logger.info(STEP, 'Navegador aberto e sessão carregada.');
      return { browser, context };
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.error(STEP, `Falha ao abrir navegador: ${msg}`);
      return messengerError('playwright_error', `Falha ao abrir navegador: ${msg}`, (e as Error).stack);
    }
  }

  /** Fecha browser e context de forma segura — nunca lança, apenas loga erros. */
  async close(session: BrowserSession): Promise<void> {
    try {
      await session.context.close();
    } catch (e) {
      this.logger.warn(STEP, `Aviso ao fechar context: ${(e as Error).message}`);
    }
    try {
      await session.browser.close();
    } catch (e) {
      this.logger.warn(STEP, `Aviso ao fechar browser: ${(e as Error).message}`);
    }
    this.logger.info(STEP, 'Navegador fechado.');
  }
}

/** Type guard: distingue BrowserSession de MessengerError */
export function isBrowserSession(v: BrowserSession | MessengerError): v is BrowserSession {
  return 'browser' in v && 'context' in v;
}