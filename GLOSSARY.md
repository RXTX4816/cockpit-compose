# Cockpit Compose

A Cockpit plugin for managing Docker and Podman Compose stacks from a web UI.

## Language

### Stacks

**Stack**:
One Compose project: a compose file (plus any override files) and the containers the runtime runs for it.
_Avoid_: Project, Compose project

**Downed stack**:
A stack with a compose file on disk and no containers.
_Avoid_: Offline stack, stopped stack

**Stopped stack**:
A stack whose containers exist but are not running.
_Avoid_: Down, offline

**Stack status**:
The rollup shown for a stack: running, partial (some services stopped), stopped, paused, or unknown.
_Avoid_: State, health

**Container state**:
The runtime's own value for a single container, such as running or exited.
_Avoid_: Status

**Compose root**:
The directory a user points a scan at to discover downed stacks.
_Avoid_: Scan path, base directory

**Bulk action**:
One action applied to several selected stacks at once.
_Avoid_: Batch, mass action

**Stack operation**:
An action on a Stack (Up, Pull, Start, Stop, Restart, Pause, Unpause, Kill, Down) run through `stackOperations`, which resolves the stack's files, profiles and admin rights so the dialog, background drawer and Bulk action all behave the same.
_Avoid_: Lifecycle function, action

### Runtime

**Runtime**:
Docker or Podman, the container engine a stack runs on.
_Avoid_: Engine, backend

**Socket mode**:
Whether the plugin talks to the runtime through a per-user socket (rootless) or the system socket escalated through Cockpit's superuser (rootful).
_Avoid_: Privilege mode, root mode

### Failure and recovery

**Leftovers**:
Containers still labelled with a stack after Down or Kill.
_Avoid_: Orphans, stragglers

**Damaged container**:
A leftover that the runtime lists but can no longer resolve, because its record was corrupted by a crash or power loss.
_Avoid_: Zombie, ghost container

### Safeguarding and work

**Snapshot**:
A saved copy of a compose file's content, taken in the editor and restorable from it.
_Avoid_: Revision, version

**Backup**:
A `.bak.tar.gz` archive of a stack's files, which Restore turns back into a stack.
_Avoid_: Export, archive

**Job**:
A Compose job, as introduced in Compose 5.6, which the plugin runs, explains and lists.
_Avoid_: Task

**Background task**:
An action the plugin detaches so it keeps running after its dialog closes, tracked in the background tasks drawer.
_Avoid_: Job, async action
