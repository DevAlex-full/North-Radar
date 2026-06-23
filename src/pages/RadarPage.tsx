import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Pencil, Plus, Radar, Search, RotateCw, Users, X } from 'lucide-react';
import { cn, classifyMatchScore, type MatchTier } from '../lib/utils';
import { useRadarStore } from '../store/useRadarStore';
import { api } from '../ipc/api';
import { TagChip } from '../components/TagChip';
import { AgentCard } from '../components/AgentCard';
import { OpportunityRow } from '../components/OpportunityRow';
import { ActivityCard } from '../components/ActivityCard';
import { EditTagsModal } from '../components/EditTagsModal';

interface RadarPageProps {
  onNavigate?: (page: 'radar' | 'agentes' | 'pipeline' | 'tasks' | 'settings') => void;
  onOpenAgent?: (agentId: number) => void;
}

export function RadarPage({ onNavigate, onOpenAgent }: RadarPageProps = {}) {
  const {
    agents, tags, sites, activity, freelas, runningTeam,
    loadAll, refreshTags, refreshFreelas: refreshFreelasStore, runTeam,
  } = useRadarStore();
  const [editingTags, setEditingTags] = useState(false);
  // Oportunidades lidas dos arquivos JSON em {workspace}/freelas/ vivem na store
  // (compartilhadas com o botão "Executar varredura agora" da TopBar), já
  // ordenadas por % de match. Aqui só cuidamos de busca e paginação.
  const [freelasPage, setFreelasPage] = useState(0);
  const [freelasQuery, setFreelasQuery] = useState('');
  // Filtro rápido por classificação (badge Alta/Média/Baixa/Evitar) e
  // ordenação — atuam sobre a lista já carregada em `freelas`, sem tocar
  // no MatchEngine nem refazer a leitura dos JSONs.
  const [tierFilter, setTierFilter] = useState<MatchTier | 'todos'>('todos');
  const [sortBy, setSortBy] = useState<'recentes' | 'match' | 'orcamento'>('match');
  const [refreshingFreelas, setRefreshingFreelas] = useState(false);
  // IDs das oportunidades selecionadas (checkbox) para "Executar agentes".
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const FREELAS_PAGE_SIZE = 5;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runTeamOnSelected = () => {
    const chosen = freelas
      .filter((o) => selectedIds.has(o.id))
      .map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        budget_min: o.budget_min,
        budget_max: o.budget_max,
        currency: o.currency,
        detected_tags: o.detected_tags,
        source_url: o.source_url,
      }));
    if (chosen.length === 0) return;
    // Vai direto para a Pipeline (sem tela intermediária) — é lá que o
    // usuário acompanha PRD → ADR → Pitch em tempo real. O TeamRunModal
    // não bloqueia mais a tela durante a execução (ver TeamRunModal.tsx);
    // só aparece no final, com o resumo.
    onNavigate?.('pipeline');
    runTeam(chosen);
  };

  // Filtra por título ou tags — match case-insensitive em substring.
  // Depois aplica o filtro de classificação (badge) e a ordenação escolhida.
  // `freelas` já vem ordenada por match (desc) do store — aqui só reordenamos
  // a cópia já filtrada, sem nenhuma chamada ao MatchEngine/IPC.
  const filteredFreelas = useMemo(() => {
    const q = freelasQuery.trim().toLowerCase();
    let list = freelas;

    if (q) {
      list = list.filter((o) => {
        const title = (o.title ?? '').toLowerCase();
        if (title.includes(q)) return true;
        let opTags: string[] = [];
        try {
          const parsed = JSON.parse((o.detected_tags as string) ?? '[]');
          if (Array.isArray(parsed)) opTags = parsed.map(String);
        } catch {
          /* ignora */
        }
        return opTags.some((t) => t.toLowerCase().includes(q));
      });
    }

    if (tierFilter !== 'todos') {
      list = list.filter((o) => classifyMatchScore(o.match_score).tier === tierFilter);
    }

    if (sortBy !== 'match') {
      list = [...list].sort((a, b) => {
        if (sortBy === 'recentes') {
          const av = a.found_at ? new Date(a.found_at as string).getTime() : 0;
          const bv = b.found_at ? new Date(b.found_at as string).getTime() : 0;
          return bv - av;
        }
        // orcamento: usa o maior valor disponível (max, ou min como fallback) por vaga.
        const aBudget = a.budget_max ?? a.budget_min ?? 0;
        const bBudget = b.budget_max ?? b.budget_min ?? 0;
        return bBudget - aBudget;
      });
    }
    // sortBy === 'match' não precisa reordenar — `freelas` já chega assim do store.

    return list;
  }, [freelas, freelasQuery, tierFilter, sortBy]);

  // Reseta paginação ao mudar busca, filtro de classificação ou ordenação.
  useEffect(() => {
    setFreelasPage(0);
  }, [freelasQuery, tierFilter, sortBy]);

  const refreshFreelas = async () => {
    if (refreshingFreelas) return;
    setRefreshingFreelas(true);
    try {
      await refreshFreelasStore();
      setFreelasPage(0);
    } catch (e) {
      console.warn('[RadarPage] refreshFreelas falhou:', e);
    } finally {
      setRefreshingFreelas(false);
    }
  };

  // Abre {workspace}/freelas/ no Explorador — acesso rápido aos JSONs das vagas.
  const openFreelasFolder = async () => {
    const r = await api.opportunities.openFreelasDir();
    if (!r.ok) console.warn('[RadarPage] abrir pasta de freelas falhou:', r.error);
  };

  // Paginação derivada — compartilhada entre header (botões) e footer (contador).
  const freelasTotalPages = Math.max(1, Math.ceil(filteredFreelas.length / FREELAS_PAGE_SIZE));
  const canPrevFreelas = freelasPage > 0;
  const canNextFreelas = freelasPage + 1 < freelasTotalPages;

  useEffect(() => {
    loadAll();
    refreshFreelasStore()
      .then(() => setFreelasPage(0))
      .catch((e) => console.warn('[RadarPage] leitura de freelas falhou:', e));
    // IPC listeners (onRunEvent, onActivityEvent) foram movidos para AppShell
    // para funcionar em qualquer aba, não só no Radar.
  }, [loadAll, refreshFreelasStore]);

  const siteById = (id: number | null) =>
    id == null ? undefined : sites.find((s) => s.id === id);

  return (
    <div className="grid gap-7 px-8 py-7 grid-cols-[minmax(0,1fr)_360px] overflow-y-auto h-full">
      {/* === Main column === */}
      <div className="flex flex-col gap-6 min-w-0">
        {/* Radar header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-soft text-purple grid place-items-center">
            <Radar size={18} strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-primary leading-tight">Radar ativo</h1>
            <p className="text-[14px] text-secondary mt-1">
              Monitorando oportunidades que combinam com o que você procura.
            </p>
          </div>
        </div>

        {/* Tags card */}
        <section className="bg-card rounded-2xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-secondary uppercase tracking-wider">Tags monitoradas</h2>
            <button
              onClick={() => setEditingTags(true)}
              className="text-[12.5px] font-medium text-purple flex items-center gap-1 hover:opacity-80"
            >
              Editar tags <Pencil size={12} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <TagChip key={t.id} variant="purple">
                {t.name}
              </TagChip>
            ))}
            <button
              onClick={() => setEditingTags(true)}
              aria-label="Adicionar tag"
              className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-purple-ring text-purple hover:bg-purple-softer transition"
            >
              <Plus size={14} />
            </button>
          </div>
        </section>

        {/* Agents */}
        <section>
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[18px] font-bold text-primary">Time de Agentes Ativo</h2>
              <p className="text-[13px] text-secondary mt-0.5">
                Ordem de execução do seu time de agentes
              </p>
            </div>
            <button
              onClick={() => onNavigate?.('agentes')}
              className="text-[13px] font-medium text-purple hover:opacity-80"
            >
              Ver detalhes →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-5">
            {agents.filter((a) => a.enabled !== false).map((a, i) => (
              <AgentCard
                key={a.id}
                agent={a}
                order={i + 1}
                onOpenEditor={() => onOpenAgent?.(a.id)}
              />
            ))}
          </div>
        </section>

        {/* Recent opportunities — fonte: arquivos JSON em {workspace}/freelas/ */}
        <section className="bg-card rounded-2xl border border-border p-5 shadow-card">
          <div className="flex flex-col gap-2.5 mb-3">
            {/* Linha 1: título + ordenação (esquerda) — sempre visível e clicável,
                nunca disputa espaço com o resto dos controles. */}
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-[16px] font-semibold text-primary shrink-0">Oportunidades recentes</h2>
              <span className="text-[11.5px] font-medium text-secondary truncate">
                {sortBy === 'match' ? 'ordenadas por match' : sortBy === 'recentes' ? 'ordenadas por mais recentes' : 'ordenadas por maior orçamento'}
              </span>
            </div>

            {/* Linha 2: ações — "Executar agentes" isolado à esquerda (não
                encolhe), busca/refresh/paginação à direita. flex-wrap garante
                que nada se sobreponha em larguras menores: o grupo da direita
                quebra pra uma nova linha antes de espremer o botão. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Executar time de agentes sobre as vagas selecionadas */}
              <button
                onClick={runTeamOnSelected}
                disabled={selectedIds.size === 0 || runningTeam}
                title="Passa cada vaga selecionada por todos os agentes (handoff) e gera um markdown em oportunidades/"
                className={cn(
                  'h-8 px-3 rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 shrink-0 transition',
                  selectedIds.size > 0 && !runningTeam
                    ? 'bg-purple text-white hover:opacity-90'
                    : 'bg-[#f5f5f7] text-muted cursor-not-allowed',
                )}
              >
                <Users size={14} />
                {runningTeam
                  ? 'Executando…'
                  : `Executar agentes${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
              </button>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Filtro rápido por classificação (Alta/Média/Baixa/Evitar) */}
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value as MatchTier | 'todos')}
                  aria-label="Filtrar por classificação"
                  title="Filtrar por classificação"
                  className="h-8 px-2 rounded-lg border border-border bg-white text-[12.5px] text-primary outline-none focus:border-purple-ring shrink-0"
                >
                  <option value="todos">Todos</option>
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                  <option value="evitar">Evitar</option>
                </select>
                {/* Ordenação */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'recentes' | 'match' | 'orcamento')}
                  aria-label="Ordenar por"
                  title="Ordenar por"
                  className="h-8 px-2 rounded-lg border border-border bg-white text-[12.5px] text-primary outline-none focus:border-purple-ring shrink-0"
                >
                  <option value="match">Maior match</option>
                  <option value="recentes">Recentes</option>
                  <option value="orcamento">Maior orçamento</option>
                </select>
                {/* Busca por título ou tag */}
                <div className="relative w-full max-w-[280px] min-w-[160px] flex-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={freelasQuery}
                    onChange={(e) => setFreelasQuery(e.target.value)}
                    placeholder="Buscar por nome ou tag…"
                    className="w-full h-8 pl-7 pr-7 rounded-lg border border-border bg-white text-[12.5px] outline-none focus:border-purple-ring"
                  />
                  {freelasQuery && (
                    <button
                      onClick={() => setFreelasQuery('')}
                      aria-label="Limpar busca"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md grid place-items-center text-muted hover:text-primary hover:bg-[#f5f5f7] transition"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {/* Refresh: re-lê os JSONs do workspace */}
                <button
                  onClick={refreshFreelas}
                  disabled={refreshingFreelas}
                  aria-label="Recarregar oportunidades dos JSONs"
                  title="Recarregar oportunidades dos JSONs"
                  className="w-8 h-8 rounded-lg border border-border bg-white text-secondary grid place-items-center hover:bg-[#f8f8fb] hover:text-primary disabled:opacity-50 transition shrink-0"
                >
                  <RotateCw size={14} className={cn(refreshingFreelas && 'animate-spin')} />
                </button>
                {/* Paginação no lugar do antigo "Ver todas" */}
                {filteredFreelas.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setFreelasPage((p) => Math.max(0, p - 1))}
                      disabled={!canPrevFreelas}
                      aria-label="Página anterior"
                      className="w-7 h-7 rounded-md border border-border bg-white text-primary grid place-items-center hover:bg-[#f8f8fb] disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="px-2 text-[12.5px] text-secondary tabular-nums">
                      {freelasPage + 1} <span className="text-muted">/ {freelasTotalPages}</span>
                    </span>
                    <button
                      onClick={() => setFreelasPage((p) => Math.min(freelasTotalPages - 1, p + 1))}
                      disabled={!canNextFreelas}
                      aria-label="Próxima página"
                      className="w-7 h-7 rounded-md border border-border bg-white text-primary grid place-items-center hover:bg-[#f8f8fb] disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div>
            {filteredFreelas.length === 0 ? (
              <p className="text-[13px] text-secondary py-3 text-center">
                {freelasQuery ? (
                  <>Nenhum resultado para "<strong className="text-primary">{freelasQuery}</strong>".</>
                ) : tierFilter !== 'todos' ? (
                  <>Nenhuma oportunidade na classificação "<strong className="text-primary">{tierFilter}</strong>" — tente outro filtro.</>
                ) : (
                  <>Nenhuma oportunidade encontrada — rode uma varredura ou ajuste as tags monitoradas.</>
                )}
              </p>
            ) : (
              filteredFreelas
                .slice(freelasPage * FREELAS_PAGE_SIZE, (freelasPage + 1) * FREELAS_PAGE_SIZE)
                .map((o) => (
                  <OpportunityRow
                    key={o.id}
                    opportunity={o}
                    site={siteById(o.source_site_id) ?? undefined}
                    selected={selectedIds.has(o.id)}
                    onToggleSelect={() => toggleSelect(o.id)}
                  />
                ))
            )}
          </div>
          {filteredFreelas.length > 0 && (
            <div className="pt-3 mt-2 border-t border-border flex items-center justify-between">
              {/* Total de oportunidades listadas (canto inferior esquerdo) */}
              <span className="text-[12px] text-muted tabular-nums">
                {filteredFreelas.length} {filteredFreelas.length === 1 ? 'oportunidade' : 'oportunidades'}
              </span>
              {/* Acesso rápido à pasta dos JSONs (rastreabilidade) */}
              <button
                onClick={openFreelasFolder}
                title="Abrir a pasta de freelas no Explorador"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-purple hover:opacity-80 transition"
              >
                <FolderOpen size={13} /> Abrir pasta
              </button>
            </div>
          )}
        </section>
      </div>

      {/* === Right sidebar === */}
      <div className="flex flex-col gap-5 min-w-0">
        <ActivityCard items={activity} />
      </div>

      {editingTags && (
        <EditTagsModal
          tags={tags}
          onClose={() => setEditingTags(false)}
          onChanged={refreshTags}
        />
      )}
    </div>
  );
}