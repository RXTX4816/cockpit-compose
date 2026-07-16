import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const COMPOSE_DIR = '/home/test/testcompose';

/**
 * Names of the compose stacks pre-staged into COMPOSE_DIR by the VM's
 * cloud-init provisioning (scripts/test-vm.config.sh). Kept in sync with
 * that file — update both if fixture stacks are added/removed/renamed.
 */
export const FIXTURE_STACKS = {
  gotify: 'gotify',
  multi: 'multi',
  multiFile: 'multi-file',
  profiles: 'profiles',
  volumesTest: 'volumes-test',
  scaleTest: 'scale-test',
  envTest: 'env-test',
  dependsOn: 'depends-on',
  healthcheck: 'healthcheck',
  restartPolicy: 'restart-policy',
  customNetwork: 'custom-network',
  namedNetworks: 'named-networks',
  longLogs: 'long-logs',
  crashLoop: 'crash-loop',
  labels: 'labels',
  mixedRestart: 'mixed-restart',
  threeReplicas: 'three-replicas',
  bindMount: 'bind-mount',
  multipleVolumes: 'multiple-volumes',
} as const;

export interface BaseData {
  page: Page;
  composeDir: string;
  stacks: typeof FIXTURE_STACKS;
}

/**
 * On podman-only hosts (no Docker binary), the app auto-opens a "Switch to
 * Podman" modal on mount (RuntimeToggle.tsx: `useState(() => suggestPodman
 * ?? false)`) since it defaults to Docker but Docker isn't there. It blocks
 * the rest of the UI until dismissed, so every test needs to clear it first.
 */
export async function dismissStartupPodmanPrompt(page: Page) {
  const modal = page.getByRole('dialog', { name: 'Switch to Podman' });
  // isVisible() is an instant, non-waiting check — the modal may not have
  // rendered yet right after navigation, so wait for it briefly instead.
  const appeared = await modal
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    await modal.getByRole('button', { name: 'Continue' }).click();
    await expect(modal).not.toBeVisible();
    // Switching runtime re-fetches the stack list; give the initial loading
    // spinner a chance to clear before interacting further, otherwise a
    // click can land right before a re-render and get lost.
    await page.getByRole('progressbar').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}

/**
 * Standard test context: logs in (via the pluginPage fixture, already done
 * by the time this runs), clears the podman-only startup prompt if present,
 * imports/scans the pre-staged compose directory, and waits for the scan to
 * complete. Every spec that needs stacks to exist should start from this
 * instead of re-implementing the import/scan flow.
 */
export async function baseData(page: Page): Promise<BaseData> {
  await dismissStartupPodmanPrompt(page);

  // "Import" is an exact match — the empty-state also has an unrelated
  // "Import existing" link that "Import" (substring) would also match.
  const importButton = page.getByRole('button', { name: 'Import', exact: true });
  const scanInput = page.getByLabel('Compose directory');
  const firstStackName = page.locator('.dss-stack-name').first();

  // On rootless Podman, something keeps resetting DownedStacksSection's
  // local state for a while after the runtime switch (open-panel toggle,
  // typed directory, and even an in-flight scan all get wiped mid-flow —
  // see docs/wiki/Podman-Compatibility.md re: rootless warmup/polling).
  // Retrying single steps isn't enough since the reset can land *after* a
  // step succeeds; retry the whole open→fill→submit sequence instead.
  let scanned = false;
  for (let attempt = 0; attempt < 5 && !scanned; attempt++) {
    const panelOpened = await importButton
      .click()
      .then(() => scanInput.waitFor({ timeout: 2000 }))
      .then(() => true)
      .catch(() => false);
    if (!panelOpened) continue;

    await scanInput.fill(COMPOSE_DIR).catch(() => {});
    await scanInput.press('Enter').catch(() => {});
    scanned = await firstStackName.waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
  }
  if (!scanned) {
    throw new Error('Scan never produced results after retrying the full import flow');
  }

  return { page, composeDir: COMPOSE_DIR, stacks: FIXTURE_STACKS };
}
