// Feature: usuarios-y-accesos, Property 1: Round-trip de tokens y no fuga de secretos
// **Validates: Requirements 2.6, 3.1, 9.4, 16.1**
import { describe, it } from "vitest";
import * as fc from "fast-check";
import { generarToken, hashToken } from "@/lib/auth/tokens";
import { toUsuarioDTO, toInvitacionDTO } from "@/lib/api/serializadores-auth";

describe("Property 1: Round-trip de tokens y no fuga de secretos", () => {
  it("P1.1 — Para todo token generado, hashToken(plano) reproduce el hash y un mapa hash→entidad resuelve correctamente", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        (n) => {
          const entidades = Array.from({ length: n }, (_, i) => ({
            id: `entidad-${i}`,
            token: generarToken(),
          }));

          const mapa = new Map<string, string>();
          for (const e of entidades) {
            mapa.set(e.token.hash, e.id);
          }

          for (const e of entidades) {
            // hashToken(plano) reproduce el hash persistido
            const hashRecalculado = hashToken(e.token.plano);
            if (hashRecalculado !== e.token.hash) return false;

            // búsqueda por hash resuelve a la entidad originadora
            if (mapa.get(hashRecalculado) !== e.id) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("P1.2 — Tokens distintos producen hashes distintos", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        (n) => {
          const tokens = Array.from({ length: n }, () => generarToken());
          const hashes = tokens.map((t) => t.hash);
          const unicos = new Set(hashes);
          return unicos.size === hashes.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("P1.3 — toUsuarioDTO y toInvitacionDTO nunca contienen hash_contrasena, hash_sesion ni token_hash", () => {
    const CAMPOS_PROHIBIDOS = ["hash_contrasena", "hash_sesion", "token_hash"];

    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          correo: fc.emailAddress(),
          nombre: fc.string({ minLength: 1, maxLength: 160 }),
          hash_contrasena: fc.string({ minLength: 10 }),
          correo_verificado: fc.boolean(),
          estado: fc.constantFrom("pendiente" as const, "activo" as const, "suspendido" as const),
          creado_en: fc.date({ noInvalidDate: true }),
          actualizado_en: fc.date({ noInvalidDate: true }),
        }),
        fc.record({
          id: fc.uuid(),
          organizacion_id: fc.uuid(),
          correo: fc.emailAddress(),
          rol_id: fc.uuid(),
          estado: fc.constantFrom("pendiente" as const, "aceptada" as const, "expirada" as const, "revocada" as const),
          token_hash: fc.string({ minLength: 10 }),
          expira_en: fc.date({ noInvalidDate: true }),
          invitado_por: fc.uuid(),
          creado_en: fc.date({ noInvalidDate: true }),
          rol: fc.record({
            id: fc.uuid(),
            organizacion_id: fc.uuid(),
            nombre: fc.string({ minLength: 1, maxLength: 80 }),
            es_sistema: fc.boolean(),
            creado_en: fc.date({ noInvalidDate: true }),
          }),
        }),
        (usuarioData, invitacionData) => {
          const usuarioDTO = toUsuarioDTO(usuarioData as any);
          const invitacionDTO = toInvitacionDTO(invitacionData as any);

          const usuarioStr = JSON.stringify(usuarioDTO);
          const invitacionStr = JSON.stringify(invitacionDTO);

          for (const campo of CAMPOS_PROHIBIDOS) {
            if (usuarioStr.includes(campo)) return false;
            if (invitacionStr.includes(campo)) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
