import { z } from "zod";
import { ApiError } from "../errors.js";
import { formatIssues } from "../middleware/validate.js";
import { cleanText } from "../mentor/memories.js";
import type { RoleRegistry } from "../services/roles.js";
import type { PlacementProfile } from "../types.js";
import { addDays, isValidYmd } from "./dates.js";

const text = (max: number) => z.string().trim().min(1).max(max);

/** The shape accepted from a student. Strict: unknown fields are rejected. */
export const PlacementProfileInput = z.strictObject({
  role_ids: z.array(z.string().regex(/^[a-z0-9_]{1,60}$/, "invalid role id")).max(3),
  target_companies: z.array(text(60)).max(10),
  placement_date: z.string().nullable(),
  available_weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one day you can study").max(7),
  daily_minutes: z.number().int().min(15, "At least 15 minutes a day").max(480, "At most 480 minutes a day"),
  preferred_language: z.enum(["python", "javascript", "cpp", "java"]).nullable(),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  strengths: z.array(text(60)).max(8),
  weak_areas: z.array(text(60)).max(8),
  priorities: z.array(z.enum(["dsa", "interview", "graphql", "projects", "communication"])).max(5),
});

const dedupe = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Validates and normalises a profile. Role ids must exist in the role catalogue, the placement date must be a real date
 * between today and two years ahead, and the same topic cannot be both a strength and a weak area. Nothing is guessed:
 * a field the student did not provide stays empty.
 */
export function normalizeProfile(raw: unknown, ctx: { roles: RoleRegistry; today: string }): PlacementProfile {
  const parsed = PlacementProfileInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("BAD_REQUEST", formatIssues(parsed.error));
  const p = parsed.data;
  for (const id of p.role_ids) if (!ctx.roles.get(id)) throw new ApiError("BAD_REQUEST", `Unknown role "${id}". Choose a role from the list.`);
  if (p.placement_date !== null) {
    if (!isValidYmd(p.placement_date)) throw new ApiError("BAD_REQUEST", "The placement date must be a real date like 2026-12-01.");
    if (p.placement_date < ctx.today) throw new ApiError("BAD_REQUEST", "The placement date must be today or later.");
    if (p.placement_date > addDays(ctx.today, 730)) throw new ApiError("BAD_REQUEST", "The placement date must be within the next two years.");
  }
  const strengths = dedupe(p.strengths.map((s) => cleanText(s, 60)).filter(Boolean));
  const weak = dedupe(p.weak_areas.map((s) => cleanText(s, 60)).filter(Boolean));
  const overlap = strengths.find((s) => weak.some((w) => w.toLowerCase() === s.toLowerCase()));
  if (overlap) throw new ApiError("BAD_REQUEST", `"${overlap}" cannot be both a strength and a weak area.`);
  return {
    role_ids: [...new Set(p.role_ids)],
    target_companies: dedupe(p.target_companies.map((s) => cleanText(s, 60)).filter(Boolean)),
    placement_date: p.placement_date,
    available_weekdays: [...new Set(p.available_weekdays)].sort((a, b) => a - b),
    daily_minutes: p.daily_minutes,
    preferred_language: p.preferred_language,
    experience_level: p.experience_level,
    strengths,
    weak_areas: weak,
    priorities: [...new Set(p.priorities)],
  };
}
