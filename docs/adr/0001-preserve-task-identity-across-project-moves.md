# Preserve task identity across project moves

Tasks currently have only project-local numeric IDs, but copying and moving tasks between projects of the same product must preserve navigable relationships without transferring related tasks. Introduce an immutable task UUID: moves preserve it, copies receive a new one, and relationships reference that identity independently of the project's local task number.

This avoids collisions and repeated updates to referencing project files when a task moves again, including files that are not currently loaded. Project-and-task references with forwarding records were the alternative, but would require the original and intermediate project files to resolve repeated moves. Project/location hints can aid navigation, but opening an unloaded local project still requires the user to provide access; unresolved references remain visible and cannot establish that a blocker is complete.
