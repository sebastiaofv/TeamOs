# US-7 · Conversas no workitem

Usar o branch `us-7`, criado de `main`. Copiar o JSON antes de importar com escrita; arrastar outra cópia testa consulta em leitura. Os dados e URLs são fictícios. O ficheiro inclui **55 comentários em #701**, um comentário num item arquivado e um item com conversa vazia. Pode ser regenerado com `node test-board/generate-us-7.mjs` e é validado pelos testes.

1. Abrir #701: Comentários fica abaixo dos dados principais, sem separador próprio. Inicialmente aparecem os 50 mais recentes, por ordem de publicação, mesmo com horas iguais/invertidas. Carregar anteriores mostra os 55 sem perder a posição de leitura.
2. O comentário 54 tem apenas imagem. O 55 contém quebras de linha, @menção, URL seguro e HTML literal: não executa HTML nem carrega imagens remotas. Abrir o link é explícito e isolado da aplicação.
3. Imagens: consultar miniaturas, ampliar com teclado, Escape fecha só a imagem, descarregar. Selecionar/colar PNG/JPEG/WebP no rascunho, remover antes de publicar e guardar/reabrir. Conteúdo real é validado e descodificado, não apenas extensão/MIME; não há compressão/redimensionamento.
4. Abrir #703: autor inicial vazio, mesmo que existam participantes. Introduzir autor explícito e texto; Enter muda de linha, Ctrl/⌘+Enter publica. A descrição/estado/arquivo/pessoas/planeamento permanecem iguais. O último autor explícito é recordado só neste projeto/sessão, com indicação local/não verificada.
5. Testar vazio/espaços, 10 001 caracteres, 11 imagens, imagem >10 MiB, SVG/GIF/ficheiro falso PNG e PNG indecodificável: erro claro antes de publicar, sem truncar nem apagar o rascunho. Imagens sem texto são válidas se existir autor.
6. Escrever texto/autor/adicionar imagens; fechar/reabrir e navegar para outro item preserva o rascunho. Descartar é explícito. Rascunhos não aparecem no JSON; terminar completamente a aplicação não os preserva.
7. Falhar a gravação depois de publicar: a publicação aparece e o rascunho é limpo após aplicação local. O projeto mostra gravação falhada; **Retry** grava o mesmo ID/data/conteúdo, sem novo comentário/evento. Não confundir aplicação local com gravação concluída.
8. Restaurar a fotografia inicial: campos normais recuam mas a conversa atual do mesmo workitem permanece. Consultar essa fotografia, antes do restauro, não mostra comentários futuros. O corte utiliza a posição canónica, não as horas.
9. Eliminar #701 conserva os comentários no registo e nas fotografias apropriadas. Recuperar o mesmo item mantém a conversa; criar outro item não reutiliza o ID. Não há browser de eliminados nem controlos para editar/apagar publicações.
10. Mostrar arquivados e abrir #702: pode receber comentários se gravável, sem desarquivar/reabrir. Em leitura ou fotografia histórica, só consultar/ampliar/descarregar; não existe compositor e o comando também impede publicar.
11. Com rascunho não enviado, alterar o ficheiro externamente: recarregar preserva o rascunho. Se o item desaparecer, surge recuperação com texto selecionável e descarga completa, incluindo imagens. Não é feita fusão automática.
12. Publicar com gravação falhada e criar conflito externo: escolher recarregar exige aviso adicional antes de perder comentários locais; descarregar cópia permite recuperar primeiro e não aplica o reload. Só a confirmação explícita substitui o registo. Os rascunhos não enviados mantêm-se.
13. Os avisos de tamanho do projeto contam imagens canónicas de todas as conversas, incluindo itens eliminados, sem contar referências da timeline como novas imagens. Publicações e imagens não são copiadas integralmente para diffs/snapshots.
14. Testar temas claro/escuro, teclado e gravação/reabertura. O JSON continua editável externamente; a imutabilidade da interface não promete proteção contra substituição do ficheiro nem recuperação de conteúdo ausente.
15. Confirmar cartões, miniaturas e campos com contornos retos, labels do compositor em maiúsculas e foco igual aos restantes formulários. O título da imagem ampliada segue a tipografia dos modais. A 390 px, publicar um autor com 150 letras sem espaços: o nome quebra linhas sem alargar a conversa nem criar scroll horizontal. Repetir em claro/escuro.

## Integrações condicionais

US-6 é outro PR independente. Após integração, Comentários permanece em Detalhes e o Histórico identifica a publicação/autor local pelo evento canónico, sem se tornar uma segunda conversa. US-11 fornecerá membros ativos/IDs quando existir; este branch usa nomes locais explícitos e sugestões existentes. US-16 não é necessária para imagens da conversa, que têm propriedade e limites próprios. US-17 poderá reutilizar o componente.

Verificação: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npx playwright test tests/e2e/comments.test.ts tests/e2e/task-detail.test.ts tests/e2e/timeline.test.ts tests/e2e/project-files.test.ts`.
