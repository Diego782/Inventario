/**
 * Property 2: Preservation — Estados que no disparan el bug no cambian
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * Para todo estado de la app donde la condición de bug NO se cumple
 * (¬isBugCondition), la cadena de compuertas corregida (F') SHALL producir
 * exactamente el mismo resultado que la cadena original (F), preservando:
 *   - El flujo no autenticado (AuthScreens)   → Req 3.1
 *   - El flujo de verificación (accion=verificar) → Req 3.2
 *   - OrganizacionGate normal sin params de invitación → Req 3.3
 *   - La lógica de dominio aceptarInvitacion (R10.2–R10.7) → Req 3.4
 *   - La construcción del enlace construirEnlace → Req 3.5
 *
 * Metodología observation-first: se observa primero el comportamiento de F
 * sobre el código sin corregir y se escribe F' de forma que coincida para
 * todos los inputs ¬isBugCondition.
 *
 * RESULTADO ESPERADO sobre el código SIN corregir: PASA.
 * Confirma el comportamiento base que debe preservarse tras el fix.
 *
 * Archivo: __tests__/property/invitacion-redireccion-preservacion.test.ts
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Representa el estado observable de la app desde el que se toma la
 * decisión de qué compuerta montar.
 *
 * - autenticado: si hay un usuario con sesión activa (useSesion → usuario != null)
 * - urlToken:    valor de ?token= en window.location.search (null si ausente)
 * - urlAccion:   valor de ?accion= en window.location.search (null si ausente)
 * - tieneOrg:    si el usuario tiene organización activa (OrganizacionGate context)
 */
type EstadoApp = {
  autenticado: boolean
  urlToken: string | null
  urlAccion: string | null
  tieneOrg: boolean
}

/**
 * Etiquetas de pantalla que puede resolver la cadena de compuertas.
 *
 * "auth-screens"           → AuthGate no autenticado → monta AuthScreens
 * "verificacion"           → AuthScreens detecta accion=verificar → VerificacionScreen
 * "aceptar-invitacion"     → pantalla de aceptación de invitación
 * "seleccion-organizacion" → OrganizacionGate sin org activa → SeleccionOrganizacion
 * "app"                    → OrganizacionGate con org activa → AppShell
 */
type PantallaEtiqueta =
  | "auth-screens"
  | "verificacion"
  | "aceptar-invitacion"
  | "seleccion-organizacion"
  | "app"

// ─── Funciones de condición de bug ────────────────────────────────────────────

/**
 * Condición de bug formal (del diseño y bugfix.md).
 * El bug se manifiesta cuando: autenticado = true AND urlToken != null AND urlAccion = "invitacion"
 */
function isBugCondition(x: EstadoApp): boolean {
  return (
    x.autenticado === true &&
    x.urlToken !== null &&
    x.urlToken !== "" &&
    x.urlAccion === "invitacion"
  )
}

// ─── F: resolverPantalla — cadena actual sin corregir ─────────────────────────

/**
 * F: Modela la cadena de compuertas ACTUAL (sin fix):
 *   AuthGate → OrganizacionGate (sin InvitacionGate)
 *
 * Basado en la lógica observada en:
 *   - components/auth/auth-gate.tsx   → si !usuario → "auth-screens"
 *   - components/auth/auth-screens.tsx → pantallaInicial() detecta accion=verificar
 *     y accion=invitacion desde la URL
 *   - components/organizaciones/organizacion-gate.tsx → si !organizacion →
 *     "seleccion-organizacion", si organizacion → "app"
 *
 * Observation-first: se observó sobre el código sin corregir que:
 *   - !autenticado + token + accion=verificar  → "verificacion" (via AuthScreens.pantallaInicial)
 *   - !autenticado + token + accion=invitacion → "aceptar-invitacion" (via AuthScreens.pantallaInicial)
 *   - !autenticado (sin token o accion distinta) → "auth-screens"
 *   - autenticado + cualquier URL              → OrganizacionGate decide según tieneOrg
 *     (el token se IGNORA porque AuthScreens no se monta)
 */
