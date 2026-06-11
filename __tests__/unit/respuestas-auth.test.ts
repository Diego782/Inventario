import { describe, it, expect } from "vitest"
import { errorAuth, mensajePorCodigo } from "@/lib/api/respuestas-auth"

const CONTENT_TYPE = "application/json; charset=utf-8"

describe("respuestas-auth — errorAuth()", () => {
  it("errorAuth('NO_AUTENTICADO', 401) retorna status 401", () => {
    const res = errorAuth("NO_AUTENTICADO", 401)
    expect(res.status).toBe(401)
  })

  it("errorAuth retorna Content-Type correcto", () => {
    const res = errorAuth("NO_AUTENTICADO", 401)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("errorAuth retorna body con shape { error: { codigo, mensaje } }", async () => {
    const res = errorAuth("NO_AUTENTICADO", 401)
    const body = await res.json()
    expect(body).toEqual({
      error: { codigo: "NO_AUTENTICADO", mensaje: "No autenticado" },
    })
  })

  it("errorAuth('PERMISO_DENEGADO', 403) retorna status 403", () => {
    const res = errorAuth("PERMISO_DENEGADO", 403)
    expect(res.status).toBe(403)
  })

  it("errorAuth('SIN_ORGANIZACION_ACTIVA', 403) retorna mensaje correcto", async () => {
    const res = errorAuth("SIN_ORGANIZACION_ACTIVA", 403)
    const body = await res.json()
    expect(body.error.mensaje).toBe("Sin organización activa")
  })

  it("errorAuth('SESION_INVALIDA', 401) retorna mensaje correcto", async () => {
    const res = errorAuth("SESION_INVALIDA", 401)
    const body = await res.json()
    expect(body.error.mensaje).toBe("Sesión inválida")
  })

  it("errorAuth('MEMBRESIA_NO_ACTIVA', 403) retorna mensaje correcto", async () => {
    const res = errorAuth("MEMBRESIA_NO_ACTIVA", 403)
    const body = await res.json()
    expect(body.error.mensaje).toBe("Membresía no activa")
  })
})

describe("respuestas-auth — mensajePorCodigo()", () => {
  it("retorna mensaje para códigos conocidos", () => {
    expect(mensajePorCodigo("NO_AUTENTICADO")).toBe("No autenticado")
    expect(mensajePorCodigo("PERMISO_DENEGADO")).toBe("Permiso denegado")
  })

  it("retorna fallback para código desconocido", () => {
    expect(mensajePorCodigo("DESCONOCIDO")).toBe("Ocurrió un error inesperado.")
  })
})
