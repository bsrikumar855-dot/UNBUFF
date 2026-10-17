import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/endpoints";
import type { LabTrainingSchemaResponse } from "@/types/contract";

/** The training schema as the server reports it (derived from the schema that actually runs queries). */
export function useLabSchema() {
  const [schema, setSchema] = useState<LabTrainingSchemaResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getLabTrainingSchema()
      .then((s) => !cancelled && setSchema(s))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { schema, error, retry };
}
