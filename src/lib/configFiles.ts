export function splitConfigFiles(configFiles: string): string[] {
  return configFiles.split(",").map(f => f.trim()).filter(Boolean);
}
