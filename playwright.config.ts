import { createPlaywrightConfig } from '@rxtx4816/cockpit-plugin-base-react/playwright.config.base';

// Ports are assigned sequentially from COCKPIT_BASE=9090 (see scripts/test-vm.config.sh)
export default createPlaywrightConfig('cockpit-compose', [
  { name: 'arch-podman',   port: 9090 },
  { name: 'arch-docker',   port: 9091 },
  { name: 'arch-both',     port: 9092 },
  { name: 'debian-podman', port: 9093 },
  { name: 'debian-docker', port: 9094 },
  { name: 'debian-both',   port: 9095 },
  { name: 'fedora-podman', port: 9096 },
  { name: 'fedora-docker', port: 9097 },
  { name: 'fedora-both',   port: 9098 },
]);
