# Boards de teste manual

Cada história inclui o seu board e roteiro no respetivo branch:

| História | Board | Roteiro |
| --- | --- | --- |
| US1 · branch `us-1` · PR #44 | [us-1.board.json](https://github.com/sebastiaofv/TeamOs/blob/us-1/kanban/test-board/us-1.board.json) | [us-1.md](https://github.com/sebastiaofv/TeamOs/blob/us-1/kanban/docs/manual-tests/us-1.md) |
| US2 · branch `us-2` · PR #45 | [us-2.board.json](https://github.com/sebastiaofv/TeamOs/blob/us-2/kanban/test-board/us-2.board.json) | [us-2.md](https://github.com/sebastiaofv/TeamOs/blob/us-2/kanban/docs/manual-tests/us-2.md) |
| US3 · branch `us-3` · PR #46 | [us-3.board.json](https://github.com/sebastiaofv/TeamOs/blob/us-3/kanban/test-board/us-3.board.json) | [us-3.md](https://github.com/sebastiaofv/TeamOs/blob/us-3/kanban/docs/manual-tests/us-3.md) |

Usar a aplicação do branch correspondente. Os boards das histórias anteriores podem estar presentes por herança do branch base; cada nova história acrescenta apenas os seus próprios ficheiros.

Copiar os ficheiros antes de testar: **Import Projects** abre-os com escrita e cada alteração é gravada automaticamente. Arrastar os ficheiros para a aplicação permite testar em modo só de leitura. Todos os dados são fictícios.

As datas são fixas em outubro/novembro de 2026; navegar para esse período no Calendário/Roadmap e para **19/10/2026** no Day Planner.

## Condição para próximas histórias

Cada issue deve fornecer, no seu próprio branch e PR, um board JSON válido em `kanban/test-board/us-N.board.json`. A pasta `kanban/test-board/` deve conter apenas boards JSON; os roteiros ficam em `kanban/docs/manual-tests/us-N.md`, com cenários representativos dos critérios de aceitação, estados vazios e casos-limite relevantes, passos e resultados esperados. Usar o esquema suportado pela respetiva implementação e validar o board antes do PR.
