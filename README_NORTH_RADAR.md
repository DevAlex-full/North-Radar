# North Radar — adaptação do Freela Radar

Este pacote contém o projeto **Freela Radar** (Felipe Aguiar) adaptado para **North Radar**,
o produto pessoal do Alex Bueno. A adaptação preservou a engenharia original do Estúdio de
Agentes e dos 3 agentes seed (PRD/ADR/Pitch), e só evoluiu o que era necessário para refletir
a identidade, a stack e o modelo comercial do North Radar.

---

## O que foi alterado

### 1. Identidade do produto (Freela Radar → North Radar)
- `package.json` — `name`, `description`, `author`, `build.appId`, `build.productName`
- `index.html` — `<title>`
- `src/components/Sidebar.tsx` — nome do app na barra lateral
- `src/components/SplashScreen.tsx` — nome do app + crédito do autor na tela de abertura
- `src/components/FirstRunModal.tsx` — título de boas-vindas + placeholder de caminho do banco
- `src/pages/SettingsPage.tsx` — título da página ("Settings" → "Configurações") + texto do app
- `electron/services/AppConfig.ts` — nome do arquivo de config, caminho do banco
  (`north-radar.db`) e da pasta de workspace (`Documents/NorthRadar/workspace`). **Reset limpo**,
  sem tentativa de migrar dados do Freela Radar (conforme decisão tomada durante a adaptação).
- `electron/ipc/handlers.ts` — nome padrão do arquivo no export do banco

### 2. Agentes do Estúdio (PRD, ADR, Pitch) — `electron/db/seed.ts`
**Decisão deliberada: preservar 100% da engenharia original.** Os 3 agentes foram auditados em
detalhe antes de qualquer alteração (Soul Prompt, System Prompt, temperatura, estrutura de saída,
exigências e restrições de cada um permanecem **idênticos** ao original do Felipe Aguiar).

A única mudança foi um **bloco adicional no Operational Prompt** de cada agente, inserido sempre
*antes* da última instrução de output, nunca substituindo texto existente:

- **PRD Agent**: ganhou uma lista do que conta como "vendável" no modelo comercial do Alex
  (sites institucionais, SaaS, dashboards, APIs, automações, multi-tenant, agendamento) e do que
  é baixa prioridade (mobile nativo, blockchain/web3, ML avançado, design puro, vídeo).
- **ADR Agent**: ganhou uma "stack de referência a considerar" (React/TS/Vite/Tailwind,
  Node/Fastify, Prisma/PostgreSQL/Supabase, Vercel/Render, n8n) — sempre dentro da mesma exigência
  original de comparar com ≥3 alternativas antes de decidir.
- **Pitch Agent**: ganhou uma lista explícita de clichês de "proposta genérica de IA" a evitar
  (saudações engessadas, listão de tecnologia sem contexto, promessas vagas).

Uma cópia íntegra do `seed.ts` original do Felipe Aguiar foi preservada em
`docs/agents-reference/seed.original.felipe-aguiar.ts` — referência de arquitetura e
engenharia de prompt, para consulta futura.

### 3. Match Engine — `electron/services/MatchEngine.ts`
A fórmula de score foi corrigida para suportar **tags de peso negativo** (ex: "mobile nativo",
"blockchain", "web3") sem quebrar a escala 0–100:

- Antes: `score = (soma dos pesos das tags presentes / soma de todos os pesos) * 100` — se uma
  tag negativa fosse adicionada, o denominador encolhia e o score podia estourar ou ficar instável.
- Depois: o denominador usa só a soma dos pesos **positivos**; tags negativas detectadas geram
  uma penalização subtraída **depois** da normalização, com `clamp(0, 100)` no resultado final.

Isso afeta os três métodos públicos (`score`, `scoreText`, `scoreTextWithTags`) sem mudar a
assinatura de nenhum — quem já chama o `MatchEngine` não precisa mudar nada.

As tags em si (pesos) foram recalibradas em `electron/db/seed.ts`:
- **Alta prioridade** (peso positivo, 0.9 a 1.5): React, TypeScript, Node.js, API, Dashboard,
  SaaS, Automação, n8n, Supabase, PostgreSQL, Prisma, Landing page, Site institucional, CRM,
  Agendamento, Financeiro, Integração, Admin dashboard, IA.
- **Baixa prioridade / evitar** (peso negativo, -1.0 a -1.5): mobile nativo, blockchain, web3,
  machine learning avançado, design gráfico, edição de vídeo, suporte técnico.

### 4. Badge de classificação visual — `src/lib/utils.ts` + `src/components/OpportunityRow.tsx`
Nova função `classifyMatchScore()` que converte o `match_score` (0–100) em uma faixa visual:

| Faixa | Score | Cor |
|---|---|---|
| Alta | ≥ 60 | verde |
| Média | 35–59 | âmbar |
| Baixa | 15–34 | laranja |
| Evitar | < 15 | vermelho |

