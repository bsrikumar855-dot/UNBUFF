import React, { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import type { RoleSkill } from "@/types/contract";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { InlineMarkdown } from "@/components/common/InlineMarkdown";

interface SkillPrimerProps {
  skill: RoleSkill;
  sessionId: string;
  claimId: string;
  onContinue: () => void;
}

/** Teach me mode: what the skill is and what a strong answer covers, shown before the first question. */
export const SkillPrimer: React.FC<SkillPrimerProps> = ({
  skill,
  sessionId,
  claimId,
  onContinue,
}) => {
  const [lesson, setLesson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // A short lesson on the concepts, written for this claim. If it cannot be written the card still stands on its own.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.resolve()
      .then(() => api.getPrimer({ session_id: sessionId, claim_id: claimId }))
      .then(
        (r) => !cancelled && setLesson(r?.lesson ?? null),
        () => undefined
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sessionId, claimId]);

  return (
    <section aria-label="Teach me primer" className="grid gap-4">
      <div>
        <p className="eyebrow mb-1 flex items-center gap-2 text-redline">
          <BookOpen size={14} aria-hidden="true" />
          Teach me · before the question
        </p>
        <h2 className="serif text-heading font-medium text-ink-primary">{skill.name}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
          {skill.description}
        </p>
      </div>
      {(loading || lesson) && (
        <div aria-busy={loading}>
          <p className="mb-1.5 text-sm font-semibold text-ink-primary">
            The idea, briefly
          </p>
          {lesson ? (
            <InlineMarkdown
              text={lesson}
              className="text-sm leading-relaxed text-ink-secondary"
            />
          ) : (
            <p className="text-sm text-ink-muted">
              Writing a short lesson for your claim…
            </p>
          )}
        </div>
      )}
      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink-primary">Know these first</p>
        <ul className="flex flex-wrap gap-2">
          {skill.prerequisites.map((p) => (
            <li
              key={p}
              className="rounded-full bg-white/70 px-3 py-1 text-xs text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
            >
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink-primary">A strong answer</p>
        <ul className="grid gap-1.5 text-sm leading-relaxed text-ink-secondary">
          {[...skill.levels.L1, ...skill.levels.L2].map((c) => (
            <li key={c} className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-redline"
              />
              {c}
            </li>
          ))}
        </ul>
      </div>
      <Button className="w-fit rounded-full" onClick={onContinue}>
        I'm ready, ask me →
      </Button>
    </section>
  );
};
