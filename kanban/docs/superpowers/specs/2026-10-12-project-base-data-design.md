# US11 — Ficha e dados base do projeto

Date: 2026-10-12
Status: desenho aprovado; implementação autorizada
Branch: `US11`, criada a partir de `main`

## Objetivo

Como Gestor de projeto, quero definir o nome, a descrição e as pessoas alocadas ao projeto, para reutilizar essa informação nos restantes ecrãs sem a introduzir repetidamente.

A ficha configura um projeto de cada vez, identificado pelo projeto selecionado. Os dados base são editáveis e partilhados; não são imutáveis. As datas de início e fim mencionadas na história inicial foram retiradas do âmbito durante a entrevista.

O vocabulário está definido no `CONTEXT.md` da raiz do repositório.

## Campos

| Campo | Obrigatório | Regra |
| --- | --- | --- |
| Nome | Sim | Remover espaços exteriores; rejeitar vazio ou apenas espaços. |
| Descrição | Não | Texto simples com várias linhas; pode estar vazia. |
| Equipa | Não | Lista de nomes; pode estar vazia. |

- Não introduzir limites adicionais de comprimento para estes campos.
- As pessoas são identificadas apenas pelo nome, sem email, função, conta ou percentagem de alocação.
- Normalizar nomes da equipa removendo espaços exteriores e entradas vazias.
- Eliminar duplicados ignorando maiúsculas/minúsculas e preservar a grafia da primeira ocorrência: `Ana`, `ana` e ` Ana ` representam a mesma pessoa.
- Pertencer à equipa não atribui tarefas automaticamente.
- Remover uma pessoa da equipa ou corrigir o seu nome não altera os responsáveis das tarefas existentes.

## Entrada e edição

- Colocar um ícone de engrenagem junto ao nome do projeto selecionado, na zona de seleção de projetos.
- A engrenagem abre a ficha desse projeto para consulta e, quando permitido, edição.
- Na vista agregada «Todos», selecionar primeiro um projeto para aceder à sua ficha.
- Usar um rascunho local com ações explícitas **Guardar** e **Cancelar**.
- Só Guardar aplica os dados e os torna disponíveis nos restantes ecrãs.
- Cancelar, fechar e `Esc` descartam o rascunho, sem confirmação adicional de abandono.
- Um nome inválido impede Guardar e mantém o rascunho para correção.
- Projetos só de leitura permitem consultar a ficha, mas não editar.
- Durante consulta histórica, apresentar os dados reconstruídos do momento selecionado, apenas para consulta. É necessário regressar ao presente para editar.

## Reutilização

- O nome guardado atualiza as referências ao projeto nos vários ecrãs e na paleta, mantendo o ficheiro e a identidade do projeto.
- A descrição fica disponível a partir dos dados partilhados do projeto e é consultável na ficha.
- No editor e nos fluxos de atribuição de tarefas da paleta, sugerir primeiro a equipa do projeto proprietário da tarefa, depois outros responsáveis já usados nesse mesmo projeto, sem duplicados.
- Não usar responsáveis de outros projetos como sugestões para essa tarefa.
- Continuar a permitir introduzir nomes livres que não pertençam à equipa.
- O projeto proprietário da tarefa determina as sugestões, mesmo que outro projeto esteja selecionado na interface.
- Na criação rápida da paleta, resolver `@pessoa` a partir do projeto de destino final, incluindo quando esse destino é escolhido com `in:projeto`, independentemente da ordem dos elementos.
- Uma abreviatura só é resolvida automaticamente quando corresponde a uma única pessoa. Quando houver várias correspondências, pedir a escolha em vez de selecionar arbitrariamente.

## Criação e ficheiros existentes

- A criação de um projeto continua a pedir apenas o nome. Descrição e equipa são preenchidas depois através da ficha.
- Projetos antigos mantêm o nome existente e apresentam descrição e equipa vazias quando esses dados não existem.
- Não inferir automaticamente a equipa a partir dos responsáveis de tarefas antigas.
- Alterar o nome do projeto não renomeia o ficheiro.
- Os dados base pertencem ao ficheiro de cada projeto e devem sobreviver a gravação, reabertura, snapshots e restauro.

## Histórico e restauro

