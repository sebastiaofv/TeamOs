# US-4 · Workflow e colunas do Board

Usar `us-4`. Copiar o JSON antes de importar com escrita; arrastar outra cópia permite testar leitura. Dados fictícios.

## Apresentação acordada

A decisão mais recente do utilizador substitui a proposta anterior de três colunas por categoria: **uma coluna normal por estado**, incluindo Backlog, Cancelled e Duplication, sem listas separadas. As cards, o detalhe e o formulário de edição mantêm a apresentação original, sem cabeçalhos novos nem seletores inline de estado/responsável. O domínio, a palette, os atalhos e o drag-and-drop continuam a validar as transições.

## Testes manuais

1. Importar `us-4.board.json`: aparecem nove colunas pela ordem configurada. Ready to test, Testing e Re-analysis são colunas próprias, apesar de terem a mesma categoria semântica. Cancelados não contam como concluídos nem como atrasados.
2. Abrir **Colunas do Board** na toolbar. Desmarcar Cancelled e Duplication: só essas colunas desaparecem, não os estados nem os workitems. Voltar a marcar restaura as colunas e os cartões.
3. Guardar/reabrir o ficheiro mantém a seleção em `extensions.boardView`, versão 1, com `hiddenStateIds`. A lista vazia significa todos os estados visíveis; ficheiros antigos sem esta extensão também mostram todos. A preferência pertence ao projeto, não ao browser/localStorage.
4. Ocultar todas as colunas apresenta uma mensagem com indicação para voltar a mostrá-las. O seletor continua acessível. A Table e restantes vistas mantêm acesso a todos os workitems; a escolha não é um filtro global de trabalho.
5. Abrir vários projetos: cada um conserva a sua seleção. O agregado respeita a visibilidade de cada projeto; ocultar um estado num projeto não elimina os itens do mesmo estado noutro projeto.
6. Arrastar #401 de Backlog para To Do sem sprint: permitido. Backlog → Done: recusado. Criar workitems em qualquer coluna continua a iniciar em Backlog.
7. #402 bloqueado pode seguir para Ready to test ou Done. A responsabilidade de Ana não muda automaticamente. Para editar pessoas, utilizar o formulário original; a descrição e restante layout mantêm-se.
8. #406 pode percorrer Ready to test → Testing → Re-analysis → In progress → Ready to test repetidamente. Cada movimento guarda um evento de estado no mesmo ID; a coluna indica o estado exato, sem controlos adicionais na card.
9. Done, Cancelled e Duplication são terminais por defeito. Configurar uma transição de reabertura nas definições permite voltar a outro estado, sem criar outro item.
10. Definições → Workflow: escolher um estado na lista e editar nome/cor/categoria e destinos no painel correspondente. A lista apresenta ordem, categoria e número de destinos. As setas de ordenação conservam o ID; Adicionar estado seleciona e foca o novo nome. Campos e dropdowns têm dimensões alinhadas e setas contidas. Os temas claro/escuro e a versão estreita do modal têm testes visuais próprios.
11. No separador **Entrada e referências**, configurar o estado de entrada e as referências de categoria. Estados removidos com trabalho em uso exigem destino explícito nesta secção. Trocar de estado/separador conserva o rascunho; Cancelar descarta todas as alterações. Guardar valida Backlog, referências, nomes únicos e acessibilidade. Estados inacessíveis ficam assinalados na lista. Os botões de Guardar/Cancelar mantêm-se visíveis enquanto os painéis são percorridos.
12. Renomear/reordenar um estado oculto preserva a seleção pelo ID. Eliminar um estado em uso exige realocação explícita, incluindo arquivados; o ID eliminado é removido também das preferências de visibilidade. Novos estados começam visíveis.
13. Mudar visibilidade tem um evento próprio da timeline, sem alterações de estado dos workitems. Consulta/restauro históricos utilizam a seleção da fotografia correspondente e preservam eventos anteriores.
14. Projeto de leitura ou fotografia histórica: consultar colunas/configuração, sem gravar preferências nem alterar estados. A proibição também é aplicada no comando.
15. Falhar a gravação após ocultar: a alteração local é mantida e o projeto indica erro. Retry grava a mesma preferência e evento, sem duplicar a operação. Reutilizar a resolução existente para alterações externas/conflitos.
16. Ficheiros antigos/workflow v1 migram sem substituir nomes, IDs, estados personalizados ou transições em uso. O novo processo predefinido aplica-se a novos projetos, não é imposto retroativamente.

## Integrações condicionais

US-12 ainda não existe em `main`: não são criados tipos nem outra hierarquia de workitems. Epics serão agrupamentos sem workflow. Relações dependem da US-2; a conclusão usa a categoria semântica, não o nome. US-6 projeta os eventos canónicos quando integrada.

Verificar: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npx playwright test tests/e2e/board-presentation.test.ts tests/e2e/workflow.test.ts tests/e2e/workflow-layout.test.ts tests/e2e/workflow-editor.test.ts`.