A badge aparece tanto na linha da lista de oportunidades quanto no modal de detalhe, mantendo
sempre o número de % visível ao lado.

### 5. Estúdio de Agentes — `src/pages/AgentsPage.tsx`
- O botão **"Novo"** deixou de criar um agente com campos quase vazios. Agora ele nasce com um
  **template completo**: Soul/System/Operational com placeholders guiados, `output_format:
  structured_markdown`, `effort: high`, `model: sonnet`, `temperature: 0.3`, e já vem com as
  ferramentas `filesystem`, `terminal` e `markdown_export` habilitadas.
- Textos do cabeçalho do Estúdio e do estado vazio foram ajustados para deixar claro que a
  personalização do agente acontece dentro do próprio North Radar.
- O export do time de agentes agora gera `north-radar-time-de-agentes.json` (antes
  `freela-radar-time-de-agentes.json`). O campo `type` interno do JSON também foi renomeado —
  confirmado que não é validado em lugar nenhum do código, então não há risco de quebra de import.

### O que **não** foi alterado (decisão deliberada)
`AgentRunner.ts`, `TeamPipeline.ts`, `RadarPage.tsx`, `PipelinePage.tsx`, schema do banco
(`electron/db/schema.ts`), todos os providers de scraping (Workana, 99Freelas, Freelancer,
Upwork, RemoteOK) e `docs/index.html` (documentação estática do projeto original, fora do
escopo desta adaptação).

---

## Como instalar

```bash
npm install
```

## Como rodar (modo desenvolvimento)

```bash
npm run dev
```

Na primeira execução, o `FirstRunModal` vai pedir para confirmar/ajustar o caminho do banco de
dados. Por padrão, ele aponta para `Documents/NorthRadar/workspace` e um arquivo
`north-radar.db` dentro da pasta de dados do usuário do Electron.

## Verificação de tipos

```bash
npm run typecheck
```

## Build de produção

```bash
npm run build
```

Gera `out/main`, `out/preload` e `out/renderer`.

> Não há script `lint` configurado neste projeto (sem `.eslintrc`/`eslint.config.*` no
> repositório original) — não foi adicionado nenhum, conforme escopo da adaptação.

---

## ⚠️ Observação sobre `better-sqlite3`

`better-sqlite3` é um módulo nativo (compilado em C++) e precisa baixar os headers do Node
durante o `npm install` para compilar contra a sua versão exata do Node.js. Em ambientes com
acesso restrito à internet (firewalls corporativos, sandboxes, alguns CI), isso pode falhar com
um erro de `node-gyp` / `403` ao buscar `nodejs.org`.

Se isso acontecer no seu ambiente:

1. Confirme que tem acesso de rede normal a `nodejs.org` e `github.com`.
2. Tente `npm rebuild better-sqlite3` depois de um `npm install` parcial.
3. Em último caso, `npm install --ignore-scripts` instala todo o resto (suficiente para
   `npm run typecheck` e `npm run build` do lado do renderer/preload), mas o app Electron **não
   vai rodar de fato** sem o binário nativo do SQLite compilado — ele é necessário em runtime
   para o `electron/db/client.ts` abrir o banco.

Em uma máquina de desenvolvimento normal (a sua, no dia a dia), isso tende a funcionar sem
fricção — essa observação existe porque foi exatamente o que aconteceu no ambiente sandbox usado
para validar este pacote antes da entrega.

---

## Status de validação (rodado antes da entrega deste ZIP)

- `npm run typecheck` → ✅ passou sem erros
- `npm run build` → ✅ passou sem erros (main 123kB, preload 6kB, renderer ~989kB)
- `npm install` completo (com compilação nativa) → não validado neste ambiente por bloqueio de
  rede ao `nodejs.org`; validado com `--ignore-scripts` para isolar e confirmar que o problema é
  de ambiente, não do código TypeScript/React alterado.

---

## Próximos passos recomendados

1. Rodar `npm install` e `npm run dev` localmente, abrir o Estúdio de Agentes e revisar os 3
   diffs nos Operational Prompts de PRD/ADR/Pitch.
2. Testar o botão "Novo" agente e validar se o template gerado já está no formato que você quer
   usar como ponto de partida no dia a dia.
3. Rodar o scanner por alguns dias com as tags recalibradas e ajustar os pesos em
   `electron/db/seed.ts` (e os thresholds de `classifyMatchScore` em `src/lib/utils.ts`) com base
   no comportamento real — os valores atuais são um ponto de partida racional, não um veredito.
4. Gerar um ícone próprio do North Radar (`npm run gen:icon`) — o `package.json` já aponta para
   `assets/icon.ico` / `assets/icon.png`.
5. Quando decidir integrar o SDR Agent / n8n (fora do escopo desta adaptação): o ponto de entrada
   mais natural é o output do Pitch Agent, que já fica pronto como artefato final consumível por
   automação externa.