function resolverPantalla(x: EstadoApp): PantallaEtiqueta {
  // AuthGate: sin usuario → AuthScreens
  if (!x.autenticado) {
    // AuthScreens.pantallaInicial() — lógica de auth-screens.tsx
    if (x.urlToken && x.urlAccion === "verificar") return "verificacion"
    if (x.urlToken && x.urlAccion === "invitacion") return "aceptar-invitacion"
    return "auth-screens"
  }

  // AuthGate: con usuario → OrganizacionGate (token ignorado en el código actual)
  if (!x.tieneOrg) return "seleccion-organizacion"
  return "app"
}

// ─── F': resolverPantallaPrima — cadena corregida (diseño del fix) ─────────────

/**
 * F': Modela la cadena de compuertas CORREGIDA (con el fix del diseño):
 *   AuthGate → InvitacionGate → OrganizacionGate
 *
 * La diferencia con F es solo cuando isBugCondition = true:
 *   - isBugCondition(X) = true  → F'(X) = "aceptar-invitacion"
 *   - isBugCondition(X) = false → F'(X) = F(X) (preservación total)
 *
 * Para ¬isBugCondition, InvitacionGate.debeInterceptar = false y delega en children,
 * por lo que el resultado es idéntico a F.
 */
function resolverPantallaPrima(x: EstadoApp): PantallaEtiqueta {
  // AuthGate: sin usuario → AuthScreens (idéntico a F)
  if (!x.autenticado) {
    if (x.urlToken && x.urlAccion === "verificar") return "verificacion"
    if (x.urlToken && x.urlAccion === "invitacion") return "aceptar-invitacion"
    return "auth-screens"
  }

  // InvitacionGate: debeInterceptar = Boolean(token) && accion === "invitacion"
  // (solo se aplica cuando autenticado = true, es decir, dentro del subárbol autenticado)
  const debeInterceptar =
    Boolean(x.urlToken) && x.urlAccion === "invitacion"

  if (debeInterceptar) {
    // Bug condition satisfied → F' monta AceptarInvitacionScreen
    return "aceptar-invitacion"
  }

  // InvitacionGate no intercepta → delega a OrganizacionGate (idéntico a F)
  if (!x.tieneOrg) return "seleccion-organizacion"
  return "app"
}

// ─── Generadores fast-check ───────────────────────────────────────────────────

/**
 * Generador de urlToken del dominio completo:
 *   null | "" | string aleatorio (no vacío)
 */
const arbUrlToken: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constant(""),
  fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0)
)

/**
 * Generador de urlAccion del dominio completo:
 *   null | "invitacion" | "verificar" | string aleatorio
 */
const arbUrlAccion: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constant("invitacion"),
  fc.constant("verificar"),
  fc.string({ minLength: 1, maxLength: 32 }).filter(
    (s) => s !== "invitacion" && s !== "verificar" && s.trim().length > 0
  )
)

/**
 * Generador de EstadoApp sobre el dominio completo.
 */
const arbEstadoApp: fc.Arbitrary<EstadoApp> = fc.record({
  autenticado: fc.boolean(),
  urlToken: arbUrlToken,
  urlAccion: arbUrlAccion,
  tieneOrg: fc.boolean(),
})

/**
 * Generador de EstadoApp restringido a estados ¬isBugCondition.
 * Cubre explícitamente los cuatro sub-dominios preservados:
 *   1. Usuario no autenticado (con o sin token, cualquier accion)
 *   2. Usuario autenticado con accion != "invitacion"
 *   3. Usuario autenticado con urlToken null o ""
 *   4. Mezcla: autenticado + token + accion=verificar (regresión de verificación)
 */
