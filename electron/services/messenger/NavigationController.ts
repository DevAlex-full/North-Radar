import { type Page } from 'playwright';
import type { MessengerLogger } from './MessengerLogger';
import type { PageController } from './PageController';
import type { ScreenshotService } from './ScreenshotService';
import { messengerError, type MessengerError } from './BrowserErrorHandler';
import { Selectors } from './Selectors';

const WORKANA_BASE = 'https://www.workana.com';
/** Página autenticada usada para verificar sessão sem abrir uma vaga. */
const AUTH_CHECK_URL = `${WORKANA_BASE}/messages`;

/**
 * Fluxo de navegação específico do domínio Workana.
 *
 * Responsabilidades (Fase 3 — sem envio):
 * 1. Dispensar cookie banner (não bloqueia HTML SSR, mas melhora screenshots)
 * 2. Verificar que o usuário está logado
 * 3. Abrir a URL da vaga
 * 4. Validar que a página carregou e identificar o estado da vaga
 * 5. Localizar o botão de proposta (sem clicar)
 *
 * Seletores verificados contra HTML real capturado em 12/07/2026.
 * Botão real: <a id="bid_button" href="/messages/bid/{slug}" class="btn btn-primary">
 */
export class NavigationController {
  constructor(
    private readonly page: Page,
    private readonly pageCtrl: PageController,
    private readonly screenshot: ScreenshotService,
    private readonly logger: MessengerLogger,
  ) {}

  /** Dispensar o cookie banner do OneTrust — melhora screenshots e evita cobertura visual. */
  private async dismissCookieBanner(): Promise<void> {
    try {
      const banner = await this.page.$(Selectors.cookieBanner.banner);
      if (!banner) return;
      const acceptBtn = await this.page.$(Selectors.cookieBanner.acceptButton);
      if (acceptBtn) {
        await acceptBtn.click();
        await this.page.waitForTimeout(600);
        this.logger.info('cookie-banner', 'Cookie banner dispensado.');
      }
    } catch {
      // Cookie banner é cosmético — nunca bloqueia o fluxo
    }
  }

  /**
   * Etapa 1: verifica que a sessão está ativa.
   * Navega para uma página autenticada e checa se não houve redirect para /login.
   */
  async verifyLogin(): Promise<null | MessengerError> {
    this.logger.info('auth', `Verificando sessão em ${AUTH_CHECK_URL}…`);

    const navErr = await this.pageCtrl.navigate(this.page, AUTH_CHECK_URL);
    if (navErr) return navErr;

    if (await this.pageCtrl.hasCaptcha(this.page)) {
      this.logger.warn('auth', 'Captcha detectado na verificação de sessão.');
      await this.screenshot.capture(this.page, 'captcha-auth');
      return messengerError('captcha_detected', 'Captcha detectado ao verificar sessão. O Workana requer verificação humana antes de prosseguir.');
    }

    if (this.pageCtrl.urlContains(this.page, Selectors.auth.loginPath)) {
      this.logger.error('auth', 'Sessão expirada — redirecionado para /login.');
      await this.screenshot.capture(this.page, 'session-expired');
      return messengerError('session_expired', 'Sessão do Workana expirada. Faça login novamente em Settings → Workana.');
    }

    this.logger.info('auth', 'Sessão válida — usuário logado.');
    return null;
  }

  /**
   * Etapa 2: abre a URL da vaga com validação de segurança.
   */
  async openProject(projectUrl: string): Promise<null | MessengerError> {
    let parsed: URL;
    try {
      parsed = new URL(projectUrl);
    } catch {
      return messengerError('project_not_found', `URL inválida: "${projectUrl}"`);
    }

    if (!parsed.hostname.endsWith('workana.com')) {
      return messengerError(
        'project_not_found',
        `URL não é do Workana: "${projectUrl}". Apenas URLs de workana.com são aceitas.`,
      );
    }

    this.logger.info('navigation', `Abrindo vaga: ${projectUrl}`);
    const navErr = await this.pageCtrl.navigate(this.page, projectUrl);
    if (navErr) return navErr;

    await this.dismissCookieBanner();

    if (await this.pageCtrl.hasCaptcha(this.page)) {
      this.logger.warn('navigation', 'Captcha detectado na página da vaga.');
      await this.screenshot.capture(this.page, 'captcha-project');
      return messengerError('captcha_detected', 'Captcha detectado na página da vaga. O Workana requer verificação humana.');
    }

    if (this.pageCtrl.urlContains(this.page, Selectors.auth.loginPath)) {
      this.logger.error('navigation', 'Sessão expirada durante navegação para a vaga.');
      await this.screenshot.capture(this.page, 'session-expired-navigation');
      return messengerError('session_expired', 'Sessão expirou durante a navegação. Faça login novamente.');
    }

    this.logger.info('navigation', `Página carregada: ${this.pageCtrl.currentUrl(this.page)}`);
    return null;
  }

