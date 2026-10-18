# Boards de teste manual

Copiar os ficheiros antes de testar: **Import Projects** abre-os com escrita e cada alteração é gravada automaticamente. Arrastar os ficheiros para a aplicação permite testar em modo só de leitura.

| Ficheiro | Issue | Versão / aplicação |
| --- | --- | --- |
| [`us-1.board.json`](us-1.board.json) | [US1 · #25](https://github.com/sebastiaofv/TeamOs/issues/25) | Esquema v1; abrir no branch `us-1` ou posterior com Tabela |
| [`us-2.board.json`](us-2.board.json) | [US2 · #26](https://github.com/sebastiaofv/TeamOs/issues/26) | Esquema v1 + `taskRelations` v1; abrir no branch `us-2` para testar relações |
| [`us-3.board.json`](us-3.board.json) | [US3 · #27](https://github.com/sebastiaofv/TeamOs/issues/27) | Esquema v2; abrir no branch `us-3` para testar responsável/participantes |

Os branches US2 e US3 ainda são implementações separadas: o board de US2 precisa da implementação de relações; o board de US3 precisa de suporte ao esquema v2. Todos os dados são fictícios. As datas são fixas em outubro/novembro de 2026; navegar para esse período no Calendário/Roadmap e para **19/10/2026** no Day Planner.

## US1 — Tabela

1. Importar `us-1.board.json`, selecionar o projeto e abrir **Tabela**.
2. Por defeito: **28 itens ativos** (inclui concluídos). **Todos: 30**. **Arquivados: 2** (#108 e #109).
3. Ordenar por ID ascendente e selecionar **25 linhas por página**: duas páginas; #130 aparece na segunda. Abrir/fechar um detalhe deve manter página, ordenação e filtros.
4. Pesquisar `OAuth`, `101` ou `acessibilidade` (esta última só está na descrição de #102).
5. Combinar participante `Ana`, estado `doing`, prioridade alta e etapa `Construção`: apenas **#101**. Na US1 o filtro de pessoas ainda pode chamar-se Assignee/Responsável; na US3 passa a Participante.
6. Testar planeamento, esforço, bloqueados (#103), datas e campos em falta (#105). Mostrar, esconder e reordenar colunas e recarregar.
7. Exportar CSV com vírgula e ponto e vírgula: respeita filtros, colunas e todas as páginas. #106 testa vírgulas/aspas/quebras de linha; #107 testa título semelhante a fórmula, exportado como texto.

## US2 — Relações e bloqueios

1. Importar `us-2.board.json` na implementação da US2. Por defeito há **10 itens ativos**; **Todos: 12**, incluindo os arquivados #208 e #209.
2. #203 depende de #201 e #202. Concluir apenas um mantém o bloqueio; concluir ambos resolve-o; reabrir um volta a bloquear. Alterar o estado de #203 continua permitido.
3. #205 tem bloqueio **manual**, mesmo com #204 concluído. Resolver/reabrir/concluir a dependência não deve apagar o motivo manual.
4. #209 está arquivado mas aberto: continua a bloquear #210. Concluir resolve; eliminar pede confirmação do impacto e preserva #210.
5. #206 está relacionado com #207 e #208 sem dependência. Navegar nos dois sentidos, substituir a relação escolhendo direção e remover sem apagar itens. A pesquisa deve encontrar #208 por ID/título e identificar arquivo/conclusão.
6. Em #206, **Criar relacionado** herda apenas etapa/milestone; não herda participantes, sprint, prioridade, prazo, tags, checklist ou bloqueio. O novo item começa no Backlog. Cancelar não deixa nada criado.
7. Cadeia #201 → #203 → #211: tentar #211 → #201 deve falhar por ciclo indireto. Autoassociações e repetição do par #201/#203 devem ser rejeitadas. Usar #212 para novas associações.
8. Guardar, reabrir e confirmar relações e bloqueios. Reimportar uma cópia original para repor o cenário.

## US3 — Participantes e responsável

1. Importar `us-3.board.json`: **9 ativos / 10 no total**. No detalhe, os campos responsável/participantes são separados.
2. Responsável **Ana** + participante **Rui**: **#301 e #307** nos ativos; incluir arquivados acrescenta **#308**. #302 não corresponde porque o responsável é Rui.
3. **Sem responsável**: #303, #304 e #310. **Sem participantes**: só #304. Os dois filtros combinados também dão apenas #304.
4. Em #301, escolher Marta como responsável inclui-a nos participantes e mantém Ana/Rui. Limpar responsável mantém todos; o estado permanece igual. Testar nomes livres e sugestões também pela palette.
5. Em #302, corrigir Rui para Rui Silva atualiza o responsável apenas nesse item. #301 e os restantes mantêm Rui.
6. Em #305, remover Marta pede confirmação: cancelar mantém os dois campos; confirmar deixa Rui participante e limpa responsável. Repetir pela palette e testar Undo.
7. #303 tem um único participante e continua sem responsável. #304 permite guardar e mudar estado sem qualquer atribuição. #306 oferece nomes adicionais nas sugestões. #309 testa nomes que coincidem com valores internos de filtros.
8. Repetir os filtros em Board, Tabela, Roadmap (expandir Construção), Calendário (outubro de 2026) e Day Planner (19/10/2026; distinguir itens planeados e lista de itens).
9. Consultar a timeline depois das alterações: valores anteriores/posteriores, preview e reabertura devem manter coerência. Mostrar a coluna Responsável na Tabela e experimentar criação e gravação por Ctrl/Cmd+Enter.
10. Importar também uma cópia de `us-1.board.json` na US3: a migração preserva participantes e deixa **todos sem responsável**, mesmo #126 com Ana como participante único. Gravar/reabrir passa a usar esquema v2.

## Condição para próximas histórias

Cada issue deve fornecer um board JSON válido em `test-board/us-N.board.json`, com cenários representativos dos seus critérios de aceitação, estados vazios e casos-limite relevantes, acompanhado de instruções e resultados esperados. O board deve usar o esquema suportado pela respetiva implementação e ser validado antes do PR.
