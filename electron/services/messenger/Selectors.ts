/**
 * Seletores DOM do Workana usados pela camada de automação do Messenger.
 *
 * ÚNICO ponto de verdade para todos os seletores — quando o Workana atualizar
 * o layout, só este arquivo precisa mudar.
 *
 * Verificado contra HTML real capturado em 12/07/2026.
 */
export const Selectors = {
  /**
   * Indicadores de que o usuário está LOGADO.
   */
  auth: {
    /** Avatar/menu do usuário no header — presente em todas as páginas logadas. */
    userMenu: '.navbar-user, .nav__userthumbnail, [class*="user-menu"]',
    /** Formulário de login — se presente, NÃO está logado. */
    loginForm: 'form[action*="login"], #login-form',
    /** URL path que indica redirect para login. */
    loginPath: '/login',
  },

  /**
   * Seletores de CAPTCHA.
   */
  captcha: {
    recaptchaIframe: 'iframe[src*="recaptcha"]',
    hcaptchaIframe: 'iframe[src*="hcaptcha"]',
    turnstileIframe: 'iframe[src*="challenges.cloudflare.com"]',
    challengeBlock: '[class*="challenge"], [id*="captcha"], [data-captcha]',
  },

  /**
   * Cookie banner (OneTrust) — dispensado antes de interagir com a página.
   * Não bloqueia o HTML SSR, mas pode cobrir elementos em screenshots.
   */
  cookieBanner: {
    acceptButton: '#onetrust-accept-btn-handler',
    banner: '#onetrust-banner-sdk',
  },

  /**
   * Página de DETALHE DE UMA VAGA.
   *
   * Verificado no HTML real de 12/07/2026:
   * - Botão principal tem id="bid_button" e href="/messages/bid/{slug}"
   * - Texto visível: "Fazer uma proposta" (PT), "Make a proposal" (EN), "Hacer una propuesta" (ES)
   * - Estrutura: <a id="bid_button" class="btn btn-primary btn-xs-fixed">
   */
  projectDetail: {
    /** Título do projeto — confirma que a página carregou (SSR). */
    title: 'h1.title, h1.h3.title, .project-view-v3 h1',

    /**
     * Botão principal "Fazer/Enviar/Hacer uma proposta".
     *
     * Estratégia em ordem de confiabilidade:
     * 1. ID semântico estável (mais confiável, identificado no HTML real)
     * 2. href contendo /messages/bid/ (padrão estável de URL)
     * 3. href contendo /bid/ (variante mais curta)
     * 4. role + texto (fallback semântico multi-idioma)
     * 5. classe btn-primary dentro do bloco de ação da vaga (fallback estrutural)
     */
    submitProposalSelectors: [
      // 1. ID estável — identificado no HTML real de 12/07/2026
      '#bid_button',
      // 2. href com padrão /messages/bid/
      'a[href*="/messages/bid/"]',
      // 3. href com /bid/ genérico
      'a[href*="/bid/"]',
      // 4. Texto em PT/EN/ES via :has-text não é suportado pelo $ — usamos
      //    button ou a com data-testid se o Workana migrar para React
      'a[data-testid="bid-button"], button[data-testid="bid-button"]',
      // 5. Fallback estrutural: btn-primary dentro do bloco CTA da vaga
      '.block-cta .btn-primary',
      'article.block-cta a.btn-primary',
    ],

    /**
     * Indicadores de que JÁ enviou proposta para esta vaga.
     * O Workana substitui o botão por uma mensagem ou link diferente.
     */
    alreadyProposedSelectors: [
      // Link para "Ver minha proposta" (aparece quando já enviou)
      'a[href*="/proposals/"]',
      'a[href*="/bid/show"]',
      '[class*="proposal-sent"]',
      '[data-testid="already-applied"]',
      // Texto "Sua proposta foi enviada" ou similar — verificar pelo texto
      // em NavigationController com page.textContent()
    ],

    /**
     * Indicadores de vaga FECHADA / encerrada.
     */
    projectClosedSelectors: [
      '.label.closed',
      '.label.cancelled',
      '[class*="project-closed"]',
      '[data-testid="project-closed"]',
    ],

    /**
     * Status labels visíveis no topo da página de vaga.
     * Verificados no HTML real: "Analisando propostas" (aberta), etc.
     */
    statusLabel: '.pry.label, .label.rounded',

    /** Vaga não encontrada / removida. */
    notAvailableSelectors: [
      '[class*="not-found"]',
      '[class*="unavailable"]',
      '[data-testid="project-not-found"]',
      'h1[class*="404"]',
    ],
  },
} as const;