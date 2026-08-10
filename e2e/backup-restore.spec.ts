import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, downedCard, ensureDown, stackRow } from './helpers/stacks';
import { sshExec } from './helpers/vm';

const BACKUP_DIR = '/home/test/testcompose';
const RESTORE_NAME = 'e2e-restored-gotify';

// `gotify` (see scripts/test-vm.config.sh) is a simple single-service fixture
// safe to back up and restore under a new name/directory.
//
// Teardown must delete the restored *directory*, not just stop the stack —
// downStack() only runs `compose down`, and the app's own "Delete compose
// file" action only removes the .yml (not gotify's bind-mounted `data/`
// subdirectory), so the directory itself survives either cleanup path. A
// prior run's leftover directory made RestoreModal's `targetExists` check
// trip on the next run, permanently disabling its Restore button (it
// requires an overwrite-confirm checkbox neither this test nor the
// unsuspecting next run handled) — a real self-inflicted state leak, not a
// flake. `rm -rf` via SSH is the only way to guarantee it's actually gone.
test.afterEach(async ({ pluginPage: page }, testInfo) => {
  if (await stackRow(page, RESTORE_NAME).count()) {
    await downStack(page, RESTORE_NAME).catch(() => {});
  }
  await sshExec(testInfo.project.name, `rm -rf ${BACKUP_DIR}/${RESTORE_NAME}`).catch(() => {});
  // Each run creates a real timestamped .bak.tar.gz in BACKUP_DIR — left
  // uncleaned across many runs, RestoreModal's archive list (and Rescan)
  // just keeps growing for no test benefit.
  await sshExec(testInfo.project.name, `rm -f ${BACKUP_DIR}/gotify-*.bak.tar.gz`).catch(() => {});
});

test('Backup creates a real archive on disk, and Restore recreates a runnable stack from it', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(90_000);
  // Self-heal against a previous interrupted run's leaked restore directory
  // (see afterEach's comment) before assuming the target path is free.
  await sshExec(testInfo.project.name, `rm -rf ${BACKUP_DIR}/${RESTORE_NAME}`).catch(() => {});
  await baseData(page);
  await ensureDown(page, 'gotify');

  // --- Backup ---
  await downedCard(page, 'gotify').getByRole('button', { name: 'Backup' }).click();
  const backupModal = page.getByRole('dialog', { name: 'Backup gotify' });
  await expect(backupModal).toBeVisible();
  await backupModal.locator('#bm-dest-dir').fill(BACKUP_DIR);
  const archivePreview = await backupModal.locator('#bm-preview').inputValue();
  await backupModal.getByRole('button', { name: 'Create backup' }).click();

  // Real effect: the modal reports the actual saved path, not a generic toast.
  await expect(backupModal.getByText('Backup created', { exact: false })).toBeVisible({ timeout: 15000 });
  await expect(backupModal.getByText(archivePreview, { exact: false })).toBeVisible();
  await backupModal.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();

  // --- Restore ---
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  const restoreModal = page.getByRole('dialog', { name: 'Restore stack from backup' });
  await expect(restoreModal).toBeVisible();
  await restoreModal.locator('#rm-scan-dir').fill(BACKUP_DIR);
  await restoreModal.getByRole('button', { name: 'Rescan' }).click();

  const archiveFilename = archivePreview.split('/').pop()!;
  const radio = restoreModal.getByRole('radio', { name: new RegExp(archiveFilename.replace('.', '\\.')) });
  await expect(radio).toBeVisible({ timeout: 10000 });
  await radio.check();

  await expect(restoreModal.locator('#rm-new-name')).toBeVisible({ timeout: 10000 });
  await restoreModal.locator('#rm-new-name').fill(RESTORE_NAME);
  // Target directory is the *parent* dir — the app creates {dir}/{name}
  // itself (same convention as Create Stack's directory field).
  await restoreModal.locator('#rm-target-dir').fill(BACKUP_DIR);
  await restoreModal.getByRole('button', { name: 'Restore', exact: true }).click();

  // NOTE: unlike BackupModal, RestoreModal's onRestored callback
  // (DownedStacksSection.tsx) closes the modal immediately on success rather
  // than showing its own success screen first — so the modal disappearing is
  // itself the signal to watch for, not a "Stack restored" message.
  await expect(restoreModal).not.toBeVisible({ timeout: 15000 });

  // Real effect: rescan finds the restored directory, and it actually starts.
  await baseData(page);
  const restoredCard = downedCard(page, RESTORE_NAME);
  await expect(restoredCard).toBeVisible({ timeout: 15000 });
  await restoredCard.getByRole('button', { name: 'Up', exact: true }).click();
  await page.getByRole('dialog', { name: new RegExp(`Confirm up.*${RESTORE_NAME}`) }).getByRole('button', { name: 'Up', exact: true }).click();
  const progress = page.getByRole('dialog', { name: new RegExp(`^Up.*${RESTORE_NAME}`) });
  await progress.getByRole('button', { name: 'Close' }).click({ timeout: 30000 });
  await expect(stackRow(page, RESTORE_NAME)).toHaveAttribute('data-status', /running|partial/, { timeout: 20000 });
});
