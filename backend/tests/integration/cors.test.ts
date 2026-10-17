import request from "supertest";
import { describe, expect, it } from "vitest";
import { testApp } from "./app.js";

describe("CORS allow-list", () => {
  const app = testApp({ corsOrigin: "https://app.example.com,http://localhost:5173" });

  it("echoes only configured origins", async () => {
    const ok = await request(app).get("/api/health").set("Origin", "https://app.example.com");
    expect(ok.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    const local = await request(app).get("/api/health").set("Origin", "http://localhost:5173");
    expect(local.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not grant access to other origins", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
