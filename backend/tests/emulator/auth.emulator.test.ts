import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { FirebaseTokenVerifier } from "../../src/auth/verifier.js";
import { MockProvider } from "../../src/llm/mock.js";
import { AssessmentService } from "../../src/services/assessment.js";
import { MemoryStore } from "../../src/store/memoryStore.js";
import { demoReportJson } from "../integration/app.js";
import { roles, silentLogger } from "../helpers.js";
import { createEmulatorUser, PROJECT_ID, requireEmulators } from "./emulator.js";

/** The real firebase-admin verifier, checking genuine ID tokens issued by the Auth emulator. */
let app: ReturnType<typeof createApp>;
let authHost: string;

beforeAll(() => {
  ({ authHost } = requireEmulators());
  const llm = new MockProvider();
  app = createApp({
    service: new AssessmentService({ store: new MemoryStore(), llm, roles, logger: silentLogger }),
    roles,
    verifier: new FirebaseTokenVerifier(PROJECT_ID),
    llm,
    logger: silentLogger,
    demoReportJson,
    rateLimits: { globalPerMinute: 10_000, llmPerMinute: 10_000 },
  });
});

const create = (token: string) =>
  request(app)
    .post("/api/claims/extract")
    .set("Authorization", `Bearer ${token}`)
    .send({ role_id: "frontend_developer", declared_skills: ["React"] });

describe("Firebase Auth emulator + firebase-admin verifier", () => {
  it("accepts a real emulator ID token and takes the uid from it, enforcing ownership", async () => {
    const alice = await createEmulatorUser(authHost, `alice-${randomUUID()}@example.test`);
    const bob = await createEmulatorUser(authHost, `bob-${randomUUID()}@example.test`);
    expect(alice.uid).not.toBe(bob.uid);

    const sid = (await create(alice.idToken).expect(200)).body.session_id as string;
    await request(app).get(`/api/report/${sid}`).set("Authorization", `Bearer ${alice.idToken}`).expect(200);
    await request(app).get(`/api/report/${sid}`).set("Authorization", `Bearer ${bob.idToken}`).expect(404);
    await request(app).delete(`/api/sessions/${sid}`).set("Authorization", `Bearer ${bob.idToken}`).expect(404);

    const mine = await request(app).get("/api/sessions").set("Authorization", `Bearer ${alice.idToken}`).expect(200);
    expect(mine.body.sessions).toHaveLength(1);
    const theirs = await request(app).get("/api/sessions").set("Authorization", `Bearer ${bob.idToken}`).expect(200);
    expect(theirs.body.sessions).toEqual([]);
  });

  it("rejects missing, garbage and tampered tokens", async () => {
    const user = await createEmulatorUser(authHost, `carol-${randomUUID()}@example.test`);
    const [h, p] = user.idToken.split(".");
    const forgedClaims = JSON.parse(Buffer.from(p!, "base64url").toString("utf8")) as Record<string, unknown>;
    forgedClaims.sub = "someone-else";
    forgedClaims.user_id = "someone-else";
    const forged = `${h}.${Buffer.from(JSON.stringify(forgedClaims)).toString("base64url")}.`;

    for (const token of ["garbage", "a.b.c", forged]) {
      const res = await create(token);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
    await request(app).post("/api/claims/extract").send({ role_id: "frontend_developer", declared_skills: ["React"] }).expect(401);
  });

  it("a valid token stays valid until it expires (revocation is not checked per request; see docs)", async () => {
    const user = await createEmulatorUser(authHost, `dave-${randomUUID()}@example.test`);
    // Same token, still valid until it expires: revocation is not checked per request (see docs).
    await create(user.idToken).expect(200);
  });
});
