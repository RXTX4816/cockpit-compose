function extractParts(imageRef: string): { withoutTag: string; tag: string | null } {
  const lastSlash = imageRef.lastIndexOf("/");
  const lastColon = imageRef.lastIndexOf(":");
  if (lastColon > lastSlash) {
    return { withoutTag: imageRef.slice(0, lastColon), tag: imageRef.slice(lastColon + 1) };
  }
  return { withoutTag: imageRef, tag: null };
}

function isVersionTag(tag: string): boolean {
  return /^v?\d/.test(tag);
}

export function getImageChangelogUrl(imageRef: string): string | null {
  const { withoutTag, tag } = extractParts(imageRef);
  const firstSlash = withoutTag.indexOf("/");

  if (firstSlash === -1) {
    return `https://hub.docker.com/_/${withoutTag}`;
  }

  const firstPart = withoutTag.slice(0, firstSlash);
  const rest = withoutTag.slice(firstSlash + 1);

  if (!firstPart.includes(".") && !firstPart.includes(":")) {
    return `https://hub.docker.com/r/${withoutTag}`;
  }

  switch (firstPart) {
    case "docker.io": {
      const path = rest.startsWith("library/") ? rest.slice("library/".length) : rest;
      return path.includes("/")
        ? `https://hub.docker.com/r/${path}`
        : `https://hub.docker.com/_/${path}`;
    }
    case "ghcr.io": {
      const parts = rest.split("/");
      if (parts.length < 2) return null;
      const base = `https://github.com/${parts[0]}/${parts[1]}/releases`;
      return tag && isVersionTag(tag) ? `${base}/tag/${tag}` : base;
    }
    case "quay.io":
      return `https://quay.io/repository/${rest}`;
    default:
      return null;
  }
}
