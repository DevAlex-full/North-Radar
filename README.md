# 🚀 North Radar

Central operacional de agentes de IA para análise de oportunidades, geração de documentação técnica e criação de propostas comerciais.

O North Radar é uma evolução do conceito de radar de oportunidades, permitindo que múltiplos agentes especializados trabalhem em conjunto para analisar projetos, gerar arquitetura técnica e criar propostas de forma estruturada.

---

## ✨ Funcionalidades

### 🔍 Radar de Oportunidades

* Monitoramento de oportunidades em plataformas de freelancing.
* Sistema de tags personalizadas.
* Classificação de compatibilidade.
* Match score configurável.

### 🤖 Time de Agentes

* Criação e gerenciamento de agentes personalizados.
* Pipeline visual de execução.
* Organização por etapas.
* Importação e exportação de equipes de agentes.

### 📄 Agentes Inclusos

#### PRD Agent

Responsável por transformar uma oportunidade em um documento de requisitos estruturado.

#### ADR Agent

Responsável por analisar a solução proposta e definir arquitetura, stack e decisões técnicas.

#### Pitch Agent

Responsável por gerar propostas comerciais personalizadas com base na análise anterior.

### 🎯 Match Engine

* Sistema de pesos positivos e negativos.
* Classificação:

  * Alta compatibilidade
  * Média compatibilidade
  * Baixa compatibilidade
  * Evitar

### 🕸️ Scraping

* Integração com Playwright.
* Coleta automatizada de oportunidades.
* Processamento e classificação automática.

---

## 🛠️ Tecnologias

### Frontend

* React
* TypeScript
* TailwindCSS
* Framer Motion

### Desktop

* Electron
* Electron Vite

### Banco de Dados

* SQLite
* Better SQLite3
* Drizzle ORM

### Automação e IA

* Claude API
* OpenAI API
* Gemini API
* Playwright

---

## ⚙️ Instalação

### Clonar o projeto

```bash
git clone https://github.com/DevAlex-full/North-Radar.git
cd North-Radar
```

### Instalar dependências

```bash
npm install
```

### Instalar navegadores do Playwright

```bash
npx playwright install
```

### Recompilar dependências nativas do Electron

```bash
npm run rebuild
```

---

## 🚀 Executando em Desenvolvimento

```bash
npm run dev
```

---

## 🔨 Build

```bash
npm run build
```

---

## ✅ Verificação de Tipos

```bash
npm run typecheck
```

---

## 🔑 Configuração de APIs

O sistema suporta múltiplos provedores de IA:

* Anthropic (Claude)
* OpenAI
* Google Gemini

As chaves podem ser configuradas na tela:

```text
Settings → Chaves
```

---

## 📁 Estrutura do Projeto

```text
electron/
├── db/
├── ipc/
├── services/

src/
├── components/
├── pages/
├── stores/
├── lib/

docs/
├── agents-reference/
```

---

## 🎯 Roadmap

* Integração com SDR Agent
* Integração com n8n
* CRM interno
* Automação de follow-up
* Integração com WhatsApp
* Dashboard de métricas
* Novos agentes especializados

---

## 👨‍💻 Autor

Alex Bueno

Desenvolvedor FullStack especializado em:

* React
* TypeScript
* Node.js
* Fastify
* Prisma
* PostgreSQL
* Supabase
* Automações
* Sistemas SaaS

GitHub:
https://github.com/DevAlex-full

---

## 📄 Licença

Projeto para fins de estudo, evolução e personalização do conceito original do Freela Radar.
