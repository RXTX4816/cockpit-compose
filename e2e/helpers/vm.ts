import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Mirrors ALL_VMS / SSH_BASE in scripts/test-vm.config.sh — SSH port is
// SSH_BASE + index in this list. Kept here (not imported from the shell
// script) since specs need it as plain data, not a shell variable.
const ALL_VMS = [
  'arch-podman', 'arch-docker', 'arch-both',
  'debian-podman', 'debian-docker', 'debian-both',
  'fedora-podman', 'fedora-docker', 'fedora-both',
  'fedora-podman-rootful',
  'fedora-full',
] as const;
const SSH_BASE = 2220;

function sshPortFor(projectName: string): number {
  const idx = ALL_VMS.indexOf(projectName as typeof ALL_VMS[number]);
  if (idx === -1) throw new Error(`No known SSH port mapping for VM project "${projectName}" — see scripts/test-vm.config.sh`);
  return SSH_BASE + idx;
}

/**
 * Runs a command on the test VM over SSH, out-of-band from the app under
 * test — for specs that need to mutate real container/host state from
 * "another terminal" (e.g. restarting a container to produce real events)
 * rather than through the UI, matching how a human would exercise the same
 * scenario per docs/testing.md's manual scenarios.
 *
 * Uses execFile (argv array), NOT a shell string — `command` is passed to
 * ssh as a single argv element, so any `$(...)`/quoting inside it is
 * evaluated remotely by the VM's shell, never locally on the host. Building
 * this as one big interpolated shell string (the first version of this
 * helper) silently ran `$(podman ps -q ...)` against the *host's own*
 * podman/docker before ssh was ever invoked — command substitution isn't
 * blocked by double quotes, so the "remote" command never actually reached
 * the VM, and failed every time with the host's (usually empty/absent)
 * result instead of the guest's.
 */
export async function sshExec(projectName: string, command: string): Promise<string> {
  const port = sshPortFor(projectName);
  const { stdout } = await run(
    'ssh',
    [
      '-p', String(port),
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=5',
      '-o', 'BatchMode=yes',
      'test@localhost',
      command,
    ],
    // A hung SSH connection would otherwise silently eat the whole test's
    // budget (no output, no error, just running out the clock) — fail fast
    // instead so it reads as a real, diagnosable error.
    { timeout: 15000 },
  );
  return stdout;
}
