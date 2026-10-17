import { describe, expect, it } from "vitest";
import { ViewerData } from "../../src/github/queries.js";

/** Links shown to the student come from GitHub's responses. Only https://github.com/... may be stored or displayed. */
describe("GitHub response links", () => {
  const viewer = (url: string) => ({ viewer: { id: "MDQ6VXNlcjE=", databaseId: 1, login: "octo", url } });

  it("accepts a github.com profile link", () => {
    expect(ViewerData.safeParse(viewer("https://github.com/octo")).success).toBe(true);
  });

  it.each(["javascript:alert(1)", "http://github.com/octo", "https://evil.example/octo", "https://github.com.evil.example/octo", "data:text/html,x"])("rejects %s", (url) => {
    expect(ViewerData.safeParse(viewer(url)).success).toBe(false);
  });
});
