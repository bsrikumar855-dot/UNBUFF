import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Role, RoleSummary } from "../types.js";

const criteriaList = z.array(z.string().min(1)).min(2).max(3);

const RoleSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  skills: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_]+$/),
        name: z.string().min(1),
        weight: z.number().positive().max(1),
        description: z.string().min(1),
        keywords: z.array(z.string().min(1)).min(1),
        levels: z.object({ L1: criteriaList, L2: criteriaList, L3: criteriaList }),
        prerequisites: z.array(z.string().min(1)).min(3).max(5),
      }),
    )
    .min(1),
});

const WEIGHT_TOLERANCE = 0.001;

/** Validates a role and asserts its weights sum to 1.0 (±0.001). Throws on any problem. */
export function parseRole(raw: unknown): Role {
  const role = RoleSchema.parse(raw);
  const sum = role.skills.reduce((acc, s) => acc + s.weight, 0);
  if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
    throw new Error(`Role ${role.id}: skill weights sum to ${sum}, expected 1.0`);
  }
  const ids = new Set(role.skills.map((s) => s.id));
  if (ids.size !== role.skills.length) throw new Error(`Role ${role.id}: duplicate skill ids`);
  return role;
}

export class RoleRegistry {
  private readonly roles: Map<string, Role>;

  constructor(roles: Role[]) {
    this.roles = new Map(roles.map((r) => [r.id, r]));
  }

  /** Loads and validates every role JSON in `dir` once at startup (fail fast). */
  static fromDirectory(dir: string): RoleRegistry {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    return new RoleRegistry(files.map((f) => parseRole(JSON.parse(readFileSync(join(dir, f), "utf8")))));
  }

  get(id: string): Role | undefined {
    return this.roles.get(id);
  }

  list(): RoleSummary[] {
    return [...this.roles.values()].map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      skill_count: r.skills.length,
    }));
  }
}
