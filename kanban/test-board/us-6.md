# US-6 · Histórico por workitem

Usar `us-6` (base `main`). Copiar o JSON antes de importar com escrita; arrastar permite consulta em leitura. Todos os dados são fictícios.

1. Abrir #601: Detalhes é inicial. Histórico conserva o item/contexto. Mostra três operações: bloco do Planner, estado e gravação com vários campos, pela sequência e **não** pela hora.
2. Expandir estado: Ready → Delivered at date, IDs preservados. O nome atual da coluna é diferente e não substitui o nome histórico. Autor é Não identificado, apesar de Ana ser participante/responsável.
3. Confirmar os títulos de #601: `Planeamento`, `Estado` e `2 categorias · 5 alterações` (em inglês: `Planning`, `Status` e `2 categories · 5 changes`). Expandir gravação: título, descrição, prioridade, participantes e responsável na mesma entrada. Filtros Pessoas/Campos encontram a mesma operação uma vez, conservando o título completo e as cinco alterações. Filtrar Arquivo em #601 apresenta “Nenhum evento corresponde ao filtro”, com regresso a Todas.
4. #603 tem apenas a fotografia inicial; não existe criação inventada. Sem timeline, existe estado vazio e não se usa a data de criação como fronteira de registo.
5. Mostrar arquivados e abrir #602: histórico permanece disponível. Desarquivar gera uma nova operação, distinta de restauro global.
6. Editar apenas título e descrição de #601, guardar e consultar: uma operação com o título `Campos e conteúdo · 2 alterações` / `Fields and content · 2 changes`. Alterar apenas o estado: `Estado` / `Status`, sem contagem. Criação, arquivo e desarquivo mantêm designações próprias. Fazer mudanças posteriores e desfazer via palette: entradas separadas, incluindo a inversa. Retry de gravação não repete operações. Operações legadas sem alterações recuperáveis conservam a designação genérica e a indicação de detalhes indisponíveis.
7. Atribuir sprint em massa, incluindo um item já nesse sprint: só os itens efetivamente alterados recebem a operação. Eliminar agrupamentos atribui mudanças apenas aos itens cujas referências foram alteradas.
8. Alterar Planner (mover/redimensionar/remover) e consultar: datas/horas e valores anterior/posterior legíveis. Anexos mostram metadados, nunca base64/dataUrl.
9. Selecionar uma posição antiga na timeline e abrir detalhe pelo Calendário/Roadmap: só aparecem eventos até à posição inclusive, mesmo com timestamps iguais/invertidos. Expandir/filtrar não move a timeline. Restaurar o projeto gera uma operação com efeitos e origem comprovados.
10. Eliminar o maior ID, guardar/reabrir ou restaurar fotografia antiga e criar outro item: o ID anterior não é reutilizado. A reserva versionada está no JSON e os eventos de eliminação não desaparecem.
11. Importar `tests/fixtures/us-6-partial.board.json`: detalhes em falta explícitos; nomes resolvidos do estado atual são identificados como atuais. `us-6-reused-id.board.json` mostra apenas a nova vida de #801; nas fotografias anteriores, a vida antiga. Restauros sem evidência suficiente sinalizam ambiguidade em vez de combinar históricos.
12. Consultar em leitura/histórico, testar teclado dos separadores, filtros, tema claro/escuro, falha/retry e conflito de ficheiro. Não existem ações de editar/apagar entradas nem restauro individual.
13. Verificar a apresentação em claro/escuro e a 390 px: separadores com a mesma linguagem visual dos separadores da Ajuda (maiúsculas, contorno reto e destaque superior), seletor de categoria com as cores e dimensões dos controlos da aplicação, operações compactas sem cantos arredondados, metadados secundários e valores Antes/Depois em painéis neutros. Em mobile, os valores ficam empilhados sem scroll horizontal; Tab evidencia o foco nos separadores, filtro e cabeçalhos expansíveis, e Enter/Espaço expande as entradas. Estados vazios e avisos históricos usam as superfícies do tema.

## Condicionais

US-2 fornece comandos/UI de relações; a projeção já compara endpoints realmente alterados e respeita o sentido em eventos legados. US-4/5/12 fornecem workflow/hierarquia e operações estruturais; são projetadas pela timeline canónica quando integradas. US-7/8/16 fornecem comentários/PRs/anexos adicionais; este branch não os implementa. Histórico é um registo local editável no ficheiro, não uma auditoria remota/inviolável.

Verificar com `npm run typecheck`, `npm run lint`, `npm run test:unit` e `npx playwright test tests/e2e/task-history.test.ts tests/e2e/task-detail.test.ts tests/e2e/timeline.test.ts`.
