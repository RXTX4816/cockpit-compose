import type { Page } from '@playwright/test';
import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, downedCard, ensureDown, stackRow, upStack } from './helpers/stacks';
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

// ── Wave 5 (#227) ────────────────────────────────────────────────────────────
// The test above covers create + restore into a fresh directory only. These cover
// archive deletion and RestoreModal's two guard rails, each verified against
// RestoreModal.tsx rather than the E2E inventory's planned shape (see the
// name-conflict test for where those differ).

/** Creates a real backup of `stack` into BACKUP_DIR through the UI; returns the archive's path. */
async function createBackup(page: Page, stack: string): Promise<string> {
  await downedCard(page, stack).getByRole('button', { name: 'Backup' }).click();
  const backupModal = page.getByRole('dialog', { name: `Backup ${stack}` });
  await expect(backupModal).toBeVisible();
  await backupModal.locator('#bm-dest-dir').fill(BACKUP_DIR);
  const archivePath = await backupModal.locator('#bm-preview').inputValue();
  await backupModal.getByRole('button', { name: 'Create backup' }).click();
  await expect(backupModal.getByText('Backup created', { exact: false })).toBeVisible({ timeout: 15000 });
  await backupModal.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();
  return archivePath;
}

/** Opens RestoreModal scanned at BACKUP_DIR and selects the given archive. */
async function openRestoreWith(page: Page, archivePath: string) {
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  const restoreModal = page.getByRole('dialog', { name: 'Restore stack from backup' });
  await expect(restoreModal).toBeVisible();
  await restoreModal.locator('#rm-scan-dir').fill(BACKUP_DIR);
  await restoreModal.getByRole('button', { name: 'Rescan' }).click();
  const filename = archivePath.split('/').pop()!;
  const radio = restoreModal.getByRole('radio', { name: new RegExp(filename.replace(/\./g, '\\.')) });
  await expect(radio).toBeVisible({ timeout: 10000 });
  await radio.check();
  await expect(restoreModal.locator('#rm-new-name')).toBeVisible({ timeout: 10000 });
  return { restoreModal, radio, filename };
}

test('Deleting a backup removes the archive from disk, behind two confirmations', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(90_000);
  const vm = testInfo.project.name;
  await baseData(page);
  await ensureDown(page, 'gotify');

  const archivePath = await createBackup(page, 'gotify');
  expect((await sshExec(vm, `test -f ${archivePath} && echo EXISTS`)).trim()).toBe('EXISTS');

  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  const restoreModal = page.getByRole('dialog', { name: 'Restore stack from backup' });
  await restoreModal.locator('#rm-scan-dir').fill(BACKUP_DIR);
  await restoreModal.getByRole('button', { name: 'Rescan' }).click();

  const filename = archivePath.split('/').pop()!;
  const radio = restoreModal.getByRole('radio', { name: new RegExp(filename.replace(/\./g, '\\.')) });
  await expect(radio).toBeVisible({ timeout: 10000 });

  // The trash button sits in the same row as this archive's radio. Ancestor divs of
  // the row also contain the radio, and ancestors precede descendants in document
  // order, so the innermost match — the row itself — is the last one.
  await restoreModal.locator('div', { has: radio }).last().getByRole('button', { name: 'Delete backup' }).click();

  // Confirmation 1 names the file.
  const confirm1 = page.getByRole('dialog', { name: 'Delete this backup?' });
  await expect(confirm1).toBeVisible();
  await expect(confirm1.getByText(filename, { exact: false })).toBeVisible();
  await confirm1.getByRole('button', { name: 'Delete', exact: true }).click();

  // Confirmation 2 is the irreversibility warning. Nothing is deleted before it.
  const confirm2 = page.getByRole('dialog', { name: 'This action is irreversible' });
  await expect(confirm2).toBeVisible();
  expect((await sshExec(vm, `test -f ${archivePath} && echo EXISTS`)).trim()).toBe('EXISTS');
  await confirm2.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(confirm2).not.toBeVisible({ timeout: 10000 });

  // Real effect: the archive is gone from disk, and from the list.
  expect((await sshExec(vm, `test -e ${archivePath} && echo EXISTS || echo GONE`)).trim()).toBe('GONE');
  await expect(radio).toHaveCount(0, { timeout: 10000 });
});

