# Scaling Services

The Scale modal lets you adjust how many replicas of each service are running without editing the compose file manually.

## Opening the modal

Click **⋮** on any running stack row, then select **Scale**. The modal is disabled for stopped stacks.

## Configuration step

The modal lists every service in the stack with a number input showing its current running replica count.

| Element | Description |
|---|---|
| **Service name** | The service as defined in the compose file |
| **Replica count** | Number input — adjust up or down |
| **⚠ host-port warning** | Services that bind a specific host port are flagged. Scaling these above 1 will cause port conflicts; Docker will error when the second replica tries to bind the same port. |

Adjust the counts and click **Apply** to proceed to the confirmation step, or **Cancel** to close without changes.

## Confirmation step

A summary table shows each service and its new replica count. Click **Scale** (primary) to apply, or **Back** to return and adjust.

## How it works

Scaling runs `docker compose up -d --scale <service>=<n>` for each changed service. Replicas above 1 are named `<stack>-<service>-1`, `<stack>-<service>-2`, and so on.

After the operation completes, the dashboard refreshes and the service count column updates to reflect the new total.

## Limitations

- Services that bind a **specific host port** (e.g., `"80:80"`) cannot safely be scaled above 1 — each replica would try to bind the same port. Use a reverse proxy or remove the host-port binding before scaling.
- Scaling down removes the excess containers but does not touch their data volumes.
- This feature scales existing services; it does not support adding new services. Edit the compose file and run **Up** to add services.
