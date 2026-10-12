# US11 — Grafo de implementação

Spec: `docs/superpowers/specs/2026-10-12-project-base-data-design.md`

## Contrato partilhado

O nome conserva a fonte existente `board.settings.title`. A descrição e equipa usam `extensions.projectDetails`, versionada (`version: 1`, `description`, `team`), para manter compatibilidade com os ficheiros atuais e preservar extensões.

`src/domain/projectDetails.ts` expõe:

- `ProjectBaseData = { title: string; description: string; team: string[] }`.
- `getProjectBaseData(data: BoardData): ProjectBaseData`, com valores vazios em ficheiros antigos.
- `normalizeProjectBaseData(input: ProjectBaseData): ProjectBaseData`.
- `setProjectBaseData(data: BoardData, input: ProjectBaseData): void`.
- `projectBaseDataEqual(a: ProjectBaseData, b: ProjectBaseData): boolean`.
- `getProjectAssigneeSuggestions(data: BoardData): string[]`: equipa primeiro, depois responsáveis locais, sem duplicados.

Um evento `project.details.updated` usa `entityType: 'board'` e changes `title`, `description`, `team`; apenas campos alterados. O replay aplica os mesmos dados base, incluindo campos vazios.

## Tickets e dependências

- **T1 — Domínio e persistência**: módulo partilhado, extensão, snapshots, serialização e replay; testes de domínio. Sem dependências.
- **T2 — Ficha e comandos**: engrenagem, diálogo, guardar/cancelar, validação, leitura histórica e conflito do rascunho; traduções e testes dos comandos. Usa o contrato de T1; integração bloqueada por T1.
- **T3 — Sugestões e criação rápida**: sugestões locais no editor/paleta e resolução pelo destino final; ambiguidade e testes. Usa o contrato de T1; integração bloqueada por T1.
- **T4 — Integração e verificação**: apresentação de eventos, testes E2E, lint/typecheck/unit/build e fluxos de persistência. Bloqueado por T1, T2 e T3.
- **T5 — Revisão e correções**: revisão de standards e spec, corrigir problemas e concluir PR. Bloqueado por T4.

T1, T2 e T3 podem ser implementados em paralelo com este contrato. T2 e T3 não alteram o módulo partilhado nem os ficheiros de domínio de T1.
