# Stack operations decide their own privilege escalation

Callers name an operation and pass a stack; they never pass `superuser`. The module resolves escalation from the stack's files, the Runtime and the Socket mode, so a caller cannot pick the wrong rule for a rootful or Podman setup. The cost is that every operation does an async ownership lookup before it starts, and the returned process hides that preparation behind a cancellable handle.
