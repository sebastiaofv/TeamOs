# US-13 · Projetos agrupados por produto e transferência de tarefas

Estado: aprovado após entrevista de clarificação; substitui integralmente a história de manutenção na issue #37. A issue #36, relativa a tipos de workitem, mantém o seu âmbito.

## História de utilizador

> Como gestor de produto, quero agrupar projetos independentes pelo nome do produto e copiar ou mover tarefas entre esses projetos, para organizar o trabalho de um mesmo produto sem perder os workflows próprios de cada projeto nem a rastreabilidade das tarefas.

## Âmbito e regras funcionais

### 1. Produto e projeto

- Cada projeto continua a ter o seu próprio ficheiro `.board.json`, tarefas, workflow e definições.
- O produto é um agrupamento de projetos, sem tarefas, workflow ou ficheiro próprios. Existe apenas um nível de agrupamento.
- Nas definições de cada projeto existe um campo de texto livre e opcional **Produto**, persistido como `productName` nos metadados do projeto (`extensions.project`). Cada projeto pode pertencer a um único produto.
- Nomes iguais após remover espaços no início/fim e ignorar maiúsculas/minúsculas identificam o mesmo produto: `House`, `house` e ` House ` agrupam os projetos. A apresentação conserva a capitalização introduzida e usa uma designação consistente no cabeçalho do grupo.
- Um valor vazio ou composto apenas por espaços equivale a não ter produto. Projetos antigos sem o campo continuam a funcionar como projetos autónomos.
- Alterar o produto nas definições afeta apenas esse projeto; não renomeia nem altera os restantes. Limpar o campo torna o projeto autónomo. Um grupo sem projetos carregados deixa de aparecer.

### 2. Navegação

- A navegação apresenta os projetos carregados com o mesmo produto como filhos de um cabeçalho de produto expansível/recolhível.
- Selecionar um projeto continua a abrir as suas vistas existentes e respeita a origem de cada tarefa nas vistas agregadas já existentes.
- O cabeçalho do produto apenas expande/recolhe os projetos. Esta história não acrescenta um board, dashboard ou workflow combinado de produto.
- Projetos sem produto continuam acessíveis autonomamente. A opção global existente para todos os projetos mantém-se disponível.
- Exemplo: `House / Construção` e `House / Manutenção` são dois projetos independentes sob **House**; manutenção é um projeto normal, sem uma área especial.

### 3. Copiar e mover

- O menu de cada tarefa disponibiliza **Copiar para projeto…** e **Mover para projeto…**. A operação incide sobre uma tarefa de cada vez.
- Os destinos elegíveis são outros projetos atualmente carregados com o mesmo produto não vazio, segundo a mesma regra de comparação dos nomes. Projetos autónomos ou de outro produto não são elegíveis.
- Tanto na cópia como na movimentação é obrigatório escolher explicitamente um estado válido do workflow do destino. Não há atribuição implícita a Backlog nem correspondência automática por nome de estado.
- Copiar exige destino com escrita; a origem pode estar em modo de leitura. Mover exige origem e destino com escrita. Aplicam-se as restrições existentes a vistas históricas e conflitos pendentes.
- Antes de confirmar, a interface identifica origem, destino, estado escolhido, valores que exigem mapeamento e associações que serão removidas. Cancelar não altera nenhum projeto.
- Se não existir destino elegível, a interface explica o motivo. A operação não altera as definições ou o workflow do projeto de destino.

### 4. Conteúdo, identidade e histórico

- **Mover:** preserva a identidade interna permanente da tarefa, conteúdo, anexos, checklist, datas próprias, comentários e histórico. A origem e o destino da transferência ficam registados.
- **Copiar:** cria uma tarefa com nova identidade interna, número local válido e histórico novo. Conserva o conteúdo da tarefa e anexos, incluindo a checklist e as suas marcações; não copia comentários nem o histórico anterior. O novo histórico regista a origem da cópia.
- Cada tarefa possui uma identidade interna imutável, distinta do número apresentado dentro do projeto. A movimentação não altera essa identidade; em caso de colisão, o número local é ajustado sem perder a referência ao projeto e número de origem.
- A cópia conserva a tarefa original sem alterações. Uma movimentação concluída deixa a tarefa apenas no destino.

