import { WorkanaSessionService } from '../WorkanaSessionService';
import type { AgentProvider, ProviderExecuteOptions, ProviderExecuteResult } from './types';

/**
 * Provider do Workana Messenger Agent.
 *
 * Natureza diferente dos outros 4 providers: não chama LLM nenhum — quando
 * implementado por completo, vai abrir o projeto no Workana com a sessão
 * salva (ver WorkanaSessionService) e enviar a proposta recebida como
 * `prompt` (o texto final produzido pelo Pitch Agent no handoff).
 *
 * NESTA ETAPA: existe só para a Provider Layer e o Studio reconhecerem
 * 'workana-messenger' como provider válido — `execute()` deliberadamente NÃO
 * envia nenhuma proposta ainda (isso é trabalho de uma etapa futura,
 * acompanhado das 8 travas de segurança definidas no plano). Chamar
 * `execute()` agora sempre retorna um erro claro e estruturado, nunca um
 * envio real nem uma simulação de sucesso — para não criar uma falsa
 * impressão de que o envio já funciona.
 */
export class WorkanaMessengerProviderImpl implements AgentProvider {
  readonly id = 'workana-messenger' as const;

  /**
   * Consultivo apenas: reflete se existe sessão salva do Workana (não abre
   * navegador, não verifica se ainda é válida — isso é `verifySession()` no
   * WorkanaSessionService, chamado explicitamente pela trava de envio numa
   * etapa futura, não aqui).
   */
  async isConfigured(): Promise<boolean> {
    return WorkanaSessionService.getStatus().exists;
  }

  async execute(opts: ProviderExecuteOptions): Promise<ProviderExecuteResult> {
    const hasSession = WorkanaSessionService.getStatus().exists;
    return {
      ok: false,
      output: '',
      meta: { provider: this.id, model: opts.model, durationMs: 0 },
      error: {
        message: hasSession
          ? 'Workana Messenger Agent: envio de proposta ainda não implementado nesta etapa (apenas a sessão de login está disponível).'
          : 'Workana Messenger Agent: nenhuma sessão do Workana salva. Configure em Settings → Workana — e o envio em si ainda não está implementado nesta etapa.',
        kind: 'unknown',
      },
    };
  }
}

export const WorkanaMessengerProvider = new WorkanaMessengerProviderImpl();