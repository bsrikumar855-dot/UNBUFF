import React, { useId, useRef, useState } from "react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EMPTY_FORM,
  SOURCE_LABEL,
  TEMPLATE_CSV_TEXT,
  TEMPLATE_JSON_TEXT,
  formToJson,
  formatDay,
  formatWhen,
  readImportFile,
  type ManualForm,
} from "@/lib/leetcode";
import type {
  LeetCodeConnection,
  LeetCodeImportConfirmResponse,
  LeetCodeImportPreview,
  LeetCodeImportRequest,
} from "@/types/contract";

const field =
  "min-h-10 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink-primary";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const signed = (n: number | null) =>
  n === null ? "not supplied" : `${n >= 0 ? "+" : ""}${n}`;

/** What would be stored, in plain words, so the student can check it against their own records before confirming. */
const PreviewSummary: React.FC<{ p: LeetCodeImportPreview }> = ({ p }) => {
  const s = p.snapshot!;
  const t = s.totals;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[11rem_1fr]">
      <dt className="text-ink-muted">Numbers captured</dt>
      <dd className="text-ink-primary">{formatWhen(s.captured_at)} (as you stated)</dd>
      <dt className="text-ink-muted">Problems solved</dt>
      <dd className="text-ink-primary">
        <span className="num font-medium">{t.solved}</span>
        {t.easy !== null
          ? ` — easy ${t.easy}, medium ${t.medium}, hard ${t.hard}`
          : " — no difficulty split supplied"}
      </dd>
      <dt className="text-ink-muted">Problems available</dt>
      <dd className="text-ink-primary">
        {s.available
          ? `easy ${s.available.easy}, medium ${s.available.medium}, hard ${s.available.hard}`
          : "not supplied"}
      </dd>
      <dt className="text-ink-muted">Topics</dt>
      <dd className="text-ink-primary">
        {s.topics
          ? `${s.topics.length} topics (${s.topics
              .slice(0, 3)
              .map((x) => `${x.topic} ${x.solved}`)
              .join(", ")}${s.topics.length > 3 ? ", …" : ""})`
          : "not supplied"}
      </dd>
      <dt className="text-ink-muted">Contest</dt>
      <dd className="text-ink-primary">
        {s.contest
          ? `rating ${s.contest.rating ?? "not given"}, rank ${s.contest.global_rank ?? "not given"}, attended ${s.contest.attended ?? "not given"}`
          : "not supplied"}
      </dd>
      <dt className="text-ink-muted">Recent activity</dt>
      <dd className="text-ink-primary">
        {s.activity
          ? `${s.activity.length} dated day${s.activity.length === 1 ? "" : "s"}, ${s.activity.reduce((n, a) => n + a.problems_solved, 0)} problems`
          : "not supplied"}
      </dd>
      <dt className="text-ink-muted">Recorded as</dt>
      <dd className="text-ink-primary">
        {p.source ? SOURCE_LABEL[p.source.kind] : "—"}, supplied by you. It will not be
        shown as live or verified.
      </dd>
      {p.previous && p.changes && (
        <>
          <dt className="text-ink-muted">Since your earlier snapshot</dt>
          <dd className="text-ink-primary">
            {formatDay(p.previous.captured_at)} → {formatDay(s.captured_at)} (
            {p.changes.days} days): solved {signed(p.changes.solved)}
            {p.changes.easy !== null
              ? `, easy ${signed(p.changes.easy)}, medium ${signed(p.changes.medium)}, hard ${signed(p.changes.hard)}`
              : ""}
          </dd>
        </>
      )}
    </dl>
  );
};

export interface ImportPanelProps {
  connection: LeetCodeConnection;
  onImported: (r: LeetCodeImportConfirmResponse) => void;
}

/**
 * Import numbers the student supplies themselves, from a file in UNBLUFF's documented format or typed in. Everything
 * is checked by the server and shown back before anything is stored. Nothing here reads LeetCode or the student's
 * account; the data is only what they give us, and it is recorded as such.
 */
