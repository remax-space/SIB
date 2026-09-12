# SIB — Sistema Integrado Basile de Advocacia

Plataforma de inteligência jurídica com pipeline de seis agentes, Firestore, Firebase Storage e autenticação por operador mestre ou licença de máquina.

## Requisitos

- Node.js 20.9 ou superior
- Projeto Firebase com Firestore e Storage
- Pelo menos uma chave de IA (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` ou `GEMINI_API_KEY`)

## Setup local

1. Copie `.env.example` para `.env` e preencha as variáveis. Não commite o `.env`.
2. Instale dependências com `npm install`.
3. Crie o operador mestre: `npm run ensure-master`.
4. (Opcional) Dados de demonstração: `npm run seed`.
5. Publique os índices do Firestore: `npm run indexes:deploy`.
6. Aplique CORS do Storage: `npm run storage:cors`.
7. Inicie o app: `npm run dev`.

O login mestre usa `MASTER_EMAIL` e `MASTER_PASSWORD`. Licenças de máquina são geridas em `/licencas`.

## Pipeline

O CRIADOR e a análise completa executam, nesta ordem:

1. Operador
2. Advogado do Diabo
3. Cabeça do Juiz
4. Auditor Documental (ICP Basile)
5. Mestre
6. Orientador

Jurisprudência é um passo posterior e só consulta a base contratada. Sem chave, endpoint HTTPS e ativação, o sistema não inventa precedentes.

DataJud consulta a API pública do CNJ no servidor, com `DATAJUD_API_KEY`.

## Produção

- Defina `AUTH_URL` / `NEXTAUTH_URL` com o domínio real.
- Inclua o mesmo domínio em `STORAGE_CORS_ORIGINS` e rode `npm run storage:cors`.
- Mantenha chaves de IA, Firebase e DataJud apenas no ambiente do servidor.
- `npm run build` e `npm start`, ou deploy na Vercel apontando para este repositório.
