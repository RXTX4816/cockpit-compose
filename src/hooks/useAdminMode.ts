import { useState, useEffect } from "react";

export function useAdminMode(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const perm = cockpit.permission({ admin: true });
    setAllowed(perm.allowed);
    const handler = () => setAllowed(perm.allowed);
    perm.addEventListener("changed", handler);
    return () => {
      perm.removeEventListener("changed", handler);
      perm.close();
    };
  }, []);

  return allowed;
}
