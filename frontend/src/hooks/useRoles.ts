import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/endpoints";
import type { RoleSummary } from "@/types/contract";

/** GET /api/roles — the backend is the only source of the role list. */
export function useRoles() {
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getRoles();
      setRoles(res.roles);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { roles, isLoading, error, retry: load };
}
