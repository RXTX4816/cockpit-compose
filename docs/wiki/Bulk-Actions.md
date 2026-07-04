# Bulk Actions

Select multiple stacks at once and run the same action (Up, Pull, Restart, Down, or Kill) across all of them in one confirmation, instead of repeating the action stack-by-stack.

## Selecting stacks

Every [layout](Stacks-Dashboard#layout-options) has a small checkbox (or, in the Unix layout, a `[ ]` / `[x]` toggle) for selecting a stack. To keep the default view uncluttered, the checkbox is hidden until you either:

- hover over (or focus) a stack row/card, or
- have already selected at least one other stack — once one row is checked, all the checkboxes become visible.

| Layout | Selection control |
|---|---|
| **Power User** | Checkbox at the start of the row |
| **Minimal** | Checkbox in the top-left corner of the card |
| **Pretty** | Checkbox in the top-left corner of the card |
| **Unix** | `[ ]` / `[x]` bracket toggle alongside the other `[key]` actions |

Clicking a checkbox never triggers the row/card's own click-to-expand behavior.

## The bulk action bar

Once at least one stack is selected, a bulk action bar appears in the dashboard toolbar:

```
┌──────────────────────────────────────────────────────────┐
│  2 selected   [Up]  (↻)  (⇩)  (⛔)   [Clear selection ✕] │
└──────────────────────────────────────────────────────────┘
```

| Control | Action |
|---|---|
| **Up** (primary button, same color as the row-level Up button) | Bring all selected stacks up |
| **↻ Restart** | Restart all selected stacks |
| **⇩ Pull** | Pull the latest images for all selected stacks |
| **⛔ Down** (red) | Stop and remove all selected stacks |
| **⛔ Kill** (red) | Force-kill all selected stacks |
| **✕ Clear selection** | Deselect everything without running an action |

Each icon button shows the same tooltip text as its single-stack counterpart on the stack row.

## Confirmation modal

Clicking a bulk action opens a confirmation modal listing every affected stack:

```
┌──────────────────────────────────────────┐
│  Down 2 stacks?                    [✕]  │
├──────────────────────────────────────────┤
│  ⚠ This stops and removes all            │
│    containers for every selected stack   │
│    Volumes are kept, but any state       │
│    outside of them is lost...            │
│                                          │
│  ℹ This will run as background tasks.    │
│    You can monitor, stop, or remove      │
│    them from the background tasks panel. │
│                                          │
│  Affected stacks:                        │
│   • myapp                                │
│   • otherapp                             │
├──────────────────────────────────────────┤
│                    [Down]  [Cancel]      │
└──────────────────────────────────────────┘
```

The warning shown depends on the action:

| Action | Warning |
|---|---|
| **Up** | A small note that this might restart containers and pull new images if configuration changed |
| **Restart** | A small note that services will briefly be unavailable |
| **Down** | A prominent danger alert explaining containers are stopped and removed |
| **Kill** | A prominent danger alert explaining this sends SIGKILL immediately, with no chance for containers to clean up |

## Execution

Confirming enqueues **one background task per selected stack** into the same queue used by [Background Tasks](Background-Tasks) — they don't run all at once, and you can track, stop, or remove each one individually from the background tasks panel. The selection is cleared and the confirmation modal closes as soon as you confirm.

## Notes

- Restart, Down, and Kill run for every selected stack regardless of its current state — check the confirmation list before proceeding if you have a mixed selection.
- Prune is not available as a bulk action, since it requires choosing per-stack which resource types (images, volumes, networks) to remove — use the single-stack [Prune Resources](Prune-Resources) flow instead.
- Switching the selected layout does not clear your selection; switching the Docker/Podman runtime does (see [Podman Compatibility](Podman-Compatibility)).
