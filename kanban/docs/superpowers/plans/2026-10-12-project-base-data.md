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

## Progresso e verificação

- [x] T1 — Domínio e persistência.
- [x] T2 — Ficha e comandos.
- [x] T3 — Sugestões e criação rápida.
- [x] T4 — Integração e verificação inicial.
- [x] T5 — Revisão e correções.

A integração passou lint, typecheck, build, 1.034 testes unitários e 222 testes Playwright (178 E2E e 44 visuais). As quatro novas baselines da ficha cobrem temas claro/escuro em desktop/mobile. Foram atualizadas as baselines afetadas pela engrenagem; algumas também continham a antiga pesquisa por input, já substituída pela paleta no código de `main`. A comparação das imagens foi revista antes de aceitar as novas baselines.

## Revisão

Revisão independente de standards e spec contra `main` (`194d95c`), após a integração inicial `1b1067b`:

- **Standards**: sem violações documentadas; uma melhoria de interface — remover o parâmetro de tarefas do portfolio que deixou de ser usado nas sugestões locais.
- **Spec**: corrigir a verificação de alterações externas antes de Guardar, para não sobrescrever ficheiros que o watcher ainda não detetou.
- **Spec**: conservar o acompanhamento do estado mais recente quando um reload externo acrescenta eventos à Timeline, sem transformar a ficha atual num preview histórico nem alterar seleções realmente históricas.

As correções e os respetivos testes de regressão pertencem a T5.

As três observações foram resolvidas em `07e02c8`: remoção do parâmetro sem uso, preflight de disco antes da mutação e preservação atómica do acompanhamento do estado mais recente nos reloads externos. A verificação independente das duas observações de spec confirmou a resolução, sem novos problemas acionáveis. Os testes de regressão incluem gravação imediata com o relógio parado (sem esperar pelo watcher), preservação de tarefas externas, eventos acrescentados externamente, seleções históricas reais e falhas de leitura do ficheiro.

## Validação final

- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test:unit`: 1.057 testes passaram.
- `npx playwright test --workers=4`: 228 testes passaram, sem atualizar snapshots (184 E2E e 44 visuais).
- `npm run build` e `npm run build:standalone`: passaram.
- Revisão de standards: melhoria de interface resolvida; sem violações documentadas.
- Revisão de spec: ambas as observações resolvidas e verificadas independentemente.

Implementação concluída na branch `US11`; PR: https://github.com/sebastiaofv/TeamOs/pull/6. A branch não foi integrada em `main`.
