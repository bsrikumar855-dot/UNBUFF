import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const contract = readFileSync(join(root, "..", "CONTRACT.md"), "utf8").replace(/\r\n/g, "\n");

describe("contract drift guards", () => {
  it("src/types.ts is copied exactly from CONTRACT.md §4", () => {
    const section = contract.slice(contract.indexOf("## 4."));
    const fenced = /```ts\n([\s\S]*?)```/.exec(section)?.[1];
    const types = readFileSync(join(root, "src", "types.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(fenced).toBeDefined();
    expect(types).toBe(fenced);
  });

  it("data/demo_report.json is exactly the §7 mock", () => {
    const mock = /<!-- MOCK_REPORT_START -->\n```json\n([\s\S]*?)```/.exec(contract)?.[1];
    const demo = readFileSync(join(root, "data", "demo_report.json"), "utf8").replace(/\r\n/g, "\n");
    expect(mock).toBeDefined();
    expect(JSON.parse(demo)).toEqual(JSON.parse(mock as string));
  });
});
