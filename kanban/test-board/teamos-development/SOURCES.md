# Fontes e limites históricos

Corte: 2026-11-12T10:45:00.000Z. Main analisada: `1d7ad9122dcb4feb2f660d32dedea4e15f2629d0`.

O snapshot público integral está em `scripts/example-project/evidence.json`: todos os issues abertos/fechados, corpos e comentários; todos os PRs, integrados/abertos/encerrados sem merge; commits alcançáveis da main. Não contém transcrições privadas.

## Reconstrução (fictício)

- O Git começa em fevereiro de 2026. Junho–agosto segue o cenário pedido no issue #91; as atividades iniciais foram reposicionadas e as datas reais dos commits continuam nas referências.
- Sprints, capacidade, objetivos, estimativas, atribuições, bloqueios, Review/Retrospective e aceitação local são simulados. As transições demonstram utilização continuada; não são um log autenticado do desenvolvimento.
- Todas as conversas inventadas começam com `(fictício — interação simulada)`. Excertos reais começam com `REFERÊNCIA REAL`, identificam a conta, data e URL; o membro local é apenas uma projeção demonstrativa.
- Estado Done significa entrega comprovada mais aceitação local simulada. Um issue encerrado sem prova de entrega não é promovido automaticamente a Done. #40 é cancelado no exemplo; #83 continua em Testing com PR aberto.

## Conversas disponíveis consultadas

- “Split project history into JSON” (05/11/2026): pedido de history.json separado, carregamento lazy e gravação independente; confirmado no issue #66.
- “Refine Kanban project requirements” (04/11/2026): separação técnico/funcional, Bugs com Tasks, membro ativo e calendário no Day Planner; a versão pública é o comentário do issue #54.
- “Choose a local model for Kanban chat” (29/10/2026): exploração de comandos estruturados com modelo local. Registado apenas como decisão proposta, sem alegar implementação.
- Os históricos acessíveis não constituem um arquivo completo de todas as conversas desde setembro. Lacunas foram tratadas como reconstrução, com prioridade para código e evidência pública.

## Issues e decomposição

