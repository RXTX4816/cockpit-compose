# Backup and Restore

Cockpit Compose lets you archive a stack's directory to a `.bak.tar.gz` file and restore it later — either on the same host or a different one.

---

## Creating a backup

Open the **⋮ more** menu on any running or stopped stack row and click **Backup**.

```
┌────────────────────────────────────────────────────────┐
│  Backup myapp                                    [✕]   │
├────────────────────────────────────────────────────────┤
│  Archive name      [myapp                         ]    │
│  Will be saved as  myapp-2026-06-13_14-22-00.bak.tar.gz│
│  Destination dir   [/etc/docker/compose           ]    │
│                                                        │
│  [ ] Include snapshots                                 │
│  [ ] Include subdirectories  (may include bind-mounted │
│                                data)                   │
├────────────────────────────────────────────────────────┤
│                    [Create backup]  [Cancel]           │
└────────────────────────────────────────────────────────┘
```

### Fields

| Field | Description |
|---|---|
| **Archive name** | Base name for the file. Defaults to the stack name. A timestamp is always appended automatically. |
| **Will be saved as** | Preview of the full filename that will be written. |
| **Destination directory** | Where the `.bak.tar.gz` file will be placed. Defaults to the parent of the stack directory. |

### Options

**Include snapshots** — When checked, YAML editor snapshots (`.snapshot.*` files) are included in the archive. Unchecked by default to keep archive sizes small; these files are only useful if you want to restore a previous editor state.

**Include subdirectories** — When checked, all subdirectories inside the stack folder are included. This can significantly increase the archive size if the stack uses bind mounts pointing into its own folder (for example, a Gitea instance storing its data under `gitea/gitea/`). Leave unchecked to archive only the top-level compose and env files.

### After clicking "Create backup"

- On success: a green **Backup created** alert appears showing the full path of the archive.
- If tar exits with warnings (for example, permission-denied on `.ssh` or similar unreadable paths) but still wrote the archive: a green success alert is shown alongside an amber warning with the tar message. The archive is still usable.
- On failure (archive not created): a red error alert shows the reason.

---

## Restoring from a backup

The **Restore** button is in the **Stopped / offline stacks** section at the bottom of the dashboard.

```
┌────────────────────────────────────────────────────────┐
│  Stopped / offline stacks                              │
│  [Create]  [▼ Import]  [Restore]                       │
└────────────────────────────────────────────────────────┘
```

### Step 1 — Select an archive

```
┌────────────────────────────────────────────────────────┐
│  Restore stack from backup                       [✕]   │
├────────────────────────────────────────────────────────┤
│  Search directory  [/etc/docker/compose      ] [Rescan]│
│                                                        │
│  ● myapp-2026-06-13_14-22-00.bak.tar.gz               │
│  ○ myapp-2026-05-01_09-00-00.bak.tar.gz               │
│                                                        │
│  ▸ Enter archive path manually                         │
└────────────────────────────────────────────────────────┘
```

When the modal opens it automatically scans the **Search directory** for `*.bak.tar.gz` files and lists them newest-first. Click **Rescan** to search again or change the directory.

If your archive is somewhere else, expand **Enter archive path manually** and type the full path.

### Step 2 — Review and configure

After you select an archive, Cockpit Compose reads its table of contents and the compose file inside to detect the stack name.

```
┌────────────────────────────────────────────────────────┐
│  Detected stack name   [myapp                   ]      │
│  Target directory      [/etc/docker/compose     ]      │
└────────────────────────────────────────────────────────┘
```

**Detected stack name** — read from the `name:` field in the archived compose file, or the archive's root directory name if no `name:` field is present.

**Target directory** — where the stack folder will be created. Defaults to the same scan directory.

#### Name conflict

If a running stack already has the same name, a warning appears and a **Restore as name** field is shown pre-filled with `<name>-restored`. You can change this to any name without slashes.

```
⚠ Stack "myapp" is already running
Restore as name  [myapp-restored                  ]
```

The extracted folder will be renamed to the new name automatically, and the `name:` field in the compose file will be updated to match.

#### Target already exists

If the destination directory (after any rename) already exists on disk, a danger alert appears. You must tick the confirmation checkbox before the **Restore** button becomes active.

```
🔴 Directory /etc/docker/compose/myapp-restored already exists
   and will be overwritten

[✓] I understand this will write to /etc/docker/compose/myapp-restored
```

### Step 3 — Restore

Click **Restore**. The restore process:

1. Extracts the archive into a temporary directory.
2. Renames the extracted folder to the final target name (if a rename is needed).
3. Updates the `name:` field in the compose file to match the restored name (if renamed).
4. Adds the stack to the **Stopped / offline stacks** list.

On success a green **Stack restored** alert appears and the modal's footer switches to a single **Close** button.

---

## Deleting a backup

In the **Restore** modal, each archive in the list has a **Delete** button. Clicking it opens a two-step confirmation:

1. **First prompt** — confirms you want to delete the named file.
2. **Second prompt** — a final confirmation before the file is permanently removed from disk.

After deletion, the archive disappears from the list. This only removes the `.bak.tar.gz` file — no stack data is affected.

---

## Notes

- Backups do **not** include Docker volumes. Only the files in the stack directory (compose files, env files, and optionally subdirectories) are archived. Export volumes separately if you need a full data backup.
- The `.bak.tar.gz` format is a standard gzip-compressed tar archive. You can inspect or extract it with any tar-compatible tool: `tar -tzf myapp-….bak.tar.gz` to list, `tar -xzf myapp-….bak.tar.gz` to extract.
- After restoring, bring the stack up with **Up** from the stopped stacks row to start containers. If the stack relies on persistent data stored in Docker volumes, re-create those volumes before bringing it up.
