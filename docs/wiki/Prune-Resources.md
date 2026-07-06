# Prune Resources

There are two ways to reclaim disk space: pruning resources for **one stack** (this page's main flow, below), or the **global image prune** covering every image on the host regardless of which stack it belongs to (see [Global image prune](#global-image-prune-all-stacks) further down).

The per-stack Prune modal removes unused Docker resources associated with a stack — old image versions, stopped containers, unused volumes, and orphaned networks. This frees up disk space and keeps your Docker environment tidy.

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
| **Images** | Older *named* versions of images used by this stack that are no longer referenced by any container. The currently-used image version is kept. This only catches images that still have a tag matching this stack's repos — it won't find images that lost their tag entirely (e.g. after re-pulling a floating tag like `:latest`), or images belonging to a stack that's fully down (no container exists to identify which repos to check). Use [Global image prune](#global-image-prune-all-stacks) for those. |
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

## Global image prune (all stacks)

The per-stack flow above can miss unused images in two common cases: a floating tag like `:latest` gets re-pulled and the old image loses its tag entirely (it becomes "dangling"), or a stack is fully down and so has no container left to tell the app which of its images are still relevant. **Global image prune** covers both, by scanning every image on the host and comparing against every container's actual image ID (not by name) — not just this one stack's.

### Opening it

The **Prune images** button sits at the right edge of the same toolbar row as **Create**, **Import**, and **Restore**, above the [downed stacks list](Importing-Stacks) (icon-only in Minimal/Unix layouts).

### Preview and confirm

```
┌──────────────────────────────────────────────────────────┐
│  Prune unused images                               [✕]   │
├──────────────────────────────────────────────────────────┤
│  ℹ This scans for images not currently used by any        │
│    container, across the whole host — not just one       │
│    stack...                                               │
│                                                            │
│  ID                   Repository:Tag        Size   Created│
│  a1b2c3d4e5f6         myapp:latest          128MB  2 days │
│  f6e5d4c3b2a1         <none>:<none>         64MB   3 weeks│
│                                                            │
│  Total reclaimable: 192MiB                                │
│                                                            │
│  ⚠ This will permanently delete these images              │
│    2 image(s) will be removed. If any belong to a         │
│    currently down stack, that stack will need to re-pull  │
│    them the next time it's brought up. This cannot be     │
│    undone.                                                │
│                                                            │
│  [ ] I understand this will permanently delete the        │
│      images listed above                                  │
├──────────────────────────────────────────────────────────┤
│                          [Prune]  [Cancel]                │
└──────────────────────────────────────────────────────────┘
```

The **Prune** button stays disabled until you tick the confirmation checkbox. Confirming runs the native `docker image prune -a` / `podman image prune -a` under the hood — the same well-tested command you'd run manually — and shows its own reported output (e.g. the total space reclaimed) once done.

> **Note:** This is host-wide, not scoped to a single stack. If an image belongs to a currently-down stack, that stack will need to re-pull it the next time it's brought up.