### 5. Pessoas, etiquetas e planeamento

- Pessoas e etiquetas continuam a pertencer aos catálogos de cada projeto. Identificadores ou nomes iguais não permitem presumir uma identidade partilhada entre projetos.
- Referências incompatíveis a pessoas ou etiquetas exigem mapeamento explícito para valores válidos no destino, ou remoção explicitamente aceite. A operação não cria entradas nos catálogos automaticamente nem descarta valores silenciosamente.
- Tanto copiar como mover remove as associações a etapas/fases de roadmap, milestones e sprints, bem como os blocos de tempo agendados no planner. Não são importadas nem recriadas estas estruturas no destino.
- O histórico da tarefa de destino regista quais as associações de planeamento removidas, com os respetivos identificadores/designações e, para blocos agendados, os horários removidos. Na cópia, este registo integra o histórico novo; o planeamento da tarefa original mantém-se intacto.
- Datas próprias da tarefa, como a data-limite, permanecem. O histórico regista também remapeamentos ou remoções explícitas de pessoas/etiquetas.

### 6. Relações entre tarefas

- Copiar ou mover preserva as referências às mesmas tarefas relacionadas; não copia nem move essas tarefas.
- As relações passam a referenciar a identidade permanente da tarefa, permitindo navegar para a localização atual mesmo depois de movimentos sucessivos ou de uma alteração do número local.
- Mantêm-se o tipo e o sentido das relações, a apresentação nos dois extremos e as regras de bloqueio existentes quando as tarefas necessárias estão carregadas.
- Se o projeto da tarefa relacionada não estiver carregado, a referência permanece visível com indicação de indisponibilidade e ação para abrir/carregar o projeto. Uma referência, por si só, não concede acesso ao ficheiro nem garante a descoberta automática da sua localização atual.
- Enquanto uma tarefa bloqueadora estiver indisponível, o seu estado é desconhecido e não pode ser tratado como concluído. A indisponibilidade não elimina a relação. Informação anteriormente conhecida deve ser identificada como potencialmente desatualizada.
- Alterar ou limpar posteriormente o produto de um projeto não invalida relações existentes. A pertença ao produto limita os destinos de novas transferências, não a validade das referências já preservadas.
- Mantêm-se as proibições de autorrelação, duplicação de relações e dependências circulares. Esta história não introduz uma pesquisa geral para criar novas relações entre quaisquer projetos.

### 7. Persistência e falhas

- A movimentação grava primeiro a tarefa no destino e só depois a remove da origem. Se a gravação no destino falhar, a origem mantém-se intacta.
- Se o destino tiver sido gravado mas a remoção/gravação da origem falhar, a interface apresenta a movimentação como pendente/incompleta, conserva os dados e permite recuperação sem duplicar a tarefa numa nova tentativa. Não apresenta a operação como concluída.
- A cópia só é apresentada como concluída depois de o destino ser gravado; uma nova tentativa da mesma operação não pode criar cópias adicionais acidentalmente.
- Deteção de alterações externas, modo de leitura e resolução de conflitos continuam a aplicar-se a cada ficheiro. Não se pressupõe uma transação atómica entre ficheiros.
- O esquema e a normalização preservam o nome do produto, a identidade permanente, as relações e o histórico relevante depois de guardar e reabrir os projetos. A migração de tarefas antigas atribui identidades estáveis sem regenerá-las a cada abertura nem perder relações, números locais, comentários ou histórico.

## Critérios de aceitação

