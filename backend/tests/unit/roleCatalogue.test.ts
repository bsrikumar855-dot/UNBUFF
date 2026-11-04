import { describe, expect, it } from "vitest";
import { RoleRegistry } from "../../src/services/roles.js";
import { ROLE_CATEGORIES } from "../../src/careers/signals.js";

describe("role catalogue", () => {
  const registry = RoleRegistry.fromDirectory("data/roles");
  const roles = registry.list();

  it("offers every target role the product claims to cover", () => {
    expect(roles.map((r) => r.id).sort()).toEqual(
      ["backend_developer", "data_analyst", "devops_engineer", "frontend_developer", "fullstack_developer", "ml_engineer", "software_engineer"],
    );
  });

  it("maps every role to job categories", () => {
    for (const r of roles) expect(ROLE_CATEGORIES[r.id]?.length, r.id).toBeGreaterThan(0);
  });

  it("keeps skill ids unique within each role", () => {
    for (const r of roles) {
      const ids = registry.get(r.id)!.skills.map((s) => s.id);
      expect(new Set(ids).size, r.id).toBe(ids.length);
    }
  });
});
