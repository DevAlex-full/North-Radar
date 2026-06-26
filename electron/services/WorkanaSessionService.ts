import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { type BrowserContext } from 'playwright';
import { launchBrowser, type BrowserChannelPref } from './BrowserLauncher';
import { getWorkanaSessionDir } from './ExecutionStorage';
import { getSettingSync } from './SettingsAccessor';
import { ActivityLogger } from './ActivityLogger';

const WORKANA_LOGIN_URL = 'https://www.workana.com/login';
/** Qualquer URL fora de /login indica que o usuário concluiu a autenticação. */
const LOGIN_PATH_FRAGMENT = '/login';

const WORKANA_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function sessionFilePath(): string {
  return path.join(getWorkanaSessionDir(), 'state.json');
}

export interface WorkanaSessionStatus {
  /** Existe um arquivo de sessão salvo em disco. */
  exists: boolean;
  /** Quando a sessão foi salva pela última vez (login bem-sucedido), se existir. */
  savedAt: string | null;
  /**
   * Resultado da última verificação ativa (abrir uma página autenticada e
   * checar se fomos redirecionados pro /login) — null se nunca verificado
   * nesta sessão do app (verificação é sob demanda, não automática no boot,
   * para não abrir um Chromium sem o usuário pedir).
   */
  lastCheck: { ok: boolean; checkedAt: string } | null;
}

export interface OpenLoginResult {
  ok: boolean;
  error?: string;
}

/**
 * Login manual assistido + persistência da sessão do Playwright para o
 * Workana. NUNCA vê ou guarda usuário/senha — abre um Chromium visível, o
 * humano loga manualmente na própria página do Workana, e quando ele clica
 * "Concluir" (acionado pela UI, via `finishLogin()`) o serviço salva os
 * cookies/localStorage resultantes (`context.storageState()`) em disco.
 *
 * Caminho de sessão já é por-perfil (`getWorkanaSessionDir()` →
 * `profiles/{profileId}/workana-session/`), preparado para a Fase 5 (Perfis
 * Locais) sem precisar migrar nada quando ela chegar.
 */
class WorkanaSessionServiceImpl extends EventEmitter {
  private context: BrowserContext | null = null;
  private opening = false;

  /**
   * Abre o Chromium (sempre visível — login manual exige isso, ignora a
   * config de headless do scraper) na tela de login do Workana e mantém o
   * contexto aberto, aguardando o usuário chamar `finishLogin()`.
   */
  async openLoginWindow(): Promise<OpenLoginResult> {
    if (this.opening || this.context) {
      return { ok: false, error: 'Já existe uma janela de login aberta. Feche-a antes de abrir outra.' };
    }
    this.opening = true;
    try {
      const channel = (getSettingSync('playwright.browser_channel', 'auto') || 'auto') as BrowserChannelPref;
      const browser = await launchBrowser({
        headless: false, // login manual SEMPRE visível, independente da config do scraper
        channel,
        onLog: (msg, level) => ActivityLogger.log({
          type: 'workana_send',
          title: 'Workana — sessão',
          description: msg,
          metadata: { level },
        }),
      });
      this.context = await browser.newContext({ userAgent: WORKANA_UA, locale: 'pt-BR' });
      const page = await this.context.newPage();
      await page.goto(WORKANA_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

      // Se o usuário fechar a janela manualmente (sem clicar "Concluir"),
      // limpamos o estado interno para não achar que a janela ainda existe.
      this.context.on('close', () => {
        this.context = null;
        this.emit('closed');
      });

      ActivityLogger.log({
        type: 'workana_send',
        title: 'Workana — janela de login aberta',
        description: 'Faça login manualmente e clique em "Concluir login" no North Radar.',
      });
      return { ok: true };
    } catch (e) {
      this.context = null;
      const msg = (e as Error).message;
      ActivityLogger.log({ type: 'error', title: 'Workana — falha ao abrir login', description: msg });
      return { ok: false, error: msg };
    } finally {
      this.opening = false;
    }
  }

  /**
   * Chamado pela UI quando o usuário confirma que terminou de logar.
   * Salva `storageState()` em disco e fecha a janela.
   */
  async finishLogin(): Promise<OpenLoginResult> {
    if (!this.context) {
      return { ok: false, error: 'Nenhuma janela de login está aberta.' };
    }
    try {
      const state = await this.context.storageState();
      const dir = getWorkanaSessionDir();
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(sessionFilePath(), JSON.stringify(state, null, 2), 'utf-8');

      await this.context.close().catch(() => undefined);
      this.context = null;

      ActivityLogger.log({
        type: 'workana_send',
        title: 'Workana — sessão salva',
        description: `Sessão salva em ${sessionFilePath()}`,
      });
      return { ok: true };
    } catch (e) {
      const msg = (e as Error).message;
      ActivityLogger.log({ type: 'error', title: 'Workana — falha ao salvar sessão', description: msg });
      return { ok: false, error: msg };
    }
  }

  /** Cancela o login em andamento sem salvar nada — fecha a janela. */
  async cancelLogin(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
    }
  }

  /**
   * Status local (sem abrir navegador): existe arquivo de sessão? quando foi
   * salvo? Não confunde "existe" com "ainda é válida" — para isso, ver
   * `verifySession()`.
   */
  getStatus(): WorkanaSessionStatus {
    const file = sessionFilePath();
    if (!fs.existsSync(file)) {
      return { exists: false, savedAt: null, lastCheck: null };
    }
    const stat = fs.statSync(file);
    return { exists: true, savedAt: stat.mtime.toISOString(), lastCheck: null };
  }

  /**
   * Verificação ATIVA (abre um Chromium headless curto): carrega uma página
   * que exige login e checa se fomos redirecionados pro /login. Usada pela
   * trava #3 do Messenger ("não enviar se não estiver logado") e pelo botão
   * "Verificar sessão" em Settings.
   */
  async verifySession(): Promise<{ ok: boolean; error?: string }> {
    const file = sessionFilePath();
    if (!fs.existsSync(file)) {
      return { ok: false, error: 'Nenhuma sessão salva. Faça login em Settings → Workana.' };
    }
    let browser;
    try {
      const channel = (getSettingSync('playwright.browser_channel', 'auto') || 'auto') as BrowserChannelPref;
      browser = await launchBrowser({ headless: true, channel });
      const context = await browser.newContext({ storageState: file, userAgent: WORKANA_UA, locale: 'pt-BR' });
      const page = await context.newPage();
      // Página que só renderiza de fato (sem redirect) para quem está logado.
      await page.goto('https://www.workana.com/messages', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const url = page.url();
      const stillOnLogin = url.includes(LOGIN_PATH_FRAGMENT);
      await context.close().catch(() => undefined);
      return stillOnLogin
        ? { ok: false, error: 'Sessão expirada — faça login novamente em Settings → Workana.' }
        : { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  /** Remove a sessão salva em disco — "Desconectar" na UI. */
  clearSession(): void {
    const file = sessionFilePath();
    if (fs.existsSync(file)) fs.unlinkSync(file);
    ActivityLogger.log({ type: 'workana_send', title: 'Workana — sessão removida', description: file });
  }

  /** Caminho do arquivo de sessão — usado pelo futuro WorkanaMessengerProvider para abrir contexto autenticado. */
  getSessionFilePath(): string {
    return sessionFilePath();
  }
}

export const WorkanaSessionService = new WorkanaSessionServiceImpl();