- [ ] Dois projetos com `productName` equivalente aparecem sob um único produto, como filhos expansíveis, mantendo ficheiros e workflows independentes.
- [ ] A comparação ignora maiúsculas/minúsculas e espaços exteriores; um valor vazio não cria um grupo vazio.
- [ ] Alterar ou remover o produto afeta apenas o projeto editado; projetos antigos continuam autónomos e acessíveis.
- [ ] O cabeçalho apenas expande/recolhe os projetos; cada projeto continua a abrir as vistas existentes.
- [ ] As ações de cópia/movimentação apresentam apenas outros projetos carregados do mesmo produto e exigem escolher um estado válido no destino em ambas as operações.
- [ ] Cancelar não deixa tarefas ou relações parcialmente criadas. Ausência de destinos e restrições de escrita têm explicações claras.
- [ ] Copiar conserva a origem, cria uma identidade distinta e histórico novo, conserva conteúdo/anexos e não copia comentários ou histórico anterior.
- [ ] Mover preserva identidade, conteúdo, comentários e histórico; colisões de números locais não confundem tarefas.
- [ ] Referências incompatíveis a pessoas/etiquetas exigem mapeamento ou remoção explícitos, sem criar catálogos automaticamente.
- [ ] Em ambas as operações, associações ao roadmap, milestones, sprints e blocos do planner são removidas no destino e detalhadas no histórico; a data-limite mantém-se.
- [ ] As tarefas relacionadas ficam nos seus projetos; as relações conservam sentido e navegação após cópia, movimentos sucessivos, guardar e reabrir.
- [ ] Referências continuam válidas se um projeto mudar de produto. Projetos relacionados não carregados produzem referências indisponíveis, com ação para os abrir, sem assumir conclusão de bloqueadores.
- [ ] Falha de gravação no destino não remove a origem; falha posterior na origem mantém uma operação pendente recuperável, sem perda de dados nem duplicação numa nova tentativa.
- [ ] Ficheiros antigos e novos preservam dados, identidades, relações e histórico em testes de ida-e-volta e após alterações externas suportadas.

## Relação com outras histórias

- Substitui a área especial de manutenção anteriormente descrita na **#37 / US-13**. A manutenção pode ser representada por um projeto normal do mesmo produto.
- A **#36 / US-12**, relativa a tipos de workitem, mantém o seu âmbito; esta história não implementa a hierarquia de tipos.
- A **#26 / US-2** limita atualmente as relações ao mesmo projeto. Esta história introduz a exceção necessária para preservar relações entre projetos após cópia/movimentação, incluindo identidade, navegação e bloqueadores indisponíveis.
- A **#28**, relativa a workflows, prevê Backlog para novos workitems. Na cópia entre projetos, esta história estabelece uma exceção explícita: o utilizador escolhe o estado do destino, tal como na movimentação.
- Mantêm-se os catálogos independentes de pessoas/etiquetas previstos em **#35** e **#53**.

## Condições de implementação

- Manter compatibilidade com `.board.json` antigos; evoluções de esquema exigem migração versionada, validação, fixtures e testes de ida-e-volta, preservando IDs e dados.
- Um JSON local por projeto mantém-se como fonte de verdade; não pressupor backend, base de dados oculta, sincronização remota ou integrações não aprovadas.
- Respeitar o modo de leitura e reutilizar autosave, deteção de alterações externas e resolução de conflitos.
- Manter PT-PT/inglês, teclado, acessibilidade, estados vazios, validações e erros claros; cobrir os comportamentos críticos com testes unitários e end-to-end adequados.
- Seguir o tema/design atual da aplicação.
- No branch e PR de implementação, incluir `kanban/test-board/us-13.board.json` e pelo menos um projeto complementar do mesmo produto, além dos exemplos necessários de outro produto/projeto autónomo. Cobrir workflows diferentes, colisões de números locais, relações, comentários, roadmap/sprints/planner e casos de leitura/falha pertinentes.
- Validar os boards com o esquema implementado e documentar passos e resultados esperados em `kanban/test-board/us-13.md`; manter as instruções gerais em `kanban/test-board/README.md`.

## Aprovação

Âmbito confirmado pelo utilizador após a entrevista de clarificação. Esta história especifica a funcionalidade; a implementação não faz parte desta revisão.
