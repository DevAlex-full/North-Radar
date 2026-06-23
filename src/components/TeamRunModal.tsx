import { AnimatePresence, motion } from 'framer-motion';
import { Check, FolderOpen, X } from 'lucide-react';
import { useRadarStore } from '../store/useRadarStore';
import { api } from '../ipc/api';
import { cn } from '../lib/utils';

/**
 * Overlay com o RESUMO FINAL da execução do time de agentes.
 *
 * Não bloqueia mais a tela durante a execução em si — quem mostra
 * PRD → ADR → Pitch trabalhando em tempo real agora é a página Pipeline
 * (ver src/pages/PipelinePage.tsx, conectada a useRadarStore.agentStages).
 * Este componente só aparece quando `teamResult` existe, ou seja, depois que
 * a execução termina — exatamente como um resumo, nunca como bloqueio.
 */
export function TeamRunModal() {
  const result = useRadarStore((s) => s.teamResult);
  const dismiss = useRadarStore((s) => s.dismissTeamResult);

  const show = !!result;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-black/45 backdrop-blur-sm p-6"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="bg-card rounded-3xl border border-border shadow-cardHover px-12 py-10 w-full max-w-[460px] flex flex-col items-center gap-5"
          >
            <ResultView result={result!} onClose={dismiss} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ResultView({
  result,
  onClose,
}: {
  result: NonNullable<ReturnType<typeof useRadarStore.getState>['teamResult']>;
  onClose: () => void;
}) {
  const count = result.written.length;
  // 3 estados reais (ver TeamPipeline.ts): 'failed' só quando nenhum documento
  // foi gravado — ter 1+ erro de agente com documento gerado é "ressalva", não falha.
  const failed = result.status === 'failed';
  const hasWarnings = result.status === 'success_with_warnings';

  const openFolder = async () => {
    await api.app.openWorkspaceDir('oportunidades');
  };

  return (
    <>
      {/* Animação de check (ou alerta, se falha real) */}
      <div className="relative w-20 h-20 grid place-items-center">
        {/* Onda que expande e some */}
        <motion.span
          className={cn(
            'absolute w-16 h-16 rounded-full',
            failed ? 'bg-rose/20' : hasWarnings ? 'bg-amber/30' : 'bg-green/30',
          )}
          initial={{ scale: 0.6, opacity: 0.7 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
        {/* Círculo com pop (spring) */}
        <motion.div
          className={cn(
            'relative w-16 h-16 rounded-full grid place-items-center',
            failed ? 'bg-[#fee2e2] text-rose' : hasWarnings ? 'bg-amber-soft text-amber' : 'bg-green-soft text-green',
          )}
          initial={{ scale: 0, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 15 }}
        >
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.16, type: 'spring', stiffness: 320, damping: 14 }}
          >
            {failed ? <X size={32} strokeWidth={3} /> : <Check size={34} strokeWidth={3} />}
          </motion.span>
        </motion.div>
      </div>

      <div className="text-center">
        <div className="text-[16px] font-bold text-primary">
          {failed ? 'Pipeline falhou' : hasWarnings ? 'Concluído com ressalvas' : 'Time concluído'}
        </div>
        {failed ? (
          <p className="text-[13px] text-rose mt-1">
            {result.errors[0] ?? 'Nenhum documento foi gerado.'}
          </p>
        ) : (
          <>
            <p className="text-[13px] text-secondary mt-1">
              {count} documento{count === 1 ? '' : 's'} gerado{count === 1 ? '' : 's'} em{' '}
              <code className="font-mono text-[12px]">oportunidades/</code>.
            </p>
            {hasWarnings && (
              <p className="text-[12px] text-amber mt-1.5">
                {result.errors.length} aviso(s) — registrados no markdown de cada vaga.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 w-full justify-center pt-1">
        {!failed && (
          <button
            onClick={openFolder}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-purple text-white text-[13.5px] font-semibold hover:opacity-90 transition"
          >
            <FolderOpen size={15} /> Abrir pasta
          </button>
        )}
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border bg-white text-[13.5px] font-medium text-primary hover:bg-[#f8f8fb] transition"
        >
          <X size={15} /> Fechar
        </button>
      </div>
    </>
  );
}