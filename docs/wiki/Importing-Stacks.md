# Importing Stacks

The **Stopped / offline stacks** section at the bottom of the dashboard shows compose files that exist on disk but whose containers are not running. You can import them by scanning a directory, then manage or start them directly from the UI.

## The Stopped section

```
┌──────────────────────────────────────────────────────────────┐
│  Stopped / offline stacks                                    │
│  [Create]  [▼ Import]  [Restore]           [Prune images]    │
├────────────────────────────────────────────────────────────┤
│  myapp   ● down   /etc/docker/compose/myapp/compose.yml      │
│                    [↑ Up]  [Edit]  [Backup]  [✕ Delete]      │
├────────────────────────────────────────────────────────────┤
│  oldsite  ● down  /etc/docker/compose/oldsite/compose.yml    │
│                    [↑ Up]  [Edit]  [Backup]  [✕ Delete]      │
└──────────────────────────────────────────────────────────────┘
```

The toolbar above the list also has **Restore** (see [Backup and Restore](Backup-and-Restore)) and, pinned to the right edge, **Prune images** — a host-wide unused-image cleanup that isn't limited to these stacks (see [Global image prune](Prune-Resources#global-image-prune-all-stacks)).

Each row shows:

| Element | Description |
|---|---|
| **Stack name** | Derived from the folder name or Compose project name |
| **● down** | Grey status label indicating the stack is offline |
| **File path** | Full path to the `docker-compose.yml` (or `compose.yml`) file |
| **Up** | Bring the stack online — see [Managing Stacks](Managing-Stacks) |
| **Edit** | Open the YAML editor — see [Editing Configuration](Editing-Configuration) |
| **Backup** | Archive the stack's files — see [Backup and Restore](Backup-and-Restore) |
| **Delete** | Delete the compose file from disk (two-step confirmation) |

## Scanning for compose files

Cockpit Compose does not automatically scan your entire filesystem. You tell it where to look by providing a **compose root directory** and clicking **Scan**.

### Steps

1. Click the **▼ Import** button to expand the import controls.

   ```
   ┌─────────────────────────────────────────────────────────────────┐
   │  [Best match]  [/etc/docker/compose      ]  Depth: [−] 2 [+]  [Scan] │
   └─────────────────────────────────────────────────────────────────┘
   ```

2. Optionally click **Best match** to auto-fill the directory path with the best guess based on where your active stacks are stored (disabled if no active stacks are running).

3. Enter a directory path in the text field, for example `/etc/docker/compose` or `/home/user/projects`.

4. Adjust the **Scan depth** if needed (see below).

5. Click **Scan**. A spinner appears with "Scanning…" while the directory is being searched.

### Scan depth

The **Depth** stepper controls how many directory levels deep the scan will look for compose files. The default is **2**, which finds stacks in a typical layout like `/compose-root/stack-name/docker-compose.yml`.

| Depth | Example paths found |
|---|---|
| 1 | `/compose-root/docker-compose.yml` |
| 2 | `/compose-root/stack-name/docker-compose.yml` *(default)* |
| 3 | `/compose-root/group/stack-name/docker-compose.yml` |

Use the **−** and **+** buttons to decrease or increase the depth (range: 1–5). A deeper scan covers more levels but takes longer and may surface compose files you don't intend to manage.

### Scan results

Cockpit Compose searches the directory for any files named `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, or `compose.yaml` up to the configured depth. Stacks that are not currently running appear in the list below.

**If no compose files are found:**

> ⚠ Are you sure this is a compose parent directory?

This warning means either the directory is empty, there are no compose files within the scan depth, or all found stacks are already running.

**If some directories were inaccessible:** A warning notice is shown, but results from accessible directories are still displayed.

**If the scan fails entirely (permission error, directory not found, etc.):** A red error alert is shown with the error message.

## Deleting a stack

Click **✕ Delete** on any stopped stack row to permanently delete its compose file.

### Confirmation — step 1

```
┌──────────────────────────────────────────────────────┐
│  Delete stack                                  [✕]   │
├──────────────────────────────────────────────────────┤
│  🔴 This action cannot be undone                     │
│                                                      │
│  File: /etc/docker/compose/myapp/docker-compose.yml  │
│                                                      │
│  [✓] Delete entire folder                            │
│      Also removes /etc/docker/compose/myapp/         │
│      and all files inside it (env files, configs).   │
├──────────────────────────────────────────────────────┤
│                         [Delete]  [Cancel]           │
└──────────────────────────────────────────────────────┘
```

If the stack uses shared networks (also used by other running stacks), a warning is shown before you proceed.

Choose whether to delete only the compose file or the entire folder (including env files and any other files inside).

Click **Delete** to proceed to the second confirmation.

### Confirmation — step 2

```
┌──────────────────────────────────────────────────────┐
│  Are you really sure?                          [✕]   │
├──────────────────────────────────────────────────────┤
│  🔴 This will permanently delete:                    │
│  /etc/docker/compose/myapp/                          │
│                                                      │
│  There is no way to recover this. Make sure you      │
│  have a backup if needed.                            │
├──────────────────────────────────────────────────────┤
│                     [Yes, delete]  [Cancel]          │
└──────────────────────────────────────────────────────┘
```

Click **Yes, delete** to confirm. The file (or folder) is deleted and the stack disappears from the list.

> **Note:** Delete only removes files from disk. It does not stop running containers. If you want to stop containers first, use **Down** from the running stacks section before deleting.

## Selecting multiple downed stacks and bulk Up

The downed stacks list supports the same kind of multi-select as the running-stacks dashboard (see [Bulk Actions](Bulk-Actions)), with the selection control adapted per [layout](Stacks-Dashboard#layout-options):

| Layout | Selection control |
|---|---|
| **Power User** | A checkbox at the start of the row, hidden until you hover/focus a row or already have something selected. |
| **Minimal** | Same checkbox behavior, shown next to the stack name on the card. |
| **Pretty** | Click anywhere on the card (except its buttons) to toggle selection — it glows blue when selected, exactly like the running-stacks Pretty layout. |
| **Unix** | A small `[ ]` / `[x]` toggle at the start of the action row. |

Once at least one stack is selected, a bulk bar appears with a **select all** toggle and a single **Up** action (down stacks only support being brought back up in bulk — there's no bulk Restart/Pull/Down/Kill here). Like the main dashboard's bulk bar, toggling select-all off — or deselecting everything manually — keeps the bar visible with **Up** grayed out instead of hiding it immediately; the explicit **✕** clear button dismisses it right away.

Confirming **Up** enqueues one background task per selected stack (see [Background Tasks](Background-Tasks)); each stack disappears from this list as its task completes successfully.
