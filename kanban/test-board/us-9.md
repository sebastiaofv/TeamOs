# US-9 · Dashboard do projeto

Board fictício: [us-9.board.json](us-9.board.json). Usar a aplicação deste branch. Copiar antes de importar para escrita; arrastar para testar só de leitura. O dashboard é uma área de consulta: abrir um workitem usa o detalhe existente em modo de leitura.

## Fotografia atual, fontes e progresso

1. Importar o board e selecionar **US-9 · Atlas project dashboard**. Abrir **Dashboard → Visão global / Overview**. Abrir também outro projeto com IDs locais iguais: os respetivos itens nunca entram nos cálculos.
2. A execução global é **2 / 6 = 33,3%**: folhas elegíveis `903, 904, 905, 906, 908, 909`; concluídas `903, 908`. Epic `901` e Story `902` têm filhos e não entram no denominador. `907` é cancelado e não entra. `904` está arquivado e entra. O estado `accepted / Validated` tem categoria semântica Concluído.
3. Selecionar o KPI de execução, depois um título da lista de origem. O detalhe abre sem perder o âmbito, tab ou lista; Escape regressa ao dashboard. Bloqueados abre `905` (manual) e `906` (dependência).
4. Em **Âmbito do plano / Planning scope → API delivery**, execução **1 / 2 = 50%**; o progresso considera a herança de `903`. A lista da fase apresenta `901–904`. No âmbito Delivery programme, Public release tem **2 / 5 = 40%**.
5. Atrasado usa prazo estritamente anterior à data da fotografia; o dia do prazo ainda não é atraso. Em **31/10/2026**, atrasados são `904, 906` e `905` ainda não está atrasado. Sem responsável: `904, 906, 909`. Sem prazo: `908, 909`. Noutra data, a lista de atrasados adapta-se; os restantes resultados mantêm-se.
6. Os gráficos de estados/tipos e a tabela por responsável incluem todos os níveis, explicitamente identificados. Selecionar uma barra ou contagem abre os respetivos itens. Os KPIs de execução usam folhas. Filtros do Board/Table não alteram este dashboard.

## Gantt e ausência de dados

1. No período **15/10–10/11/2026**, Delivery programme, API delivery e UX delivery estão simultaneamente no período planeado. Todas são sinalizadas; as fases com itens em execução também têm essa indicação. A linha de hoje aparece se estiver dentro do intervalo do plano. Na fotografia histórica há uma segunda linha para a data consultada.
2. Selecionar barras de fases e diamonds de milestones abre os itens associados. **Abrir no Roadmap / Open in Roadmap** navega para o plano; numa fase abre a lista existente. Voltar a Dashboard conserva âmbito e tab.
3. Escolher **Empty phase**: execução **N/D**, sem fontes, sem prazo calculável. Escolher **Cancelled scope**: denominador elegível zero e **N/D**, nunca 0% nem 100%. Unassigned checkpoint e Cancelled checkpoint também não têm percentagem fabricada.
4. Desvio face à baseline é N/D: a baseline da timeline é uma observação, não uma baseline aprovada de planeamento. O modelo atual não tem workstreams, FTE, riscos, decisões ou entregáveis; a UI explica a indisponibilidade e permite filtrar fases, sem transformar tags em workstreams.

## Histórico e sprints

1. No seletor **Fotografia / Snapshot**, escolher **15/10/2026 09:00 UTC**. Execução global **1 / 6 = 16,7%**; `903` ainda está em execução. Abrir o seu detalhe pela lista de origem confirma esse estado histórico e não permite alterar dados. Voltar à fotografia atual repõe **33,3%**.
2. Em Histórico registado, período **16–19/10/2026** não tem observações. Não aparecem pontos interpolados. Uma data final anterior à inicial mostra erro. As observações de 15, 20, 25 e 30/10 são navegáveis; uma fotografia histórica não mostra observações futuras.
3. **Sprint Analytics / Análise de sprints** começa com Todos os sprints. Os números e nomes seguem o catálogo comum. Selecionar apenas Implementation, depois Discovery e Implementation, depois Todos: a seleção funciona para um, vários ou todos. Em 31/10: Discovery = Concluído por datas, Implementation = Ativo, Hardening = Planeado.
4. Implementation tem quatro participantes (`902–905`), três folhas elegíveis e uma concluída. Selecionar as contagens permite consultar as fontes. Com seleção individual, ver distribuição por estados/tipos e a alteração de âmbito de **25/10**: `906` saiu de Implementation para Hardening. Selecionar essa alteração consulta o registo anterior preservado.
5. Story Points, capacidade, velocity/média, comparação de SP e burndown apresentam **N/D**: o modelo atual só guarda esforço categórico, não pontos. Carry-over de fecho, objetivo, review e retrospetiva também são N/D quando não existem registos. Participação e alterações de âmbito nunca são apresentadas como resultados finais imutáveis de sprint.

## Leitura, idiomas e acessibilidade

Repetir com arrastar/largar (só de leitura), tema claro/escuro, PT-PT/inglês e janela de 390 px. Nas duas tabs, usar a roda do rato dentro do dashboard para chegar ao Histórico registado e regressar ao início; a barra de navegação permanece visível. Tab/Enter permitem selecionar KPIs e abrir fontes; o foco segue para o título da lista, e os detalhes fecham com Escape. O Gantt e tabelas têm deslocamento horizontal local sem alargar a página. Mudar para Todos os projetos regressa ao Board e oculta Dashboard. Consultar o dashboard não altera o ficheiro. Alterações externas e conflitos continuam a ser tratados pelo mecanismo comum da aplicação.

## Validação automatizada

`tests/unit/dashboard.test.ts` valida o JSON, ida-e-volta, IDs/histórico, cálculo semântico, folhas, arquivo, herança, sobreposição, cancelamento, datas, observações e participação. `tests/e2e/dashboard.test.ts` cobre seleção de projeto, drilldown, leitura, navegação, períodos, sprints, PT-PT, teclado e ecrã pequeno. Não há alteração de esquema persistido.

Resultados de 31/10/2026: lint e typecheck aprovados; 1 248 testes unitários e 371 testes end-to-end aprovados. As verificações finais do dashboard incluem sete cenários end-to-end e duas verificações visuais com quatro imagens (Overview/Sprint Analytics, claro/escuro). Builds normal e standalone gerados. A suite visual completa tem 47 testes aprovados e 20 diferenças de baseline já reproduzidas numa cópia intacta de `main` (`e01e7de`); não foram atualizadas essas imagens herdadas. Foram atualizadas apenas as dez baselines afetadas pela navegação e acrescentadas as quatro imagens do dashboard.

Correção de scroll: a área do dashboard ativa agora deslocamento vertical no contentor da aplicação. Regressão validada com roda do rato nas duas tabs, a 1280 px (board completo) e 390 px (projeto vazio): 11 cenários end-to-end do dashboard e duas verificações visuais aprovados.