| Issue | Estado GitHub | Workitem | Evidência de implementação |
|---|---|---|---|
| [#24](https://github.com/sebastiaofv/TeamOs/issues/24) US-21 · Separar o backlog do Board Kanban | closed | TOS-US-74 | [PR #44](https://github.com/sebastiaofv/TeamOs/pull/44) |
| [#25](https://github.com/sebastiaofv/TeamOs/issues/25) US-1 · Tabela de workitems | closed | TOS-US-79 | [PR #44](https://github.com/sebastiaofv/TeamOs/pull/44), [PR #47](https://github.com/sebastiaofv/TeamOs/pull/47) |
| [#26](https://github.com/sebastiaofv/TeamOs/issues/26) US-2 · Relações e bloqueios entre workitems | closed | TOS-US-89 | [PR #45](https://github.com/sebastiaofv/TeamOs/pull/45) |
| [#27](https://github.com/sebastiaofv/TeamOs/issues/27) US-3 · Participantes e responsável de um workitem | closed | TOS-US-97 | [PR #46](https://github.com/sebastiaofv/TeamOs/pull/46), [PR #47](https://github.com/sebastiaofv/TeamOs/pull/47) |
| [#28](https://github.com/sebastiaofv/TeamOs/issues/28) US-4 · Workflows personalizados por projeto | closed | TOS-US-103 | [PR #48](https://github.com/sebastiaofv/TeamOs/pull/48) |
| [#29](https://github.com/sebastiaofv/TeamOs/issues/29) US-5 · Evolução do Roadmap: etapas hierárquicas e milestones | closed | TOS-US-111 | [PR #49](https://github.com/sebastiaofv/TeamOs/pull/49) |
| [#30](https://github.com/sebastiaofv/TeamOs/issues/30) US-6 · Histórico de alterações do workitem | closed | TOS-US-121 | [PR #50](https://github.com/sebastiaofv/TeamOs/pull/50) |
| [#31](https://github.com/sebastiaofv/TeamOs/issues/31) US-7 · Comentários em conversa no workitem | closed | TOS-US-127 | [PR #51](https://github.com/sebastiaofv/TeamOs/pull/51) |
| [#32](https://github.com/sebastiaofv/TeamOs/issues/32) US-8 · Associação de pull requests a workitems | closed | TOS-US-134 | [PR #52](https://github.com/sebastiaofv/TeamOs/pull/52) |
| [#33](https://github.com/sebastiaofv/TeamOs/issues/33) US-9 · Dashboard de um projeto | closed | TOS-US-140 | [PR #59](https://github.com/sebastiaofv/TeamOs/pull/59) |
| [#34](https://github.com/sebastiaofv/TeamOs/issues/34) US-10 · Dashboard global de portefólio | open | TOS-US-150 | Sem PR integrado identificado; backlog ou reconstrução. |
| [#35](https://github.com/sebastiaofv/TeamOs/issues/35) US-11 · Dados mestres do projeto | closed | TOS-US-155 | [PR #55](https://github.com/sebastiaofv/TeamOs/pull/55) |
| [#36](https://github.com/sebastiaofv/TeamOs/issues/36) US-12 · Tipos de workitem | closed | TOS-US-161 | [PR #56](https://github.com/sebastiaofv/TeamOs/pull/56) |
| [#37](https://github.com/sebastiaofv/TeamOs/issues/37) US-13 · Projetos agrupados por produto e transferência de tarefas | closed | TOS-US-171 | [PR #58](https://github.com/sebastiaofv/TeamOs/pull/58) |
| [#38](https://github.com/sebastiaofv/TeamOs/issues/38) US-15 · Drilldown do Gantt | closed | TOS-US-183 | [PR #49](https://github.com/sebastiaofv/TeamOs/pull/49) |
| [#39](https://github.com/sebastiaofv/TeamOs/issues/39) US-16 · Anexos de documentos e imagens | closed | TOS-US-188 | [PR #61](https://github.com/sebastiaofv/TeamOs/pull/61) |
| [#40](https://github.com/sebastiaofv/TeamOs/issues/40) US-17 · Painel lateral de detalhe do workitem | closed | TOS-US-197 | Issue encerrado sem PR próprio. A main tem detalhe em modal; não afirmar que existe um painel lateral novo. Reconstrução parcial (fictício). |
| [#41](https://github.com/sebastiaofv/TeamOs/issues/41) US-18 · FTE por projeto | open | TOS-US-202 | Sem PR integrado identificado; backlog ou reconstrução. |
| [#42](https://github.com/sebastiaofv/TeamOs/issues/42) US-19 · Análise de desvios de datas | open | TOS-US-207 | A stack antiga PR #19 foi encerrada sem integração. Baselines aprovadas continuam planeadas. |
| [#43](https://github.com/sebastiaofv/TeamOs/issues/43) US-20 · Registo e acompanhamento de riscos | closed | TOS-US-212 | [PR #60](https://github.com/sebastiaofv/TeamOs/pull/60) |
| [#53](https://github.com/sebastiaofv/TeamOs/issues/53) US-21 · Restrição aos valores disponiveis nos campos Responsavel, Participantes e TAGs. | closed | TOS-US-223 | [PR #55](https://github.com/sebastiaofv/TeamOs/pull/55) |
| [#54](https://github.com/sebastiaofv/TeamOs/issues/54) DISC-1 · Organização funcional do TeamOS e modelo de planeamento e acompanhamento | closed | TOS-US-228 | [PR #75](https://github.com/sebastiaofv/TeamOs/pull/75) |
| [#57](https://github.com/sebastiaofv/TeamOs/issues/57) US 22 - Alterações ao layout e funcionalidade dos sprints | closed | TOS-US-241 | [PR #65](https://github.com/sebastiaofv/TeamOs/pull/65) |
| [#62](https://github.com/sebastiaofv/TeamOs/issues/62) US-23 - Visualização de anexos diretamente no browser | closed | TOS-US-252 | [PR #63](https://github.com/sebastiaofv/TeamOs/pull/63) |
| [#64](https://github.com/sebastiaofv/TeamOs/issues/64) US-24 - Alterar design da aplicação | closed | TOS-US-259 | [PR #79](https://github.com/sebastiaofv/TeamOs/pull/79) |
| [#66](https://github.com/sebastiaofv/TeamOs/issues/66) US-25 - Separar os anexos e o histórico do JSON do projeto | closed | TOS-US-271 | [PR #82](https://github.com/sebastiaofv/TeamOs/pull/82) |
| [#67](https://github.com/sebastiaofv/TeamOs/issues/67) US-26 - Importação via Excel com macro e CSV único | open | TOS-US-280 | Sem PR integrado identificado; backlog ou reconstrução. |
| [#68](https://github.com/sebastiaofv/TeamOs/issues/68) US-27 - Reorganizar e otimizar a estrutura do JSON do projeto | closed | TOS-US-286 | [PR #88](https://github.com/sebastiaofv/TeamOs/pull/88) |
| [#69](https://github.com/sebastiaofv/TeamOs/issues/69) US-28 - Evitar sobrescritas e reconciliar alterações concorrentes no projeto | closed | TOS-US-297 | [PR #77](https://github.com/sebastiaofv/TeamOs/pull/77) |
| [#70](https://github.com/sebastiaofv/TeamOs/issues/70) US-29 - Documentação integrada na aplicação e guia da metodologia Agile | closed | TOS-US-305 | [PR #71](https://github.com/sebastiaofv/TeamOs/pull/71) |
| [#72](https://github.com/sebastiaofv/TeamOs/issues/72) US-30 - Gestão de automatismos de transições entre estados nas definições do projeto | closed | TOS-US-311 | [PR #80](https://github.com/sebastiaofv/TeamOs/pull/80) |
| [#73](https://github.com/sebastiaofv/TeamOs/issues/73) US-31 · Timeline do projeto com consulta histórica entre separadores e restauro | open | TOS-US-321 | Sem PR integrado identificado; backlog ou reconstrução. |
| [#74](https://github.com/sebastiaofv/TeamOs/issues/74) US-32 - Seleção de temas Clássico e Moderno com modos claro e escuro | closed | TOS-US-327 | [PR #76](https://github.com/sebastiaofv/TeamOs/pull/76) |
| [#78](https://github.com/sebastiaofv/TeamOs/issues/78) Investigar e corrigir problemas de performance da aplicação | closed | TOS-US-333 | [PR #86](https://github.com/sebastiaofv/TeamOs/pull/86) |
| [#81](https://github.com/sebastiaofv/TeamOs/issues/81) US-33 · Criação automática de Bugs por endpoint do TeamOS | open | TOS-US-342 | Sem PR integrado identificado; backlog ou reconstrução. |
| [#83](https://github.com/sebastiaofv/TeamOs/issues/83) US-34-Redesign do Dashboard | open | TOS-US-348 | [PR #87](https://github.com/sebastiaofv/TeamOs/pull/87) |
| [#84](https://github.com/sebastiaofv/TeamOs/issues/84) Bug 1 - arrastar workitens no board funcional para done | closed | TOS-BG-375 | [PR #85](https://github.com/sebastiaofv/TeamOs/pull/85) |
| [#89](https://github.com/sebastiaofv/TeamOs/issues/89) US-35 - Identificação e alteração do utilizador ativo no header | open | TOS-US-356 | Requisito aberto, sem PR de implementação na data de corte. |
| [#90](https://github.com/sebastiaofv/TeamOs/issues/90) Permitir drag-and-drop de ficheiros nos anexos | open | TOS-US-362 | Drag-and-drop e anexos de Project Control são trabalho planeado; o exemplo usa os anexos nativos de workitems. |
| [#91](https://github.com/sebastiaofv/TeamOs/issues/91) Criação do plano de projeto TeamOS | open | TOS-US-368 | Esta entrega permanece In progress no exemplo; a aceitação depende da revisão do PR desta implementação. |

## Pull Requests: não confundir encerramento e integração

| PR | Estado | Data real de merge | Base |
|---|---|---|---|
| [#1](https://github.com/sebastiaofv/TeamOs/pull/1) ci: executar verificações do kanban no GitHub Actions | encerrado sem integração | — | main |
| [#2](https://github.com/sebastiaofv/TeamOs/pull/2) CI: testar o kanban no GitHub Actions e publicar builds como release | integrado | 2026-09-25T20:50:17Z | main |
| [#3](https://github.com/sebastiaofv/TeamOs/pull/3) Paleta de comandos (⌘K) com criação rápida, planeamento e ajuda na aplicação | integrado | 2026-09-26T15:18:03Z | main |
| [#4](https://github.com/sebastiaofv/TeamOs/pull/4) US6: histórico de alterações no detalhe da tarefa | encerrado sem integração | — | main |
| [#5](https://github.com/sebastiaofv/TeamOs/pull/5) US10: mockups dos dashboards de projeto e portefólio | encerrado sem integração | — | main |
| [#6](https://github.com/sebastiaofv/TeamOs/pull/6) US11: ficha e dados base do projeto | encerrado sem integração | — | main |
| [#7](https://github.com/sebastiaofv/TeamOs/pull/7) US-1 · Tabela de workitems por projeto | encerrado sem integração | — | main |
| [#8](https://github.com/sebastiaofv/TeamOs/pull/8) [US-11] Dados base do projeto e identidades locais estáveis | encerrado sem integração | — | feat/us-01-workitems-table |
| [#9](https://github.com/sebastiaofv/TeamOs/pull/9) [US-12] Tipos de workitem imutáveis e conclusão agregada da hierarquia | encerrado sem integração | — | feat/us-11-project-master-data |
| [#10](https://github.com/sebastiaofv/TeamOs/pull/10) [US-4] Workflows de projeto, estados semânticos e transições explícitas | encerrado sem integração | — | feat/us-12-workitem-types |
| [#11](https://github.com/sebastiaofv/TeamOs/pull/11) [US-2] Criação de workitens relacionados e dependências de bloqueio | encerrado sem integração | — | feat/us-04-project-workflows |
| [#12](https://github.com/sebastiaofv/TeamOs/pull/12) [US-5] Fases de projeto aninhadas, milestones e progresso baseado em folhas | encerrado sem integração | — | feat/us-02-workitem-relations |
| [#13](https://github.com/sebastiaofv/TeamOs/pull/13) [US-3] Responsável único da equipa e My workitems locais | encerrado sem integração | — | feat/us-05-project-plan |
| [#14](https://github.com/sebastiaofv/TeamOs/pull/14) [US-6] Histórico por workitem a partir da linha temporal existente do projeto | encerrado sem integração | — | feat/us-03-team-assignment |
| [#15](https://github.com/sebastiaofv/TeamOs/pull/15) [US-7] Comentários de conversa imutáveis e capturas de ecrã coladas | encerrado sem integração | — | feat/us-06-workitem-history |
| [#16](https://github.com/sebastiaofv/TeamOs/pull/16) [US-8] Associações offline a pull requests do GitHub | encerrado sem integração | — | feat/us-07-workitem-comments |
| [#17](https://github.com/sebastiaofv/TeamOs/pull/17) [US-16] Gestão de anexos de workitem e pré-visualizações seguras | encerrado sem integração | — | feat/us-08-pull-request-links |
| [#18](https://github.com/sebastiaofv/TeamOs/pull/18) [US-17] Painel lateral de workitem responsivo e edição protegida | encerrado sem integração | — | feat/us-16-safe-attachments |
| [#19](https://github.com/sebastiaofv/TeamOs/pull/19) [US-19] Revisões de baseline aprovadas e variação de datas do projeto | encerrado sem integração | — | feat/us-17-workitem-side-panel |
| [#20](https://github.com/sebastiaofv/TeamOs/pull/20) [US-15] Drilldown de workitens no Gantt com preservação de contexto | encerrado sem integração | — | feat/us-19-date-variance-analysis |
| [#21](https://github.com/sebastiaofv/TeamOs/pull/21) [US-9] Dashboard de execução do projeto e drilldown da origem dos KPI | encerrado sem integração | — | feat/us-15-gantt-drilldown |
| [#22](https://github.com/sebastiaofv/TeamOs/pull/22) [US-10] Dashboard de portefólio transversal a produtos e cobertura de dados explícita | encerrado sem integração | — | feat/us-09-project-dashboard |
| [#23](https://github.com/sebastiaofv/TeamOs/pull/23) [US-13] Manutenção da aplicação e endurecimento de segurança final integrado | encerrado sem integração | — | feat/us-10-portfolio-dashboard |
| [#44](https://github.com/sebastiaofv/TeamOs/pull/44) US-1 · Tabela de workitems por projeto | integrado | 2026-10-19T20:10:30Z | main |
| [#45](https://github.com/sebastiaofv/TeamOs/pull/45) US-2 · Relações e bloqueios entre workitems | integrado | 2026-10-20T21:23:49Z | main |
| [#46](https://github.com/sebastiaofv/TeamOs/pull/46) US-3 · Participantes e responsável de um workitem | integrado | 2026-10-19T20:10:29Z | main |
| [#47](https://github.com/sebastiaofv/TeamOs/pull/47) fix: corrigir findings da auditoria US-1 e US-3 | integrado | 2026-10-19T20:41:09Z | main |
| [#48](https://github.com/sebastiaofv/TeamOs/pull/48) US-4 · Workflows personalizados por projeto | integrado | 2026-10-28T10:51:51Z | main |
| [#49](https://github.com/sebastiaofv/TeamOs/pull/49) US-5 · Roadmap: etapas hierárquicas e milestones | integrado | 2026-10-23T07:29:54Z | main |
| [#50](https://github.com/sebastiaofv/TeamOs/pull/50) US-6 · Histórico de alterações do workitem | integrado | 2026-10-21T07:52:32Z | main |
| [#51](https://github.com/sebastiaofv/TeamOs/pull/51) US-7 · Comentários em conversa no workitem | integrado | 2026-10-21T21:48:08Z | main |
| [#52](https://github.com/sebastiaofv/TeamOs/pull/52) US-8 · Associação de pull requests a workitems | integrado | 2026-10-21T21:27:47Z | main |
| [#55](https://github.com/sebastiaofv/TeamOs/pull/55) US-11 + US-21: definições do projeto e valores curados | integrado | 2026-10-23T07:38:58Z | main |
| [#56](https://github.com/sebastiaofv/TeamOs/pull/56) US-12 · Tipos de workitem, hierarquia e aceitação funcional | integrado | 2026-10-29T12:35:26Z | main |
| [#58](https://github.com/sebastiaofv/TeamOs/pull/58) feat: produtos, transferências e hierarquia de workitems (US-13) | integrado | 2026-11-01T21:48:06Z | main |
| [#59](https://github.com/sebastiaofv/TeamOs/pull/59) feat: project dashboard and recorded sprint analytics (US-9) | integrado | 2026-11-04T12:14:48Z | main |
| [#60](https://github.com/sebastiaofv/TeamOs/pull/60) US-20: Add Project Control for risks, decisions and deliverables | integrado | 2026-11-04T09:08:15Z | main |
| [#61](https://github.com/sebastiaofv/TeamOs/pull/61) Improve workitem attachments, todo updates and tab layouts (#39) | integrado | 2026-11-04T09:21:27Z | main |
| [#63](https://github.com/sebastiaofv/TeamOs/pull/63) US-23: abrir anexos no browser e otimizar previews | integrado | 2026-11-04T12:24:05Z | main |
| [#65](https://github.com/sebastiaofv/TeamOs/pull/65) US-22: manual Sprint lifecycle and frozen results | integrado | 2026-11-05T18:53:17Z | main |
| [#71](https://github.com/sebastiaofv/TeamOs/pull/71) US-29: In-app documentation and Agile methodology guide | integrado | 2026-11-05T09:20:29Z | main |
| [#75](https://github.com/sebastiaofv/TeamOs/pull/75) Implement agreed planning and workitem updates for #54 | integrado | 2026-11-05T20:11:42Z | main |
| [#76](https://github.com/sebastiaofv/TeamOs/pull/76) US-32: Add Classic and minimalist Modern theme selection | integrado | 2026-11-05T12:37:10Z | main |
| [#77](https://github.com/sebastiaofv/TeamOs/pull/77) US-28: reconciliar alterações concorrentes sem sobrescritas silenciosas | integrado | 2026-11-05T13:09:47Z | main |
| [#79](https://github.com/sebastiaofv/TeamOs/pull/79) US-24: refine workspace, Roadmap and blocking indicators | integrado | 2026-11-09T16:11:39Z | main |
| [#80](https://github.com/sebastiaofv/TeamOs/pull/80) feat: configure workflow automations and review Sprint closure (US-30) | integrado | 2026-11-09T07:29:57Z | main |
| [#82](https://github.com/sebastiaofv/TeamOs/pull/82) feat: store projects in folders with lazy history and attachments (US-25) | integrado | 2026-11-09T00:26:48Z | main |
| [#85](https://github.com/sebastiaofv/TeamOs/pull/85) fix: prevent Board workitems from causing horizontal page overflow (#84) | integrado | 2026-11-09T09:37:19Z | main |
| [#86](https://github.com/sebastiaofv/TeamOs/pull/86) perf: accelerate workitems, history and Dashboard (#78) | integrado | 2026-11-09T09:37:17Z | main |
| [#87](https://github.com/sebastiaofv/TeamOs/pull/87) feat: Dashboard Overview com widgets compactos e atividade integrada (#83) | aberto | — | main |
| [#88](https://github.com/sebastiaofv/TeamOs/pull/88) feat: reorganize project files into the v1 format (US-27) | integrado | 2026-11-11T23:13:53Z | main |

## Commits da main

As datas de commit abaixo são reais. Não foram deslocadas para corresponder ao cenário do protótipo.

| Commit | Data real | Trabalho |
|---|---|---|
| [ed7d65a](https://github.com/sebastiaofv/TeamOs/commit/ed7d65ad2030429dc1700f496af12a8838c2a866) | 2026-02-13T13:13:48Z | first commit |
| [fe0e33b](https://github.com/sebastiaofv/TeamOs/commit/fe0e33b112103d0c9da3eb291731f4ef78f04dd2) | 2026-02-13T13:36:53Z | Remove kanban-board.json and implement portfolio view in kanban.html with new UI components and functionality for managing multiple boards. Update README.md to reflect new features and usage instructions. |
| [88fbd0e](https://github.com/sebastiaofv/TeamOs/commit/88fbd0eb2d955c6b2a1f7f3efc19cbff9c24fbce) | 2026-02-13T13:37:44Z | Remove markathon-board.json and test-board.json files. Update .DS_Store binary file. |
| [c4ba9af](https://github.com/sebastiaofv/TeamOs/commit/c4ba9afdac6797f0a8247b462f0f7b0e6ad0abdb) | 2026-02-13T13:39:16Z | Remove example.portfolio.json and markathon.board.json files. Update README.md to reflect new file paths for example board and portfolio config. |
| [3b42168](https://github.com/sebastiaofv/TeamOs/commit/3b42168add8aecd25ac58f1158ad131a0da25b36) | 2026-02-13T13:40:07Z | Remove unused example files and update README.md to clarify current configuration file structure. |
| [16aaacb](https://github.com/sebastiaofv/TeamOs/commit/16aaacb301934f56322f5d6c6359e065df6c3e7d) | 2026-02-13T13:40:26Z | Delete .DS_Store |
| [ec3b1e5](https://github.com/sebastiaofv/TeamOs/commit/ec3b1e5336ebc49d9d81c037d5b4b203a70bc9d9) | 2026-02-14T12:51:26Z | Remove kanban.html, README.md, markathon.board.json, and example.portfolio.json files, cleaning up the project structure and eliminating unused components. |
| [2b6eba9](https://github.com/sebastiaofv/TeamOs/commit/2b6eba99c8002e680d86c58110fa53515fe9b297) | 2026-02-14T12:53:44Z | Refactor project structure by removing unused kanban.html and example files, and updating README.md for clarity on current configuration. |
| [9d1b18d](https://github.com/sebastiaofv/TeamOs/commit/9d1b18df7576e4c5d7cff335ca4fd7db276d6a4b) | 2026-02-14T13:10:41Z | Update meetings.html to display loading message for meeting count and remove hardcoded meeting data, streamlining the file for future dynamic data integration. |
| [d6d60a5](https://github.com/sebastiaofv/TeamOs/commit/d6d60a59188735e11bbbd32c57868dbc8a339ae1) | 2026-02-14T13:12:06Z | Update meeting data structure to remove hardcoded attendee counts and display dynamic participant counts in meetings.html. |
| [745e6d4](https://github.com/sebastiaofv/TeamOs/commit/745e6d4988e715db70cf958627bf20d57be6e7bf) | 2026-02-16T15:26:38Z | feat: add shortcut help modal and save UX shortcuts |
| [3250ac3](https://github.com/sebastiaofv/TeamOs/commit/3250ac3293ce971b812238e815e92fc5e00b0d72) | 2026-02-16T20:12:13Z | refactor: update kanban layout and schema versions, enhance portfolio and board configurations |
| [13f5b2b](https://github.com/sebastiaofv/TeamOs/commit/13f5b2ba769221a5dc8a7449e2b65c1d089e0fea) | 2026-02-16T20:28:05Z | refactor: enhance kanban layout and improve board configuration options |
| [80bb908](https://github.com/sebastiaofv/TeamOs/commit/80bb9088808fb32981686634e330b3487e5e0433) | 2026-02-16T20:44:40Z | style: enhance logs.html with new color variables and badge styles for logs and audits |
| [0e2770a](https://github.com/sebastiaofv/TeamOs/commit/0e2770a36b45c30e47bc94080fd72b2b90585777) | 2026-02-18T18:22:54Z | feat: implement dynamic meeting file resolution and loading in meetings.html |
| [6646e5f](https://github.com/sebastiaofv/TeamOs/commit/6646e5f35b7f434d3dce83529325c89bea352394) | 2026-02-18T21:01:10Z | chore: remove outdated meeting files and associated data structures to streamline project organization |
| [a2c0b6a](https://github.com/sebastiaofv/TeamOs/commit/a2c0b6a5bcd65957cb4ee45bbfce3d829721793b) | 2026-02-25T19:47:34Z | update |
| [db108f9](https://github.com/sebastiaofv/TeamOs/commit/db108f9ce917eca06c98ff200a8c993f9e822439) | 2026-02-25T21:39:05Z | feat: enhance kanban filters by adding archive and sort options for tasks and portfolios, and remove outdated example portfolio file |
| [9c6a35d](https://github.com/sebastiaofv/TeamOs/commit/9c6a35dca4e746096e627f3cb900d35288b8b30f) | 2026-02-25T21:57:47Z | feat: implement sortable columns in kanban table and remove legacy portfolio sort dropdown |
| [2b3e746](https://github.com/sebastiaofv/TeamOs/commit/2b3e7465da7ee7b062759b69096bfddd970f7e0a) | 2026-02-25T22:20:44Z | feat: add scoring system for tasks based on priority and effort, update kanban UI for due date input, and remove tags functionality |
| [f633457](https://github.com/sebastiaofv/TeamOs/commit/f6334571f42180145f0c760a08770087c67d33dd) | 2026-02-25T22:28:04Z | refactor: update task creation and modal handling in tests, enhance portfolio row seeding, and improve search and filter functionalities |
| [315bc1b](https://github.com/sebastiaofv/TeamOs/commit/315bc1bebc023b17b9a5a952693aa8d38e22f0f3) | 2026-02-26T19:13:36Z | feat: introduce portfolio view toggle and enhance kanban layout with new column styles, remove timeline functionality and related documentation |
| [fd78ea6](https://github.com/sebastiaofv/TeamOs/commit/fd78ea6dc6a6f584e156260ac44d27172062ca96) | 2026-02-26T20:29:08Z | feat: update kanban title, enhance styling for chips and modals, and improve task board layout with new sorting options |
| [c85818c](https://github.com/sebastiaofv/TeamOs/commit/c85818ca4eb87af27d7c5c4284cf8f30fbd0aa51) | 2026-02-26T20:41:15Z | feat: add checklist editor functionality to kanban tasks, enhancing task management with dynamic item addition and removal |
| [d52675c](https://github.com/sebastiaofv/TeamOs/commit/d52675c10de4d4dd1077efb1cf460bd583523000) | 2026-02-26T20:43:13Z | fix: update kanban title in HTML and JavaScript to use 'TeamOS → Kanban' for consistency |
| [79fea9d](https://github.com/sebastiaofv/TeamOs/commit/79fea9d3fb88ff138c946e696d506520c451c4ee) | 2026-02-26T21:22:26Z | feat: add attachment functionality to kanban tasks, including UI for adding and displaying attachments in task details |
| [9e9d21f](https://github.com/sebastiaofv/TeamOs/commit/9e9d21f7eb4a9893ff5fe2f735716b2d06fd4f8e) | 2026-02-26T21:49:28Z | feat: enhance kanban task management with assignee and blocked status, including UI updates for task details and filtering options |
| [7ffaa30](https://github.com/sebastiaofv/TeamOs/commit/7ffaa30f9eef46360d24b600c59817a3bd76574e) | 2026-02-26T21:51:34Z | refactor: restructure shortcut display logic in kanban UI for improved organization and readability |
| [d75b55c](https://github.com/sebastiaofv/TeamOs/commit/d75b55caf5e59a4045058bc2cf21d18f136ccc2c) | 2026-02-26T22:06:58Z | chore: update board schema version from 4 to 1 in kanban HTML and tests for consistency |
| [f1a161b](https://github.com/sebastiaofv/TeamOs/commit/f1a161bbe3dc925d2ef707511ada02566873ca6f) | 2026-02-26T22:26:09Z | refactor: remove unused board view and related UI elements from kanban HTML, update app ID in tests for consistency |
| [3696293](https://github.com/sebastiaofv/TeamOs/commit/3696293ed29cb19274062b8b021d5de045ba7088) | 2026-02-26T22:33:00Z | feat: update project creation flow in kanban HTML to use default project name from file picker, enhance task details with assignee and blocker status, and remove example board files for cleaner project structure |
| [57f8f81](https://github.com/sebastiaofv/TeamOs/commit/57f8f81a8e08011c424d5b7902e710a7ed59df8a) | 2026-02-26T22:58:46Z | feat: implement project save state management in kanban HTML, including UI updates for save status and error handling, and enhance test coverage for project creation and import scenarios |
| [5d563dd](https://github.com/sebastiaofv/TeamOs/commit/5d563dd84838b47fd5950c0944209146cc149adc) | 2026-02-26T23:09:57Z | feat: introduce BoardRepository for improved board data management in kanban HTML, including serialization, validation, and enhanced error handling; add logging functionality and update README for internal architecture clarity |
| [632c5d7](https://github.com/sebastiaofv/TeamOs/commit/632c5d7d44b5474d932049eff6d451e2198bc445) | 2026-02-27T20:07:24Z | update |
| [bfd1383](https://github.com/sebastiaofv/TeamOs/commit/bfd1383370bd307be1f64cf8a6240ad9cc5c209a) | 2026-02-28T22:37:33Z | feat: refactor board and task payload construction in tests for improved maintainability and clarity, utilizing helper functions to streamline data handling |
| [26853a2](https://github.com/sebastiaofv/TeamOs/commit/26853a2238d22d5e801d1d82d6439547fcb2ea92) | 2026-02-28T23:33:42Z | feat: enhance task filtering capabilities in kanban HTML, improving user experience by allowing users to filter tasks based on assignee and blocked status |
| [fd79a84](https://github.com/sebastiaofv/TeamOs/commit/fd79a84c78ed25ebc8dfb8f51ec0ac209b5fc2f1) | 2026-03-09T09:56:06Z | style: improve code formatting and readability in kanban HTML, including consistent spacing and indentation for CSS properties and HTML elements |
| [30baa6f](https://github.com/sebastiaofv/TeamOs/commit/30baa6f0bb2ac6ef9c20384bad4a0198f9ccab84) | 2026-03-11T19:11:18Z | update |
| [6ba7e68](https://github.com/sebastiaofv/TeamOs/commit/6ba7e68ab80bc6ff5ed7d4aa00c7d333e396e3d8) | 2026-03-11T20:32:35Z | feat: implement multi-assignee support in kanban HTML and related components, updating task structure to use an array for assignees; enhance UI for adding assignees and update tests for new functionality |
| [ab8cb7a](https://github.com/sebastiaofv/TeamOs/commit/ab8cb7aff22dfb2913adbf7606ad8046d244c3b0) | 2026-03-11T21:00:16Z | refactor: update kanban HTML to use consistent IDs for buttons and inputs, improving accessibility and maintainability; modify test cases to reflect changes in button functionality and ensure proper UI behavior |
| [2996818](https://github.com/sebastiaofv/TeamOs/commit/29968182f4a3e74905f002daf68f0f5ef8e08cec) | 2026-03-11T21:09:58Z | feat: implement hovered card functionality in kanban HTML, allowing shortcuts to prioritize hovered cards over selected ones; update tests to validate new behavior and ensure proper interaction with task details |
| [4aaea74](https://github.com/sebastiaofv/TeamOs/commit/4aaea742ecf5834773ffca6c435220105f1266eb) | 2026-03-11T21:15:22Z | feat: add attachment download functionality and duplicate handling in kanban HTML; enhance UI with new download button and update tests to verify duplicate attachment behavior |
| [b725d04](https://github.com/sebastiaofv/TeamOs/commit/b725d0432f39c641d9dd9ada9f2f2a05a4290d2d) | 2026-03-11T22:19:08Z | feat: implement reset filters functionality in kanban HTML, allowing users to clear filters and restore default sorting; add tests to verify filter reset behavior and scroll position preservation in timeline events |
| [45593d2](https://github.com/sebastiaofv/TeamOs/commit/45593d2e3e6f237207c43618b9b5958f48f01665) | 2026-03-11T22:55:57Z | chore: remove outdated agents guide and delete unused project board JSON file, streamlining the kanban repository |
| [f9d0040](https://github.com/sebastiaofv/TeamOs/commit/f9d004065c4e999368539874f2c262ca8ec39d6b) | 2026-03-11T23:10:33Z | feat: add comprehensive agent guide for Boards TeamOs, detailing operational support roles, analysis protocols, and request handling for Kanban boards |
| [2aa5834](https://github.com/sebastiaofv/TeamOs/commit/2aa583401456573102955471b661f1b17dcc9c4b) | 2026-03-17T09:50:56Z | update |
| [f82f0ec](https://github.com/sebastiaofv/TeamOs/commit/f82f0ec0ea639c1f57d6d2d7480c421acb114d5b) | 2026-03-18T18:37:29Z | docs: add roadmap view design spec |
| [d136266](https://github.com/sebastiaofv/TeamOs/commit/d13626677672962b1ab0b801073687b77f14d0c1) | 2026-03-18T18:47:40Z | feat: add roadmap schema foundation |
| [f276db4](https://github.com/sebastiaofv/TeamOs/commit/f276db4cca28e2e8354e88799186bb23b48bfd7f) | 2026-03-18T18:57:22Z | fix: tighten roadmap schema validation |
| [f04e31f](https://github.com/sebastiaofv/TeamOs/commit/f04e31fdaa93f6daa290d27121406d5e3fe862ab) | 2026-03-18T19:05:02Z | feat: add portfolio roadmap view toggle |
| [eb6071e](https://github.com/sebastiaofv/TeamOs/commit/eb6071ec8f24708a26b7045762dac55826a12175) | 2026-03-18T19:13:05Z | fix: reset invalid portfolio roadmap state |
| [b9e4bb4](https://github.com/sebastiaofv/TeamOs/commit/b9e4bb4740a0a1ac5c7e87554ab5df9743b93b3b) | 2026-03-18T19:15:21Z | fix: clear invalid portfolio selection on startup |
| [56c25a9](https://github.com/sebastiaofv/TeamOs/commit/56c25a93f7fa3f2d23523680b6c2b215ca25a9e7) | 2026-03-18T19:25:44Z | feat: add roadmap item management and task assignment |
| [6e576a5](https://github.com/sebastiaofv/TeamOs/commit/6e576a5f1ae601901d7f11f80c42b04c5e66e117) | 2026-03-18T19:34:04Z | fix: preserve roadmap ids and modal shortcuts |
| [4e03fa2](https://github.com/sebastiaofv/TeamOs/commit/4e03fa2ebdd0dc0071201e368f49cb034994c835) | 2026-03-18T19:43:41Z | feat: add bulk sprint creation from board tasks |
| [7d6ae41](https://github.com/sebastiaofv/TeamOs/commit/7d6ae417b6834d400782b760d9b78fde4fa02768) | 2026-03-18T19:53:57Z | fix: replay bulk sprint timeline events |
| [ffc895e](https://github.com/sebastiaofv/TeamOs/commit/ffc895e4eb9d22ed00d54d8867f0981d259ad08c) | 2026-03-18T20:07:01Z | feat: render roadmap timeline for selected boards |
| [871a179](https://github.com/sebastiaofv/TeamOs/commit/871a179289e4c577d0b8d3f51f3dc127384fec7c) | 2026-03-18T20:24:48Z | fix: open historical roadmap task details |
| [ad9c189](https://github.com/sebastiaofv/TeamOs/commit/ad9c1891ef13bb33986db9ab91a99b3a7d94a0e8) | 2026-03-18T20:35:52Z | refine: compact roadmap timeline layout |
| [3e18b53](https://github.com/sebastiaofv/TeamOs/commit/3e18b53b43ca32b912578fb25cfbd71400e1c8bf) | 2026-03-18T20:41:09Z | fix: use projected roadmap task details in preview |
| [f2c1771](https://github.com/sebastiaofv/TeamOs/commit/f2c1771c926d63317e630d92b91c0a9cb7af43f7) | 2026-03-18T20:54:24Z | fix: replay roadmap timeline updates |
| [b999386](https://github.com/sebastiaofv/TeamOs/commit/b999386118a6c62969bb6cf785e13398a2996598) | 2026-03-18T21:01:50Z | refine: align roadmap layout and task grid |
| [d17880f](https://github.com/sebastiaofv/TeamOs/commit/d17880f2df3ea98dc1be01c720369d09c12dadd1) | 2026-03-18T21:16:06Z | refine: compact roadmap timeline surface |
| [b722e4d](https://github.com/sebastiaofv/TeamOs/commit/b722e4d609e8d585c8dd9d64aa17c83bfb431a70) | 2026-03-18T21:22:08Z | refine: align roadmap task grid and header actions |
| [65737b2](https://github.com/sebastiaofv/TeamOs/commit/65737b21f8a8eff83ae7e1033942d8a4df716a86) | 2026-03-18T21:26:57Z | fix: hide bulk actions without selection |
| [489b389](https://github.com/sebastiaofv/TeamOs/commit/489b38993dfe85b1a539fa4d77b2a1e983b95d2e) | 2026-03-18T21:28:36Z | fix: clamp roadmap timeline bars to track |
| [72efb63](https://github.com/sebastiaofv/TeamOs/commit/72efb6304e546aaf7e6b27c59b8a5ec9eed58961) | 2026-03-18T21:34:35Z | refine: align roadmap axis and row actions |
| [77903c4](https://github.com/sebastiaofv/TeamOs/commit/77903c4988cbd50d8c4d4f752f3945defcfc9952) | 2026-03-18T21:38:15Z | fix: unify roadmap date positioning |
| [fb494d3](https://github.com/sebastiaofv/TeamOs/commit/fb494d37aca13ba9a9d87b152cfed65cc87ef800) | 2026-03-18T21:46:52Z | refine: adjust padding in kanban layout for improved spacing |
| [c4d10a7](https://github.com/sebastiaofv/TeamOs/commit/c4d10a725b1c85fca3da77fbf34a5a047e99ad71) | 2026-03-18T23:10:39Z | refine: update roadmap view styles and layout for consistency |
| [63f2970](https://github.com/sebastiaofv/TeamOs/commit/63f297026aa2771b27ab5bab22a6a58ac85cea07) | 2026-03-18T23:17:32Z | feat: add today marker to roadmap axis for improved visibility |
| [3ff27e3](https://github.com/sebastiaofv/TeamOs/commit/3ff27e304f125eb7c56fb3cc3c051ba123a9da53) | 2026-03-18T23:28:54Z | refine: adjust roadmap element dimensions for improved layout |
| [a96c991](https://github.com/sebastiaofv/TeamOs/commit/a96c991bb31391435196ed77f8b3d069d4b97df7) | 2026-03-19T08:39:20Z | update |
| [dbd7813](https://github.com/sebastiaofv/TeamOs/commit/dbd7813c2701d33c2a19805c028fafbe61d5e62f) | 2026-04-03T18:50:57Z | chore: ignore local worktrees |
| [a8421a6](https://github.com/sebastiaofv/TeamOs/commit/a8421a603fc7396ea274dd5290820439b4257c0f) | 2026-04-03T19:07:04Z | feat: add portfolio calendar view |
| [2837211](https://github.com/sebastiaofv/TeamOs/commit/28372113b74e9d1ac3ef0223e38c6c02e2578d89) | 2026-04-03T19:08:16Z | chore: ignore local worktrees |
| [dc8a525](https://github.com/sebastiaofv/TeamOs/commit/dc8a5253e69687a1aa0f06a1df2eb2e02eaf7c09) | 2026-04-03T19:08:44Z | Merge branch 'feature/portfolio-calendar' |
| [33dcf39](https://github.com/sebastiaofv/TeamOs/commit/33dcf39df574c0f61858687cbc3ae78ac312b146) | 2026-04-03T20:57:54Z | feat: add calendar view |
| [3d87540](https://github.com/sebastiaofv/TeamOs/commit/3d8754082844a8cd5c0265658e3644536b67cd5a) | 2026-04-03T21:07:20Z | fix: update portfolio calendar year handling and improve month name display |
| [e8c3bee](https://github.com/sebastiaofv/TeamOs/commit/e8c3beec248a7dc0bb7f5ceef9559bb41ec45105) | 2026-04-03T21:20:56Z | docs: add calendar heat map design spec |
| [66028f7](https://github.com/sebastiaofv/TeamOs/commit/66028f75375589dc38b13947da59932ba3d32d60) | 2026-04-03T21:28:03Z | chore: ignore repo worktrees |
| [0bf1c22](https://github.com/sebastiaofv/TeamOs/commit/0bf1c22836df1ac15af44a575e8217c85cd27c35) | 2026-04-03T21:38:14Z | feat: add calendar heat map toggle state |
| [6421cd1](https://github.com/sebastiaofv/TeamOs/commit/6421cd1b52037f86f92e42176f8262ade7370b96) | 2026-04-03T21:43:58Z | test: cover calendar heat map toggle interactions |
| [8bf5fab](https://github.com/sebastiaofv/TeamOs/commit/8bf5fab4e505f41698d9305f0a2ad45de281db17) | 2026-04-03T21:53:27Z | fix: expose calendar heat map mode state |
| [a39dda1](https://github.com/sebastiaofv/TeamOs/commit/a39dda112f4b5d86b2cea81a2f4761ec0ef4ca0c) | 2026-04-03T23:09:23Z | feat: add year calendar heat map |
| [2b056dc](https://github.com/sebastiaofv/TeamOs/commit/2b056dcd0f9519c634af901f7032dae8b7beab94) | 2026-04-03T23:14:04Z | feat: add month calendar heat map |
| [67bcd66](https://github.com/sebastiaofv/TeamOs/commit/67bcd6689936d1141a98bb329b216ddef7d6abf7) | 2026-04-03T23:17:57Z | feat: add portfolio calendar heat map |
| [7841780](https://github.com/sebastiaofv/TeamOs/commit/78417800fb964a7c8d0c018d9dd88509b6547dc3) | 2026-04-03T23:24:43Z | feat: add calendar heat map implementation plan |
| [1bc4461](https://github.com/sebastiaofv/TeamOs/commit/1bc4461b178154ce883d187a4bc29aad6339525c) | 2026-04-04T11:27:35Z | docs: add calendar density design spec |
| [44290a6](https://github.com/sebastiaofv/TeamOs/commit/44290a6feaab5e8dc6deabd6c576c31e8bb57828) | 2026-04-08T19:34:07Z | feat: compact month calendar items |
| [cc12449](https://github.com/sebastiaofv/TeamOs/commit/cc124490d93c77071fb168458aa2f9cb40955933) | 2026-04-08T19:55:45Z | docs: add calendar day item cap design spec |
| [b044eec](https://github.com/sebastiaofv/TeamOs/commit/b044eec1ffc0e60c4e972fc389c14c5766891e02) | 2026-04-08T20:04:56Z | docs: add task due date picker design spec |
| [50979ed](https://github.com/sebastiaofv/TeamOs/commit/50979edb13688bcdf1c8447df849b2d1b6ddb8c7) | 2026-04-08T20:20:34Z | update |
| [894498a](https://github.com/sebastiaofv/TeamOs/commit/894498a5030115de60b62ceadf64c7c11e8e44da) | 2026-04-08T20:22:09Z | docs: add task checklist reorder design spec |
| [db71d5e](https://github.com/sebastiaofv/TeamOs/commit/db71d5e895a20f6a4dd7be29aeb2c3c42c540603) | 2026-04-08T20:33:13Z | updates |
| [037f301](https://github.com/sebastiaofv/TeamOs/commit/037f301f8040208087ada796e5511f581090ce37) | 2026-04-21T21:59:24Z | feat: add tag management for tasks with editor and validation |
| [c7f868b](https://github.com/sebastiaofv/TeamOs/commit/c7f868bce3ea4b7ac00823bb5f2166469dfddac3) | 2026-04-21T22:00:20Z | feat: highlight today's date in portfolio calendar with background color |
| [7b3a036](https://github.com/sebastiaofv/TeamOs/commit/7b3a0369a2e0d9d4c8493e55bd6449388a2484ac) | 2026-04-23T19:38:16Z | feat: implement theme toggle functionality with persistence for dark mode |
| [33f1aa3](https://github.com/sebastiaofv/TeamOs/commit/33f1aa3b9b6b52d59f028c5a8c0bffd930dd79bf) | 2026-09-11T15:02:37Z | docs: add Vite + React + Tailwind migration design spec |
| [e78741b](https://github.com/sebastiaofv/TeamOs/commit/e78741b72d9b51f3b780998b874e7b56c72319d0) | 2026-09-11T15:09:58Z | docs: add Phase 1 domain extraction implementation plan |
| [9b774fe](https://github.com/sebastiaofv/TeamOs/commit/9b774feb24def5b7e86aebe5dec1c63aea6461e4) | 2026-09-11T15:12:53Z | docs: require verifying failing assertions against pre-migration source |
| [6bea484](https://github.com/sebastiaofv/TeamOs/commit/6bea48489e26ee13fc694036b7d2749faa245a89) | 2026-09-11T15:37:14Z | refactor: serve kanban app through Vite as an ES module |
| [65b1c7b](https://github.com/sebastiaofv/TeamOs/commit/65b1c7b8d02d5006644b0aa64a4757b0564ecd33) | 2026-09-11T15:40:22Z | docs: correct test count to 94 and record white-box coupling finding |
| [abc898c](https://github.com/sebastiaofv/TeamOs/commit/abc898cabd0c978c690a1f4ff46631ef7c936f55) | 2026-09-11T15:47:17Z | docs: correct function classification to include async functions |
| [2044713](https://github.com/sebastiaofv/TeamOs/commit/2044713a17b57f2aef4178a82065b637c3b45a36) | 2026-09-11T15:50:22Z | fix: move favicon.ico into public/ so vite build copies it to dist/ |
| [65ed59f](https://github.com/sebastiaofv/TeamOs/commit/65ed59f4413dd077696c00b0f3c9ab4cfb4ab612) | 2026-09-11T15:54:36Z | refactor: extract board and app constants to src/domain/constants.js |
| [952facb](https://github.com/sebastiaofv/TeamOs/commit/952facb971bb7456d983538099fcb91612ec5e77) | 2026-09-11T16:02:32Z | refactor: extract generic helpers to src/domain/util.js with unit tests |
| [1a0ea60](https://github.com/sebastiaofv/TeamOs/commit/1a0ea60cb43bb030b63a7c8743fa4921e91c1df5) | 2026-09-11T16:06:40Z | refactor: refine extract-domain backtick guard and extract formatFileSize |
| [4b7af4a](https://github.com/sebastiaofv/TeamOs/commit/4b7af4afc348b8eff48d7e69d1daf69ab1c8b608) | 2026-09-11T16:12:58Z | docs: reclassify functions using transitive call-graph analysis |
| [44787ba](https://github.com/sebastiaofv/TeamOs/commit/44787ba9b8549bd80da584b47f298244ce8b9d38) | 2026-09-11T16:15:34Z | fix: harden backtick guard against escaped backticks, extend util test coverage |
| [e7f1187](https://github.com/sebastiaofv/TeamOs/commit/e7f11878083a7d278a50406ba95a280600ac2171) | 2026-09-11T16:23:37Z | refactor: extract task normalizers to src/domain/task.js with unit tests |
| [a918fa0](https://github.com/sebastiaofv/TeamOs/commit/a918fa0a4cc1313bfb7704f3d3b7806cb40d2019) | 2026-09-11T16:27:46Z | docs: resequence Phase 1 extraction by dependency layer |
| [7a1af9c](https://github.com/sebastiaofv/TeamOs/commit/7a1af9c00fc83ef302bee4e69bcbaa4ed9d493db) | 2026-09-11T16:34:27Z | fix(extract-domain): fail loudly on extracted calls to still-in-main.js functions |
| [793340d](https://github.com/sebastiaofv/TeamOs/commit/793340dd84de9f59b91a45889f58c5437614b974) | 2026-09-11T22:02:47Z | docs: harden function classifier and regenerate extraction sequence |
| [98a69d9](https://github.com/sebastiaofv/TeamOs/commit/98a69d94bbbcbf6b1e32a91e9b9a84dfd740f91d) | 2026-09-11T22:13:49Z | refactor: extract board/roadmap pure functions to src/domain with unit tests |
| [470e000](https://github.com/sebastiaofv/TeamOs/commit/470e000488d854a764e17c435c768e28e6d23dce) | 2026-09-11T22:21:37Z | fix(extract-domain): stop treating template-literal text as calls |
| [3fe780c](https://github.com/sebastiaofv/TeamOs/commit/3fe780c3a2313b8daddf47649ff977ca30e951dd) | 2026-09-11T22:37:28Z | refactor: extract attachment/calendar pure functions and 5 util normalizers |
| [8feb541](https://github.com/sebastiaofv/TeamOs/commit/8feb541cbed8b53cc4b979d7961214f2443140ad) | 2026-09-11T22:40:05Z | docs: detect callback references in classifier, resequence again |
| [686fc94](https://github.com/sebastiaofv/TeamOs/commit/686fc949bbaedd0a8740235d322db3cf1bf02435) | 2026-09-12T09:21:48Z | refactor: extract 14 calendar pure functions to src/domain/calendar.js |
| [1b64f1a](https://github.com/sebastiaofv/TeamOs/commit/1b64f1a95db5b32693d0702acdc843d017ccd34f) | 2026-09-12T09:23:15Z | docs: exclude HTML-emitting functions from extraction sequence |
| [14b3820](https://github.com/sebastiaofv/TeamOs/commit/14b382073ee6c699ef84489a694a155cfb168662) | 2026-09-12T11:48:54Z | refactor: extract serialize/timeline pure functions to src/domain |
| [8ac94c7](https://github.com/sebastiaofv/TeamOs/commit/8ac94c79372a922af6811cac78357c5eabc4ab7b) | 2026-09-12T11:51:28Z | docs: fix classifier template-literal stripper, resequence |
| [7406b51](https://github.com/sebastiaofv/TeamOs/commit/7406b513585fc0e56ab6786349ec80c183f7b2fe) | 2026-09-12T12:09:13Z | refactor: extract attachment/board/calendar/persistence/roadmap pure functions |
| [b7b0014](https://github.com/sebastiaofv/TeamOs/commit/b7b0014596dbfb4018de7e6d034f59609fbfbb7e) | 2026-09-12T12:16:12Z | refactor: extract roadmap/scoring/serialize/task pure functions to src/domain |
| [a78af2a](https://github.com/sebastiaofv/TeamOs/commit/a78af2a5f6bc39ee2f0dbdf88b46965a2f437058) | 2026-09-12T12:21:29Z | refactor: extract task status, timeline diff, and util helpers to src/domain |
| [7e9b4f2](https://github.com/sebastiaofv/TeamOs/commit/7e9b4f2a73a7002df5345e9ff29e4b02eead9bc2) | 2026-09-12T12:30:48Z | refactor: extract attachments/calendar/roadmap/task/timeline pure functions |
| [fcade73](https://github.com/sebastiaofv/TeamOs/commit/fcade7375a5faf4489c1b3a4e3b939fd35331181) | 2026-09-12T12:38:58Z | refactor: extract attachment/roadmap/task/timeline/calendar pure functions |
| [6298486](https://github.com/sebastiaofv/TeamOs/commit/6298486a0da7582e4db1066ebd0b73c54dd395a7) | 2026-09-12T12:45:36Z | refactor: extract attachment/roadmap/scoring/timeline pure functions to src/domain |
| [30c17a9](https://github.com/sebastiaofv/TeamOs/commit/30c17a9bc5fc687f837de11bce6a793979ac38e2) | 2026-09-12T14:15:27Z | refactor: extract board validation and task normalization to src/domain |
| [6132c21](https://github.com/sebastiaofv/TeamOs/commit/6132c21f628ce33b48d7d7effb01992f1cc519b8) | 2026-09-12T14:21:18Z | refactor: extract board snapshot/serialize and task timeline pure functions |
| [ce79181](https://github.com/sebastiaofv/TeamOs/commit/ce791817648ab88ad0f2b6e1abd77a5c768b32d0) | 2026-09-12T14:31:37Z | refactor: extract final 5 timeline functions, complete domain extraction |
| [b438246](https://github.com/sebastiaofv/TeamOs/commit/b438246e26484f3e9a947854eb343766af9e6444) | 2026-09-12T14:33:48Z | refactor: extract File System Access wrapper to src/persistence |
| [d36ceb3](https://github.com/sebastiaofv/TeamOs/commit/d36ceb360da8eeaf077f1273d0ef3d0b93a6e887) | 2026-09-12T14:41:30Z | build: wire up Tailwind pipeline (preflight off) and rewrite README |
| [1e2e25b](https://github.com/sebastiaofv/TeamOs/commit/1e2e25b97f002f064053f9aad4511c1256167788) | 2026-09-12T14:42:29Z | build: rename postcss config to .mjs to silence build warning |
| [6c481cd](https://github.com/sebastiaofv/TeamOs/commit/6c481cd861ff4f8e26e63189fe969684d4e95729) | 2026-09-12T14:45:05Z | test: convert the last shim-dependent Playwright tests to Vitest |
| [943730c](https://github.com/sebastiaofv/TeamOs/commit/943730cb4750a1c8bfd955d6c404305e3832ef41) | 2026-09-12T14:54:17Z | chore: add dev server launch config |
| [53c0b1d](https://github.com/sebastiaofv/TeamOs/commit/53c0b1d94c76807e3274f03c758d1d57cff06fb3) | 2026-09-12T14:54:17Z | Merge Phase 1: extract domain layer from single-file kanban.html |
| [4e6d56d](https://github.com/sebastiaofv/TeamOs/commit/4e6d56de31eb9b449ce7d906074e43e7e8fcdb56) | 2026-09-12T15:15:49Z | refactor: extract application state to src/state/store.js |
| [57da391](https://github.com/sebastiaofv/TeamOs/commit/57da39102571b9f942794a65bf0dacc6c1733ce1) | 2026-09-12T15:31:27Z | refactor: extract persistence layer to src/persistence |
| [bb6f59d](https://github.com/sebastiaofv/TeamOs/commit/bb6f59dfa8804a005d84b91846aa4c3725cd6f3f) | 2026-09-12T15:32:43Z | fix(extract-domain): catch member-expression bases, not just calls |
| [66c87c0](https://github.com/sebastiaofv/TeamOs/commit/66c87c0e17f8546eb7191df404a2deefb04109e7) | 2026-09-12T18:16:05Z | chore: remove dead code left over from the domain extraction |
| [579bf90](https://github.com/sebastiaofv/TeamOs/commit/579bf905cfcfa84b53eae19da89e3d5f2eb327ca) | 2026-09-12T18:23:09Z | Merge chore/dead-code-cleanup: remove dead code left over from domain extraction |
| [ac7f3ae](https://github.com/sebastiaofv/TeamOs/commit/ac7f3ae2e99ff649e53b496221ff2ae96eba3a91) | 2026-09-12T18:26:59Z | docs: decide black-box-first test strategy for Phase 2 and plan the rewrite |
| [e7c5695](https://github.com/sebastiaofv/TeamOs/commit/e7c5695f5645a31af25341d74353b643c553ca19) | 2026-09-12T19:29:36Z | test(e2e): drive the suite through the page instead of app internals |
| [085b477](https://github.com/sebastiaofv/TeamOs/commit/085b4775e25de6304d6440093cad06b37ded1dac) | 2026-09-12T19:31:46Z | refactor: remove window test bridge |
| [0de3f71](https://github.com/sebastiaofv/TeamOs/commit/0de3f7157b14d2753358390d638b4dbce894a922) | 2026-09-13T13:52:28Z | Merge test/black-box-e2e: black-box Playwright suite, remove window bridge |
| [93bd537](https://github.com/sebastiaofv/TeamOs/commit/93bd53786b5590de7f16ad76c9b6c2574562b639) | 2026-09-13T14:16:25Z | docs: design Phase 2.0 React foundation and legacy bridge |
| [45cf452](https://github.com/sebastiaofv/TeamOs/commit/45cf452c740ff27d315d4eeea02d332827921776) | 2026-09-13T14:26:16Z | docs: plan Phase 2.0 React foundation and legacy bridge |
| [218aaed](https://github.com/sebastiaofv/TeamOs/commit/218aaed02dc58a26e696cecb3f3764f77ba68ab3) | 2026-09-13T14:28:31Z | test(visual): capture legacy screenshot baselines for shortcuts and help dialogs |
| [1709b11](https://github.com/sebastiaofv/TeamOs/commit/1709b11758cdaf88264b3b89b4e6fb5df190e76c) | 2026-09-13T14:34:20Z | feat: mount a React root beside legacy with a version-tick state bridge |
| [6f5fbf9](https://github.com/sebastiaofv/TeamOs/commit/6f5fbf9deb0c3ab500c6e9798d84b7403065d3a2) | 2026-09-13T14:38:31Z | feat: add activeDialog state with open/close dialog actions |
| [8a82576](https://github.com/sebastiaofv/TeamOs/commit/8a82576289862d8b8d8a2fef5690aaa028184c8f) | 2026-09-13T14:46:58Z | feat: port Help modal to Radix Dialog on the React bridge |
| [cad4605](https://github.com/sebastiaofv/TeamOs/commit/cad46054957f93004471c79aea95c39aeb9900e7) | 2026-09-13T14:56:43Z | refactor: share dialog focus return via useReturnFocus and drop dead closeHelpModal |
| [5ffa72f](https://github.com/sebastiaofv/TeamOs/commit/5ffa72f122e3d6e066a65c14718dae59d51d07dc) | 2026-09-13T15:05:46Z | feat: port Shortcuts modal to Radix Dialog and document the React bridge |
| [8095256](https://github.com/sebastiaofv/TeamOs/commit/8095256942bb0eca25b970f1ed861337ab2ae29b) | 2026-09-13T15:14:57Z | docs: document bridge memoisation pitfalls, refresh README, record plan deviations |
| [3b5de1c](https://github.com/sebastiaofv/TeamOs/commit/3b5de1c5895e065dcb3eb793fe0fbbd602d7906f) | 2026-09-13T16:34:04Z | Merge phase2/foundation: React root, version-tick bridge, Shortcuts and Help on Radix Dialog |
| [e7e1c3c](https://github.com/sebastiaofv/TeamOs/commit/e7e1c3c7e9cc7555a7cd0ad1504e1a538e629fa4) | 2026-09-13T18:13:23Z | docs: design Phase 2.1a task detail, roadmap entity modal and undo toast |
| [d484a9d](https://github.com/sebastiaofv/TeamOs/commit/d484a9d10a5581e3f06970179b8d57ee9460aeb8) | 2026-09-13T18:26:30Z | docs: plan Phase 2.1a task detail, roadmap entity modal and undo toast |
| [46fcd1f](https://github.com/sebastiaofv/TeamOs/commit/46fcd1f18a8f14260027233900e2eefa3d2895e3) | 2026-09-13T18:56:24Z | test: move the Playwright board harness into tests/support |
| [520f3f0](https://github.com/sebastiaofv/TeamOs/commit/520f3f02fb5c631f29f7416a9a45fac26eb51da2) | 2026-09-13T19:05:43Z | test(visual): capture legacy baselines for task detail, roadmap entity modal and undo toast |
| [3befdd4](https://github.com/sebastiaofv/TeamOs/commit/3befdd478bb534e5f28d484f5da1957255b72c7b) | 2026-09-13T19:09:51Z | test(visual): add legacy baseline with task detail attachments in view |
| [3f5bffd](https://github.com/sebastiaofv/TeamOs/commit/3f5bffdec609f9153e4d93848ff74d3f410eab95) | 2026-09-13T19:16:25Z | feat: dialog props, legacy host seam, focus-restore guard and island error recovery |
| [6fb613b](https://github.com/sebastiaofv/TeamOs/commit/6fb613b543bc599b6232f266827fe86f711f212b) | 2026-09-13T19:25:00Z | feat: port the undo toast to React |
| [8551ee6](https://github.com/sebastiaofv/TeamOs/commit/8551ee691a6382d6e5be45a2f0825da55ad4b71c) | 2026-09-13T19:35:09Z | feat: port the roadmap entity modal to Radix Dialog |
| [72f0117](https://github.com/sebastiaofv/TeamOs/commit/72f01173cafb57173c10efe3119dc4a2107a9340) | 2026-09-13T19:46:08Z | feat: port the task detail modal to Radix Dialog and document 2.1a |
| [8c8c85a](https://github.com/sebastiaofv/TeamOs/commit/8c8c85a8aa8172d46a5e6fc00b0d1b8497d573ea) | 2026-09-13T20:03:19Z | fix: keep Help and Shortcuts open when clicking Undo, harden toast baseline clock, key roadmap draft |
| [7bcd4c3](https://github.com/sebastiaofv/TeamOs/commit/7bcd4c339ad083cdfc1b2fed586c055f06ca2bc5) | 2026-09-13T20:12:37Z | Merge phase2/modals-a: task detail, roadmap entity modal and undo toast on React |
| [334c069](https://github.com/sebastiaofv/TeamOs/commit/334c069c0d019aae9612eec6df1f493df44659cd) | 2026-09-13T20:43:13Z | docs: design Phase 2.1b task editor modal |
| [ab40629](https://github.com/sebastiaofv/TeamOs/commit/ab406293f125679b9c21bf27af3e7e7e07015943) | 2026-09-13T20:55:15Z | docs: plan Phase 2.1b task editor modal |
| [a88c0ae](https://github.com/sebastiaofv/TeamOs/commit/a88c0aebd5727a2f74bcbf842ed448d7cf2eed05) | 2026-09-13T22:29:57Z | feat: checkpoint React portfolio migration through timeline |
| [5d16c18](https://github.com/sebastiaofv/TeamOs/commit/5d16c1834e38a3c4fc49927233af5f5b352d9722) | 2026-09-13T23:01:22Z | feat: complete remaining React migration slices |
| [ae87633](https://github.com/sebastiaofv/TeamOs/commit/ae87633a17fae2b622c1817efcbb5a7a50454076) | 2026-09-14T07:26:51Z | refactor: remove retired view rendering bridges |
| [1b230e1](https://github.com/sebastiaofv/TeamOs/commit/1b230e1555a17c59d61960a5173a0d5ef77d1590) | 2026-09-14T07:51:57Z | refactor: extract portfolio mutations from legacy runtime |
| [2ce70d4](https://github.com/sebastiaofv/TeamOs/commit/2ce70d4d02633cbfc811c330c94be72faa1975aa) | 2026-09-14T08:13:16Z | refactor: retire portfolio legacy action bridge |
| [92f1354](https://github.com/sebastiaofv/TeamOs/commit/92f13542e3e7aaaba1081b423c8bdee9780ca7d9) | 2026-09-14T08:59:40Z | refactor: remove portfolio legacy runtime |
| [bea8e29](https://github.com/sebastiaofv/TeamOs/commit/bea8e29895407ce6d377115dbb751b3d37518c1b) | 2026-09-14T09:26:15Z | chore: remove migration leftovers, add ESLint, refresh README |
| [6284ef1](https://github.com/sebastiaofv/TeamOs/commit/6284ef129c047e27bc19b90b4144a82c069225aa) | 2026-09-14T09:35:33Z | refactor: merge duplicated portfolio helpers and move non-render values out of the store |
| [ef7324a](https://github.com/sebastiaofv/TeamOs/commit/ef7324aa59671f4e2ba85e06e9b6690c1fdd124c) | 2026-09-14T09:41:33Z | refactor: render the app shell in React instead of portals into index.html |
| [93dd290](https://github.com/sebastiaofv/TeamOs/commit/93dd2907f9e985611884f0307b39946e6136411b) | 2026-09-14T09:41:58Z | Merge cleanup/housekeeping: remove migration leftovers, merge duplicated helpers, React app shell |
| [a331a5f](https://github.com/sebastiaofv/TeamOs/commit/a331a5f025d96f0cbc1366319a2db7fb9c2464dd) | 2026-09-14T12:56:01Z | refactor: simplify React state and separate portfolio actions |
| [38a9999](https://github.com/sebastiaofv/TeamOs/commit/38a9999cd2102513a2da528988cf71a714f55db3) | 2026-09-14T13:13:55Z | refactor: remove calendar CSS string helpers |
| [4958084](https://github.com/sebastiaofv/TeamOs/commit/495808440160417e572bf8e025d888f3e5ca9f64) | 2026-09-14T13:25:30Z | refactor: separate file persistence from browser interactions |
| [60c6c60](https://github.com/sebastiaofv/TeamOs/commit/60c6c60b8ab9b1d7d184ec5183499f784426b335) | 2026-09-14T13:29:50Z | refactor: replace Tailwind tooling with plain CSS |
| [b6b4bdb](https://github.com/sebastiaofv/TeamOs/commit/b6b4bdb4545676065512d7d5c73e0a2a31be34f6) | 2026-09-14T13:55:39Z | chore: add pre-commit hook running ESLint on staged files and unit tests |
| [b244642](https://github.com/sebastiaofv/TeamOs/commit/b2446420362cd7811fdbee9d92463baf610dbcfa) | 2026-09-14T14:03:13Z | refactor: split app.test.js by feature and app.css into per-feature files |
| [0368696](https://github.com/sebastiaofv/TeamOs/commit/03686964f16c7c5e1bc9f71e3aae9836c08d84f8) | 2026-09-14T14:05:49Z | Merge refactor/split-large-files: pre-commit hook, split e2e tests by feature, split CSS per feature |
| [7f62255](https://github.com/sebastiaofv/TeamOs/commit/7f622559069cbedbfb06e0e6d27141af222859bf) | 2026-09-14T14:16:42Z | test: run Playwright on its own port and never reuse a server |
| [2fbc7b9](https://github.com/sebastiaofv/TeamOs/commit/2fbc7b9f3e73c72c0ec5962d1137f577e63b7aab) | 2026-09-14T14:17:33Z | Merge fix/playwright-own-port: run Playwright on its own port and never reuse a server |
| [391d6af](https://github.com/sebastiaofv/TeamOs/commit/391d6af0acdc16bbc473c865e24b74c8eacd3c15) | 2026-09-14T14:23:58Z | chore: upgrade Vite 8, Vitest 5 and plugin-react 6; remove stale board JSON reference |
| [7834d96](https://github.com/sebastiaofv/TeamOs/commit/7834d9615fa065707e65c8ab86f76db7dff3faa7) | 2026-09-14T14:30:01Z | Merge chore/upgrade-vite-vitest: Vite 8, Vitest 5, plugin-react 6; remove stale board JSON reference |
| [d77a07f](https://github.com/sebastiaofv/TeamOs/commit/d77a07fcdb83d286951f52e89d7693b60d662f5d) | 2026-09-14T14:37:26Z | chore: remove example board and agents.md |
| [dae55e5](https://github.com/sebastiaofv/TeamOs/commit/dae55e502edb5afdf7180efed0042001437a0300) | 2026-09-14T15:02:25Z | refactor: replace native alert/confirm/prompt with an in-app dialog, use refs for focus and scroll |
| [19c018f](https://github.com/sebastiaofv/TeamOs/commit/19c018f7523037762faac61dbbb83066404a20e5) | 2026-09-14T15:02:34Z | Merge chore/remove-example-board: remove example board and agents.md |
| [58bf53a](https://github.com/sebastiaofv/TeamOs/commit/58bf53a965bdabbe3ec49c3af8fb41d5116f15cd) | 2026-09-14T15:02:34Z | Merge refactor/app-dialogs-and-refs: in-app dialog replaces native popups, refs replace DOM lookups |
| [37f9c9c](https://github.com/sebastiaofv/TeamOs/commit/37f9c9cb750724857f5d6abf95b1eed857072380) | 2026-09-14T15:23:40Z | feat: drag cards and checklist items with dnd-kit (mouse, touch, keyboard) |
| [7305a86](https://github.com/sebastiaofv/TeamOs/commit/7305a86c4c735abbe12d1ecf27b8cb1b6c92e256) | 2026-09-14T15:23:42Z | Merge feat/dnd-kit: drag cards and checklist items with dnd-kit (mouse, touch, keyboard) |
| [83e2451](https://github.com/sebastiaofv/TeamOs/commit/83e2451730203abd9fb739623e6695b16b01d210) | 2026-09-14T21:39:29Z | feat: convert the app and its tests to TypeScript |
| [ad0a54d](https://github.com/sebastiaofv/TeamOs/commit/ad0a54d9a291e5ce52ebca387df713216221f196) | 2026-09-14T21:39:43Z | Merge feat/typescript: convert the app and its tests to TypeScript |
| [0411c1b](https://github.com/sebastiaofv/TeamOs/commit/0411c1bc10de84c4be63ae01bac428ac834cff42) | 2026-09-17T21:10:18Z | feat: add PortfolioTaskCard component for task management in portfolio view |
| [381e0bb](https://github.com/sebastiaofv/TeamOs/commit/381e0bb64d45e4dc626e3bd86f02d778f5d74756) | 2026-09-17T21:52:27Z | Add new styles for portfolio components including toolbar, roadmap, task detail, editor, timeline, and undo toast |
| [95041c1](https://github.com/sebastiaofv/TeamOs/commit/95041c16f89fc69cdb724a52ce7d40222ccd9fbd) | 2026-09-17T22:16:59Z | feat: update calendar layout and controls for improved navigation and responsiveness |
| [6517df5](https://github.com/sebastiaofv/TeamOs/commit/6517df577a9cef58d91b72aab322c63622327e54) | 2026-09-18T08:25:22Z | Update portfolio features and include production build |
| [a1626f2](https://github.com/sebastiaofv/TeamOs/commit/a1626f21e48c7d6b6fb52c139b0932a917c18caf) | 2026-09-18T08:54:58Z | Compact portfolio UI and remove empty state |
| [dd6a445](https://github.com/sebastiaofv/TeamOs/commit/dd6a445645acf50253955b651665d789767009dc) | 2026-09-18T09:03:06Z | Add standalone single-file build |
| [ec802c2](https://github.com/sebastiaofv/TeamOs/commit/ec802c289c651f9867ffc73d6a9465139c695d16) | 2026-09-18T09:09:48Z | Publish standalone HTML build |
| [10509ca](https://github.com/sebastiaofv/TeamOs/commit/10509ca49f2d26578426e6ac964cad5d06f66173) | 2026-09-25T17:30:23Z | docs(planner): add day planner design and implementation plan |
| [657a2f0](https://github.com/sebastiaofv/TeamOs/commit/657a2f0a852f375c3b0faee8ed5b9cc1312990fb) | 2026-09-25T17:31:41Z | feat(planner): add day planner time and date rules |
| [1890a6e](https://github.com/sebastiaofv/TeamOs/commit/1890a6edf420f44d8d22b8b3c8f21c33d376d66b) | 2026-09-25T17:32:29Z | feat(planner): store day planner blocks in the project extension |
| [66ca005](https://github.com/sebastiaofv/TeamOs/commit/66ca005d5aa721c8a3429f79b8a9b8ca2a510619) | 2026-09-25T17:32:42Z | feat(planner): lay out overlapping blocks side by side |
| [8d141f6](https://github.com/sebastiaofv/TeamOs/commit/8d141f65aaa6e9a6a17a126f24368286a85c9520) | 2026-09-25T17:33:18Z | feat(planner): add planner view mode and date navigation |
| [93f188e](https://github.com/sebastiaofv/TeamOs/commit/93f188ea70c61f378ff9eaaa39f3b2d5e04de828) | 2026-09-25T17:34:10Z | feat(planner): build the planner view model |
| [e3b4a45](https://github.com/sebastiaofv/TeamOs/commit/e3b4a4578730b65710b25a33a0322d322bc4fe01) | 2026-09-25T17:35:00Z | feat(planner): add, move, resize and remove planner blocks with undo |
| [d564a41](https://github.com/sebastiaofv/TeamOs/commit/d564a4182a1facbc6bc26abf9e0a20ef1f916872) | 2026-09-25T17:40:36Z | feat(planner): add the Day Planner view with drag, move, resize and keyboard control |
| [0fb3bb6](https://github.com/sebastiaofv/TeamOs/commit/0fb3bb63dfe503c458843f06a95f060d44580a47) | 2026-09-25T17:45:47Z | test(planner): update shortcut dialog expectations, visual snapshots and docs |
| [8ef56d8](https://github.com/sebastiaofv/TeamOs/commit/8ef56d879e1ea01be7743f22230f7562dd044ff1) | 2026-09-25T17:54:42Z | feat(planner): record planner changes in the project timeline |
| [ae23656](https://github.com/sebastiaofv/TeamOs/commit/ae23656b34b84919c1d0844a53db5c0082c5dfd8) | 2026-09-25T17:57:35Z | fix(timeline): always write timeline summaries in English |
| [8fa4af0](https://github.com/sebastiaofv/TeamOs/commit/8fa4af09c3eb034f846c9139ae88d796bc03a325) | 2026-09-25T18:02:39Z | feat(timeline): show timeline event wording in the selected language |
| [876eea2](https://github.com/sebastiaofv/TeamOs/commit/876eea2311729c81095955fa3e1e2b5b9c6c09c7) | 2026-09-25T18:30:10Z | feat(toolbar): move task filters into a Filters dropdown panel |
| [965c888](https://github.com/sebastiaofv/TeamOs/commit/965c888c7a459da82ec037a0143d932e2e6c2b9a) | 2026-09-25T18:31:25Z | Publish production and standalone builds |
| [9a334da](https://github.com/sebastiaofv/TeamOs/commit/9a334dad784b2cce8d9716e98472d2c3550dcfd5) | 2026-09-25T20:45:51Z | ci(kanban): test on GitHub Actions and publish builds as a release |
| [77ec83a](https://github.com/sebastiaofv/TeamOs/commit/77ec83a75b29ec81def77c4415efaf391290f756) | 2026-09-25T20:50:17Z | Merge pull request #2 from sebastiaofv/ci/github-actions |
| [eb7fc13](https://github.com/sebastiaofv/TeamOs/commit/eb7fc1355d6ea9749ef2fad78d2042d8899a059a) | 2026-09-25T23:27:25Z | docs(palette): add command palette design |
| [b785fd9](https://github.com/sebastiaofv/TeamOs/commit/b785fd9d21b6f736c8167e79c661c1b1cb98fdeb) | 2026-09-25T23:28:33Z | feat(palette): add fuzzy matching and quick-create parser |
| [856161f](https://github.com/sebastiaofv/TeamOs/commit/856161f580da635230376cd9be29ce650a4373ba) | 2026-09-25T23:30:10Z | feat(palette): add assignee, priority and quick-create task commands with undo |
| [274245b](https://github.com/sebastiaofv/TeamOs/commit/274245b39c40a2a1e6814e557974f6a8440b174e) | 2026-09-25T23:33:13Z | feat(palette): build palette results for search, task actions, steps, quick create and plan |
| [cb29eaa](https://github.com/sebastiaofv/TeamOs/commit/cb29eaab03b791f8af74dc6af8b3730fc4e15cf5) | 2026-09-25T23:34:21Z | feat(palette): run palette actions and remember recent items |
| [a07beea](https://github.com/sebastiaofv/TeamOs/commit/a07beeaa6dba412639fceccb4eaddc2ee93a8567) | 2026-09-25T23:41:19Z | feat(palette): add the command palette (⌘K, /, toolbar search box) |
| [bae7ba7](https://github.com/sebastiaofv/TeamOs/commit/bae7ba70912bac045572fb0f664546020663788d) | 2026-09-26T09:54:13Z | feat(help): add tabs to Help with a Command palette guide |
| [5446f08](https://github.com/sebastiaofv/TeamOs/commit/5446f08b4f97171ae9e53b077690ac9a06582799) | 2026-09-26T15:18:02Z | Merge pull request #3 from sebastiaofv/feature/command-palette |
| [06e92a5](https://github.com/sebastiaofv/TeamOs/commit/06e92a58c5940b8b420a15322cbb44cfc580c6d9) | 2026-09-28T11:33:30Z | fixes |
| [dbcf90e](https://github.com/sebastiaofv/TeamOs/commit/dbcf90e927a0f8a1ad38c0fd3451cf4c7ea17e16) | 2026-09-28T11:37:55Z | fixes |
| [194d95c](https://github.com/sebastiaofv/TeamOs/commit/194d95ce8b06ffd8425b26cfde6836b24a38ae15) | 2026-09-28T11:43:18Z | fixes |
| [b287c8f](https://github.com/sebastiaofv/TeamOs/commit/b287c8f3d32549957d6d2e262d3671423f889647) | 2026-10-13T21:24:04Z | feat(table): add pure workitem queries and secure CSV export |
| [9598a5f](https://github.com/sebastiaofv/TeamOs/commit/9598a5ffa320c076e2573abfca3875170940b619) | 2026-10-13T21:24:46Z | feat: add project workitems table view and controls |
| [cb2bcc1](https://github.com/sebastiaofv/TeamOs/commit/cb2bcc10be05769ae545ceaac35d0d18d529d42d) | 2026-10-13T21:26:45Z | test: cover project workitems table end to end |
| [4b1b5a2](https://github.com/sebastiaofv/TeamOs/commit/4b1b5a2a9f083fa458fd221bb06dbef58dd491d8) | 2026-10-13T21:28:41Z | test: update visual baselines for table navigation |
| [a310bcf](https://github.com/sebastiaofv/TeamOs/commit/a310bcf0a888b39c8889ee7b98f7c21589bc6946) | 2026-10-13T21:31:18Z | fix(table): restore row detail focus and verify acceptance flows |
| [aa85b44](https://github.com/sebastiaofv/TeamOs/commit/aa85b44e071688bd69eca9321108006f8200f194) | 2026-10-13T21:32:11Z | test: add light and dark workitems table visual coverage |
| [199b760](https://github.com/sebastiaofv/TeamOs/commit/199b7608c1c12c17d3693d67cb43062f45a8ab4a) | 2026-10-14T08:22:46Z | fix(table): preserve toolbar search and compact themed filters |
| [3a4ad67](https://github.com/sebastiaofv/TeamOs/commit/3a4ad67c5da1507b9fde1f50b57112bd95b4aceb) | 2026-10-14T10:14:47Z | fix(table): reuse original toolbar and contain CSV arrow |
| [7740d54](https://github.com/sebastiaofv/TeamOs/commit/7740d5482f7ad0fc012435459cd6cab37910c25a) | 2026-10-14T17:45:40Z | fix(table): remove redundant visible project heading |
| [50a7d44](https://github.com/sebastiaofv/TeamOs/commit/50a7d44320d23cf3cdca02d301a0c10c63495e92) | 2026-10-14T17:54:58Z | fix(table): align column chooser with CSV export |
| [32c06be](https://github.com/sebastiaofv/TeamOs/commit/32c06be45b01436203b7218ab7e3f23a025f4eaa) | 2026-10-14T18:22:41Z | build: track regular and standalone distribution outputs |
| [0c3b2de](https://github.com/sebastiaofv/TeamOs/commit/0c3b2de2689515f786bc8e19fe68fb1150a8cbb5) | 2026-10-17T14:49:14Z | fix(table): remove actions column and align pagination select |
| [6582221](https://github.com/sebastiaofv/TeamOs/commit/6582221efac6e6523cabbc4aaa585ea8212add86) | 2026-10-17T15:04:33Z | fix(portfolio): unify filters and update table tests for removed edit actions |
| [26559eb](https://github.com/sebastiaofv/TeamOs/commit/26559ebc27de25e7d937bfb1bb722f356eea2503) | 2026-10-17T15:45:59Z | feat: implement US-2 workitem relations and dependency blocking (#26) |
| [dc2e696](https://github.com/sebastiaofv/TeamOs/commit/dc2e696429eca2c5d5a7a0c062600fb6bc15b566) | 2026-10-17T15:50:57Z | fix: normalize empty relations and align query boundaries |
| [59daffd](https://github.com/sebastiaofv/TeamOs/commit/59daffd3d58f246b4d3b82019ec4187a3ca47cca) | 2026-10-17T15:58:15Z | feat: implement US-3 participants and responsible person (#27) |
| [7849556](https://github.com/sebastiaofv/TeamOs/commit/78495568ecb43fb6d49547f58822ca2e299e7569) | 2026-10-17T16:03:28Z | fix(us-3): address review findings and refresh verified builds |
| [a1cbf6d](https://github.com/sebastiaofv/TeamOs/commit/a1cbf6dce3b9334ad3ab0130beeb972d9108d035) | 2026-10-18T10:52:35Z | test: add manual boards for US1 US2 and US3 |
| [aa041dd](https://github.com/sebastiaofv/TeamOs/commit/aa041ddecb92c8f089669bdac164fd1c83311b5d) | 2026-10-18T10:58:14Z | test(us-2): add relations board and manual testing guide |
| [a4be77e](https://github.com/sebastiaofv/TeamOs/commit/a4be77edff210c165b66d07e73c4bdf3707c0d36) | 2026-10-18T10:58:14Z | test(us-3): keep story boards in their matching branches |
| [e2a2271](https://github.com/sebastiaofv/TeamOs/commit/e2a2271c25034449b1b941b038f3cd480c576e57) | 2026-10-18T10:58:14Z | test(us-1): add table board and manual testing guide |
| [2b0832a](https://github.com/sebastiaofv/TeamOs/commit/2b0832a2489121e35159826d82f4fad9083e7c02) | 2026-10-18T10:58:24Z | Merge remote-tracking branch 'origin/us-1' into us-2 |
| [6b37908](https://github.com/sebastiaofv/TeamOs/commit/6b379087621b60eca43f2278ae350cce9de70ebb) | 2026-10-18T10:58:24Z | Merge remote-tracking branch 'origin/us-1' into us-3 |
| [8e279aa](https://github.com/sebastiaofv/TeamOs/commit/8e279aa08ff125de4221a7da678976768df5cbb8) | 2026-10-18T11:02:00Z | test(us-2): move board into kanban and separate test guide |
| [e36d766](https://github.com/sebastiaofv/TeamOs/commit/e36d7666fdb9d6bb6d77616e838362aaada243a7) | 2026-10-18T11:02:00Z | test(us-3): move board into kanban and separate test guide |
| [bc42f91](https://github.com/sebastiaofv/TeamOs/commit/bc42f9195567b28bdc8b7d16d4910c17ea3fb273) | 2026-10-18T11:02:00Z | test(us-1): place JSON boards inside kanban/test-board |
| [b50c525](https://github.com/sebastiaofv/TeamOs/commit/b50c5258c80d1be2967e28e4f896a1747260322e) | 2026-10-18T11:02:23Z | Merge remote-tracking branch 'origin/us-1' into us-2 |
| [5e06248](https://github.com/sebastiaofv/TeamOs/commit/5e062486c0949690cffdac0ce56f6df7f4322be4) | 2026-10-18T11:02:23Z | Merge remote-tracking branch 'origin/us-1' into us-3 |
| [cb975cd](https://github.com/sebastiaofv/TeamOs/commit/cb975cd9dcbb1e0db7e71e62b0956918c5bb5a71) | 2026-10-18T11:19:26Z | feat(us-1): implement table delivery review and sprint perspectives |
| [95b3666](https://github.com/sebastiaofv/TeamOs/commit/95b3666a7b0c068ffabaf4e7e9df66ed334c129b) | 2026-10-18T11:22:57Z | fix(us-1): address review regressions and refresh verified builds |
| [06dda7f](https://github.com/sebastiaofv/TeamOs/commit/06dda7ff65a982d967d5c8932de207cb9b969937) | 2026-10-18T11:45:16Z | docs(us-2): place walkthrough alongside the test board |
| [d1fde4a](https://github.com/sebastiaofv/TeamOs/commit/d1fde4a74a66a29d2eff67b9d57ea475c53573c3) | 2026-10-18T11:45:16Z | docs(us-3): place walkthrough alongside the test board |
| [bb45c3c](https://github.com/sebastiaofv/TeamOs/commit/bb45c3c9d8c1d52cadb3358e8448fd15e6de5f83) | 2026-10-18T11:45:16Z | docs: keep test board guides alongside their JSON files |
| [9e3d33f](https://github.com/sebastiaofv/TeamOs/commit/9e3d33f460acf8225784e08fb19594d35d03e353) | 2026-10-18T11:45:43Z | docs: keep test board guides alongside their JSON files |
| [2f3ef9a](https://github.com/sebastiaofv/TeamOs/commit/2f3ef9ad73703580f2492b022447f64a348ceb33) | 2026-10-18T11:45:43Z | docs: keep test board guides alongside their JSON files |
| [cb54fba](https://github.com/sebastiaofv/TeamOs/commit/cb54fbadf84a088c408cefc017210c9de83af909) | 2026-10-18T17:26:05Z | feat(us-1): persist sprint creation order and project sequence |
| [8a94e04](https://github.com/sebastiaofv/TeamOs/commit/8a94e04fd96633f4f5ec195002b630463a524512) | 2026-10-18T17:31:30Z | fix(us-1): reserve legacy sprint identities retained in timeline |
| [d11adc4](https://github.com/sebastiaofv/TeamOs/commit/d11adc4641c7c585be28d659d8d3db3e0e1122d0) | 2026-10-18T17:31:40Z | build(us-1): refresh sprint identity builds and visual baselines |
| [e42034c](https://github.com/sebastiaofv/TeamOs/commit/e42034cc8d002fd1a085159a1d234c1782e54c9c) | 2026-10-18T17:44:33Z | fix(us-2): unify workitem search and selection (#26) |
| [03eb45a](https://github.com/sebastiaofv/TeamOs/commit/03eb45a787ef1a42b1b66efcd740dfc0c19e2b6a) | 2026-10-19T20:06:24Z | fix(us-2): show related workitem status and assignees (#26) |
| [9d96761](https://github.com/sebastiaofv/TeamOs/commit/9d967616821a781be1dc280556bc7e240011b6eb) | 2026-10-19T20:07:23Z | Merge us-1 into us-3 and resolve generated artifact conflicts |
| [ea1c2ef](https://github.com/sebastiaofv/TeamOs/commit/ea1c2ef25c06e1668615ded073e114950c957d86) | 2026-10-19T20:10:28Z | Merge pull request #46 from sebastiaofv/us-3 |
| [86c5d6f](https://github.com/sebastiaofv/TeamOs/commit/86c5d6f2275c8baa161c5a721951cf616d45a8b6) | 2026-10-19T20:14:51Z | revert: undo accidental integration of US-1 and US-3 |
| [5e1c52b](https://github.com/sebastiaofv/TeamOs/commit/5e1c52b90028f43891a8aa3355ac240d5cf7e911) | 2026-10-19T20:18:45Z | feat: integrate US-1 and US-3 with existing sprint assignment |
| [ae8d59b](https://github.com/sebastiaofv/TeamOs/commit/ae8d59bc29d7096c76898f70c7ff036a5ed7ea54) | 2026-10-19T20:38:54Z | fix: resolve US-1 and US-3 audit findings |
| [7b66802](https://github.com/sebastiaofv/TeamOs/commit/7b66802b8c9962124daf6ec599ca1a99754aa226) | 2026-10-19T20:41:09Z | Merge pull request #47 from sebastiaofv/fix/us-1-us-3-audit |
| [bcfcfcf](https://github.com/sebastiaofv/TeamOs/commit/bcfcfcfd701b31c9d9a543ade927edfa6bbf6355) | 2026-10-19T20:55:49Z | Merge origin/main into us-2 |
| [d1b0285](https://github.com/sebastiaofv/TeamOs/commit/d1b0285a2ee38c56c3b2093e586577f5516bca59) | 2026-10-19T20:57:28Z | chore: remove root health, logs, and meetings folders |
| [5b2ff6f](https://github.com/sebastiaofv/TeamOs/commit/5b2ff6f895bb6310fa80432834211d7e32715c1a) | 2026-10-19T20:58:38Z | Merge remote-tracking branch 'origin/main' into us-2 |
| [a71840b](https://github.com/sebastiaofv/TeamOs/commit/a71840bf0b731af9f5d04f95dd72a4e9956258ed) | 2026-10-19T21:47:15Z | fix: compact work item relations and confirm inline changes |
| [1d32f59](https://github.com/sebastiaofv/TeamOs/commit/1d32f59f5821d1e471dcb79d7486f4ec3e3d040e) | 2026-10-20T06:42:48Z | feat: implement US-4 project workflows |
| [e6104e0](https://github.com/sebastiaofv/TeamOs/commit/e6104e08a2b3560029ab430a58f98b4a627e10b3) | 2026-10-20T06:52:16Z | feat: implement US-5 hierarchical roadmap and progress |
| [13f9359](https://github.com/sebastiaofv/TeamOs/commit/13f93595978aa0f2780a10b9e9bb5a0cf35b8235) | 2026-10-20T07:08:36Z | feat: implement US-6 workitem timeline history |
| [70276ca](https://github.com/sebastiaofv/TeamOs/commit/70276ca37b994fe7addf8e5934da7c559b38482d) | 2026-10-20T07:37:36Z | feat: implement US-7 immutable offline workitem conversations |
| [cd985ab](https://github.com/sebastiaofv/TeamOs/commit/cd985ab3ae45e5655ce0cdf8b882a06df96725d7) | 2026-10-20T07:52:08Z | feat: implement US-8 local pull request associations |
| [6c75dfa](https://github.com/sebastiaofv/TeamOs/commit/6c75dfa871cff5b57a567082388b4d829d7f0637) | 2026-10-20T08:02:24Z | fix: harden workflow identity handling and refresh app bundles |
| [7ea2378](https://github.com/sebastiaofv/TeamOs/commit/7ea2378b953768a13efdcf8e58a108b0425a997d) | 2026-10-20T08:02:24Z | fix: keep planning controls in Details and refresh app bundles |
| [c84d483](https://github.com/sebastiaofv/TeamOs/commit/c84d483113d29e34f3bd3f362892fbcbe02ced08) | 2026-10-20T08:02:24Z | fix: harden partial history evidence and refresh app bundles |
| [3747710](https://github.com/sebastiaofv/TeamOs/commit/37477107925b7953a5657508dcd586657538bb76) | 2026-10-20T08:02:24Z | fix: avoid ambiguous conversation reassociation after deletion |
| [f004f58](https://github.com/sebastiaofv/TeamOs/commit/f004f58e40df0b14627bff816f29ebdea16a315e) | 2026-10-20T16:21:00Z | feat: align US-4 with workflow clarification comments |
| [f93cb15](https://github.com/sebastiaofv/TeamOs/commit/f93cb157eab1481cf9bdeea95287f2d687f097f3) | 2026-10-20T17:18:52Z | feat: implement clarified US-5 Roadmap tables, milestones and drilldown |
| [3f7fe8c](https://github.com/sebastiaofv/TeamOs/commit/3f7fe8c89f881dc912e26ffb8110330b72933db5) | 2026-10-20T17:19:14Z | fix: preserve legacy workflow columns and refresh clarified UI baselines |
| [98f9479](https://github.com/sebastiaofv/TeamOs/commit/98f94790c14d3e0bd3f871f713c58df2e5c70928) | 2026-10-20T17:27:28Z | fix: keep workflow references valid when optional categories are removed |
| [bad7fa8](https://github.com/sebastiaofv/TeamOs/commit/bad7fa879c76d88b3bac9fc2faa59f3ae841f589) | 2026-10-20T18:44:28Z | fix: restore original task UI and persist per-state Board column visibility |
| [cc14a51](https://github.com/sebastiaofv/TeamOs/commit/cc14a51908f79b00c9246250cd39620a3698c650) | 2026-10-20T19:24:10Z | fix: redesign workflow modal with contained dropdown arrows and responsive state editor |
| [ca1fb80](https://github.com/sebastiaofv/TeamOs/commit/ca1fb80338548478108ded4a06ef9e1cc9dfa382) | 2026-10-20T20:08:41Z | style: align workflow modal skin with application theme |
| [00a957c](https://github.com/sebastiaofv/TeamOs/commit/00a957c3ae826a5c8a79a7aa72fd9fd3341e9557) | 2026-10-20T20:10:11Z | fix: match relation status colors to table badges |
| [6294113](https://github.com/sebastiaofv/TeamOs/commit/6294113769f48f765dbf307ffd6da60fcab6dac5) | 2026-10-20T20:23:10Z | style: align workitem history with the app theme |
| [733407c](https://github.com/sebastiaofv/TeamOs/commit/733407cda4090e052feb52da914f04af2f1d4f88) | 2026-10-20T20:46:23Z | style: align workitem conversations with the app theme |
| [8a8162d](https://github.com/sebastiaofv/TeamOs/commit/8a8162d167ca4530588960d8c04f4a579079edbd) | 2026-10-20T20:46:30Z | style: align pull request links and preserve keyboard focus |
| [fe5f6d7](https://github.com/sebastiaofv/TeamOs/commit/fe5f6d756e2c4d257efda9aeb7fd24ec54319cbf) | 2026-10-20T20:46:41Z | style: align roadmap controls and planning fields with app theme |
| [462292f](https://github.com/sebastiaofv/TeamOs/commit/462292f7f17dbacb72bf8ce5fc0c40dd4dfa7220) | 2026-10-20T21:23:49Z | Merge pull request #45 from sebastiaofv/us-2 |
| [e609594](https://github.com/sebastiaofv/TeamOs/commit/e609594fc0abc89634f5d5d285709b373e3bf415) | 2026-10-20T21:35:54Z | Merge origin/main into us-4 and resolve integration conflicts |
| [677dcf8](https://github.com/sebastiaofv/TeamOs/commit/677dcf8d25092e56f1d1e64aca78a5ad633504a1) | 2026-10-20T21:36:01Z | Merge origin/main into us-5 and resolve integration conflicts |
| [8f06da8](https://github.com/sebastiaofv/TeamOs/commit/8f06da88f30d916902be6c580d6bb1e18e42b494) | 2026-10-20T21:36:07Z | Merge origin/main into us-6 and resolve integration conflicts |
| [2dcde98](https://github.com/sebastiaofv/TeamOs/commit/2dcde98f265b35c71d678d2051f5ff9268a21673) | 2026-10-20T21:36:13Z | Merge origin/main into us-8 and resolve integration conflicts |
| [92882ae](https://github.com/sebastiaofv/TeamOs/commit/92882ae2e5af531a2c96e84c697b1e7c26b04540) | 2026-10-20T21:36:13Z | Merge origin/main into us-7 and resolve integration conflicts |
| [e22fe58](https://github.com/sebastiaofv/TeamOs/commit/e22fe58bef9c5f59687eff17c17f0a64136cec4e) | 2026-10-20T21:57:56Z | fix: apply roadmap visual and interaction review (#29) |
| [c1f7fba](https://github.com/sebastiaofv/TeamOs/commit/c1f7fba1c705c228657b81bd7087b8d0aa9cbe7f) | 2026-10-20T22:02:13Z | fix: stop roadmap guides before unclassified work |
| [e742048](https://github.com/sebastiaofv/TeamOs/commit/e74204813315dba1aaf9e3b2bce116836db26337) | 2026-10-20T22:06:15Z | fix: remove unclassified section from roadmap |
| [e6c2eee](https://github.com/sebastiaofv/TeamOs/commit/e6c2eee65e4a0513f3443e9983fa599fcad253ed) | 2026-10-20T22:22:27Z | fix: summarize workitem history titles by category and change count |
| [33dcc59](https://github.com/sebastiaofv/TeamOs/commit/33dcc593af29bc30db1d613ebf4e670a7bf17a6b) | 2026-10-21T07:52:31Z | Merge pull request #50 from sebastiaofv/us-6 |
| [3a86dd4](https://github.com/sebastiaofv/TeamOs/commit/3a86dd4e2e2f979d60bbd39cabac3adb487655af) | 2026-10-21T07:57:08Z | Merge main into us-4 and resolve integration conflicts |
| [df0e99f](https://github.com/sebastiaofv/TeamOs/commit/df0e99ff5ff9f9524041cee736a8e687ef308a11) | 2026-10-21T07:59:47Z | Merge main into us-5 and resolve integration conflicts |
| [b2e8aca](https://github.com/sebastiaofv/TeamOs/commit/b2e8acabc38cb437766a75fc181dbb7640d7c1e3) | 2026-10-21T08:00:32Z | Merge main into us-8 and resolve integration conflicts |
| [932a10e](https://github.com/sebastiaofv/TeamOs/commit/932a10e371742dfc27b7f9f7f9e653d171b31a5e) | 2026-10-21T08:00:32Z | Merge main into us-7 and resolve integration conflicts |
| [7a2f03a](https://github.com/sebastiaofv/TeamOs/commit/7a2f03aa7ecb3a1fc4ef4a4612c4445923200b68) | 2026-10-21T08:10:43Z | feat(us-8): move pull request links into a dedicated detail tab |
| [d7467a8](https://github.com/sebastiaofv/TeamOs/commit/d7467a8853370b69edba398dc362b3ad557f961e) | 2026-10-21T08:11:11Z | feat(us-7): add a dedicated Comments tab and compact newest-first conversation |
| [13b7240](https://github.com/sebastiaofv/TeamOs/commit/13b72402e9e9e4d792c508a82f6adf70362f33d7) | 2026-10-21T08:19:39Z | fix(us-5): keep milestone labels close to their markers |
| [26bcb86](https://github.com/sebastiaofv/TeamOs/commit/26bcb8621bf6f1ffcf445471df10f1acfe94a3f0) | 2026-10-21T08:25:09Z | fix(us-5): increase milestone names and dates to readable type |
| [14ca3d3](https://github.com/sebastiaofv/TeamOs/commit/14ca3d3732517ba5303df139796327f620801be3) | 2026-10-21T08:32:37Z | style(us-5): increase Roadmap text for readability |
| [40c003d](https://github.com/sebastiaofv/TeamOs/commit/40c003d6800f5f8c5ccbc098bc6c5ab8863db567) | 2026-10-21T21:27:47Z | Merge pull request #52 from sebastiaofv/us-8 |
| [a6feb2f](https://github.com/sebastiaofv/TeamOs/commit/a6feb2f3548f76e2ba487bd9ec3d5737896e42a8) | 2026-10-21T21:45:07Z | Merge main into us-7 and preserve Comments and Pull Requests tabs |
| [ea98b87](https://github.com/sebastiaofv/TeamOs/commit/ea98b8751ddaced147a6a7354afae9237a29ef23) | 2026-10-21T21:48:07Z | Merge pull request #51 from sebastiaofv/us-7 |
| [f4596b4](https://github.com/sebastiaofv/TeamOs/commit/f4596b430920a71d710a1b666514b47c08e34dfe) | 2026-10-22T09:02:22Z | fix(us-5): pin roadmap timeline and improve dates, relocation and phase colours |
| [2b8b36b](https://github.com/sebastiaofv/TeamOs/commit/2b8b36b613f4cf88af784f1b1a0df38058422206) | 2026-10-22T19:29:43Z | feat: add project settings and curated members and tags (#35, #53) |
| [563ac2c](https://github.com/sebastiaofv/TeamOs/commit/563ac2cb3f470de277324bbc6bb8c19b2e41db3d) | 2026-10-22T19:40:36Z | fix: keep project settings actions visible and clarify removal controls |
| [18bad1e](https://github.com/sebastiaofv/TeamOs/commit/18bad1e5fed41aa7ccd58dfcd56c25c6a0c1fbd4) | 2026-10-22T19:44:11Z | fix: align member creation with tag input flow |
| [8d0e888](https://github.com/sebastiaofv/TeamOs/commit/8d0e888f7d220cea38a3a9e26d60674e35688ed6) | 2026-10-22T19:53:31Z | fix: contain task member and tag dropdown arrows |
| [fccdc6b](https://github.com/sebastiaofv/TeamOs/commit/fccdc6bce298bd096efafc85a6e5245fd5bf181a) | 2026-10-23T07:26:10Z | Merge main into us-5 and preserve Roadmap, Comments and Pull Requests |
| [64d081c](https://github.com/sebastiaofv/TeamOs/commit/64d081cae98ce1577db44aba46b1181945283dec) | 2026-10-23T07:29:54Z | Merge pull request #49 from sebastiaofv/us-5 |
| [e2e24dd](https://github.com/sebastiaofv/TeamOs/commit/e2e24ddba328789c1fae07228255d26f98e048f7) | 2026-10-23T07:35:25Z | Merge main into us-11-21 and synchronize settings dismissal test |
| [0225421](https://github.com/sebastiaofv/TeamOs/commit/022542122f319bc75250b1c1b8915d0ed54e420d) | 2026-10-23T07:38:58Z | Merge pull request #55 from sebastiaofv/us-11-21 |
| [ea8750d](https://github.com/sebastiaofv/TeamOs/commit/ea8750dc6d19d7b06b0459dff31ba6b67bcbb0eb) | 2026-10-28T09:18:34Z | Merge workflow dependency into US-12 and preserve current project features |
| [116f62f](https://github.com/sebastiaofv/TeamOs/commit/116f62fb3c98402cf007b559fa3c9e6ae00e3922) | 2026-10-28T10:17:23Z | feat: implement workitem types, hierarchy and functional acceptance (US-12) |
| [c50251a](https://github.com/sebastiaofv/TeamOs/commit/c50251a8747fd601d084124f341390ea51a225fa) | 2026-10-28T10:47:38Z | chore: refresh US-4 integration snapshots and build assets |
| [33937d6](https://github.com/sebastiaofv/TeamOs/commit/33937d6b71bb7a0f20a28c43d1c99281ef55cabc) | 2026-10-28T10:51:50Z | Merge pull request #48 from sebastiaofv/us-4 |
| [d515bcb](https://github.com/sebastiaofv/TeamOs/commit/d515bcb8d91206d2db05fd268ab1dbb15b1f5065) | 2026-10-28T10:58:54Z | Merge main into US-12 and preserve workitem visual baselines |
| [bb9fcff](https://github.com/sebastiaofv/TeamOs/commit/bb9fcff2f4be0c8dbf8a958fe273196c837bf034) | 2026-10-28T18:28:37Z | fix: unify board columns and repair roadmap layout |
| [d27ab75](https://github.com/sebastiaofv/TeamOs/commit/d27ab75975fafac06d51b19a6e1fa0016021bfd0) | 2026-10-28T18:46:22Z | fix: hide board controls when no projects are loaded |
| [19cf5a2](https://github.com/sebastiaofv/TeamOs/commit/19cf5a2bc6be5cb6b6a61ab5f15089f2b54e65e4) | 2026-10-28T18:58:09Z | test: refresh US-12 fixtures for multiple projects |
| [89f4185](https://github.com/sebastiaofv/TeamOs/commit/89f418569997d87490d0ae65315989d3adf4de8d) | 2026-10-28T19:02:55Z | fix: integrate workflow into project settings |
| [242c797](https://github.com/sebastiaofv/TeamOs/commit/242c7974b5d719fa2f04f18792123c4cd799ad96) | 2026-10-28T19:05:20Z | build: refresh standalone app for project settings |
| [c761194](https://github.com/sebastiaofv/TeamOs/commit/c761194ad6db7916a14ccfd85f5d0cded3aed662) | 2026-10-28T21:58:25Z | refactor: deepen workitem changes and project consultation |
| [5aa8bd9](https://github.com/sebastiaofv/TeamOs/commit/5aa8bd941982c4a689dd38e87a38506322997f8d) | 2026-10-28T22:19:50Z | feat: separate technical and functional project workflows |
| [c4c48cf](https://github.com/sebastiaofv/TeamOs/commit/c4c48cf952ad9e1b6bbd5fd5b526d1f031add89d) | 2026-10-28T22:21:52Z | feat: redesign workitem modals with dedicated relations tab |
| [fffa7fb](https://github.com/sebastiaofv/TeamOs/commit/fffa7fbe53423ee6df4eebd70daba49784e3d4f1) | 2026-10-28T22:49:53Z | feat: add persistent app setting for timeline visibility |
| [8d51411](https://github.com/sebastiaofv/TeamOs/commit/8d514115b3f77dd1d8b4cb1c2c2ebd9b956a455f) | 2026-10-29T08:44:58Z | fix: expand sprint workitems directly in table rows |
| [3de32a0](https://github.com/sebastiaofv/TeamOs/commit/3de32a0d4fc4308dc4b106ebcef6ccdbc89aca1c) | 2026-10-29T08:50:42Z | fix: persist project-prefixed workitem IDs |
| [c95c461](https://github.com/sebastiaofv/TeamOs/commit/c95c46196745e1638172aab44baaeba34db615f5) | 2026-10-29T08:53:32Z | fix: address workitem modal and Board testing feedback |
| [131d13f](https://github.com/sebastiaofv/TeamOs/commit/131d13f2d6ac54a3bb965dc0c94e473fabaa134d) | 2026-10-29T08:54:01Z | fix: require Edit for checklist content and document feedback checks |
| [fbcfdea](https://github.com/sebastiaofv/TeamOs/commit/fbcfdea1aeff8817633776524e7b48c53ad5eda4) | 2026-10-29T09:03:53Z | test: verify feedback fixes with project IDs and refresh builds |
| [9999469](https://github.com/sebastiaofv/TeamOs/commit/99994693d3c6ea441a3372db053a95bc810ed9f3) | 2026-10-29T09:13:02Z | fix: refine sprint tables and portfolio presentation |
| [0208530](https://github.com/sebastiaofv/TeamOs/commit/0208530a842b950d2414f8d5b6fa5c07b48de754) | 2026-10-29T09:13:35Z | Merge remote-tracking branch 'origin/feature/us-12-workitem-types' into feature/us-12-workitem-types |
| [b0773c2](https://github.com/sebastiaofv/TeamOs/commit/b0773c2126db99abd1a2d2e287e9be8c0a84f55a) | 2026-10-29T09:18:26Z | fix: keep dropdown arrows inset across the app |
| [ebda494](https://github.com/sebastiaofv/TeamOs/commit/ebda494a7993d4b7281b2b7c8f5f8e64ef6270a2) | 2026-10-29T12:24:14Z | feat: simplify portfolio cards around essential information |
| [82c3571](https://github.com/sebastiaofv/TeamOs/commit/82c3571d83a76cd6b73a458c92403116bc700cfc) | 2026-10-29T12:35:26Z | Merge pull request #56 from sebastiaofv/feature/us-12-workitem-types |
| [fd31423](https://github.com/sebastiaofv/TeamOs/commit/fd31423e010931e1cf4f87a9441c5f47b5d7a502) | 2026-10-29T12:39:36Z | test: align CI assertions with essential workitem cards |
| [e01e7de](https://github.com/sebastiaofv/TeamOs/commit/e01e7dec247fc0c048358ec042ff6f25b05c08d0) | 2026-10-29T12:45:45Z | test: wait for comment author focus before filling draft |
| [5ee1e6c](https://github.com/sebastiaofv/TeamOs/commit/5ee1e6c2b149e0570cfbea8da9759e81fcc2643c) | 2026-10-29T13:25:20Z | feat: group product projects and transfer workitems safely |
| [81c22d8](https://github.com/sebastiaofv/TeamOs/commit/81c22d897bfac8ed544ddd38648c509b3b619363) | 2026-10-29T14:21:00Z | fix: enforce transfer lifecycle rules and preserve returning comments |
| [4267ffb](https://github.com/sebastiaofv/TeamOs/commit/4267ffbbb37ca6e6d0991cf0ca886f81ddc5a9eb) | 2026-10-31T12:27:51Z | fix: refine product navigation and reviewed hierarchy transfers |
| [85f5d66](https://github.com/sebastiaofv/TeamOs/commit/85f5d664840c8301c37802aafa351807a267b75c) | 2026-10-31T12:28:31Z | style: keep transfer review columns readable on small screens |
| [5d74100](https://github.com/sebastiaofv/TeamOs/commit/5d74100d8cda7029273b7af9e42b418d74b6b695) | 2026-10-31T12:39:40Z | fix: preserve creation navigation and unify hierarchical workitem tables |
| [746646a](https://github.com/sebastiaofv/TeamOs/commit/746646aed91628013fd2edce9491a68e093cf59a) | 2026-10-31T12:59:12Z | feat: add project dashboard and recorded sprint analytics (US-9) |
| [37f402f](https://github.com/sebastiaofv/TeamOs/commit/37f402f869b4155d98f59e484e9d171420b83fc3) | 2026-10-31T13:32:10Z | fix: enable dashboard container scrolling |
| [1276ac5](https://github.com/sebastiaofv/TeamOs/commit/1276ac56bc7c6dd25b5423fe1426f9b471f59bf2) | 2026-10-31T15:10:06Z | feat: add Project Control risks, decisions and deliverables (US-20) |
| [bceed48](https://github.com/sebastiaofv/TeamOs/commit/bceed48ffb3a6c3110a9dac433a047464da652f5) | 2026-11-01T19:42:50Z | fix: refine product selection and grouped transfer reviews |
| [bff888d](https://github.com/sebastiaofv/TeamOs/commit/bff888d4e61e23b6b5b21debc29d41d99a5960ef) | 2026-11-01T19:56:28Z | fix: align Project Control dialogs, identities and associations |
| [69c9a69](https://github.com/sebastiaofv/TeamOs/commit/69c9a6969626fd533b60b9cae3d880105e8c5598) | 2026-11-01T20:13:22Z | fix: hide Epics on boards and preserve linked workitem navigation |
| [1b5b5f6](https://github.com/sebastiaofv/TeamOs/commit/1b5b5f692ef15b85101be660793ba8d72e4ef22a) | 2026-11-01T21:48:05Z | Merge pull request #58 from sebastiaofv/codex/us-13-product-project-transfers |
| [00977ed](https://github.com/sebastiaofv/TeamOs/commit/00977ed6bee309915e93d03dbb79478deb855d45) | 2026-11-01T22:02:55Z | fix: reuse workitem history presentation in Project Control |
| [8a769ca](https://github.com/sebastiaofv/TeamOs/commit/8a769cae24bb03faa548f2733e0a6adea759f520) | 2026-11-01T22:16:25Z | feat: move attachments to a dedicated tab with upload metadata |
| [ca28350](https://github.com/sebastiaofv/TeamOs/commit/ca28350b9950edb8e99e0c992814c14e309bf73f) | 2026-11-02T22:54:46Z | fix: align Project Control view and edit behavior |
| [ca58716](https://github.com/sebastiaofv/TeamOs/commit/ca587169911623668ba001da84e13ceeb30f3212) | 2026-11-02T23:06:41Z | Fix direct workitem attachments, todo completion and tab layout (#39) |
| [e0cd7a4](https://github.com/sebastiaofv/TeamOs/commit/e0cd7a4a6cd3f6a278348c058fc3ae53fcfba0f7) | 2026-11-02T23:20:22Z | fix: align Project Control sidebar fields with Work Items |
| [fb7b999](https://github.com/sebastiaofv/TeamOs/commit/fb7b999530418c62ae9e876b731ad27837ab2854) | 2026-11-03T07:26:46Z | fix: align Project Control Type field with Work Item modes |
| [a9db0c4](https://github.com/sebastiaofv/TeamOs/commit/a9db0c43d4d5e47a27a951cebeaa69eba034f609) | 2026-11-03T07:29:36Z | Remove attachments from the workitem edit form (#39) |
| [6037b63](https://github.com/sebastiaofv/TeamOs/commit/6037b63f9fc0db216efbd0a3809ab1d619986e87) | 2026-11-03T09:04:54Z | feat: open supported attachments in browser tabs (US-23) |
| [67ee807](https://github.com/sebastiaofv/TeamOs/commit/67ee807246f4c4daeaebceb64101c220041e7eb2) | 2026-11-04T08:48:42Z | fix: remove Project Control sidebar sticky offset |
| [75f2b44](https://github.com/sebastiaofv/TeamOs/commit/75f2b4415d3dedda86d907716eb4e39b93e555b0) | 2026-11-04T08:55:14Z | Fix first attachment save permission and misleading transfer banner (#39) |
| [5016e4a](https://github.com/sebastiaofv/TeamOs/commit/5016e4ac6ef5e31b0557c9e7213336cd9120a920) | 2026-11-04T08:58:24Z | feat: expand browser attachment previews and reduce decoding overhead |
| [aa2c47e](https://github.com/sebastiaofv/TeamOs/commit/aa2c47e960538207c51490a24cfd43c87e493982) | 2026-11-04T09:07:31Z | Merge origin/main into Project Control |
| [e734c23](https://github.com/sebastiaofv/TeamOs/commit/e734c2399ab60c4505c9bdce6cadb35fc818d669) | 2026-11-04T09:08:14Z | Merge pull request #60 from sebastiaofv/codex/us-20-project-control |
| [0802c1d](https://github.com/sebastiaofv/TeamOs/commit/0802c1db78941e8a88d86ce385bc1c7f61679f7c) | 2026-11-04T09:14:12Z | feat: add manual Sprint lifecycle and frozen results (US-22) |
| [db0b88f](https://github.com/sebastiaofv/TeamOs/commit/db0b88f4c00a3db5a5491349080bfd8149bbde64) | 2026-11-04T09:14:38Z | Merge main into attachment improvements and stabilize async checks |
| [8868a1b](https://github.com/sebastiaofv/TeamOs/commit/8868a1b4b580d28944e35c9fb8b05e223efec6ff) | 2026-11-04T09:21:26Z | Merge pull request #61 from sebastiaofv/codex/issue-39-attachments-tab |
| [6629223](https://github.com/sebastiaofv/TeamOs/commit/66292232abda3dd94277e4831bc0ba7873034ffd) | 2026-11-04T09:33:15Z | Merge main into Sprint lifecycle and preserve Project Control |
| [f6969a7](https://github.com/sebastiaofv/TeamOs/commit/f6969a7d55509b2c999b9540ccab65ec4db3232f) | 2026-11-04T09:35:07Z | Merge main into project dashboard and preserve Project Control |
| [f3d2e8e](https://github.com/sebastiaofv/TeamOs/commit/f3d2e8ebe4c88750ef7a3b958f83ea26b4131edc) | 2026-11-04T09:35:07Z | Merge main into browser attachments and preserve the dedicated tab |
| [ef3ad49](https://github.com/sebastiaofv/TeamOs/commit/ef3ad49b1b8bb18515a12011b77eaaa47db86720) | 2026-11-04T10:07:44Z | Implement dashboard section reporting requested in #33 |
| [11cc145](https://github.com/sebastiaofv/TeamOs/commit/11cc145f0daaf256666ebe7997b43cb8a8116b69) | 2026-11-04T12:14:47Z | Merge pull request #59 from sebastiaofv/codex/us-9-project-dashboard |
| [d4bb3c5](https://github.com/sebastiaofv/TeamOs/commit/d4bb3c5f48adbedee8f34ea9826fc933b88a7f50) | 2026-11-04T12:18:07Z | Merge main into US-23 and regenerate combined builds |
| [1b76ba1](https://github.com/sebastiaofv/TeamOs/commit/1b76ba1289e18bbe8cbe7efdc203a1b77dee7382) | 2026-11-04T12:24:04Z | Merge pull request #63 from sebastiaofv/codex/us-23-browser-attachments |
| [a70b33d](https://github.com/sebastiaofv/TeamOs/commit/a70b33df1a5be4baeea6aea25b36d1ee410042a3) | 2026-11-04T18:37:30Z | Remove docs/adr |
| [084a403](https://github.com/sebastiaofv/TeamOs/commit/084a403dbecc046aa24cd17a63662758c4c918a8) | 2026-11-04T18:37:32Z | Remove docs/adr |
| [a3ce86f](https://github.com/sebastiaofv/TeamOs/commit/a3ce86f69ef746cdc74f750d997ae9ff93b15f86) | 2026-11-04T18:38:38Z | Remove kanban/docs |
| [1511314](https://github.com/sebastiaofv/TeamOs/commit/1511314680c2576f67cd704e5f8266c34e120c2a) | 2026-11-04T18:38:40Z | Remove kanban/docs |
| [1773a84](https://github.com/sebastiaofv/TeamOs/commit/1773a84a3817c497ca6662064c1eaafd89f34119) | 2026-11-04T18:52:39Z | Harden Kanban CI release and speed up test runs |
| [976ad62](https://github.com/sebastiaofv/TeamOs/commit/976ad6242c014ff6c9a060c0df6ec6b98f5972fa) | 2026-11-04T18:55:28Z | Tidy .gitignore files |
| [7207d98](https://github.com/sebastiaofv/TeamOs/commit/7207d98181209a07a98cb7953014cc16ef3c1aa9) | 2026-11-04T19:47:42Z | Add in-app documentation and Agile methodology guide (US-29, #70) |
| [1af4a6f](https://github.com/sebastiaofv/TeamOs/commit/1af4a6f7c18a1ca021db4e3f33ad61b4058cd086) | 2026-11-04T20:12:20Z | US-22: Sprint duration in business days and nested Sprints in Roadmap |
| [0889a3a](https://github.com/sebastiaofv/TeamOs/commit/0889a3ab8b92d987d46e68531011c29e62fbedde) | 2026-11-05T01:22:06Z | US-22: workflow types, Testing category, Sprint indicators and planning rules |
| [1c11d79](https://github.com/sebastiaofv/TeamOs/commit/1c11d79e38a300a16bafe4869c46b0ed1df9ae0c) | 2026-11-05T09:20:28Z | Merge pull request #71 from sebastiaofv/feature/70-in-app-docs |
| [4b80ab7](https://github.com/sebastiaofv/TeamOs/commit/4b80ab7a73d5cfe0fbe67ed5aad20a40d13244a2) | 2026-11-05T09:32:24Z | Merge latest main into Sprint lifecycle |
| [531d1b0](https://github.com/sebastiaofv/TeamOs/commit/531d1b0ca34a467e032b1c7af5e221454657659a) | 2026-11-05T09:55:08Z | Replace app header title with Teamos logo |
| [e7bfac3](https://github.com/sebastiaofv/TeamOs/commit/e7bfac31bf0b571c899b8afe86510d9bb0a93b7f) | 2026-11-05T10:00:41Z | Resize header logo to 100 by 25 pixels |
| [ec105ca](https://github.com/sebastiaofv/TeamOs/commit/ec105cad3afffb8ca0f8f0b5133cd15f2bf08b31) | 2026-11-05T10:14:11Z | Set browser page title to TeamOS |
| [d7fd201](https://github.com/sebastiaofv/TeamOs/commit/d7fd20184540891aa69ff4873267742301f018f7) | 2026-11-05T10:38:22Z | Implement approved issue #54 planning and workitem changes |
| [d152f1c](https://github.com/sebastiaofv/TeamOs/commit/d152f1ccf570a4a48197d6876c3a9fbf7eb08782) | 2026-11-05T11:02:12Z | Add theme picker with Classic and minimalist Modern themes |
| [c20aae7](https://github.com/sebastiaofv/TeamOs/commit/c20aae76f6498da79f3e61972c9321e6d7e029c0) | 2026-11-05T11:42:03Z | Implement US-28 conditional saves and project reconciliation |
| [c1aa64e](https://github.com/sebastiaofv/TeamOs/commit/c1aa64e520b6fa2e023c45d8ea3ea2a0dd996370) | 2026-11-05T12:37:10Z | Merge pull request #76 from sebastiaofv/codex/us-32-theme-switcher |
| [f866a9f](https://github.com/sebastiaofv/TeamOs/commit/f866a9f3fa69517bc413e988fcbe5a9e63b429af) | 2026-11-05T13:02:49Z | Merge main into US-28 and regenerate combined builds |
| [5233159](https://github.com/sebastiaofv/TeamOs/commit/52331590cd82aecd8cc06b02f9730ce4448c2461) | 2026-11-05T13:09:47Z | Merge pull request #77 from sebastiaofv/codex/us-28-concurrent-project-reconciliation |
| [6056004](https://github.com/sebastiaofv/TeamOs/commit/6056004966e645a44fb42465ac67af996bb9db78) | 2026-11-05T18:06:01Z | fix: show closed Sprint notice above its table |
| [c4825cf](https://github.com/sebastiaofv/TeamOs/commit/c4825cfee3cca7ff1b08229f204479c6a99e5b05) | 2026-11-05T18:52:51Z | Merge main into US-22 and refresh combined builds and snapshots |
| [5fb4d04](https://github.com/sebastiaofv/TeamOs/commit/5fb4d04fa605ca37a654bacf1b6341c74249986f) | 2026-11-05T18:53:16Z | Merge pull request #65 from sebastiaofv/codex/us-22-sprint-lifecycle |
| [1278f3a](https://github.com/sebastiaofv/TeamOs/commit/1278f3a71cdc5ce29510085395b9c1d0e313e9c9) | 2026-11-05T19:02:26Z | Merge main into planning updates and reconcile Sprint workflows |
| [c229aad](https://github.com/sebastiaofv/TeamOs/commit/c229aad1ae821f25ed38a140f55e50702216f709) | 2026-11-05T19:23:50Z | fix: address issue 54 validation feedback |
| [358f675](https://github.com/sebastiaofv/TeamOs/commit/358f675709706b23ecbf1420101ed4207bc237c8) | 2026-11-05T20:03:55Z | fix: clarify Sprint phase date review choices |
| [be2f781](https://github.com/sebastiaofv/TeamOs/commit/be2f78166e29d96f4df48c38fe5b7e7b811b2e1e) | 2026-11-05T20:11:42Z | Merge pull request #75 from sebastiaofv/codex/issue-54-planning-workflow-updates |
| [9f85057](https://github.com/sebastiaofv/TeamOs/commit/9f850579712853a3b0a345134a4e1c3f6f00af61) | 2026-11-05T20:33:33Z | feat: reorganize workspace navigation and contextual controls |
| [8fbb4d3](https://github.com/sebastiaofv/TeamOs/commit/8fbb4d3628dd17653e844ed8a3f67c96610757b4) | 2026-11-05T21:19:46Z | fix: refine empty workspace and shared query toolbar |
| [0c102af](https://github.com/sebastiaofv/TeamOs/commit/0c102af04f065a5376b92319a0943e90c325d126) | 2026-11-05T21:26:53Z | fix: unify project action labels and icons |
| [04335f1](https://github.com/sebastiaofv/TeamOs/commit/04335f1c1ec0a691e0d47e155bd54e61f58c7868) | 2026-11-05T21:41:03Z | fix: integrate queries into existing Board and Table toolbars |
| [567e0ae](https://github.com/sebastiaofv/TeamOs/commit/567e0aed7e7b0c2695cfd3f03024891e5fd39ac4) | 2026-11-05T21:48:22Z | style: polish spacing and button states in both themes |
| [f992150](https://github.com/sebastiaofv/TeamOs/commit/f99215073f1aef3f6b7526f94e18ebaf7298ddf9) | 2026-11-05T22:05:00Z | Refine table controls and highlight Board creation |
| [ebff84c](https://github.com/sebastiaofv/TeamOs/commit/ebff84c4c483121ff1d6d160bd1ed122c352c1f5) | 2026-11-05T22:17:31Z | Harden accessible controls and reduced-motion saving feedback |
| [3491f8f](https://github.com/sebastiaofv/TeamOs/commit/3491f8f45f570178d5017281aadce5f4c4c92b48) | 2026-11-05T22:35:30Z | Adapt touch and landscape layouts and polish project controls |
| [f40cb36](https://github.com/sebastiaofv/TeamOs/commit/f40cb36bf39d0ca1832ce9e87576ce4188e93d58) | 2026-11-06T08:43:41Z | feat: configure project hierarchy automations (US-30) |
| [c39a5ba](https://github.com/sebastiaofv/TeamOs/commit/c39a5bac4ca97556c303a25e058c2e3150e958e8) | 2026-11-06T09:06:03Z | feat: compact workspace header and Kanban cards (#64) |
| [cc060b5](https://github.com/sebastiaofv/TeamOs/commit/cc060b52aaf3d9017a5755febf8f04f81e808088) | 2026-11-06T09:42:55Z | feat: separate project folders, history and attachments (US-25) |
| [0b93fad](https://github.com/sebastiaofv/TeamOs/commit/0b93fadd6c43a802a30042602199581d675b7527) | 2026-11-06T09:44:39Z | test: retry native file snapshots during atomic saves |
| [eb9f068](https://github.com/sebastiaofv/TeamOs/commit/eb9f06840b29014d5d5d197f9a0961640612584d) | 2026-11-06T10:01:25Z | test: verify standalone project creation closes the dialog |
| [ec20a96](https://github.com/sebastiaofv/TeamOs/commit/ec20a961e657e9961f6dabb5e50a0efa3b68335e) | 2026-11-06T10:48:19Z | feat: use Import Projects as the single folder entry point |
| [f0b975a](https://github.com/sebastiaofv/TeamOs/commit/f0b975a307dde22a5a1a63f95cc047bc8b649f90) | 2026-11-06T11:18:15Z | feat: streamline Table controls and fill Board width (#64) |
| [f8aad42](https://github.com/sebastiaofv/TeamOs/commit/f8aad42e9313c2487c010f8d456d9b76f3eafd74) | 2026-11-06T11:28:24Z | fix: vertically center dropdown chevrons (#64) |
| [c0a7a78](https://github.com/sebastiaofv/TeamOs/commit/c0a7a784df648ea0172d790fc4148413859f3940) | 2026-11-06T11:33:28Z | style: consolidate Dashboard and Project Control toolbars (#64) |
| [3711e96](https://github.com/sebastiaofv/TeamOs/commit/3711e96b6b256c40c1fc6ad9c4022c0ce5df87c4) | 2026-11-06T14:18:16Z | feat: group Table sprint actions and simplify Sprint tables (#64) |
| [81c96dd](https://github.com/sebastiaofv/TeamOs/commit/81c96dd00776be791a45f63d4b5324c5ec859f9c) | 2026-11-06T16:01:28Z | feat: align Project Control subsections with the All table (#64) |
| [a587d1b](https://github.com/sebastiaofv/TeamOs/commit/a587d1b562be7d6315cef80a0ed763644a81a85f) | 2026-11-08T23:24:38Z | fix: refine automation reviews and Sprint closure for issue 72 |
| [778b20a](https://github.com/sebastiaofv/TeamOs/commit/778b20a74d80e1ca2d9db79a2c8606ca02689607) | 2026-11-08T23:31:58Z | feat: implement Table, Board and Roadmap review feedback (#64) |
| [bbe9d0d](https://github.com/sebastiaofv/TeamOs/commit/bbe9d0dc7ebf49f17c21580636d7165ffd4a014b) | 2026-11-09T00:26:47Z | Merge pull request #82 from sebastiaofv/codex/issue-66-project-folders |
| [358e381](https://github.com/sebastiaofv/TeamOs/commit/358e3815bd9fe8d89896072dfc47d99a346e3639) | 2026-11-09T00:31:34Z | Merge main into project automations after US-25 |
| [93965cf](https://github.com/sebastiaofv/TeamOs/commit/93965cfff0da8ebd4e4ac90ace4ebe6396109afa) | 2026-11-09T00:33:08Z | Merge main into app design after US-25 |
| [1a18ede](https://github.com/sebastiaofv/TeamOs/commit/1a18ede9553db27c86eb21b2e60c6096498d7721) | 2026-11-09T01:01:41Z | feat: unify workflow reviews and refine Sprint closure (#72) |
| [5f1981e](https://github.com/sebastiaofv/TeamOs/commit/5f1981ebd7388a83ed99c7238da6594831eee003) | 2026-11-09T07:22:44Z | fix: anchor Board selection labels inside the scrolling columns (#84) |
| [ba39681](https://github.com/sebastiaofv/TeamOs/commit/ba396817ee5d2397d41812282a1688918eeee148) | 2026-11-09T07:29:56Z | Merge pull request #80 from sebastiaofv/codex/issue-72-project-automations |
| [a2b9203](https://github.com/sebastiaofv/TeamOs/commit/a2b9203270f39ae79c50cb06e483970cc67ec4ec) | 2026-11-09T07:33:32Z | Merge main into Board overflow fix after US-30 |
| [bed0af4](https://github.com/sebastiaofv/TeamOs/commit/bed0af4ce80a5b046ae845560340e5860340ba9c) | 2026-11-09T07:36:19Z | Merge main into app design after US-30 |
| [f9ebe19](https://github.com/sebastiaofv/TeamOs/commit/f9ebe19a41194252278230c927c621fdccc8b86d) | 2026-11-09T07:48:00Z | fix: isolate view filters and align compact roadmap milestones (#64) |
| [c25a59a](https://github.com/sebastiaofv/TeamOs/commit/c25a59a0c6df0e816b89821236ecbb693d22397a) | 2026-11-09T07:51:15Z | Merge updated app design branch after US-30 |
| [379a2a9](https://github.com/sebastiaofv/TeamOs/commit/379a2a9804d213e1f69370f90dc48b9a20f3ecde) | 2026-11-09T09:13:39Z | perf: keep workitem interactions responsive with large histories (#78) |
| [eba91d7](https://github.com/sebastiaofv/TeamOs/commit/eba91d7f4987434aabe2ec0396b9bb74ca7c6278) | 2026-11-09T09:37:16Z | Merge pull request #86 from sebastiaofv/codex/issue-78-performance |
| [2bd9618](https://github.com/sebastiaofv/TeamOs/commit/2bd961887d58081525e95131ff829d28f1e0ce9f) | 2026-11-09T09:49:16Z | Merge main into app design after performance fixes (#78) |
| [bdfffe0](https://github.com/sebastiaofv/TeamOs/commit/bdfffe05c6a96c0a83169e0c1683e45517b47c5a) | 2026-11-09T12:31:32Z | fix: address Sprint phase review and Roadmap feedback (#64) |
| [ad5ae35](https://github.com/sebastiaofv/TeamOs/commit/ad5ae353e0cb8398a2f5e15c546f723933528789) | 2026-11-09T12:39:08Z | feat: reorganize project files into the v1 format (#68) |
| [b3ce21c](https://github.com/sebastiaofv/TeamOs/commit/b3ce21c221b4d7595f065c296d87c43b8196f525) | 2026-11-09T13:56:36Z | fix: simplify Sprint confirmations and phase date reviews (#64) |
| [9508545](https://github.com/sebastiaofv/TeamOs/commit/9508545c6638590dc7bbb97c3809b27f2eb0c9b3) | 2026-11-09T14:56:27Z | fix: preserve project history and harden v1 conversion (#68) |
| [c0f9c06](https://github.com/sebastiaofv/TeamOs/commit/c0f9c0675e214965db5cfa6edfc2a068bdf0b64b) | 2026-11-09T15:08:35Z | test: wait for project identity saves before advancing |
| [fe2a780](https://github.com/sebastiaofv/TeamOs/commit/fe2a78083a2907c57689f3d2d863a120d2b4174c) | 2026-11-09T15:45:31Z | fix: scale Roadmap zoom and mark completed milestones (#64) |
| [b0a6b1a](https://github.com/sebastiaofv/TeamOs/commit/b0a6b1ab34999c5005b4bf0493dbdbc960bf7584) | 2026-11-09T16:11:38Z | Merge pull request #79 from sebastiaofv/codex/issue-64-app-design |
| [1f103bf](https://github.com/sebastiaofv/TeamOs/commit/1f103bf2a93dc8d95ac6981c8d88336f5caa6079) | 2026-11-09T20:29:26Z | fix: complete the v1 format review for project files (#68) |
| [7982621](https://github.com/sebastiaofv/TeamOs/commit/7982621ba298da10643fa2d1a2680220ee88d8da) | 2026-11-11T19:30:25Z | docs: align in-app guides with current TeamOS behavior |
| [b1945c7](https://github.com/sebastiaofv/TeamOs/commit/b1945c7d121b017153596ed7126b2bb3c2242b23) | 2026-11-11T19:52:16Z | refactor: tighten the v1 project file structure (#68) |
| [ace5a21](https://github.com/sebastiaofv/TeamOs/commit/ace5a21d8c0ba481794f2be0bd51fbb094e1e7ea) | 2026-11-11T23:13:22Z | Merge main into the v1 project format branch (#68) |
| [1d7ad91](https://github.com/sebastiaofv/TeamOs/commit/1d7ad9122dcb4feb2f660d32dedea4e15f2629d0) | 2026-11-11T23:13:53Z | Merge pull request #88 from sebastiaofv/claude/issue-68-project-json-v1 |
