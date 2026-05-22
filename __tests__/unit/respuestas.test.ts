import { describe, it, expect } from "vitest"
import {
  ok,
  creado,
  errorValidacion,
  errorConflicto,
  errorServidor,
  errorBdNoDisponible,
  errorNoEncontrado,
  errorPeticion,
} from "@/lib/api/respuestas"

const CONTENT_TYPE = "application/json; charset=utf-8"

describe("Helpers de respuesta — Content-Type", () => {
  it("ok() retorna Content-Type correcto", () => {
    const res = ok({ data: "test" })
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    expect(res.status).toBe(200)
  })

  it("creado() retorna Content-Type correcto y status 201", () => {
    const res = creado({ id: "123" })
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    expect(res.status).toBe(201)
  })

  it("errorValidacion() retorna 422 con Content-Type correcto", () => {
    const res = errorValidacion([{ campo: "nombre", mensaje: "Requerido" }])
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    expect(res.status).toBe(422)
  })

  it("errorConflicto() retorna 409 con Content-Type correcto", () => {
    const res = errorConflicto("SKU_DUPLICADO")
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    expect(res.status).toBe(409)
  })

  it("errorServidor() retorna 500 con Content-Type correcto", () => {
    const res = errorServidor("VENTA_FALLIDA")
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    expect(res.status).toBe(500)
  })

  it("errorBdNoDisponible() retorna 503 con Content-Type correcto", () => {
    const res = errorBdNoDisponible()
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    expect(res.status).toBe(503)
  })

  it("errorNoEncontrado() retorna 404 con Content-Type correcto", () => {
    const res = errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    expect(res.status).toBe(404)
  })

  it("errorPeticion() retorna 400 con Content-Type correcto", () => {
    const res = errorPeticion("STOCK_NEGATIVO")
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    expect(res.status).toBe(400)
  })
})
