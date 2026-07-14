import type { ProviderExecuteOptions, ProviderExecuteResult } from '../providers/types';
import { toProviderError } from './BrowserErrorHandler';
import { BrowserController, isBrowserSession } from './BrowserController';
import { PageController, isPage } from './PageController';
import { NavigationController } from './NavigationController';
import { ScreenshotService } from './ScreenshotService';
import { MessengerLogger } from './MessengerLogger';
import { WorkanaSessionService } from '../WorkanaSessionService';
import type { MessengerError } from './BrowserErrorHandler';

const PROVIDER_ID = 'workana-messenger' as const;

/**
 * Orquestra todos os controllers da camada de automação do Workana Messenger.
 *
 * Responsabilidades:
 * - Montar o grafo de dependências (Logger → Screenshot → BrowserController
 *   → PageController → NavigationController)
 * - Executar o fluxo sequencial
 * - Garantir que o browser seja fechado em qualquer caminho de saída
 * - Retornar sempre um ProviderExecuteResult bem formado
 *
 * Nesta Fase 3: navega até o botão "Enviar proposta" e para.
 * Nenhuma ação irreversível é executada.
 */
export class MessengerRuntime {
  /**
   * Ponto de entrada chamado pelo WorkanaMessengerProvider.execute().
   *
   * `opts.prompt` = texto da proposta (vindo do Pitch no handoff futuro)
   *                 Nesta fase não é usado — apenas logado para rastreabilidade.
   * `opts.context` = { agentSlug, runId } para correlação de logs.
   *
   * O campo `source_url` da oportunidade deve ser passado via
   * `opts.context` como `opportunityUrl` — veja WorkanaMessengerProvider.
   */
  async run(opts: ProviderExecuteOptions & { opportunityUrl: string }): Promise<ProviderExecuteResult> {
    const start = Date.now();
    const logger = new MessengerLogger(opts.onChunk);
    const screenshot = new ScreenshotService(logger);
    const browserCtrl = new BrowserController(logger);
    const pageCtrl = new PageController(logger);

    logger.info('runtime', `Iniciando Workana Messenger (runId: ${opts.context?.runId ?? 'manual'}, agente: ${opts.context?.agentSlug ?? '?'})`);
    logger.info('runtime', `URL da vaga: ${opts.opportunityUrl}`);
    logger.info('runtime', `Fase 3 — navegação até o botão "Enviar proposta" (sem envio).`);

    // Obtém o caminho da sessão salva
    const sessionFilePath = WorkanaSessionService.getSessionFilePath();

    // 1. Abre o browser com a sessão salva
    const sessionOrError = await browserCtrl.open(sessionFilePath);
    if (!isBrowserSession(sessionOrError)) {
      return this.failure(sessionOrError, logger, start);
    }
    const { browser, context } = sessionOrError;

    // Garante fechamento em qualquer caminho de saída
    try {
      // 2. Abre nova página
      const pageOrError = await pageCtrl.newPage(context);
      if (!isPage(pageOrError)) {
        return this.failure(pageOrError, logger, start);
      }
      const page = pageOrError;

      const nav = new NavigationController(page, pageCtrl, screenshot, logger);

      // 3. Verifica login
      const loginErr = await nav.verifyLogin();
      if (loginErr) return this.failure(loginErr, logger, start);

      // 4. Abre a vaga
      const openErr = await nav.openProject(opts.opportunityUrl);
      if (openErr) return this.failure(openErr, logger, start);

      // 5. Valida que a página carregou corretamente
      const validateErr = await nav.validateProjectPage();
      if (validateErr) return this.failure(validateErr, logger, start);

      // 6. Localiza o botão "Enviar proposta" (sem clicar)
      const buttonOrError = await nav.locateSubmitButton();
      if (typeof buttonOrError !== 'string') {
        return this.failure(buttonOrError, logger, start);
      }

      // Sucesso da Fase 3
      logger.info('runtime', '✅ Fase 3 concluída: navegação até o botão "Enviar proposta" realizada com sucesso. Nenhuma proposta foi enviada.');

      const durationMs = Date.now() - start;
      const output = [
        logger.toMarkdown(),
        `\n---\n`,
        `**Resultado:** Fase 3 OK — botão "Enviar proposta" localizado (seletor: \`${buttonOrError}\`).`,
        `**Duração:** ${durationMs}ms`,
        `**Nenhuma proposta foi enviada.** O envio será implementado na Fase 4.`,
      ].join('\n');

      return {
        ok: true,
        output,
        meta: { provider: PROVIDER_ID, model: opts.model, durationMs },
      };
    } finally {
      await browserCtrl.close({ browser, context });
    }
  }

  private failure(err: MessengerError, logger: MessengerLogger, start: number): ProviderExecuteResult {
    const durationMs = Date.now() - start;
    logger.error('runtime', `Execução encerrada com falha: [${err.code}] ${err.message}`);
    return {
      ok: false,
      output: logger.toMarkdown(),
      meta: { provider: PROVIDER_ID, model: 'workana', durationMs },
      error: toProviderError(err),
    };
  }
}