# Boards de teste manual

As histórias integradas têm os boards e roteiros nesta pasta em `main`; histórias pendentes apontam para o respetivo branch:

| História | Board | Roteiro |
| --- | --- | --- |
| US1 · integrada em `main` · PR #44 | [us-1.board.json](us-1.board.json) | [us-1.md](us-1.md) |
| US2 · branch `us-2` · PR #45 | [us-2.board.json](https://github.com/sebastiaofv/TeamOs/blob/us-2/kanban/test-board/us-2.board.json) | [us-2.md](https://github.com/sebastiaofv/TeamOs/blob/us-2/kanban/test-board/us-2.md) |
| US3 · integrada em `main` · PR #46 | [us-3.board.json](us-3.board.json) | [us-3.md](us-3.md) |
| US4 · branch `us-4` | [us-4.board.json](us-4.board.json) | [us-4.md](us-4.md) |

Para US1 e US3, usar a aplicação de `main`. Para histórias pendentes, usar o branch correspondente. Os boards das histórias anteriores podem estar presentes por herança do branch base; cada nova história acrescenta apenas os seus próprios ficheiros.

Copiar os ficheiros antes de testar: **Import Projects** abre-os com escrita e cada alteração é gravada automaticamente. Arrastar os ficheiros para a aplicação permite testar em modo só de leitura. Todos os dados são fictícios.

As datas são fixas em outubro/novembro de 2026; navegar para esse período no Calendário/Roadmap e para **19/10/2026** no Day Planner.

## Condição para próximas histórias

Cada issue deve fornecer, no seu próprio branch e PR, um board JSON válido em `kanban/test-board/us-N.board.json` e o respetivo roteiro em `kanban/test-board/us-N.md`, com cenários representativos dos critérios de aceitação, estados vazios e casos-limite relevantes, passos e resultados esperados. O `README.md` desta pasta reúne as instruções gerais. Usar o esquema suportado pela respetiva implementação e validar o board antes do PR.
