import { chromium, type Browser } from 'playwright';

export type BrowserChannelPref = 'auto' | 'chromium' | 'msedge' | 'chrome';

export interface LaunchBrowserOptions {
  headless: boolean;
  channel: BrowserChannelPref;
  /** Logger opcional — quem chamar pode plugar seu próprio `.log()` (ex: WorkanaScraper, WorkanaSessionService). */
  onLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
}

/**
 * Lança o navegador conforme a preferência de canal, com fallback entre
 * Chromium (Playwright) / Edge / Chrome do sistema.
 *
 * Extraído do método privado `launchBrowser` de WorkanaScraper.ts para ser
 * reutilizável por qualquer feature que precise abrir um Chromium real
 * (sessão do Workana, futuras sessões de outras plataformas). O scraper em si
 * ainda usa seu método privado nesta etapa — a migração dele para usar este
 * helper é um passo isolado e separado (não faz parte desta entrega), para
 * não misturar uma refatoração de comportamento já validado com a entrega
 * de uma feature nova.
 */
export async function launchBrowser(opts: LaunchBrowserOptions): Promise<Browser> {
  const { headless, channel, onLog } = opts;
  const log = (msg: string, level: 'info' | 'warn' | 'error' = 'info') => onLog?.(msg, level);

  const args = ['--disable-blink-features=AutomationControlled', '--no-sandbox'];
  const defs: Record<'chromium' | 'msedge' | 'chrome', { label: string; launch: () => Promise<Browser> }> = {
    chromium: { label: 'Chromium', launch: () => chromium.launch({ headless, args }) },
    msedge: { label: 'Edge', launch: () => chromium.launch({ headless, channel: 'msedge', args }) },
    chrome: { label: 'Chrome', launch: () => chromium.launch({ headless, channel: 'chrome', args }) },
  };
  const base: Array<'chromium' | 'msedge' | 'chrome'> = ['chromium', 'msedge', 'chrome'];
  const order = channel === 'auto' ? base : [channel, ...base.filter((c) => c !== channel)];

  let lastErr: unknown;
  for (const key of order) {
    const a = defs[key];
    try {
      return await a.launch();
    } catch (e) {
      lastErr = e;
      log(`⚠️ Navegador "${a.label}" indisponível, tentando próximo…`, 'warn');
    }
  }
  throw new Error(
    `Não foi possível abrir um navegador (Chromium/Edge/Chrome): ${(lastErr as Error)?.message ?? lastErr}`,
  );
}