# Background Tasks

Long-running actions like **Up** and **Pull** can be sent to the background instead of making you wait in front of a progress modal. Background tasks run one at a time and are tracked in a small floating panel so you can check on them, stop them, or dismiss them whenever you like.

## Sending a task to the background

While an **Up** or **Pull** modal is streaming output, click **Run in Background** next to **Cancel**:

```
┌──────────────────────────────────────────┐
│  Up — myapp                        [✕]  │
├──────────────────────────────────────────┤
│  ● Starting myapp…                       │
├──────────────────────────────────────────┤
│  Container myapp-web-1  Starting         │
│  ...                                     │
├──────────────────────────────────────────┤
│           [Run in Background]  [Cancel]  │
└──────────────────────────────────────────┘
```

The modal closes immediately and the same action keeps running behind the scenes.

Bulk actions (see [Bulk Actions](Bulk-Actions)) always run as background tasks — there is no foreground modal for them.

## The background tasks panel

A floating button appears in the bottom-right corner of the screen whenever the plugin is loaded. It shows a badge with the number of pending + running tasks:

```
                                          ┌───┐
                                          │ 2 │
                                          └───┘
                                           (☰)
```

Click it to open the panel:

```
┌────────────────────────────────────┐
│  Background tasks              [✕] │
├────────────────────────────────────┤
│  Up — myapp              Running   │
│                          [Stop]    │
├────────────────────────────────────┤
│  Pull — otherapp          Pending  │
├────────────────────────────────────┤
│  Down — old-stack         Complete │
│                          [Remove]  │
└────────────────────────────────────┘
```

The panel is scrollable and caps its height at half the screen. Newest tasks appear at the bottom, closest to the toggle button. Opening the panel (or a new task starting) automatically scrolls to and focuses the newest entry.

### Task states

| State | Meaning |
|---|---|
| **Pending** | Queued, waiting for the currently running task to finish |
| **Running** | Currently executing |
| **Complete** | Finished successfully |
| **Failed** | Finished with an error — the error message is shown under the task |
| **Stopped** | Cancelled via the **Stop** button |

Only **one task runs at a time**, in the order it was queued. This avoids two actions on the same (or a related) stack running concurrently and stepping on each other.

### Controls

| Button | Available when | Effect |
|---|---|---|
| **Stop** | Running | Closes the underlying process. The task ends up in the **Stopped** state. |
| **Remove** | Pending, Complete, Failed, or Stopped | Removes the task from the panel. A pending task removed this way never actually runs. |

### Viewing live output

Click anywhere on a **Running** or **Pending** task's row to reopen its log — the same streaming output view you'd see in the foreground modal, with a **Stop** button. Finished tasks don't reopen a log view; their outcome is already visible in the panel.

## Switching Docker/Podman while tasks are queued

If you switch the runtime toggle (see [Podman Compatibility](Podman-Compatibility)) while tasks are still **pending**, those pending tasks are automatically cancelled instead of running against the newly selected runtime. A toast notification confirms how many were cancelled.

This is intentional: a pending task doesn't build its command until it actually starts, so if it started after the switch it would run against the wrong Docker/Podman backend. Tasks that are already **Running** or have already finished are unaffected — their command was already dispatched under the runtime that was active at the time.
