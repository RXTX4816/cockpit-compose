# Browser-only plugin with no backend

The plugin ships no server component. It runs in the browser inside Cockpit and reaches the host only through Cockpit's JS API (`cockpit.spawn`, file access, and the runtime's socket). Users install the plugin and nothing else: no extra daemons or agents. The cost is that all logic, including parsing CLI output, runs client-side.
