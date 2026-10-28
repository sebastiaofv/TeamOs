# TeamOs

TeamOs organises work into independent projects that can be grouped by product.

## Language

**Project**:
An independent collection of workitems with its own workflows and project settings. A project can belong to one product or remain standalone.

**Product**:
A named grouping of related projects, with no further levels of grouping. A product groups projects without having workitems or workflows of its own.
_Avoid_: Master project, parent project, application maintenance area

**Workitem**:
A unit of work tracked within a project, classified as an Epic, User Story, Task, or Bug.
_Avoid_: Task when referring to workitems in general

**Task**:
A workitem representing execution work, either standalone or belonging directly to a User Story or Epic.

**Epic**:
A workitem representing a broad business objective or outcome, grouping related User Stories and directly associated Tasks.

**User Story**:
A workitem representing a business need whose acceptance is assessed against acceptance criteria. Its functional acceptance is distinct from completion of its Tasks.
_Avoid_: Story when referring to workitems in general

**Bug**:
A workitem representing incorrect behaviour requiring correction and functional validation. Bugs are outside the parent-child hierarchy.

**Functional acceptance**:
An explicit confirmation that a User Story or Bug meets its expected functional result.
_Avoid_: Technical completion, completion of child Tasks

**Execution progress**:
The completion of execution work represented by a User Story's Tasks, distinct from the Story's functional acceptance.

**Hierarchical parent**:
The single workitem under which another workitem is organised within the same project. It is distinct from a related workitem or a parent phase in the Roadmap.

**Current Sprint allocation**:
The single planned or active Sprint in which a workitem is currently planned. A Task belonging to a User Story follows the Story's planning.

**Sprint participation**:
A workitem's involvement in a particular Sprint, retained after its current allocation changes. A Story's participation does not imply that every one of its Tasks participated in every one of its Sprints.

**Planning inheritance**:
The use of a hierarchical parent's effective Phase or Milestone association, unless the child explicitly chooses another association or none. Phase and Milestone inheritance are independent.

**Workitem relationship**:
An explicit link between workitems, distinct from their parent-child hierarchy. A relationship remains meaningful across projects; moving a workitem does not move its related workitems or remove these relationships.

**Workitem identity**:
The permanent identity of a workitem, preserved when it moves between projects. A copy is a new workitem with a different identity.
_Avoid_: Project-local workitem number
