# US-8 · Ligações locais a pull requests

Usar `us-8`, criado de `main`, não dos branches anteriores. Copiar o JSON antes de importar com escrita; arrastar outra cópia testa leitura. URLs e dados fictícios, sem necessidade de servidores/PRs reais.

1. Abrir #801: secção Pull Requests em Detalhes, com três URLs de servidores diferentes, HTTP/HTTPS, portas e query/fragmento preservados. Não existem fornecedor/repositório/número/título/estado/notas nem verificações remotas.
2. #802 repete um URL de #801: permitido. #803 tem lista vazia clara. #804 arquivado mantém referência inacessível sem a remover/classificar automaticamente.
3. Adicionar URL completo em #803 e confirmar. Espaços exteriores são removidos, nada mais. Aceitar `http://git.local:8080/qualquer/caminho?Q=One%2FTwo#Diff`, sem exigir `/pull/` ou github.com.
4. Rejeitar vazio, `42`, `/repo/pull/1`, `javascript:alert(1)`, `data:`, `file:` e `https://user:password@git.local/pr/1`. A entrada fica preservada e a lista/eventos não mudam.
5. Tentar repetir exatamente um URL, com/sem espaços exteriores: erro. Corrigir outro link para esse mesmo URL também é impedido. Variações textuais de maiúsculas/query/fragmento continuam distintas, sem comparação semântica.
6. Corrigir e confirmar altera só a associação; Cancelar preserva-a. Remover pede confirmação com o URL completo; Cancelar mantém-no. Descrição, estado, pessoas e planeamento não mudam.
7. Criar/editar workitem: adicionar/corrigir/remover links é rascunho. Só **Guardar o workitem** aplica. Cancelar o workitem descarta tudo; Enter no campo confirma apenas a ligação e não submete o formulário inteiro.
8. Abrir é uma ação explícita, numa janela isolada (`noopener noreferrer`). Gestão/listagem/persistência funcionam offline e não pedem metadados/previews/favicons/API; abrir pode depender de acesso ao destino e nunca altera o projeto.
9. A timeline inicial contém uma associação de #801: fotografia inicial tem um link e atual tem três. Consultar histórico mostra as associações da fotografia; restaurar recua os links (ao contrário de comentários imutáveis), mantendo eventos anteriores.
10. Em leitura e fotografias históricas, só consultar/abrir; não há ações de mutação, e o comando também as impede. Gravar/reabrir/exportar/importar preserva URLs; ficheiros v1/v2 migram para v3 com lista vazia onde não existia informação, sem inventar associações.
11. Falhar a gravação após confirmar: associação/evento já aplicados permanecem em memória. Retry grava os mesmos dados, sem duplicar link/evento. Conflitos seguem a escolha do ficheiro completo já existente.
12. Testar PT-PT/inglês, teclado, URLs compridos e temas claro/escuro.

US-6 é um PR separado: após integração, `task.updated` com alterações `pullRequests` aparece no Histórico, incluindo anterior/posterior e uma única operação quando guardado com outros campos. Este branch não cria um histórico paralelo nem implementa GitHub API, OAuth, tokens, webhooks, sincronização ou deteção de merge. US-17 poderá reutilizar o componente.

Verificação: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npx playwright test tests/e2e/pull-requests.test.ts tests/e2e/task-editor.test.ts tests/e2e/task-detail.test.ts tests/e2e/timeline.test.ts`.
