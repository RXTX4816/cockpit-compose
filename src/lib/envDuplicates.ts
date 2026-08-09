// Mirrors the key-extraction rules in the base library's EnvTable
// (@rxtx4816/cockpit-plugin-base-react/components) parseContent/hasDuplicateKeys:
// comment lines (start with #) and lines without an "=" are ignored, everything
// before the first "=" on a real line is the key. Kept here so EnvModal can run
// the same duplicate check on raw .env text directly, independent of which view
// mode (Table vs Raw) produced it — EnvTable's own duplicate detection only runs
// while it's mounted, so a duplicate introduced purely in Raw mode was silently
// saved with no warning (issue #261).
export function hasDuplicateEnvKeys(content: string): boolean {
  const keys = content
    .split("\n")
    .filter(line => line.trim() !== "" && !line.startsWith("#") && line.includes("="))
    .map(line => line.substring(0, line.indexOf("=")));
  return keys.length !== new Set(keys).size;
}
