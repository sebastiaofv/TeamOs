# US1 — Tabela de workitems

Board: [`us-1.board.json`](us-1.board.json). Branch: `us-1`. Issue: [#25](https://github.com/sebastiaofv/TeamOs/issues/25).

1. Importar uma cópia do board, selecionar o projeto e abrir **Tabela**.
2. Por defeito: **28 itens ativos** (inclui concluídos). **Todos: 30**. **Arquivados: 2** (#108 e #109).
3. Ordenar por ID ascendente e selecionar **25 linhas por página**: duas páginas; #130 aparece na segunda. Abrir/fechar um detalhe deve manter página, ordenação e filtros.
4. Pesquisar `OAuth`, `101` ou `acessibilidade` (esta última só está na descrição de #102).
5. Combinar pessoa `Ana`, estado `doing`, prioridade alta e etapa `Construção`: apenas **#101**. Na US1, o filtro de pessoas chama-se Assignee/Responsável.
6. Testar planeamento, esforço, bloqueados (#103), datas e campos em falta (#105). Mostrar, esconder e reordenar colunas e recarregar.
7. Exportar CSV com vírgula e ponto e vírgula: respeita filtros, colunas e todas as páginas. #106 testa vírgulas/aspas/quebras de linha; #107 testa título semelhante a fórmula, exportado como texto.
