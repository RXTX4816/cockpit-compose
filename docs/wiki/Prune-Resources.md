# Prune Resources

The Prune modal removes unused Docker resources associated with a stack — old image versions, stopped containers, unused volumes, and orphaned networks. This frees up disk space and keeps your Docker environment tidy.

> **Warning:** Pruning volumes deletes their data permanently. There is no undo. Make sure you have backups before pruning volumes.

## Opening the modal

Click the **⋮ more** menu on any stack row, then select **Prune**. This is a **danger action**.

## Step 1 — Select what to prune

```
┌────────────────────────────────────────────────────┐
│  Prune resources — myapp                     [✕]   │
├────────────────────────────────────────────────────┤
│  ⚠ Destructive action — cannot be undone           │
│                                                    │
│  [✓] Images                                        │
│      Older image versions for this stack's repos   │
│      that are no longer used by any container.     │
│                                                    │
│  [✓] Containers                                    │
│      Stopped containers belonging to this stack.   │
│                                                    │
│  [✓] Volumes ⚠                                     │
│      Unused named volumes associated with this     │
│      stack.                                        │
│                                                    │
│  [✓] Networks                                      │
│      Unused networks created for this stack        │
│      (in-use ones are skipped).                    │
├────────────────────────────────────────────────────┤
│                      [Preview →]  [Cancel]         │
└────────────────────────────────────────────────────┘
```

### Warnings

If the stack is **not currently running**, a danger alert appears at the top:

> Stack is not running — risk of data loss

This warning exists because Docker cannot determine which volumes are "in use" when no containers are running, so volume pruning may remove data you still need.

### Resource types

| Resource | What gets removed |
|---|---|
| **Images** | Older versions of images used by this stack that are no longer referenced by any container. The currently-used image version is kept. |
| **Containers** | Stopped containers that belong to this stack (identified by Compose project labels). Running containers are never removed. |
| **Volumes** | Named volumes defined in the compose file that are not currently mounted by any running container. **Data inside these volumes is permanently deleted.** |
| **Networks** | Custom networks created by the compose file that are not currently in use by any running container. In-use networks are automatically skipped. |

Select at least one resource type to enable the **Preview →** button.

## Step 2 — Preview

Click **Preview →** to see exactly what will be deleted before anything is removed.

```
┌──────────────────────────────────────────────────────┐
│  Preview — resources to be removed             [✕]   │
├──────────────────────────────────────────────────────┤
│  Images                                              │
│  nginx:1.24                                          │
│  nginx:1.23                                          │
│                                                      │
│  Containers                                          │
│  Nothing to remove.                                  │
│                                                      │
│  Volumes                                             │
│  myapp_db_data                                       │
│                                                      │
│  Networks                                            │
│  myapp_default                                       │
├──────────────────────────────────────────────────────┤
│  [Prune selected]  [← Back]  [Cancel]                │
└──────────────────────────────────────────────────────┘
```

Review the list carefully. If you see something you did not intend to remove, click **← Back** to adjust your selection.

## Step 3 — Execute

Click **Prune selected** (danger button) to delete the listed resources. The operation runs and the modal closes when complete.

To go back without pruning, click **← Back** or **Cancel**.