test('Cancelling the second delete confirmation keeps the archive', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(90_000);
  const vm = testInfo.project.name;
  await baseData(page);
  await ensureDown(page, 'gotify');
  const archivePath = await createBackup(page, 'gotify');

  const { restoreModal, radio } = await openRestoreWith(page, archivePath);
  await restoreModal.locator('div', { has: radio }).last().getByRole('button', { name: 'Delete backup' }).click();
  await page.getByRole('dialog', { name: 'Delete this backup?' }).getByRole('button', { name: 'Delete', exact: true }).click();

  const confirm2 = page.getByRole('dialog', { name: 'This action is irreversible' });
  await confirm2.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm2).not.toBeVisible();

  expect((await sshExec(vm, `test -f ${archivePath} && echo EXISTS`)).trim()).toBe('EXISTS');
  await expect(radio).toBeVisible();
});

// "Target already exists": when the final destination directory is already on disk,
// Restore stays disabled until the overwrite checkbox is ticked (RestoreModal's
// canRestore requires `!targetExists || targetExistsConfirmed`).
test('Restoring onto an existing directory is gated on the overwrite checkbox, then really overwrites', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(90_000);
  const vm = testInfo.project.name;
  const TARGET_NAME = 'e2e-overwrite-target';
  const TARGET = `${BACKUP_DIR}/${TARGET_NAME}`;

  // A pre-existing directory holding a compose file with a marker the restore must replace.
  await sshExec(vm, `rm -rf ${TARGET} && mkdir -p ${TARGET} && printf 'services:\\n  placeholder:\\n    image: busybox\\n    # e2e-pre-existing-marker\\n' > ${TARGET}/docker-compose.yml`);

  try {
    await baseData(page);
    await ensureDown(page, 'gotify');
    const archivePath = await createBackup(page, 'gotify');
    const { restoreModal } = await openRestoreWith(page, archivePath);

    await restoreModal.locator('#rm-new-name').fill(TARGET_NAME);
    await restoreModal.locator('#rm-target-dir').fill(BACKUP_DIR);

    const restoreButton = restoreModal.getByRole('button', { name: 'Restore', exact: true });
    const confirm = restoreModal.locator('#rm-target-confirm');

    // The warning names the real path, and the button is blocked until acknowledged.
    await expect(restoreModal.getByText(`Directory ${TARGET} already exists`, { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(confirm).toBeVisible();
    await expect(restoreButton).toBeDisabled();

    await confirm.check();
    await expect(restoreButton).toBeEnabled();
    await restoreButton.click();
    await expect(restoreModal).not.toBeVisible({ timeout: 15000 });

    // Real effect: the colliding file on disk is now gotify's, and the old marker is gone.
    const compose = await sshExec(vm, `cat ${TARGET}/docker-compose.yml`);
    expect(compose).toContain('gotify/server');
    expect(compose).not.toContain('e2e-pre-existing-marker');
  } finally {
    await sshExec(vm, `rm -rf ${TARGET}`).catch(() => {});
  }
});

// "Name conflict" — note this differs from the E2E inventory's guess, which assumed
// it meant two backups with colliding archive names. In RestoreModal.tsx it means
// the archive's stack name matches an *existing* stack (case-insensitive): the app
// warns and pre-fills the restore name with "<name>-restored" so the restored copy
// doesn't collide with the one already there.
test('Restoring a backup whose stack already exists warns and suggests a -restored name', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(120_000);
  const vm = testInfo.project.name;
  const SUGGESTED = 'gotify-restored';

  await sshExec(vm, `rm -rf ${BACKUP_DIR}/${SUGGESTED}`).catch(() => {});
  try {
    await baseData(page);
    await ensureDown(page, 'gotify');
    const archivePath = await createBackup(page, 'gotify');

    // gotify must exist as a known stack for the archive's name to collide with.
    await upStack(page, 'gotify');

    const { restoreModal } = await openRestoreWith(page, archivePath);

    await expect(restoreModal.getByText('Stack "gotify" is already running', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(restoreModal.locator('#rm-detected-name')).toHaveValue('gotify');
    await expect(restoreModal.locator('#rm-new-name')).toHaveValue(SUGGESTED);

    // Restoring under the suggested name lands beside the original, not over it.
    await restoreModal.locator('#rm-target-dir').fill(BACKUP_DIR);
    await restoreModal.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(restoreModal).not.toBeVisible({ timeout: 15000 });

    expect((await sshExec(vm, `test -f ${BACKUP_DIR}/${SUGGESTED}/docker-compose.yml && echo EXISTS`)).trim()).toBe('EXISTS');
    expect((await sshExec(vm, `test -f ${BACKUP_DIR}/gotify/docker-compose.yml && echo EXISTS`)).trim()).toBe('EXISTS');
  } finally {
    if (await stackRow(page, SUGGESTED).count()) await downStack(page, SUGGESTED).catch(() => {});
    await sshExec(vm, `rm -rf ${BACKUP_DIR}/${SUGGESTED}`).catch(() => {});
  }
});
