# US6 — Plano de implementação

Spec confirmada: [Histórico de alterações da tarefa](../specs/2026-10-09-task-history-design.md).

Branch de entrega: `US6`. A fonte única continua a ser a timeline existente no projeto.

## Grafo de trabalho

### US6-0 — Contrato de leitura (concluído)

- Bloqueios: nenhum.
- Fixar os tipos de projeção em `src/domain/taskHistoryTypes.ts` e a assinatura de `deriveTaskHistory` abaixo.
- Este contrato permite desenvolver domínio e apresentação em paralelo; a verificação integrada depende da entrega de ambos.

### US6-1 — Projeção de domínio e testes (concluído)

- Bloqueios: US6-0.
- Criar `src/domain/taskHistory.ts` com `deriveTaskHistory(boardData: BoardData, task: Task, options?: { eventIndex?: number | null }): TaskHistory`.
- Usar o contrato de leitura de `src/domain/taskHistoryTypes.ts`.
- Percorrer os eventos do projeto e reutilizar o replay existente para obter alterações diretas e indiretas, planeamento e efeitos de restauro.
- Preservar a ordem dos eventos, limitar a consulta ao índice histórico quando aplicável e distinguir ciclos de vida, incluindo reutilização de identificadores e proveniência de restauro.
- Mostrar apenas informação demonstrável e sinalizar lacunas. A baseline de uma tarefa existente é um estado inicial conhecido, não uma criação.
- A consulta não modifica os dados recebidos nem cria eventos.
- Testar os comportamentos do domínio, sobretudo mudanças de estado agrupadas, atribuição em lote, Roadmap, Planner, desfazer, restauro, contexto histórico, identidade e dados incompletos.
- Entrega: projeção e testes de domínio.

### US6-2 — Consulta reativa e apresentação no detalhe (concluído)

- Bloqueios de escrita: US6-0. A verificação integrada depende de US6-1.
- Ligar a tarefa aberta ao seu projeto e ao contexto histórico, derivando o histórico a partir dos dados carregados atuais.
- Apresentar uma secção recolhível **Histórico**, inicialmente recolhida, no detalhe da tarefa. Identificador de teste da secção: `taskHistory`.
- Cada entrada usa a classe `task-history-entry`, com resumo, data/hora local e detalhes expansíveis de valores antes/depois.
- Atualizar o histórico com alterações/reload do projeto; a consulta não muda a seleção do projeto ou da timeline.
- Mostrar contexto histórico, informação indisponível e estado de gravação do projeto quando necessário.
- Usar EN/PT, temas, teclado e formatação legível para estados, referências de Roadmap, checklist, anexos e planeamento. Nunca apresentar conteúdo binário de anexos como texto do histórico.
- Entrega: query/integração, componente, traduções e estilos.

### US6-3 — Verificação de integração pelo utilizador (concluído)

- Bloqueios de escrita: US6-0. Bloqueios de execução: US6-1 e US6-2. A escrita dos cenários pode decorrer em paralelo com US6-1 e US6-2, usando o contrato da secção acima.
- Criar testes Playwright em `tests/e2e/task-history.test.ts`, usando os helpers existentes.
- Verificar consulta passiva sem novas escritas/eventos, alterações agrupadas e estado, atualização ao alterar checklist com o detalhe aberto, limitação do preview, projetos read-only, EN/PT e teclado.
- Verificar alterações indiretas e planeamento através de dados/eventos reais do projeto.
- Entrega: testes E2E significativos para os critérios de aceitação.

## Verificação e entrega

- Executar lint, typecheck, testes unitários, build e suites E2E relevantes.
- Rever os diffs segundo os padrões do repositório e a spec; corrigir os problemas encontrados.
- Fazer commit e push de `US6` para `origin`, conforme pedido do utilizador.
- Referenciar esta spec e este grafo no PR. Não existem issues abertas identificadas para a US6 no tracker remoto.

## Revisão de implementação

- Standards: composição do read model movida para queries; regra de continuidade/proveniência partilhada pelo histórico e pela fonte do detalhe; reutilização do parser de horas do Planner.
- Spec: restauro de snapshots esparsos conserva o histórico conhecido e identifica campos indisponíveis, sem apresentar defaults de normalização como alterações comprovadas.
- O replay conserva separadamente os valores efetivos de negócio e a evidência historicamente registada. Valores vazios explicitamente registados continuam conhecidos; campos omitidos não ganham conhecimento apenas por normalização.
- As correções incluem testes de regressão para restauro através das APIs existentes, proveniência incoerente, identificadores reutilizados e primeira alteração após abrir uma tarefa sem timeline.
- As referências visuais do detalhe foram atualizadas deliberadamente para a secção Histórico; acrescentadas referências do histórico expandido nos temas claro e escuro.

## Resultado da verificação

- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test:unit`: 1.077 testes passaram.
- `npm test`: 216 testes de navegador e referências visuais passaram.
- Builds normal e standalone: passaram.
- Revalidação dos findings de Standards e Spec: resolvidos, incluindo as reproduções de restauro esparso, ausência de falsas alterações por normalização e preservação de valores anteriores vazios.

Entrega: [PR #4](https://github.com/sebastiaofv/TeamOs/pull/4), branch `US6`.
