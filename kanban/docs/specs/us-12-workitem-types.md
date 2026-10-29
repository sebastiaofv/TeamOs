# US-12 · Tipos de workitem e hierarquia

Estado: entendimento final confirmado pelo utilizador em 2026-10-28; implementação autorizada na branch feature/us-12-workitem-types, associada à #36. Implementação concluída e validada localmente: 1.203 testes unitários e 372 testes Playwright, lint, typecheck e builds normal/standalone aprovados.

## História de utilizador

Como gestor de projeto, quero distinguir Epics, User Stories, Tasks e Bugs, organizar a hierarquia funcional e acompanhar execução, aceitação e planeamento nas vistas existentes do TeamOS.

Referência: [#36 / US-12](https://github.com/sebastiaofv/TeamOs/issues/36#issuecomment-6458684949). Esta versão consolida as decisões da entrevista e substitui as regras incompatíveis da proposta original.

## 1. Tipos e workflow comum

- Quatro tipos: Epic, User Story, Task e Bug. Workitem é o termo genérico; Task designa apenas trabalho de execução.
- Selecionar o tipo na criação rápida e no formulário completo. O tipo é imutável depois de criar.
- Todos os tipos usam os estados, categorias e transições do workflow definido para o projeto. Não existem workflows próprios por tipo.
- Novos workitems começam no Backlog, conforme a #28. Mantém-se a exceção aprovada na US-13 para copiar entre projetos com escolha explícita de estado do destino.
- Conclusão e cancelamento usam categorias semânticas, nunca nomes fixos como Done.
- Todos os canais de mudança de estado respeitam as mesmas regras, incluindo detalhe, Table, Boards, atalhos, ações em lote e transferências.
- Cancelamento não equivale a conclusão; reabertura exige uma transição permitida. Bloqueios continuam informativos, conforme as #26 e #28.

## 2. Hierarquia

| Tipo | Pai permitido | Filhos permitidos |
| --- | --- | --- |
| Epic | Nenhum | User Stories e Tasks |
| User Story | Epic ou nenhum | Tasks |
| Task | User Story, Epic ou nenhum | Nenhum |
| Bug | Nenhum | Nenhum |

- Pai e filhos pertencem sempre ao mesmo projeto. Cada workitem tem no máximo um pai.
- Uma Task de uma Story obtém o Epic através dessa Story; não tem um segundo Epic independente.
- Rejeitar associações inválidas, autorreferências e ciclos.
- A decomposição de Stories em Tasks é opcional.
- Related Workitems mantém-se independente da hierarquia, com as regras existentes de relações, dependências e navegação.
- No detalhe de Epic, criar Stories ou Tasks com o pai preenchido automaticamente; apresentar secções User Stories e Tasks para os filhos diretos.
- No detalhe de Story, a secção chama-se exclusivamente Tasks e permite consultar, criar e abrir Tasks com associação automática.
- Permitir associar workitems existentes, desassociar e mudar de pai. Recalcular progresso, planeamento e visibilidade afetados e registar no History.
- Impedir eliminar um pai com filhos; exigir primeiro desassociar ou mudar explicitamente os filhos para outro pai válido. Não eliminar em cascata.
- Cancelar ou reabrir filhos não cancela, conclui nem reabre automaticamente o pai.

## 3. Campos e detalhe

Preservar Title, Description, Responsible, Participants, Tags, Blocked, Blocker, Priority, Status, Created, Updated e Due, incluindo os comportamentos atuais e as validações dos valores preenchidos.

| Tipo | Campos e secções específicos | Effort | Pull Requests |
| --- | --- | --- | --- |
| Epic | Objective / Expected Outcome; Scope opcional; Business Value opcional; User Stories; Tasks diretas; Progress | Não | Não |
| User Story | Acceptance Criteria; Epic opcional; Tasks; Execution Progress | Manual | Sim |
| Task | Parent Workitem opcional; restantes campos existentes | Manual | Sim |
| Bug | Steps to Reproduce; Expected Result; Actual Result; Severity opcional; Environment / Version opcional | Manual | Sim |

- Severity é distinto de Priority. Bugs não têm Parent Workitem.
- Não acrescentar campos próprios de testes/aceitação a Tasks nem a Epics.
- Phase e Milestone aplicam-se aos quatro tipos, segundo a herança definida na secção 8.
- Sprint é planeado em Stories, Tasks sem Story e Bugs. Epics não entram em Sprints; Tasks de Stories acompanham o planeamento da Story.
- Só título e tipo são obrigatórios na criação; os restantes campos específicos podem ser preenchidos depois. Preservar validações condicionais existentes, por exemplo motivo de bloqueio manual.
- Acceptance Criteria tem de estar preenchido antes da aceitação de uma Story. Os campos específicos de Bugs continuam opcionais.
- Effort nunca é calculado, somado, preenchido automaticamente nem usado como ponderação.
- Comments, History e Related Workitems existem nos quatro tipos. Comments mantém ordenação do mais recente para o mais antigo.
- Preservar edição/consulta de relações, dados de responsável/estado, anexos e as capacidades existentes de Pull Requests nos tipos elegíveis.
- History mantém apresentação compacta e regista alterações de campos, estado, pessoas, hierarquia, relações, planeamento, automatismos e aceitação funcional.

## 4. Aceitação e estado dos pais

- Concluir uma Story ou Bug exige confirmação explícita de aceitação funcional, mesmo quando todas as Tasks já terminaram.
- Impedir aceitar uma Story com Tasks por concluir: é necessário concluí-las, cancelá-las ou desassociá-las explicitamente.
- Stories sem Tasks seguem o workflow manual e continuam a exigir critérios e aceitação.
- O diálogo pede um nome local e regista nome, data e transição no History. A autoria é local e não verificada; não criar autenticação ou papéis de aprovação nesta US.
- A aceitação está disponível com acesso de escrita e respeita as restrições existentes de histórico, conflitos e persistência.
- O Epic tem estado manual e progresso calculado. Concluir filhos não conclui automaticamente o Epic.
- Permitir concluir um Epic com filhos pendentes, avisando antes da confirmação.
- Reabrir uma Task de uma Story aceite atualiza o progresso e apresenta aviso de inconsistência, sem alterar automaticamente o estado da Story. A reabertura da Story é explícita.
- Problemas de validação podem ser registados em Comments; não é obrigatório criar um Bug.

Ver [ADR-0002](../../../docs/adr/0002-separate-parent-completion-from-child-execution.md).

## 5. Automatismos das Stories

- Sem botão ou diálogo “Story automation” na interface, por decisão do utilizador em 2026-10-28. Preservar configurações existentes nos ficheiros e respetivos comportamentos.
- A configuração persistida admite por projeto dois destinos opcionais: início e fim da execução. Ambos são estados não terminais do workflow comum.
- Cada automatismo define origens elegíveis. Só atua se a origem atual corresponder e a transição estiver permitida. Não cria um segundo workflow, não aceita, cancela ou reabre automaticamente a Story.
- Detetar início quando o conjunto de Tasks passa de não iniciado para execução iniciada, usando as categorias do workflow. Uma Task que passa diretamente a concluída também representa trabalho iniciado.
- Detetar fim quando deixa de haver Tasks por concluir e existe pelo menos uma Task concluída. Canceladas são excluídas; todas canceladas não disparam avanço.
- Apenas mudanças de estado de Tasks disparam estes automatismos. Criar, associar ou desassociar Tasks atualiza progresso, sem fazer avançar a Story.
- No máximo uma transição da Story por alteração de estado de Task. Se início e fim coincidirem, prevalece fim; não encadear avanços sucessivos nem repetir efeitos ao guardar/reabrir.
- Se a transição automática estiver impedida, guardar a alteração válida da Task, manter o estado da Story e informar do motivo. Não fabricar um evento de transição da Story que não aconteceu.
- Registar as transições automáticas efetivamente aplicadas e a Task que lhes deu origem no History.

## 6. Progresso

| Indicador | Numerador | Denominador |
| --- | --- | --- |
| Execution Progress da Story | Tasks concluídas | Tasks não canceladas |
| Progress do Epic | Filhos diretos concluídos | Filhos diretos não cancelados |
| Progresso do Sprint | Itens principais planeados concluídos | Itens principais planeados não cancelados |

- Peso igual por item, sem Effort. Cancelados ficam fora do numerador e denominador.
- No Epic, contar Stories e Tasks diretamente associadas. Tasks de Stories não voltam a contar diretamente no Epic.
- Uma Story só conta como concluída após aceitação funcional. Ter 100% de execução das Tasks não a torna concluída.
- No Sprint, itens principais são Stories, Tasks sem Story e Bugs; não duplicar Story e Tasks. Mostrar o progresso de execução das Tasks separadamente.
- Sem itens elegíveis, mostrar ausência de percentagem (“Sem trabalho elegível” ou o estado N/D já existente na vista), nunca 100%.
- Arquivo e filtros de apresentação não transformam o conjunto global de trabalho associado: preservar a compatibilidade com as regras de contagem das #25 e #29.
- As fórmulas de Epic/Story/Sprint não substituem a fórmula de folhas elegíveis das etapas e milestones definida na #29.

## 7. Sprints e histórico

- Cada workitem tem no máximo um Sprint atual, planeado ou ativo; participação histórica pode abranger vários Sprints.
- A Story é a unidade de planeamento das suas Tasks. Planear uma Story inclui automaticamente Tasks não terminadas. Novas Tasks criadas enquanto a Story estiver no Sprint acompanham esse planeamento.
- Tasks subordinadas não escolhem um Sprint independente.
- Ao passar a Story para outro Sprint, levar apenas Tasks não terminadas. Tasks concluídas ou canceladas mantêm a participação no Sprint anterior e continuam no detalhe da Story, sem se tornarem trabalho planeado no novo.
- Preservar a consulta dos Sprints em que a Story participou e das Tasks que realmente participaram em cada um. Não reconstruir o trabalho histórico apenas a partir da associação atual da Story.
- Ao associar uma Task não terminada a uma Story, adotar o planeamento da Story. Ao desassociar, conservar o Sprint como planeamento próprio se continuar elegível. Trabalho terminado conserva a participação histórica.
- Ao reabrir uma Task terminada num Sprint anterior, adotar automaticamente o Sprint atual da Story se estiver planeado ou ativo, preservando a participação histórica anterior. Sem Sprint atual elegível, a Task fica sem alocação atual. A confirmação mostra esta alteração e o eventual aviso de inconsistência da Story aceite; não reabre a Story automaticamente.
- Antes de alterar associações que afetem planeamento, pré-visualizar o antes/depois e confirmar.
- Manter a elegibilidade existente: não planear em Sprints concluídos; revalidar ao aplicar.
- Preservar o significado atual de ativo segundo as datas do Sprint. Vários Sprints podem estar ativos, sem permitir múltiplas alocações atuais do mesmo workitem.
- Esta US não implementa encerramento autónomo de Sprints, reset automático de estado para Backlog ou uma nova política de rollover.
- Preservar a compatibilidade com o futuro encerramento e o seu histórico congelado, sem apresentar snapshots ou estados históricos que não tenham sido registados.

Ver [ADR-0003](../../../docs/adr/0003-preserve-sprint-participation-history.md).

## 8. Phase, Milestone e Roadmap

- Preservar a #29: Phase e Milestone têm, independentemente, três escolhas: Herdar do pai / Nenhuma / Associação específica.
- Novos filhos começam em herança; uma associação específica substitui a herdada e Nenhuma impede a herança nessa dimensão.
- Resolver a associação efetiva recursivamente, sem copiar valores herdados para todos os descendentes. Identificar visualmente valor herdado e explícito.
- Dados antigos mantêm associações preenchidas como explícitas e ausências como Nenhuma, sem herança retroativa.
- Apenas etapas-folha podem receber associação direta, segundo a #29. Hierarquia de etapas e hierarquia de workitems são distintas.
- Alterar Phase ou Milestone não altera estado nem Sprint.
- A associação de um Sprint a uma fase é opcional e serve de organização; não força os workitems desse Sprint a terem essa fase. Sprints sem fase têm uma secção própria.
- O Roadmap mantém fases/subfases, milestones, Sprints, eixo temporal, navegação e ações de planeamento existentes, com as mesmas regras da Table.
- Expandir Sprint → Story → Tasks participantes; Tasks sem Story e Bugs ficam diretamente no Sprint. Permitir abrir detalhes e consultar ID, título, estado e progresso aplicável.
- Usar a pertença histórica correta nos Sprints anteriores; não repetir Tasks terminadas como trabalho novo.
- Preservar o padrão visual de expansão/recolha e a distinção entre contexto atual e histórico.

## 9. Boards

- Dois Boards: Técnico (Tasks e Bugs) e Funcional (User Stories e Epics), conforme a correção pedida pelo utilizador em 2026-10-28.
- Ambos têm o mesmo layout: uma única linha horizontal com as colunas do workflow pela ordem configurada, incluindo Backlog como coluna normal. Aplicar visibilidade, contagem e drag-and-drop ao Backlog como às restantes colunas.
- No Técnico, Tasks de Stories aparecem apenas se participarem num Sprint ativo. Estar a Story num Sprint ativo não inclui Tasks terminadas em Sprints anteriores.
- Tasks sem Story, incluindo as diretamente associadas a Epics, e Bugs aparecem independentemente de Sprint, sujeitos aos filtros existentes.
- Não criar linhas ou grupos separados por Story, Bugs ou trabalho independente; o contexto hierárquico mantém-se nos cartões.
- Cartões identificam ID/título, tipo, responsável, prioridade e Story/Epic quando aplicável, seguindo o design existente sem duplicação desnecessária.
- No Funcional aparecem todas as Stories e Epics, sujeitos aos filtros aplicáveis. Mostrar estado, responsável, Epic, Execution Progress e existência de Tasks pendentes.
- Tasks são consultáveis no detalhe da Story, sem cartões autónomos no Funcional.
- Drag-and-drop e demais mudanças respeitam as mesmas transições e confirmações do domínio.
- Preservar vistas agregadas: estados de projetos diferentes agrupam-se pelas categorias da #28, mantendo o estado real visível e resolução explícita de destinos ambíguos.

## 10. Table

Preservar pesquisa, filtros, ordenação, edição e planeamento, com seis secções:

| Secção | Conteúdo |
| --- | --- |
| Epics | Todos os Epics; estado, progresso, filhos diretos e criação |
| User Stories | Todas as Stories, independentemente de Epic/Sprint; estado, Epic, progresso e Tasks |
| Independent Workitems | Tasks sem Story, incluindo as de Epic, e Bugs |
| All Tasks & Bugs | Todas as Tasks e Bugs; não apresenta Epics/Stories como linhas |
| Unplanned Workitems | Stories, Tasks sem Story e Bugs sem alocação atual a Sprint planeado/ativo |
| Sprints | Gestão existente; Stories e trabalhos independentes planeados; expansão das Tasks |

- All Tasks & Bugs apresenta colunas Epic e User Story, pesquisáveis, ordenáveis, filtráveis e com acesso ao detalhe.
- Para Task de Story, Epic vem da Story; para Task de Epic, User Story fica vazia; para Tasks sem pai e Bugs, ambas ficam vazias.
- Unplanned exclui Epics e Tasks de Stories como unidades autónomas; preservar histórico de participação anterior.
- Sprints mantém criação, consulta, planeamento e proibição de destinos concluídos, sem perda de funções existentes.
- Cada Sprint mantém a secção colapsável e apresenta uma única tabela com as colunas e ferramentas existentes. Expandir/recolher uma Story diretamente na linha revela as Tasks participantes no mesmo Sprint, alinhadas e indentadas nas mesmas colunas; eliminar a caixa hierárquica separada desta vista.
- Tasks sem Story participante e Bugs aparecem diretamente na tabela. Filtros que excluam a Story não ocultam Tasks correspondentes. Ordenar raízes e filhos entre si; paginar grupos completos para manter Story e Tasks na mesma página. CSV inclui todos os itens filtrados, mesmo com linhas recolhidas. A expansão não altera o progresso do Sprint nem permite editar participações históricas.

## 11. Calendar e Day Planner

- Calendar apresenta todos os tipos com Due válido, preservando os restantes elementos de planeamento e filtros existentes.
- Day Planner apresenta Tasks e Bugs por defeito, com filtro de tipo para incluir Stories e Epics.
- Preservar blocos já agendados e as funcionalidades existentes. O filtro do tabuleiro de itens disponíveis não elimina blocos guardados.
- Agendar um bloco de tempo não torna um Epic elegível para Sprint nem altera hierarquia, estado ou Effort.

## 12. Transferências entre projetos

- Aplicar as regras da US-13 aos workitems: mesma pertença a produto para destinos elegíveis, acesso de escrita, escolha explícita de estado, mapeamentos, pré-visualização e persistência recuperável.
- Copiar apenas o item escolhido, sem pai/filhos no destino e sem copiar comentários/histórico anterior; criar nova identidade e registar origem.
- Mover preserva identidade, comentários e histórico, mas só é permitido sem filhos; desassociar do pai exige confirmação.
- Preservar Related Workitems sem transferir os itens relacionados.
- Remover no destino as associações a Phase, Milestone, Sprint e blocos do Planner, conforme a US-13; não ativar herança ao limpar associações.
- A escolha de estado de destino não permite contornar a aceitação funcional ou as restantes restrições de conclusão.
- Ao mover uma Story ou Bug já aceite para um estado concluído, preservar a aceitação existente, juntamente com a identidade e o histórico. Se ainda não existir aceitação, a entrada num estado concluído exige a confirmação funcional normal.
- Ao copiar uma Story ou Bug diretamente para um estado concluído, exigir nova confirmação de aceitação e nome local, registados no histórico novo da cópia. A aceitação do original não é transferida para a cópia.
- Um destino não concluído não mantém uma aceitação como situação atual; numa movimentação, a aceitação anterior continua consultável no histórico preservado.
- Preservar as regras de falha parcial, revalidação, leitura e conflitos da US-13; não pressupor transação atómica entre ficheiros.

## 13. Confirmações e tema

- Reutilizar os diálogos existentes, os estilos de botões/modais e as variáveis de tema; suportar claro/escuro, PT-PT/inglês e teclado.
- Confirmar com pré-visualização: aceitação de Stories/Bugs; conclusão de Epics com filhos pendentes; cancelamento/reabertura que afeta pais; mudança/remoção de pai com impacto no planeamento; cópia/movimento; e alteração de Sprint da Story que afeta Tasks.
- Preservar confirmações existentes de eliminação, arquivo, relações e entidades de planeamento.
- Operações proibidas explicam o motivo e a resolução; uma confirmação não permite contornar restrições.
- Mostrar IDs/títulos, quantidades e valores relevantes antes/depois, associações removidas e mudanças automáticas previsíveis.
- Uma confirmação por ação, incluindo os seus efeitos, com botões descritivos. Cancelar preserva os dados; texto corrente, filtros e navegação não exigem novos popups.
- Revalidar as condições e o conjunto afetado depois de confirmar; alterações entretanto ocorridas exigem rever os efeitos e confirmar novamente.
- Automatismos não abrem sequências independentes de popups. Efeitos previsíveis integram a confirmação da ação original, quando aplicável, e ficam no History.
- Referências locais: showConfirm/showChoice em src/app/overlays/appMessages.ts, AppMessageDialog, estilos de modais e variáveis de tema. Seguir o padrão existente de revalidação das operações estruturais.

## 14. Migração, persistência e limites

- Migrar todos os workitems legados para Task, preservando IDs, dados, estados, Effort, pessoas, datas, Tags, bloqueios, planeamento, Comments, History, Related Workitems, Pull Requests e blocos existentes.
- Não reduzir estados a três estados de Task: manter o workflow comum e a compatibilidade com a migração da #28.
- Evoluir o esquema de forma versionada, com validação, fixtures e testes de ida-e-volta. Guardar/reabrir não perde tipo, pai, campos, herança, participação histórica ou configuração de automatismos.
- Um JSON local por projeto mantém-se como fonte de verdade. Reutilizar autosave, modo de leitura, deteção de alterações externas e resolução de conflitos.
- Não acrescentar backend, autenticação, sincronização remota, motor de scripts nem workflows arbitrários por tipo.
- Distinguir capacidades já existentes de integrações ainda dependentes das #28, #29 e US-13. Implementar ou integrar as dependências de forma explícita, sem anunciar como concluído o que ainda não existe.

## 15. Articulação com outras histórias

- #36 / US-12: substituir corpo e critérios incompatíveis por esta definição, incluindo aceitação explícita e workflow comum.
- #28 / US-4: preservar workflow comum e categorias; substituir a derivação automática integral de Stories/Epics pelas regras de aceitação, automatismos limitados e estado manual do Epic.
- #29 / US-5: preservar herança de Phase/Milestone e contagem por folhas nas etapas/milestones. A associação opcional Sprint→fase não impõe pertença aos workitems.
- #25 / US-1: preservar elegibilidade e identidade de Sprints; integrar participação histórica sem implementar nesta US o encerramento autónomo.
- #37 / US-13: generalizar o vocabulário de Task para Workitem nas operações genéricas e acrescentar as restrições de hierarquia aqui definidas. Preservar ADR-0001.
- Não publicar alterações nas issues como parte desta entrevista; este documento regista o alinhamento necessário.

## 16. Critérios de aceitação e validação

- [x] Criar os quatro tipos nas duas formas de criação; impedir mudança posterior de tipo e preservar criação em Backlog.
- [x] Aplicar o mesmo workflow em todos os tipos e canais, incluindo aceitação de Stories/Bugs e transições proibidas.
- [x] Validar a matriz de hierarquia, projeto, pai único, criação contextual, reparenting e proibição de eliminar/mover pais com filhos.
- [x] Expor os campos, secções e tabs corretos por tipo; preservar Comments, History, relações e Pull Requests elegíveis.
- [x] Exigir critérios e Tasks terminadas/canceladas antes de aceitar Story; registar confirmação com autoria local não verificada.
- [x] Validar estado manual de Epic, aviso com filhos pendentes e inexistência de conclusão/cancelamento automático de pais.
- [x] Testar automatismos opcionais: origens/destinos, início, fim, prioridade, uma transição por evento, todos cancelados e transição impedida sem perder a alteração da Task.
- [x] Validar fórmulas sem duplicação, cancelados, ausência de elegíveis e independência de Effort/filtros.
- [x] Planear Story e Tasks automaticamente, impedir Sprint independente de Task subordinada e preservar histórico ao replanear/reparentar.
- [x] Não incluir Tasks terminadas de Sprints anteriores como trabalho novo nem no Técnico do Sprint seguinte.
- [x] Ao reabrir uma dessas Tasks, acompanhar o Sprint atual elegível da Story, preservando a participação anterior; sem Sprint elegível, ficar sem alocação atual e explicar os efeitos na confirmação.
- [x] Preservar as três opções de herança de Phase/Milestone, os valores efetivos e a semântica dos ficheiros antigos.
- [x] Apresentar os dois Boards com colunas e grupos corretos e as seis secções da Table com filtros/navegação.
- [x] Expandir Sprint→Story→Tasks no Roadmap, mantendo trabalho independente, edição existente e Sprints com/sem fase.
- [x] Preservar Calendar e blocos do Planner; validar filtro de tipo e os novos tipos.
- [x] Confirmar os efeitos relevantes com antes/depois; cancelar sem alterações; revalidar após confirmação e respeitar leitura/conflitos.
- [x] Validar tema claro/escuro, PT-PT/inglês, teclado, acessibilidade, estados vazios e erros compreensíveis.
- [x] Migrar/guardar/reabrir dados antigos e novos sem perda e validar transferências com as restrições da US-13.
- [x] Preservar aceitação em movimentações elegíveis, exigir nova aceitação em cópias concluídas e distinguir histórico de aceitação da situação atual num destino não concluído.
- [x] Incluir no branch/PR de implementação kanban/test-board/us-12.board.json e guião kanban/test-board/us-12.md, com cenários normais, vazios, históricos e casos-limite. Validar o JSON pelo esquema implementado e manter as instruções gerais do test-board/README.md.
- [x] Cobrir comportamentos críticos com testes de domínio e end-to-end apropriados; os cenários manuais não substituem as verificações automáticas.

## Confirmação final

O utilizador confirmou o entendimento final e autorizou implementar, criar uma feature branch ligada à #36 e responder ao comentário original após a implementação. Mantêm-se workflow único, confirmações e tema atual; a interface de transferências da US-13 e o fecho autónomo de Sprints são dependências separadas, com as regras de integração aqui descritas.
