/**
 * Barrel re-export for downed-stacks discovery and management components.
 *
 * These components handle stacks that are not currently running: scanning
 * the filesystem for compose projects, importing, creating, restoring from
 * backups, and deleting stacks.
 */
export { DownedStacksSection } from "../DownedStacksSection";
export { CreateStackModal } from "../CreateStackModal";
export { DeleteStackModal } from "../DeleteStackModal";
export { RestoreModal } from "../RestoreModal";
export { BackupModal } from "../BackupModal";
export { inferComposeRoot } from "../../lib/composeDiscovery";