export const ImportPanel: React.FC<ImportPanelProps> = ({ connection, onImported }) => {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<LeetCodeImportRequest | null>(null);
  const [preview, setPreview] = useState<LeetCodeImportPreview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [done, setDone] = useState<LeetCodeImportConfirmResponse | null>(null);
  const [tab, setTab] = useState("file");
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM);

  const reset = () => {
    setPayload(null);
    setPreview(null);
    setFileError(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const runPreview = async (req: LeetCodeImportRequest) => {
    setBusy("preview");
    setError(null);
    setDone(null);
    setPayload(req);
    try {
      setPreview(await api.previewLeetCodeImport(req));
    } catch (e) {
      setPreview(null);
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    setPreview(null);
    setFileError(null);
    setDone(null);
    if (!file) return;
    const r = await readImportFile(file);
    if (!r.ok) {
      setFileError(r.message);
      return;
    }
    await runPreview({ format: r.format, origin: "file", content: r.text });
  };

  const confirm = async () => {
    if (!payload || !preview?.content_hash) return;
    setBusy("confirm");
    setError(null);
    try {
      const r = await api.confirmLeetCodeImport({
        ...payload,
        content_hash: preview.content_hash,
      });
      setDone(r);
      setPreview(null);
      setPayload(null);
      if (fileRef.current) fileRef.current.value = "";
      setForm(EMPTY_FORM);
      onImported(r);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const set = (k: keyof ManualForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section
      aria-labelledby={`${id}-h`}
      className="border border-ink-primary bg-surface p-5 sm:p-6"
    >
      <h2 id={`${id}-h`} className="eyebrow text-ink-primary">
        Import your own numbers
      </h2>
      <p className="mt-2 text-sm text-ink-secondary">
        Supply progress you have the right to use, from your own LeetCode profile or
        records. UNBLUFF checks it, shows it back, and stores it only after you confirm.
        It is saved as numbers{" "}
        <strong className="text-ink-primary">you supplied, with the date you give</strong>
        : never as live, synchronised or verified data. Never include a password, cookie
        or token: such files are rejected.
      </p>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          reset();
        }}
        className="mt-4"
      >
        <TabsList aria-label="How to supply the numbers">
          <TabsTrigger value="file">Upload a file</TabsTrigger>
          <TabsTrigger value="manual">Type the numbers</TabsTrigger>
        </TabsList>

        <TabsContent value="file" className="mt-4">
          <label htmlFor={`${id}-file`} className="text-sm font-medium text-ink-primary">
            JSON or CSV file in the template format (up to{" "}
            {connection.limits.max_import_bytes / 1024} KB)
          </label>
          <input
            id={`${id}-file`}
            ref={fileRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
            disabled={busy !== null}
            className="mt-1.5 block w-full max-w-md text-sm text-ink-secondary file:mr-3 file:min-h-9 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:text-sm file:text-ink-primary"
          />
          {fileError && (
            <p role="alert" className="mt-2 text-sm text-ink-primary">
              {fileError}
            </p>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            Template with clearly fictitious numbers (it will not import until you replace
            them):{" "}
            <button
              type="button"
              className="underline underline-offset-4 hover:text-redline"
              onClick={() =>
                download(
                  "unbluff-leetcode-template.json",
                  TEMPLATE_JSON_TEXT,
                  "application/json"
                )
              }
            >
              JSON
            </button>
            {" · "}
            <button
              type="button"
              className="underline underline-offset-4 hover:text-redline"
              onClick={() =>
                download("unbluff-leetcode-template.csv", TEMPLATE_CSV_TEXT, "text/csv")
              }
            >
              CSV
            </button>
          </p>
        </TabsContent>

        <TabsContent value="manual" className="mt-4">
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              void runPreview({
                format: "json",
                origin: "manual",
                content: formToJson(form),
              });
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary sm:col-span-2"
              htmlFor={`${id}-date`}
            >
              Date these numbers were true
              <input
                id={`${id}-date`}
                type="date"
                max={today}
                value={form.captured_on}
                onChange={set("captured_on")}
                className={field}
                required
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-solved`}
            >
              Total solved
              <input
                id={`${id}-solved`}
                inputMode="numeric"
                value={form.solved}
                onChange={set("solved")}
                className={field}
                required
              />
            </label>
            <span aria-hidden="true" className="hidden sm:block" />
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-easy`}
            >
              Easy
              <input
                id={`${id}-easy`}
                inputMode="numeric"
                value={form.easy}
                onChange={set("easy")}
                className={field}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-medium`}
            >
              Medium
              <input
                id={`${id}-medium`}
                inputMode="numeric"
                value={form.medium}
                onChange={set("medium")}
                className={field}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-hard`}
            >
              Hard
              <input
                id={`${id}-hard`}
                inputMode="numeric"
                value={form.hard}
                onChange={set("hard")}
                className={field}
              />
            </label>
            <p className="self-end text-xs text-ink-muted">
              Give all three, adding up to the total, or leave all three empty.
            </p>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-rating`}
            >
              Contest rating (optional)
              <input
                id={`${id}-rating`}
                inputMode="decimal"
                value={form.rating}
                onChange={set("rating")}
                className={field}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-rank`}
            >
              Global rank (optional)
              <input
                id={`${id}-rank`}
                inputMode="numeric"
                value={form.rank}
                onChange={set("rank")}
                className={field}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-att`}
            >
              Contests attended (optional)
              <input
                id={`${id}-att`}
                inputMode="numeric"
                value={form.attended}
                onChange={set("attended")}
                className={field}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary sm:col-span-4"
              htmlFor={`${id}-note`}
            >
              Where these numbers came from (optional)
              <input
                id={`${id}-note`}
                maxLength={120}
                value={form.note}
                onChange={set("note")}
                placeholder="for example: copied by hand from my profile page"
                className={field}
              />
            </label>
            <div className="sm:col-span-4">
              <Button type="submit" variant="outline" disabled={busy !== null}>
                {busy === "preview" ? "Checking…" : "Check these numbers"}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>

      {busy === "preview" && (
        <p role="status" className="mt-4 text-sm text-ink-secondary">
          Checking your data…
        </p>
      )}

      {preview && !preview.valid && (
        <div
          role="alert"
          className="mt-4 border-l-2 border-redline bg-surface-100/60 p-3 text-sm text-ink-primary"
        >
          <p className="font-medium">This data was not accepted. Nothing was stored.</p>
          <ul className="mt-2 list-disc pl-5">
            {preview.issues.map((i, n) => (
              <li key={`${i.path}-${n}`}>
                <span className="font-mono text-xs text-ink-muted">{i.path}</span>{" "}
                {i.message}
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-2" onClick={reset}>
            Clear
          </Button>
        </div>
      )}

      {preview?.valid && preview.snapshot && (
        <div
          className="mt-4 border-t border-line pt-4"
          aria-label="Preview of what would be stored"
        >
          <h3 className="text-sm font-semibold text-ink-primary">
            Check this before you import
          </h3>
          <div className="mt-3">
            <PreviewSummary p={preview} />
          </div>
          {preview.warnings.length > 0 && (
            <ul
              role="status"
              aria-label="Things to check"
              className="mt-3 list-disc pl-5 text-sm text-ink-secondary"
            >
              {preview.warnings.map((w, n) => (
                <li key={`${w.path}-${n}`}>{w.message}</li>
              ))}
            </ul>
          )}
          {preview.already_imported ? (
            <p role="status" className="mt-3 text-sm text-ink-primary">
              You have already imported exactly these numbers, so confirming would change
              nothing.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void confirm()} disabled={busy !== null}>
                {busy === "confirm" ? "Importing…" : "Import these numbers"}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={busy !== null}>
                Discard
              </Button>
            </div>
          )}
        </div>
      )}

      {done && (
        <p role="status" className="mt-4 text-sm text-ink-primary">
          {done.status === "imported"
            ? `Imported. Your numbers captured ${formatWhen(done.snapshot.captured_at)} are saved as supplied by you.`
            : "Those exact numbers were already imported, so nothing changed."}
        </p>
      )}
      {error !== null && <ErrorState className="mt-4" error={error} />}
    </section>
  );
};
