import { type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from './client';
import * as schema from './schema';

// Pipeline sequencial: PRD → ADR → Pitch. Cada agente é executado em ordem
// para cada freela, e o output do anterior alimenta o próximo (via input
// concatenado ou via leitura de `{workspace}/executions/` no futuro).

const DEFAULT_SOUL_PRD = `Você é um Product Manager sênior, pragmático e direto. Pensa em outcomes acima de outputs.
Você é o PRIMEIRO elo do pipeline: PRD → ADR → Pitch. Sua clareza determina a qualidade dos próximos agentes.
Foca em jobs to be done, critérios mensuráveis e riscos. Tom executivo em português, sem floreios.`;

const DEFAULT_SYSTEM_PRD = `Sua missão é gerar um PRD (Product Requirements Document) acionável a partir da oportunidade de freela.
O ADR Agent vai usar seu output pra decidir o stack técnico; o Pitch Agent vai usar pra escrever a proposta de venda. Entregue clareza.

ESTRUTURA OBRIGATÓRIA:
1. Contexto
2. Problema (a dor real do cliente, não só o que ele pediu)
3. Solução proposta
4. Escopo (in / out)
5. Requisitos funcionais
6. Requisitos não-funcionais
7. Critérios de aceite (numerados e mensuráveis)
8. Riscos`;

const DEFAULT_OP_PRD = `Sempre comece extraindo a INTENÇÃO do cliente em uma frase.
Depois liste 3 hipóteses sobre o que pode estar por trás do pedido.
NÃO inclua cronograma nem orçamento — Pitch Agent cuida disso depois.
NÃO escolha tecnologias específicas — ADR Agent decide depois.

Contexto do operador (North Radar): projetos vendáveis típicos incluem sites institucionais,
landing pages, sistemas web/SaaS, e-commerce, dashboards, sistemas internos (ERP/CRM), APIs,
automações/integrações, plataformas multi-tenant e agendamento. Mobile nativo puro, blockchain/web3,
ML avançado, design gráfico puro e edição de vídeo estão fora do core — se a oportunidade for
principalmente isso, sinalize no Contexto sem deixar de seguir a estrutura.

Output em markdown, pronto pra ser consumido pelos próximos agentes.`;

const DEFAULT_SOUL_ADR = `Você é um arquiteto de software experiente, pragmático, anti-overengineering.
Você é o SEGUNDO elo do pipeline: recebe o PRD do agente anterior e decide o stack.
Pensa em trade-offs concretos: simplicidade vs escala, custo vs latência, build vs buy. Não recomenda tecnologia da moda sem motivo.`;

const DEFAULT_SYSTEM_ADR = `Sua missão é produzir um ADR (Architecture Decision Record) para a oportunidade, usando o PRD do agente anterior como fonte de verdade do escopo.
O Pitch Agent vai usar suas decisões pra estimar prazo, custo e narrativa técnica da proposta.

ESTRUTURA OBRIGATÓRIA:
1. Contexto (sintetize do PRD em 2-3 linhas)
2. Forças em jogo
3. Opções consideradas (no mínimo 3)
4. Decisão
5. Justificativa
6. Consequências (positivas e negativas)
7. Diagrama em mermaid (C4 ou fluxo)`;

const DEFAULT_OP_ADR = `Se o PRD não estiver disponível no input, trabalhe com a oportunidade bruta mas SINALIZE a ausência logo no Contexto.
Sempre escolha o stack mais simples que resolva o problema descrito no PRD.
Considere e descarte ao menos 2 alternativas antes da decisão final.
Inclua sempre o diagrama mermaid.

Stack de referência do operador (North Radar) — considere entre as opções avaliadas sempre que
fizer sentido pro escopo, mas sem abrir mão de comparar com alternativas reais:
Frontend: React + TypeScript + Vite + Tailwind. Backend: Node.js + Fastify (ou Next.js API routes
em fullstack simples). ORM/DB: Prisma + PostgreSQL, Supabase quando precisar de auth/storage/realtime
prontos. Deploy: Vercel (frontend/fullstack) ou Render (backend dedicado/workers). Integrações e
automação de processo: n8n quando o escopo envolver webhooks encadeados ou integração entre sistemas
de terceiros. Só recomende fora desse padrão se o PRD justificar claramente.

Output em markdown, pronto pra alimentar o Pitch Agent.`;

const DEFAULT_SOUL_PITCH = `Você é um vendedor consultivo que fecha contratos de freela alto-ticket.
Você é o ÚLTIMO elo do pipeline: recebe PRD (escopo) + ADR (decisões técnicas) e escreve a proposta final pro cliente.
Vende valor, não horas. Conhece o vocabulário do cliente e demonstra entendimento profundo do problema antes de propor solução.`;

const DEFAULT_SYSTEM_PITCH = `Sua missão é escrever uma proposta de vendas vencedora ancorada no PRD e no ADR já produzidos.
Esta é a saída FINAL que o cliente vai ler — combine o escopo do PRD com as decisões técnicas do ADR numa linguagem comercial e enxuta.

ESTRUTURA OBRIGATÓRIA:
1. Diagnóstico do problema (espelhe o cliente — vem do PRD)
2. Proposta de valor em 1 frase
3. Entregáveis (escopo do PRD)
4. Como vamos trabalhar (stack do ADR, sem jargão excessivo)
5. Cronograma sugerido
6. Investimento (faixa, não número fechado)
7. Próximos passos (CTA específico)`;

const DEFAULT_OP_PITCH = `Se PRD/ADR não estiverem no input, gere uma proposta razoável mas mais conservadora, sinalizando lacunas.
Comece SEMPRE refletindo o problema do cliente nas palavras dele (extraído do PRD).
Use bullets curtos. Cronograma derivado das decisões do ADR.
CTA específico no final (ex: "envio o contrato em 24h se a proposta fizer sentido"), nunca vago.

Nunca use clichês de proposta genérica de freelancer/IA: evite "Prezado(a) cliente", "Estamos
entusiasmados em apresentar", "Nossa equipe de especialistas", "Olá! Tenho interesse na vaga",
listão de tecnologias sem contexto de benefício, ou "alta qualidade e prazo rápido" sem prova
concreta. Escreva como o operador do North Radar escreveria pra um cliente real: direto, humano,
sem jargão corporativo.

Output em markdown rico, pronto pra enviar ao cliente.`;

const DEFAULT_AGENT_TOOLS = ['filesystem', 'terminal', 'markdown_export'];

// Os 3 agentes de exemplo do pipeline sequencial PRD → ADR → Pitch.
export function buildAgentSeeds(): schema.NewAgent[] {
  return [
    {
      name: 'PRD Agent',
      slug: 'prd-agent',
      description: 'Documento de Requisitos',
      soul_prompt: DEFAULT_SOUL_PRD,
      system_prompt: DEFAULT_SYSTEM_PRD,
      operational_prompt: DEFAULT_OP_PRD,
      output_format: 'structured_markdown',
      effort_level: 'high',
      autonomy_level: 'autonomous',
      model: 'sonnet',
      provider: 'claude-cli',
      temperature: 0.3,
      max_tokens: 12000,
      retries: 2,
      timeout_seconds: 300,
      color: 'purple',
      icon: 'ClipboardList',
      runtime_config_json: JSON.stringify({
        model: 'sonnet',
        provider: 'claude-cli',
        effort: 'high',
        cloud_p: true,
        skip_permissions: true,
        temperature: 0.3,
        max_tokens: 12000,
        timeout_seconds: 300,
        tools: { terminal: true, filesystem: true, playwright: false },
      }),
    },
    {
      name: 'ADR Agent',
      slug: 'adr-agent',
      description: 'Arquitetura de Solução',
      soul_prompt: DEFAULT_SOUL_ADR,
      system_prompt: DEFAULT_SYSTEM_ADR,
      operational_prompt: DEFAULT_OP_ADR,
      output_format: 'structured_markdown',
      effort_level: 'high',
      autonomy_level: 'autonomous',
      model: 'sonnet',
      provider: 'claude-cli',
      temperature: 0.2,
      max_tokens: 12000,
      retries: 2,
      timeout_seconds: 300,
      color: 'blue',
      icon: 'Cloud',
      runtime_config_json: JSON.stringify({
        model: 'sonnet',
        effort: 'high',
        cloud_p: true,
        skip_permissions: true,
        temperature: 0.2,
        max_tokens: 12000,
        timeout_seconds: 300,
        tools: { terminal: true, filesystem: true, playwright: false },
      }),
    },
    {
      name: 'Pitch Agent',
      slug: 'pitch-agent',
      description: 'Proposta de Vendas',
      soul_prompt: DEFAULT_SOUL_PITCH,
      system_prompt: DEFAULT_SYSTEM_PITCH,
      operational_prompt: DEFAULT_OP_PITCH,
      output_format: 'rich_text',
      effort_level: 'medium',
      autonomy_level: 'autonomous',
      model: 'sonnet',
      temperature: 0.6,
      max_tokens: 8000,
      retries: 2,
      timeout_seconds: 240,
      color: 'green',
      icon: 'Megaphone',
      runtime_config_json: JSON.stringify({
        model: 'sonnet',
        effort: 'medium',
        cloud_p: true,
        skip_permissions: true,
        temperature: 0.6,
        max_tokens: 8000,
        timeout_seconds: 240,
        tools: { terminal: true, filesystem: true, playwright: false },
      }),
    },
  ];
}

// Insere os 3 agentes + suas tools padrão e devolve as linhas criadas.
function insertAgents(db: BetterSQLite3Database<typeof schema>) {
  const agentRows = db.insert(schema.agents).values(buildAgentSeeds()).returning().all();
  for (const a of agentRows) {
    db.insert(schema.agent_tools)
      .values(DEFAULT_AGENT_TOOLS.map((t) => ({ agent_id: a.id, tool_name: t, enabled: true })))
      .run();
  }
  return agentRows;
}

// Settings padrão que a aplicação espera (CLI do Claude, scan, tema, etc.).
export function buildDefaultSettings(): Array<{ key: string; value: string }> {
  return [
    // CLI
    { key: 'claude.cli_path', value: 'claude' },
    { key: 'claude.flags', value: JSON.stringify(['-p', '--dangerously-skip-permissions']) },
    // Defaults para novos agentes
    { key: 'claude.default_model', value: 'sonnet' },
    { key: 'claude.max_tokens', value: '12000' },
    { key: 'claude.timeout_seconds', value: '300' },
    { key: 'claude.retries', value: '2' },
    { key: 'claude.temperature', value: '0.3' },
    // Orquestrador (runtime, lido dinamicamente sem restart)
    { key: 'claude.max_concurrency', value: '3' },
    { key: 'claude.queue_max', value: '50' },
    { key: 'scan.frequency_minutes', value: '5' },
    { key: 'scan.headless', value: 'true' },
    { key: 'scan.timeout_seconds', value: '30' },
    { key: 'general.theme', value: 'light' },
    { key: 'general.language', value: 'pt-BR' },
    { key: 'general.auto_backup', value: 'true' },
  ];
}

/**
 * Base mínima de um banco NOVO: os 3 agentes de exemplo (PRD → ADR → Pitch)
 * + settings padrão. A estrutura (tabelas) deve ser criada antes via
 * applySchema(). Usado pelo botão "Criar" em Settings → Geral.
 */
export function seedBaseAgents(db: BetterSQLite3Database<typeof schema>) {
  const existing = db.select({ id: schema.agents.id }).from(schema.agents).all();
  if (existing.length > 0) return;
  insertAgents(db);
  db.insert(schema.settings).values(buildDefaultSettings()).onConflictDoNothing().run();
}

// Seed completo do boot: base (3 agentes + settings) + dados de demonstração.
export function runSeed(db: BetterSQLite3Database<typeof schema> = getDb()) {
  const existingAgents = db.select({ id: schema.agents.id }).from(schema.agents).all();
  if (existingAgents.length > 0) {
    return; // já populado
  }

  insertAgents(db);

  // Sites
  const sites = [
    { name: 'Workana', slug: 'workana', url: 'https://www.workana.com', status: 'active', opportunity_count: 12, last_scan_at: new Date(Date.now() - 2 * 60 * 1000) },
    { name: '99Freelas', slug: '99freelas', url: 'https://www.99freelas.com.br', status: 'active', opportunity_count: 18, last_scan_at: new Date(Date.now() - 3 * 60 * 1000) },
    { name: 'Freelancer.com', slug: 'freelancer', url: 'https://www.freelancer.com', status: 'active', opportunity_count: 15, last_scan_at: new Date(Date.now() - 4 * 60 * 1000) },
    { name: 'Upwork', slug: 'upwork', url: 'https://www.upwork.com', status: 'active', opportunity_count: 9, last_scan_at: new Date(Date.now() - 5 * 60 * 1000) },
    { name: 'RemoteOK', slug: 'remoteok', url: 'https://remoteok.com', status: 'paused', opportunity_count: 0, last_scan_at: null as Date | null },
  ];
  const siteRows = db.insert(schema.monitored_sites).values(sites).returning().all();

  // Tags — pesos positivos = alta prioridade (stack/escopo do Alex), pesos negativos
  // = baixa prioridade/evitar (penalizam o score sem destruir o denominador, ver MatchEngine).
  const radarTags: Array<{ name: string; weight: number }> = [
    // Alta prioridade — stack e domínio principal
    { name: 'React', weight: 1.5 },
    { name: 'TypeScript', weight: 1.5 },
    { name: 'Node.js', weight: 1.4 },
    { name: 'API', weight: 1.3 },
    { name: 'Dashboard', weight: 1.3 },
    { name: 'SaaS', weight: 1.5 },
    { name: 'Automação', weight: 1.3 },
    { name: 'n8n', weight: 1.4 },
    { name: 'Supabase', weight: 1.2 },
    { name: 'PostgreSQL', weight: 1.2 },
    { name: 'Prisma', weight: 1.1 },
    { name: 'Landing page', weight: 1.0 },
    { name: 'Site institucional', weight: 0.9 },
    { name: 'CRM', weight: 1.2 },
    { name: 'Agendamento', weight: 1.1 },
    { name: 'Financeiro', weight: 1.0 },
    { name: 'Integração', weight: 1.3 },
    { name: 'Admin dashboard', weight: 1.2 },
    { name: 'IA', weight: 1.0 },
    // Baixa prioridade / evitar — pesos negativos penalizam sem inflar o denominador
    { name: 'mobile nativo', weight: -1.2 },
    { name: 'blockchain', weight: -1.5 },
    { name: 'web3', weight: -1.5 },
    { name: 'machine learning avançado', weight: -1.0 },
    { name: 'design gráfico', weight: -1.0 },
    { name: 'edição de vídeo', weight: -1.2 },
    { name: 'suporte técnico', weight: -1.0 },
  ];
  db.insert(schema.radar_tags).values(radarTags.map((t) => ({ name: t.name, weight: t.weight, active: true }))).run();

  // Sample opportunities matching preview.jpg
  const findSite = (slug: string) => siteRows.find((s) => s.slug === slug)!;
  const opps = [
    {
      title: 'Sistema SaaS para controle de assinaturas',
      description: 'Plataforma SaaS para gestão de assinaturas recorrentes com integração Stripe.',
      source_site_id: findSite('workana').id,
      source_url: 'https://www.workana.com/job/1',
      budget_min: 4000, budget_max: 7000,
      match_score: 95,
      detected_tags: JSON.stringify(['React', 'Node.js', 'Stripe', 'SaaS']),
      found_at: new Date(Date.now() - 3 * 60 * 1000),
    },
    {
      title: 'Integração de pagamentos com múltiplas gateways',
      description: 'API REST para orquestrar gateways de pagamento.',
      source_site_id: findSite('99freelas').id,
      source_url: 'https://www.99freelas.com.br/job/2',
      budget_min: 2000, budget_max: 3500,
      match_score: 92,
      detected_tags: JSON.stringify(['API', 'Node.js', 'PostgreSQL', 'Integração']),
      found_at: new Date(Date.now() - 8 * 60 * 1000),
    },
    {
      title: 'Aplicativo desktop para automação de processos',
      description: 'App desktop multiplataforma com Electron + TypeScript.',
      source_site_id: findSite('freelancer').id,
      source_url: 'https://www.freelancer.com/job/3',
      budget_min: 3000, budget_max: 5000,
      match_score: 88,
      detected_tags: JSON.stringify(['Electron', 'TypeScript', 'Automação', 'Desktop']),
      found_at: new Date(Date.now() - 12 * 60 * 1000),
    },
    {
      title: 'Chatbot com IA para atendimento ao cliente',
      description: 'Chatbot baseado em OpenAI para SaaS de atendimento.',
      source_site_id: findSite('upwork').id,
      source_url: 'https://www.upwork.com/job/4',
      budget_min: 2500, budget_max: 4000,
      match_score: 85,
      detected_tags: JSON.stringify(['IA', 'OpenAI', 'Node.js', 'SaaS']),
      found_at: new Date(Date.now() - 15 * 60 * 1000),
    },
    {
      title: 'Dashboard de métricas em tempo real',
      description: 'Dashboard com gráficos e WebSocket.',
      source_site_id: findSite('remoteok').id,
      source_url: 'https://remoteok.com/job/5',
      budget_min: 2000, budget_max: 3000,
      match_score: 78,
      detected_tags: JSON.stringify(['React', 'Charts', 'WebSocket', 'Dashboard']),
      found_at: new Date(Date.now() - 18 * 60 * 1000),
    },
  ];
  const oppRows = db.insert(schema.opportunities).values(opps).returning().all();

  // Activity feed entries (mirror preview.jpg)
  db.insert(schema.activity_logs).values([
    { type: 'document', title: 'PRD Agent gerou documento', description: 'Plataforma de gestão financeira', created_at: new Date(Date.now() - 2 * 60 * 1000) },
    { type: 'opportunity', title: 'Nova oportunidade encontrada', description: 'API REST para integração com ERP', created_at: new Date(Date.now() - 3 * 60 * 1000) },
    { type: 'document', title: 'ADR Agent atualizou arquitetura', description: 'Definiu stack e padrões', created_at: new Date(Date.now() - 4 * 60 * 1000) },
    { type: 'document', title: 'Pitch Agent gerou proposta', description: 'Dashboard administrativo com IA', created_at: new Date(Date.now() - 6 * 60 * 1000) },
    { type: 'scan', title: 'Varredura concluída', description: '12 novas oportunidades encontradas', created_at: new Date(Date.now() - 8 * 60 * 1000) },
  ]).run();

  // Default settings
  db.insert(schema.settings).values(buildDefaultSettings()).onConflictDoNothing().run();
}
