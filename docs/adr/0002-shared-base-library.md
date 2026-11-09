# Shared plugin infrastructure lives in a base library

Hooks, components, tooling config, the CI workflow and the VM test harness live in a separate package, `@rxtx4816/cockpit-plugin-base-react`, versioned independently of this plugin. This repo consumes it from npm and links a local build with yalc when both need to change together. Changes to shared code therefore need a release of the base library first, and CI here calls a workflow defined in the base repo.
