import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/api/endpoints";
import { useAuth } from "@/auth/context";
import type { DsaProgress, DsaProgressUpdate } from "@/types/contract";

/**
 * The signed-in student's own DSA progress, keyed by question id. Does nothing while signed out
 * (the catalogue is public; only the progress controls need an account).
 */
export function useDsaProgress() {
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  const [records, setRecords] = useState<DsaProgress[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRecords((await api.getDsaProgress()).progress);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    if (signedIn) void load();
    else setRecords(null);
  }, [signedIn, load]);

  const byQuestion = useMemo(() => new Map((records ?? []).map((r) => [r.question_id, r])), [records]);

  /** Saves a change and replaces the local copy with the server's record (the server is the source of truth). */
  const update = useCallback(async (questionId: string, patch: DsaProgressUpdate): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.putDsaProgress(questionId, patch);
      setRecords((prev) => [saved, ...(prev ?? []).filter((r) => r.question_id !== questionId)]);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const remove = useCallback(async (questionId: string): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await api.deleteDsaProgress(questionId);
      setRecords((prev) => (prev ?? []).filter((r) => r.question_id !== questionId));
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { signedIn, authLoading: status === "loading", records, byQuestion, error, saving, update, remove, reload: load };
}
