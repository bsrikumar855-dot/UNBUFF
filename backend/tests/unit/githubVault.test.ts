import { describe, expect, it } from "vitest";
import { keyIdOf, keyProblem, sha256Hex, TokenVault } from "../../src/github/vault.js";

const K1 = Buffer.alloc(32, 1).toString("base64");
const K2 = Buffer.alloc(32, 2).toString("base64");

describe("GitHub token vault", () => {
  it("round-trips a token and never stores it in the clear", () => {
    const vault = new TokenVault(K1);
    const sealed = vault.seal("gho_supersecret", "u1", "42");
    expect(JSON.stringify(sealed)).not.toContain("gho_supersecret");
    expect(Buffer.from(sealed.data, "base64").toString("utf8")).not.toContain("gho_supersecret");
    expect(vault.open(sealed, "u1", "42")).toBe("gho_supersecret");
  });

  it("uses a fresh IV every time (same token, different ciphertext)", () => {
    const vault = new TokenVault(K1);
    const a = vault.seal("t", "u1", "42");
    const b = vault.seal("t", "u1", "42");
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("binds the token to its owner and GitHub account: a copied record does not decrypt", () => {
    const vault = new TokenVault(K1);
    const sealed = vault.seal("t", "u1", "42");
    expect(() => vault.open(sealed, "u2", "42")).toThrow();
    expect(() => vault.open(sealed, "u1", "43")).toThrow();
  });

  it("detects tampering", () => {
    const vault = new TokenVault(K1);
    const sealed = vault.seal("secret-token", "u1", "42");
    const data = Buffer.from(sealed.data, "base64");
    data[0] = (data[0] ?? 0) ^ 1;
    expect(() => vault.open({ ...sealed, data: data.toString("base64") }, "u1", "42")).toThrow();
    expect(() => vault.open({ ...sealed, tag: Buffer.alloc(16, 0).toString("base64") }, "u1", "42")).toThrow();
  });

  it("a different key cannot decrypt; a retired key still can (rotation)", () => {
    const sealedWithOld = new TokenVault(K1).seal("t", "u1", "42");
    expect(() => new TokenVault(K2).open(sealedWithOld, "u1", "42")).toThrow();
    const rotated = new TokenVault(K2, [K1]);
    expect(rotated.open(sealedWithOld, "u1", "42")).toBe("t");
    expect(rotated.seal("t", "u1", "42").key_id).toBe(keyIdOf(K2));
  });

  it("rejects keys that are not 32 base64 bytes, and key ids reveal nothing usable", () => {
    expect(keyProblem(undefined)).toMatch(/empty/);
    expect(keyProblem("short")).toMatch(/32 random bytes/);
    expect(keyProblem(K1)).toBeNull();
    expect(() => new TokenVault("short")).toThrow();
    expect(() => new TokenVault(K1, ["short"])).toThrow();
    expect(keyIdOf(K1)).toMatch(/^[a-f0-9]{8}$/);
    expect(K1).not.toContain(keyIdOf(K1));
  });

  it("hashes one-time values with sha256", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
