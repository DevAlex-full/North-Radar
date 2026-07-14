import { WorkanaSessionService } from '../WorkanaSessionService';
import { MessengerRuntime } from '../messenger/MessengerRuntime';
import type { AgentProvider, ProviderExecuteOptions, ProviderExecuteResult } from './types';

/**
 * Provider do Workana Messenger Agent.
 *
 * Natureza diferente dos outros 4 providers: não chama LLM nenhum — abre o
 * projeto no Workana com a sessão salva (WorkanaSessionService) e executa a
 * automação via MessengerRuntime.
 *
 * O `prompt` recebido é o texto final da proposta (saída do Pitch Agent no
 * handoff). O `output` é um log estruturado + confirmação do resultado.
 * O `context.opportunityUrl` é a URL da vaga a ser aberta (passado pelo
 * TeamPipeline quando o provider é 'workana-messenger').
 *
 * Fase 3: navega até o botão "Enviar proposta" e para.
 * Nenhuma proposta é enviada ainda.
 */
export class WorkanaMessengerProviderImpl implements AgentProvider {
  readonly id = 'workana-messenger' as const;
  private readonly runtime = new MessengerRuntime();

  /**
   * Consultivo: reflete se existe sessão salva (não abre navegador).
   * A verificação ativa de sessão (headless + check de URL) fica em
   * WorkanaSessionService.verifySession(), chamada pelas travas de segurança
   * que serão adicionadas na Fase 4.
   */
  async isConfigured(): Promise<boolean> {
    return WorkanaSessionService.getStatus().exists;
  }

  async execute(opts: ProviderExecuteOptions): Promise<ProviderExecuteResult> {
    const opportunityUrl = opts.context?.opportunityUrl;

    if (!opportunityUrl) {
      return {
        ok: false,
        output: '',
        meta: { provider: this.id, model: opts.model, durationMs: 0 },
        error: {
          message:
            'Workana Messenger: URL da vaga não fornecida. ' +
            'O campo `context.opportunityUrl` deve ser preenchido pelo TeamPipeline com o `source_url` da oportunidade.',
          kind: 'unknown',
        },
      };
    }

    return this.runtime.run({ ...opts, opportunityUrl });
  }
}

export const WorkanaMessengerProvider = new WorkanaMessengerProviderImpl();