- Cada Guardar com alterações efetivas cria uma única entrada no histórico do projeto.
- A entrada inclui apenas os campos efetivamente alterados, com rótulos legíveis e valores anteriores e seguintes.
- A equipa deve ser apresentada de forma legível, sem obrigar o utilizador a interpretar JSON.
- Guardar sem alterações efetivas, depois da normalização, não cria entrada no histórico nem uma nova mutação de dados.
- Uma correção da grafia de um nome conta como alteração.
- O replay da Timeline reconstrói nome, descrição e equipa; não basta mostrar um evento que não possa ser reaplicado.
- O restauro de um momento anterior repõe também os dados base desse momento, seguindo o fluxo existente de restauro do projeto.
- Num momento anterior à definição da descrição ou da equipa, esses campos apresentam os valores vazios correspondentes.

## Alterações externas durante a edição

- Ao abrir a ficha, conservar os dados base que deram origem ao rascunho.
- Antes de Guardar, comparar esses dados com os dados base atuais do projeto.
- Se os dados base tiverem sido alterados externamente entretanto, impedir a substituição silenciosa e informar que é necessário recarregar a ficha.
- Não descartar silenciosamente o rascunho em caso de conflito.
- Alterações externas apenas a tarefas ou planeamento não bloqueiam Guardar; a gravação preserva esses dados atuais.
- A proteção é verificada antes de aplicar a mutação da ficha; a deteção e os conflitos do ficheiro continuam também a usar os mecanismos existentes.

## Restrições de integração

- Manter uma fonte persistida única para cada dado base. O título de sessão deve acompanhar o nome persistido.
- Usar os mecanismos existentes de mutação, permissões, fila de gravação e erros de persistência.
- Atualizar em conjunto os tipos, validação, normalização, serialização, snapshots e replay necessários aos novos dados.
- Preservar compatibilidade de leitura dos ficheiros atuais e os dados das restantes extensões.
- Não registar valores `undefined` nos pares antes/depois: os valores vazios devem sobreviver à serialização JSON e à normalização dos eventos.
- Fornecer textos em português e inglês, seguindo a infraestrutura de internacionalização existente.
- Seguir os componentes e estilos existentes para diálogos, formulários e botões de ícone acessíveis.

## Critérios de aceitação

1. Selecionar um projeto e abrir a engrenagem apresenta o nome, a descrição e a equipa desse projeto.
2. Guardar um nome válido, uma descrição multilinha e uma equipa atualiza apenas o projeto em edição e persiste os dados no seu ficheiro.
3. Reabrir o ficheiro recupera os dados guardados; renomear o projeto conserva o nome do ficheiro.
4. Um nome vazio ou composto apenas por espaços não é guardado.
5. Cancelar, fechar ou usar `Esc` mantém os dados anteriores e não cria eventos.
6. Nomes vazios e duplicados normalizados não são introduzidos na equipa.
7. Atribuir uma tarefa sugere a equipa e os responsáveis do projeto proprietário, sem nomes provenientes de outros projetos, e permite nomes externos.
8. Alterar ou remover nomes da equipa não reatribui tarefas existentes.
9. A criação rápida resolve pessoas segundo o destino final e pede uma escolha quando a abreviatura é ambígua.
10. Um Guardar efetivo produz uma única entrada com os campos alterados e os valores antes/depois; um Guardar sem alterações não produz entrada.
11. A consulta histórica e o restauro apresentam e recuperam corretamente os três dados base.
12. Um ficheiro antigo sem descrição ou equipa continua a abrir, com esses campos vazios e sem preenchimento automático a partir das tarefas.
13. Projetos só de leitura e fichas em consulta histórica não permitem mutações.
14. Alterações externas aos dados base durante a edição impedem a sobrescrita silenciosa; alterações apenas a tarefas ou planeamento são preservadas e não impedem a gravação da ficha.

## Verificação prevista

- Testes de domínio: normalização de equipa, obrigatoriedade do nome, compatibilidade, serialização e reconstrução/restauro dos dados base.
- Testes de comandos e queries: projeto correto, sugestões locais, resolução de criação rápida, uma entrada por gravação, ausência de mutações sem alterações e conflito de dados base.
- Testes de integração/E2E: abrir, guardar e reabrir; descartar rascunho; ficheiros antigos; isolamento entre projetos; consulta histórica/só de leitura; atualizações externas.
- Verificação visual da engrenagem e ficha conforme os padrões existentes.

## Confirmação

As decisões de produto foram aceites nas rondas Q1–Q24 e o resumo final foi confirmado. A implementação foi autorizada pelo gestor.
