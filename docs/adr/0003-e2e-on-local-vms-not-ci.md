# End-to-end tests run on local VMs, not in CI

The Playwright suite drives a real Cockpit in QEMU VMs covering the runtime matrix (Docker, Podman, rootless, rootful, both). It needs a running VM, so it runs locally and not in CI; CI covers typecheck, lint, unit tests and build. Run it before merging UI or runtime-sensitive changes.
