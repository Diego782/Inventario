/**
 * Smoke test de Content-Type para los helpers de respuesta de los endpoints nuevos.
 * Verifica que `errorAuth` y `ok` devuelven Content-Type: application/json; charset=utf-8.
 *
 * Requirements: R15.8, R16.4
 */

import { describe, it, expect } from "vitest"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok } from "@/lib/api/respuestas"

const CONTENT_TYPE = "application/json; charset=utf-8"

describe("Smoke — Content-Type de endpoints nuevos", () => {
  it("errorAuth('NO_AUTENTICADO', 401) devuelve Content-Type: application/json; charset=utf-8", () => {
    const res = errorAuth("NO_AUTENTICADO", 401)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("ok({ test: true }) devuelve Content-Type: application/json; charset=utf-8", () => {
    const res = ok({ test: true })
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("errorAuth('NO_AUTENTICADO', 401) devuelve status 401", () => {
    const res = errorAuth("NO_AUTENTICADO", 401)
    expect(res.status).toBe(401)
  })

  it("errorAuth body tiene shape { error: { codigo, mensaje } }", async () => {
    const res = errorAuth("NO_AUTENTICADO", 401)
    const body = await res.json()
    expect(body).toHaveProperty("error")
    expect(body.error).toHaveProperty("codigo", "NO_AUTENTICADO")
    expect(body.error).toHaveProperty("mensaje")
    expect(typeof body.error.mensaje).toBe("string")
  })
})
