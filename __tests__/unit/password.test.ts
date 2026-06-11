import { describe, it, expect } from "vitest";
import { hashContrasena, verificarContrasena } from "@/lib/auth/password";

describe("password — hashContrasena y verificarContrasena", () => {
  it("round-trip: verificar con la misma contraseña devuelve true", async () => {
    const hash = await hashContrasena("hola1234");
    const resultado = await verificarContrasena("hola1234", hash);
    expect(resultado).toBe(true);
  });

  it("contraseña incorrecta devuelve false", async () => {
    const hash = await hashContrasena("hola1234");
    const resultado = await verificarContrasena("otrapassword", hash);
    expect(resultado).toBe(false);
  });

  it("hash corrupto devuelve false (no lanza error)", async () => {
    const resultado = await verificarContrasena("hola1234", "hash-corrupto-invalido");
    expect(resultado).toBe(false);
  });

  it("hash vacío devuelve false", async () => {
    const resultado = await verificarContrasena("hola1234", "");
    expect(resultado).toBe(false);
  });
});