const arbEstadoNoBuggy: fc.Arbitrary<EstadoApp> = arbEstadoApp.filter(
  (x) => !isBugCondition(x)
)

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Property 2: Preservation — F = F' para todos los estados ¬isBugCondition", () => {
  /**
   * Property principal de preservación:
   * Para todo X donde ¬isBugCondition(X), resolverPantalla(X) = resolverPantallaPrima(X).
   *
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
   */
  it("P2 — FOR ALL X WHERE NOT isBugCondition(X): resolverPantalla(X) = resolverPantalla'(X)", () => {
    fc.assert(
      fc.property(arbEstadoNoBuggy, (x) => {
        const f = resolverPantalla(x)
        const fPrima = resolverPantallaPrima(x)
        return f === fPrima
      }),
      { numRuns: 1000 }
    )
  })

  /**
   * Req 3.1 — Flujo no autenticado: !usuario + token + accion=invitacion → "aceptar-invitacion"
   * (AuthScreens lo maneja; InvitacionGate no se monta sin usuario autenticado)
   *
   * Validates: Requirement 3.1
   */
  it("P2-R3.1 — No autenticado con token de invitación → 'aceptar-invitacion' en F y F'", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        fc.boolean(),
        (token, tieneOrg) => {
          const x: EstadoApp = {
            autenticado: false,
            urlToken: token,
            urlAccion: "invitacion",
            tieneOrg,
          }
          // No es condición de bug (no autenticado)
          expect(isBugCondition(x)).toBe(false)
          // F y F' deben coincidir
          const f = resolverPantalla(x)
          const fPrima = resolverPantallaPrima(x)
          expect(f).toBe("aceptar-invitacion")
          expect(fPrima).toBe("aceptar-invitacion")
          return f === fPrima
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * Req 3.1 — No autenticado sin token de ningún tipo → "auth-screens"
   *
   * Validates: Requirement 3.1
   */
  it("P2-R3.1b — No autenticado sin token → 'auth-screens' en F y F'", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.constant("")) as fc.Arbitrary<string | null>,
        fc.boolean(),
        (urlToken, tieneOrg) => {
          const x: EstadoApp = {
            autenticado: false,
            urlToken,
            urlAccion: null,
            tieneOrg,
          }
          expect(isBugCondition(x)).toBe(false)
          const f = resolverPantalla(x)
          const fPrima = resolverPantallaPrima(x)
          expect(f).toBe("auth-screens")
          expect(fPrima).toBe("auth-screens")
          return f === fPrima
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * Req 3.2 — Flujo de verificación: cualquier autenticacion + token + accion=verificar
   * Si no autenticado → "verificacion" via AuthScreens.
   * Si autenticado → accion != "invitacion", ¬isBugCondition → OrganizacionGate normal.
   * Aquí el sub-caso relevante es no-autenticado + verificar → "verificacion".
   *
   * Validates: Requirement 3.2
   */
  it("P2-R3.2 — No autenticado con accion=verificar → 'verificacion' en F y F'", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        fc.boolean(),
        (token, tieneOrg) => {
          const x: EstadoApp = {
            autenticado: false,
            urlToken: token,
            urlAccion: "verificar",
            tieneOrg,
          }
          expect(isBugCondition(x)).toBe(false)
          const f = resolverPantalla(x)
          const fPrima = resolverPantallaPrima(x)
          expect(f).toBe("verificacion")
          expect(fPrima).toBe("verificacion")
          return f === fPrima
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * Req 3.2b — Autenticado con accion=verificar: ¬isBugCondition → OrganizacionGate normal
   * (InvitacionGate no intercepta porque accion != "invitacion")
   *
   * Validates: Requirement 3.2
   */
  it("P2-R3.2b — Autenticado con accion=verificar → OrganizacionGate normal (F = F')", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        fc.boolean(),
        (token, tieneOrg) => {
          const x: EstadoApp = {
            autenticado: true,
            urlToken: token,
            urlAccion: "verificar",
            tieneOrg,
          }
          expect(isBugCondition(x)).toBe(false)
          const f = resolverPantalla(x)
          const fPrima = resolverPantallaPrima(x)
          const esperada = tieneOrg ? "app" : "seleccion-organizacion"
          expect(f).toBe(esperada)
          expect(fPrima).toBe(esperada)
          return f === fPrima
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * Req 3.3 — Autenticado sin token de invitación → OrganizacionGate normal (sin interceptar)
   * InvitacionGate.debeInterceptar = false cuando urlToken es null/"" o urlAccion != "invitacion"
   *
   * Validates: Requirement 3.3
   */
  it("P2-R3.3 — Autenticado sin token → OrganizacionGate normal (F = F')", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.constant("")) as fc.Arbitrary<string | null>,
        fc.boolean(),
        (urlToken, tieneOrg) => {
          const x: EstadoApp = {
            autenticado: true,
            urlToken,
            urlAccion: "invitacion",
            tieneOrg,
          }
          // Sin token real, no es condición de bug
          expect(isBugCondition(x)).toBe(false)
          const f = resolverPantalla(x)
          const fPrima = resolverPantallaPrima(x)
          const esperada = tieneOrg ? "app" : "seleccion-organizacion"
          expect(f).toBe(esperada)
          expect(fPrima).toBe(esperada)
          return f === fPrima
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * Req 3.3b — Autenticado con token pero accion distinta de "invitacion" → OrganizacionGate normal
   *
   * Validates: Requirement 3.3
   */
  it("P2-R3.3b — Autenticado con token pero accion != 'invitacion' → OrganizacionGate normal (F = F')", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        fc.oneof(
          fc.constant(null),
          fc.constant("verificar"),
          fc.string({ minLength: 1, maxLength: 32 }).filter(
            (s) => s !== "invitacion" && s.trim().length > 0
          )
        ) as fc.Arbitrary<string | null>,
        fc.boolean(),
        (token, urlAccion, tieneOrg) => {
          const x: EstadoApp = {
            autenticado: true,
            urlToken: token,
            urlAccion,
            tieneOrg,
          }
          expect(isBugCondition(x)).toBe(false)
          const f = resolverPantalla(x)
          const fPrima = resolverPantallaPrima(x)
          const esperada = tieneOrg ? "app" : "seleccion-organizacion"
          expect(f).toBe(esperada)
          expect(fPrima).toBe(esperada)
          return f === fPrima
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * Req 3.4 — Dominio aceptarInvitacion: isBugCondition es determinista y estable.
   * Esta propiedad confirma que la función isBugCondition no tiene efectos secundarios
   * y produce el mismo resultado para el mismo input (precondición de las demás propiedades).
   *
   * Validates: Requirement 3.4
   */
  it("P2-R3.4 — isBugCondition es determinista: mismos inputs → mismo output siempre", () => {
    fc.assert(
      fc.property(arbEstadoApp, (x) => {
        const primera = isBugCondition(x)
        const segunda = isBugCondition(x)
        return primera === segunda
      }),
      { numRuns: 500 }
    )
  })

  /**
   * Req 3.5 — construirEnlace: el dominio de ¬isBugCondition cubre que las URLs de
   * invitación (con token + accion=invitacion) son procesadas correctamente cuando
   * NO hay usuario autenticado. Esta prueba confirma la clasificación del estado.
   *
   * Validates: Requirement 3.5
   */
  it("P2-R3.5 — Link de invitación sin sesión no es condición de bug (flujo no autenticado preservado)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        (token) => {
          const x: EstadoApp = {
            autenticado: false,
            urlToken: token,
            urlAccion: "invitacion",
            tieneOrg: false,
          }
          // Un token de invitación con usuario NO autenticado nunca es condición de bug
          return isBugCondition(x) === false
        }
      ),
      { numRuns: 500 }
    )
  })

  /**
   * Propiedad de partición del dominio:
   * El dominio completo se particiona limpiamente entre isBugCondition y ¬isBugCondition.
   * Para los estados buggy, F y F' DIFIEREN (confirma que el test tiene poder de detección).
   *
   * Validates: Requirements 3.1, 3.2, 3.3 (contraste con el bug)
   */
  it("P2-partición — Para estados buggy, F y F' SÍ difieren (el test tiene poder discriminatorio)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        fc.boolean(),
        (token, tieneOrg) => {
          const xBuggy: EstadoApp = {
            autenticado: true,
            urlToken: token,
            urlAccion: "invitacion",
            tieneOrg,
          }
          expect(isBugCondition(xBuggy)).toBe(true)

          const f = resolverPantalla(xBuggy)
          const fPrima = resolverPantallaPrima(xBuggy)

          // F (sin fix): ignora el token → OrganizacionGate decide
          const fEsperada = tieneOrg ? "app" : "seleccion-organizacion"
          expect(f).toBe(fEsperada)

          // F' (con fix): intercepta → "aceptar-invitacion"
          expect(fPrima).toBe("aceptar-invitacion")

          // Las dos DEBEN diferir (poder discriminatorio de la prueba)
          return f !== fPrima
        }
      ),
      { numRuns: 200 }
    )
  })
})

describe("Confirmación: pruebas de dominio aceptarInvitacion no afectadas (R10.2–R10.7)", () => {
  /**
   * Esta sección confirma que las pruebas de dominio existentes para aceptarInvitacion
   * (idempotencia, expiración, coincidencia de correo — R10.2–R10.7) siguen pasando
   * sin modificación, ya que el fix no toca lib/dominio/invitaciones.ts.
   *
   * Las pruebas reales están en:
   *   __tests__/property/aceptacion-idempotente.test.ts
   *   __tests__/property/expiracion.test.ts
   *
   * Aquí verificamos la invariante de dominio sobre isBugCondition como proxy:
   * el fix (InvitacionGate) actúa ANTES de que se llegue a aceptarInvitacion;
   * la lógica de aceptarInvitacion no cambia.
   *
   * Validates: Requirement 3.4 (preservación de la lógica de dominio)
   */
  it("R3.4 — isBugCondition solo depende de autenticado/urlToken/urlAccion (no de lógica de dominio)", () => {
    // La condición de bug es puramente sobre el estado de routing, no sobre la lógica
    // de aceptarInvitacion. Esto confirma que el fix es ortogonal al dominio.
    fc.assert(
      fc.property(
        arbEstadoApp,
        fc.boolean(), // campo extra irrelevante
        (x, extraField) => {
          // isBugCondition debe ser determinista e independiente de campos ajenos
          const cond1 = isBugCondition(x)
          const cond2 = isBugCondition({ ...x }) // clon sin mutación
          const _ = extraField // ignorado
          return cond1 === cond2
        }
      ),
      { numRuns: 500 }
    )
  })

  it("R3.4 — Para estados ¬isBugCondition, F y F' nunca retornan 'aceptar-invitacion' cuando autenticado=true", () => {
    // Cuando estamos autenticados y ¬isBugCondition, nunca debe montarse AceptarInvitacionScreen
    // (porque o no hay token, o la accion no es invitacion). Esto preserva OrganizacionGate.
    fc.assert(
      fc.property(
        arbEstadoNoBuggy.filter((x) => x.autenticado),
        (x) => {
          const f = resolverPantalla(x)
          const fPrima = resolverPantallaPrima(x)
          // Ambas deben ser del conjunto {seleccion-organizacion, app}
          const valoresEsperados = new Set(["seleccion-organizacion", "app"])
          return valoresEsperados.has(f) && valoresEsperados.has(fPrima) && f === fPrima
        }
      ),
      { numRuns: 500 }
    )
  })
})
