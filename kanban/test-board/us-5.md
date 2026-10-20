# US-5 · Roadmap hierárquico

Usar `us-5`, criado de `main`, não de `us-4`. Copiar o board antes de importar. Arrastar outra cópia testa leitura.

1. Abrir Roadmap: um único eixo e secções Milestones/Etapas/Sprints. Delivery → Engineering → API/Interface. Controlos separados recolhem subetapas e abrem trabalho inline.
2. Delivery e Public release: **25% (1/4 elegíveis)**. O item arquivado #503 conta na métrica. Com filtro Ativos aparecem 3 de 4; com filtro Done aparece 1 de 4, mantendo 25%. Sem folhas: N/D.
3. Public release é posterior ao intervalo das etapas, contém trabalho de ramos diferentes e não depende do sprint.
4. Abrir #505 e atribuir API e Public release no detalhe. Sprint e estado mantêm-se. No editor, só API/Interface/Future work são destinos de etapa; pais continuam disponíveis como filtros. Sem etapa/Sem milestone encontram itens não associados.
5. Criar uma subetapa em API: datas iniciais copiam o intervalo de API; Guardar exige realocação explícita dos dois itens diretos, incluindo arquivados quando aplicável. Cancelar mantém tudo. Escolher limpar ou a nova folha aplica a árvore e associações numa operação.
6. Editar/mover ramos: não é permitido escolher a própria etapa/descendente. Datas de pais são calculadas; mover preserva datas das folhas. Se o pai perde o último filho, conserva o intervalo calculado como editável.
7. Eliminar Engineering é impedido enquanto tem filhos. Eliminar folha/milestone em uso exige confirmação e escolha explícita de outra folha/milestone ou Nenhuma. Cancelar não altera nada; restantes dimensões e estados mantêm-se.
8. Guardar/reabrir preserva IDs, árvore, datas, associações, timeline e sprint. Ficheiros roadmap v1 migram para extensão v2 sem eventos inventados.
9. Em leitura/histórico, consultar árvore, progresso, listas e detalhes sem alterar. Testar teclado e temas claro/escuro.

## Integrações condicionais

- #28/US-4: após integração, o cálculo usa categorias do workflow, exclui Cancelados e mostra contagem própria; neste branch independente, `done` representa conclusão. Acrescentar uma folha cancelada após integrar #28 não altera o exemplo 1/4.
- #36/US-12: hierarquia de workitems ainda não existe em `main`. Herança/Nenhuma/substituição e exclusão de workitems-pai aguardam essa estrutura; não foi criada uma segunda hierarquia de trabalho nesta história.

## Verificação

`npm run typecheck`, `npm run lint`, `npm run test:unit` e `npx playwright test tests/e2e/roadmap.test.ts tests/e2e/phase-tree.test.ts`.
