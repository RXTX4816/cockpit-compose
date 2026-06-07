# Stack Info

The Stack Info modal shows a detailed snapshot of everything associated with a stack: its running containers, the images they use, any named volumes, and the networks it participates in.

## Opening the modal

Click the **Info** button on any stack row.

## Sections

### Compose file

Shows the full path to the compose file on disk, for quick reference.

---

### Services

A list of container cards, one per service. Each card shows:

| Field | Description |
|---|---|
| **Status label** | Green if running, grey if stopped |
| **Name** | The service name and the full container name |
| **Image** | The Docker image the container is using |
| **Container ID** | First 12 characters of the container ID |
| **Uptime / status** | How long the container has been running, or its current state |
| **Ports** | All exposed port mappings as `host:container` blue labels |

If the container list is loading, a spinner is shown. If the data cannot be retrieved, a warning alert is displayed. If the stack has no containers (e.g., it was just started and containers haven't initialized yet), a "No containers found" message is shown.

---

### Images

A table of Docker images used by the stack's services.

| Column | Description |
|---|---|
| **Service** | The service name that uses this image |
| **Repository** | The image repository (e.g., `nginx`, `ghcr.io/myorg/myapp`) |
| **Tag** | The image tag (e.g., `latest`, `1.25`, `sha256:…`) |
| **Size** | Disk space used by the image (e.g., `248 MB`) |
| **Created** | How long ago the image was created |

This section is useful for auditing which image versions are running and identifying large images.

---

### Volumes

A table of named volumes associated with the stack.

| Column | Description |
|---|---|
| **Name** | The volume name as defined in the compose file |
| **Driver** | The volume driver (usually `local`) |
| **Mountpoint** | The path on the host where the volume data is stored |

> **Note:** If your Docker Compose installation does not support the `volumes` subcommand, this section displays: "Not available on this Docker Compose version."

---

### Networks

A table of networks created by this stack.

| Column | Description |
|---|---|
| **Name** | The network name |
| **Shared with** | Other stacks that are also connected to this network, if any |

Networks shared with other stacks are flagged with an icon. This is useful for understanding cross-stack dependencies before running **Down** — removing a shared network will affect those other stacks.

---

## Closing the modal

Click **✕** or press **Escape** to close.
