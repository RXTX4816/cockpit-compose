# Bulk Actions

Select multiple stacks at once and run the same action (Up, Pull, Restart, Down, or Kill) across all of them in one confirmation, instead of repeating the action stack-by-stack.

## Selecting stacks

Every [layout](Stacks-Dashboard#layout-options) supports selecting a stack, but the control differs per layout:

| Layout | Selection control |
|---|---|
| **Power User** | A checkbox at the start of the row. To keep the default view uncluttered, it's hidden until you hover/focus the row, or until at least one stack is already selected (once one row is checked, all the checkboxes become visible). |
| **Minimal** | Click anywhere on the card (except its buttons/menu) to toggle selection — the card gets a blue glow ring when selected. There is no checkbox. |
| **Pretty** | Same as Minimal: click the card to toggle selection, shown with a blue glow ring. There is no checkbox. |
| **Unix** | A `[ ]` / `[x]` bracket toggle alongside the other `[key]` actions. |

Clicking a checkbox, or clicking a card outside its action buttons, never triggers the row/card's own click-to-expand behavior.

## The bulk action bar

Once at least one stack is selected, a bulk action bar appears in the dashboard toolbar:

```
┌────────────────────────────────────────────────────────────────────┐
│  ☑ 2 selected   [Up]  (↻)  (⇩)  (⛔)   [Clear selection ✕]        │
└────────────────────────────────────────────────────────────────────┘
```

| Control | Action |
|---|---|
| **☑ Select all** (checkbox, first in the bar) | Selects every stack currently displayed. Shows an indeterminate dash when some (but not all) stacks are selected. Toggling it off clears the selection but — unlike deselecting the last stack manually — **keeps the bar visible** with its action buttons grayed out, rather than hiding it immediately. |
| **Up** (primary button, same color as the row-level Up button) | Bring all selected stacks up |
| **↻ Restart** | Restart all selected stacks |
| **⇩ Pull** | Pull the latest images for all selected stacks |
| **⛔ Down** (red) | Stop and remove all selected stacks |
| **⛔ Kill** (red) | Force-kill all selected stacks |
| **✕ Clear selection** | Deselect everything and immediately dismiss the bar |

Each icon button shows the same tooltip text as its single-stack counterpart on the stack row. Whenever the selection drops to zero — whether by toggling Select all off or by manually unchecking the last stack — the action buttons gray out but the bar itself stays put for a few seconds before auto-hiding, so you don't lose your place if you're about to select something else. Clicking **✕ Clear selection** always dismisses the bar immediately, regardless of that timer.

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
