# US1 — Tabela de workitems

Board: [`us-1.board.json`](../../test-board/us-1.board.json). Branch: `us-1`. Issue: [#25](https://github.com/sebastiaofv/TeamOs/issues/25).

1. Importar uma cópia do board, selecionar o projeto e abrir **Tabela**.
2. Por defeito: **28 itens ativos** (inclui concluídos). **Todos: 30**. **Arquivados: 2** (#108 e #109).
3. Ordenar por ID ascendente e selecionar **25 linhas por página**: duas páginas; #130 aparece na segunda. Abrir/fechar um detalhe deve manter página, ordenação e filtros.
4. Pesquisar `OAuth`, `101` ou `acessibilidade` (esta última só está na descrição de #102).
5. Combinar pessoa `Ana`, estado `doing`, prioridade alta e etapa `Construção`: apenas **#101**. Na US1, o filtro de pessoas chama-se Assignee/Responsável.
6. Testar planeamento, esforço, bloqueados (#103), datas e campos em falta (#105). Mostrar, esconder e reordenar colunas e recarregar.
7. Exportar CSV com vírgula e ponto e vírgula: respeita filtros, colunas e todas as páginas. #106 testa vírgulas/aspas/quebras de linha; #107 testa título semelhante a fórmula, exportado como texto.

## Revisão da entrega — apresentação e vistas

8. Verificar **Criado/Atualizado** no formato `yyyy-mm-dd HH:mm:ss`, em UTC, 24 horas e sem milissegundos. Os prazos continuam apenas com data.
9. Ativar todas as colunas. Cada uma mantém a largura mínima; o texto fica limitado a duas linhas e o conteúdo completo continua disponível no título/tooltip e no detalhe. A tabela tem scroll horizontal, também em ecrã estreito.
10. Os estados têm badges diferentes: Backlog preto, To Do azul, In Progress âmbar e Done verde. Ativar **Blocked**: o Yes de #103 fica vermelho; No é neutro.
11. Em **Workitems por planear**, só aparecem não concluídos sem sprint: **19 ativos**. Selecionar #105 e #106, criar um Sprint com o mesmo formulário do Board, e confirmar que ambos deixam esta vista sem mudar de estado. Cancelar antes de guardar não altera o board. Em modo só de leitura não existe a ação de criar sprint.
12. Em **Sprints**, os cabeçalhos mantêm nome, estado, conclusão e datas mesmo colapsados. Expandir cada secção: apenas os respetivos membros; os filtros, paginação, detalhe e CSV aplicam-se à tabela desse sprint. Secções fechadas não montam as linhas.
13. Com a data de referência **18/10/2026**, os resultados esperados são:
    - Sprint 0: **Terminado**, **66,7% (2/3)**; inclui dois membros arquivados na métrica, mesmo quando as suas linhas estão ocultas pelo filtro de ativos.
    - Sprint 1: **Ativo**, **25% (1/4)**.
    - Sprint 2: **Planeado**, **0% (0/2)**.
    - Sprint 3: **Planeado**, **N/D (0/0)**.
14. Mudar os filtros não altera a percentagem global do sprint. As datas determinam apenas o estado temporal; ainda não existe encerramento nem fotografia congelada. Os itens não regressam automaticamente ao Backlog. O adaptador de dados da vista admite futuros membros/fotografias por sprint, sem exigir que um workitem pertença historicamente a um só sprint.
