# Gestão de tarefas

Linguagem usada para acompanhar as tarefas dos projetos e compreender a sua evolução.

## Language

**Tarefa**:
Unidade de trabalho de um projeto, representada no Board e acompanhada através de um estado.
_Avoid_: Workitem, quando usado de forma ambígua para incluir milestones, fases ou sprints.

**Alteração da tarefa**:
Mudança aos dados de uma tarefa, descrita pelos valores anteriores e seguintes e pelo momento em que ocorreu.

**Histórico da tarefa**:
Sequência das alterações aos dados e ao planeamento de uma tarefa, com data e hora e valores antes e depois, que permite compreender a sua evolução.
_Avoid_: Timeline do projeto, quando se pretende referir apenas o histórico de uma tarefa.

**Histórico do projeto**:
Sequência das alterações de um projeto e dos seus elementos, incluindo tarefas e planeamento.

**Alteração de planeamento da tarefa**:
Criação, mudança ou remoção de um bloco de planeamento associado a uma tarefa, incluindo alterações à sua data, hora ou duração.

**Estado inicial conhecido**:
Estado mais antigo de uma tarefa disponível para consulta, que pode corresponder a uma tarefa já existente e não ao momento da sua criação.

**Ciclo de vida da tarefa**:
Percurso da mesma tarefa desde a sua criação ou estado inicial conhecido, incluindo alterações e eventual recuperação por restauro. Tarefas distintas têm ciclos de vida distintos, mesmo quando reutilizam um identificador.

**Histórico incompleto**:
Histórico disponível que não permite determinar todas as alterações ou atribuir todas as entradas com confiança à mesma tarefa.
