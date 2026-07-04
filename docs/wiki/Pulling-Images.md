# Pulling Images

The Pull action downloads the latest versions of all images referenced in your compose file from their registries (Docker Hub, GHCR, private registries, etc.).

## When to pull

- You use `:latest` or unpinned tags and want the most recent version.
- You have pinned tags and want to refresh the layer cache or check for updated digests.
- You are about to run `Up` and want to ensure the images are already present locally.

## Starting a pull

Click the **Pull** button on any stack row.

### Confirmation step

A confirmation modal appears before the pull begins:

> Newer image versions may introduce breaking changes.  
> Review changelogs before pulling.  
> Pinning to a specific version tag avoids unexpected updates.

Each service is listed with its current image tag. Services with unpinned images (`:latest` or no tag) are marked with a **⚠** warning and a note explaining that these images always pull whatever the registry currently considers "latest" — which may not be what you expect.

Click **Pull** to proceed or **Cancel** to abort.

## Progress modal

After confirmation, a progress modal opens and streams the output of `docker compose pull`:

```
┌──────────────────────────────────────────┐
│  Pull — myapp                      [✕]  │
├──────────────────────────────────────────┤
│  ● Pulling images for myapp…             │
├──────────────────────────────────────────┤
│  web      Pulling                        │
│  web      Pulling from library/nginx     │
│  web      Pull complete                  │
│  db       Already up to date             │
│  ...                                     │
├──────────────────────────────────────────┤
│                              [Cancel]    │
└──────────────────────────────────────────┘
```

The log is color-coded by event type (pulling, pulled, already up to date, error).

When the operation finishes:

- **✓ Pull complete** — all images were pulled or were already up to date
- **✗ Pull failed** — an error occurred; the error is shown below the status

Click **Close** when done. Click **Cancel** to abort a pull that is still in progress. Alternatively, click **Run in Background** to close the modal and keep the pull running — see [Background Tasks](Background-Tasks).

> **Pulling for multiple stacks at once?** Select several stacks and use the bulk **Pull** action — see [Bulk Actions](Bulk-Actions).

## Applying pulled images

Pulling images **does not restart your containers**. The new image layers are downloaded to disk but the running containers continue to use the old image until you run **Up**. To apply the new images:

1. Close the Pull modal.
2. Click **Up** on the stack row.

Docker will detect that the image has changed and recreate the affected containers.