  /**
   * Etapa 3: valida o estado da página da vaga com erros distintos por caso.
   *
   * Ordem de verificação (do mais específico para o mais genérico):
   * 1. Vaga não encontrada (404)
   * 2. Vaga fechada/cancelada
   * 3. Proposta já enviada
   * 4. Título carregou (vaga disponível)
   */
  async validateProjectPage(): Promise<null | MessengerError> {
    this.logger.info('validation', 'Validando estado da página do projeto…');

    // Lê o status label para logging
    try {
      const statusEl = await this.page.$(Selectors.projectDetail.statusLabel);
      if (statusEl) {
        const statusText = await statusEl.textContent();
        this.logger.info('validation', `Status da vaga: "${statusText?.trim()}"`);
      }
    } catch { /* não crítico */ }

    // 1. Vaga não encontrada
    const notAvail = await this.pageCtrl.findFirstVisible(
      this.page, [...Selectors.projectDetail.notAvailableSelectors], 3_000,
    );
    if (notAvail) {
      await this.screenshot.captureWithHtml(this.page, 'project-not-available');
      return messengerError('project_unavailable', 'Vaga não encontrada ou indisponível (404/removida).');
    }

    // 2. Vaga fechada
    const closed = await this.pageCtrl.findFirstVisible(
      this.page, [...Selectors.projectDetail.projectClosedSelectors], 3_000,
    );
    if (closed) {
      await this.screenshot.capture(this.page, 'project-closed');
      return messengerError('project_unavailable', 'Este projeto está fechado e não aceita mais propostas.');
    }

    // 3. Proposta já enviada — verifica href e texto
    const alreadyProposed = await this.pageCtrl.findFirstVisible(
      this.page, [...Selectors.projectDetail.alreadyProposedSelectors], 3_000,
    );
    if (alreadyProposed) {
      await this.screenshot.capture(this.page, 'already-proposed');
      return messengerError('already_proposed', 'Você já enviou uma proposta para este projeto.');
    }

    // 4. Título presente = vaga carregou (SSR — título está no HTML inicial)
    const titleFound = await this.pageCtrl.waitForSelector(
      this.page, Selectors.projectDetail.title, 8_000,
    );
    if (!titleFound) {
      await this.screenshot.captureWithHtml(this.page, 'project-title-missing');
      return messengerError(
        'project_not_found',
        'Título do projeto não encontrado na página. O layout pode ter mudado ou a vaga não carregou.',
      );
    }

    this.logger.info('validation', 'Página do projeto validada: vaga disponível.');
    return null;
  }

  /**
   * Etapa 4: localiza o botão de proposta sem clicar.
   *
   * Estratégia baseada no HTML real de 12/07/2026:
   * - Elemento: <a id="bid_button" href="/messages/bid/{slug}" class="btn btn-primary">
   * - Texto: "Fazer uma proposta" (PT) / "Make a proposal" (EN) / "Hacer una propuesta" (ES)
   *
   * Tenta cada seletor em ordem de confiabilidade, logando qual funcionou.
   * Retorna o seletor encontrado ou MessengerError.
   */
  async locateSubmitButton(): Promise<string | MessengerError> {
    this.logger.info('button-scan', 'Procurando botão de proposta…');

    const selectors = Selectors.projectDetail.submitProposalSelectors;

    for (const sel of selectors) {
      try {
        const el = await this.page.$(sel);
        if (!el) continue;

        const visible = await el.isVisible();
        if (!visible) {
          this.logger.info('button-scan', `Seletor "${sel}" encontrado mas não visível — tentando próximo.`);
          continue;
        }

        // Loga o texto e href para confirmação
        const text = await el.textContent().catch(() => '');
        const href = await el.getAttribute('href').catch(() => '');

        this.logger.info('button-scan', `✅ Botão encontrado: seletor="${sel}" texto="${text?.trim()}" href="${href}"`);
        await this.screenshot.capture(this.page, 'button-found');

        return sel;
      } catch (e) {
        this.logger.warn('button-scan', `Erro ao tentar seletor "${sel}": ${(e as Error).message}`);
      }
    }

    // Nenhum seletor funcionou — tenta fallback por texto visível
    this.logger.warn('button-scan', 'Nenhum seletor padrão funcionou. Tentando fallback por texto…');
    const textFallback = await this.locateByText();
    if (textFallback) {
      this.logger.info('button-scan', `✅ Botão encontrado via texto: "${textFallback}"`);
      await this.screenshot.capture(this.page, 'button-found-text-fallback');
      return `text:${textFallback}`;
    }

    await this.screenshot.captureWithHtml(this.page, 'button-not-found');
    return messengerError(
      'button_not_found',
      'Botão de proposta não encontrado com nenhum seletor conhecido. ' +
      'O layout do Workana pode ter sido atualizado. Verifique o HTML salvo em workana-screenshots/.',
    );
  }

  /**
   * Fallback: procura por texto visível de botão de proposta (PT/EN/ES).
   * Usa page.evaluate para varrer todos os elementos clicáveis.
   */
  private async locateByText(): Promise<string | null> {
    // page.evaluate roda no browser — usamos string de função para evitar que
    // o compilador TS (modo Node) reclame de globals de DOM (document).
    try {
      const keywords = [
        'fazer uma proposta', 'enviar proposta',
        'make a proposal', 'submit proposal',
        'hacer una propuesta', 'enviar propuesta',
      ];
      const fn = new Function('kws', `
        const candidates = Array.from(document.querySelectorAll('a, button'));
        for (const el of candidates) {
          const text = (el.textContent || '').toLowerCase().trim();
          if (kws.some(function(kw) { return text.includes(kw); })) return text;
        }
        return null;
      `);
      return await this.page.evaluate(fn as (kws: string[]) => string | null, keywords);
    } catch {
      return null;
    }
  }
}