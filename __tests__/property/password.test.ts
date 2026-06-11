// Feature: usuarios-y-accesos, Property 2: Round-trip de hashing de contraseñas
// **Validates: Requirements 2.4, 2.5**
import { describe, it, beforeAll } from "vitest";
import * as fc from "fast-check";
import { hashContrasena, verificarContrasena } from "@/lib/auth/password";

beforeAll(() => {
  process.env.BCRYPT_COST = "4";
});

describe("Property 2: Round-trip de hashing de contraseñas", () => {
  it("P2.1 — Para toda contraseña p, verificarContrasena(p, hash(p)) === true", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 128 }),
        async (p) => {
          const hash = await hashContrasena(p);
          const resultado = await verificarContrasena(p, hash);
          return resultado === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("P2.2 — Para dos contraseñas distintas p y q, verificarContrasena(q, hash(p)) === false", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 128 }),
        fc.string({ minLength: 8, maxLength: 128 }),
        async (p, q) => {
          fc.pre(p !== q);
          const hash = await hashContrasena(p);
          const resultado = await verificarContrasena(q, hash);
          return resultado === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});
