# Issue #83 — Progress Since Last Review

Implements [the activity-section request](https://github.com/sebastiaofv/TeamOs/issues/83#issuecomment-6756920894). The six Project Overview widgets, Project Control and Sprint Analytics keep their existing behavior.

## English walkthrough

Import `us-9-sections.board.json`, select Dashboard and set Start date to **24/10/2026**, End date to **31/10/2026**.

1. **Progress Since Last Review** follows the six Overview widgets, with a quiet divider and heading. Activity Summary occupies the first row; Started Workitems, Completed Workitems and In Progress Workitems share the next row on a wide screen. At smaller widths the grid wraps. Detail widgets retain preset heights.
2. Activity Summary shows **3 Started**, **2 Completed**, **6 In Progress**. Each indicator opens the complete corresponding list below the dashboard, including when its detail widget is hidden.
3. Started contains Story **910** (24/10), independent Task **911** (25/10), and Bug **914** (28/10). The fixture's legacy title “Bug excluded from activity lists” is retained to expose the changed inclusion rule. Child Task **913** and Epics are excluded. Moving 911 to Testing on 26/10 does not count as another start.
4. Completed contains **910** and **912**, both on 30/10. The event for 912 at 23:59:59.999 belongs to that day. Each row shows Type, ID, Title, Responsible and the recorded transition date. Titles truncate with their full text on hover. Clicking a row, ID or title opens its read-only detail.
5. In Progress includes execution and Testing states at the selected End date, including work already executing before Start. Workflow badges retain the recorded state name and color. Preview lists show at most **five** rows; **View All (6)** opens all six In Progress workitems. Counts in headings and Activity Summary always refer to the full list.
6. Set Start to 26/10: only Bug 914 remains in Started. Set End to 29/10: Completed becomes empty and Story 910 is still In Progress. Repeated starts/completions count a workitem once per indicator; the date shown is its first qualifying transition within the selected period.
7. In **Visible sections**, add/remove each of the four activity widgets and use its up/down buttons to reorder them. With a writable project, these four widgets' visibility/order are saved in the project file, restored on reopening and available to everyone using that file. **Reset to Default** restores the summary first and all three lists. This extension does not change workitems or the other sections' visibility preferences. Read-only/historical consultation supports a local layout without writing to the project.
8. A period with recorded history but no qualifying transitions shows zero and a quiet empty message. Starting before 15/10 displays a partial-history warning. No baseline means Started/Completed are unavailable (N/A), while current In Progress can still be consulted. An End date before the first baseline never substitutes today's data. Restores, baseline contents and workflow edits do not invent activity.
9. Repeat in English/Portuguese, light/dark, at desktop and 390px widths. Tables scroll internally; the page has no horizontal overflow. Keyboard users can activate IDs/titles, summary indicators, View All and layout controls. Changing dates clears obsolete source lists. Consultation and drill-down alone leave the project file untouched. The standalone HTML supports the same behavior offline.

## Validação em português

Importar o mesmo ficheiro e selecionar **24/10/2026–31/10/2026**. A secção **Progresso desde a última revisão** apresenta **Resumo de atividade**, **Workitems iniciados**, **Workitems concluídos** e **Workitems em curso**. Confirmar totais **3 / 2 / 6**, as datas efetivas, inclusão de Bugs e Testing, exclusão de Tasks dependentes e abertura dos detalhes históricos. As tabelas incluem tipo, ID, título e responsável, além da data ou estado. **Ver todos (6)** apresenta a lista completa; as pré-visualizações mostram até cinco linhas.

Em **Secções visíveis**, confirmar adição, remoção e reordenação dos quatro widgets. A configuração é guardada no ficheiro partilhado do projeto e mantém-se ao reabrir; **Repor predefinições** recupera a ordem inicial. Em modo de consulta, a alteração é apenas local. Confirmar mensagens distintas para ausência de atividade, histórico parcial e histórico indisponível, bem como funcionamento em claro/escuro, mobile e standalone offline.

Automated coverage: `tests/unit/dashboardOverview.test.ts`, `tests/unit/dashboardActivityLayout.test.ts`, `tests/e2e/dashboardSections.test.ts`, `tests/e2e/dashboard.test.ts` and `tests/dashboard-sections.visual.test.ts`.
