import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { configurado, crearTransporte } from "@/lib/correo/transporte"

describe("lib/correo/transporte", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASSWORD
    delete process.env.SMTP_PORT
    delete process.env.SMTP_SECURE
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe("configurado()", () => {
    it("retorna false cuando las 3 variables están vacías", () => {
      expect(configurado()).toBe(false)
    })

    it("retorna false si falta SMTP_HOST", () => {
      process.env.SMTP_USER = "user@test.com"
      process.env.SMTP_PASSWORD = "pass123"
      expect(configurado()).toBe(false)
    })

    it("retorna false si falta SMTP_USER", () => {
      process.env.SMTP_HOST = "smtp.example.com"
      process.env.SMTP_PASSWORD = "pass123"
      expect(configurado()).toBe(false)
    })

    it("retorna false si falta SMTP_PASSWORD", () => {
      process.env.SMTP_HOST = "smtp.example.com"
      process.env.SMTP_USER = "user@test.com"
      expect(configurado()).toBe(false)
    })

    it("retorna true cuando las 3 variables están presentes", () => {
      process.env.SMTP_HOST = "smtp.example.com"
      process.env.SMTP_USER = "user@test.com"
      process.env.SMTP_PASSWORD = "pass123"
      expect(configurado()).toBe(true)
    })
  })

  describe("crearTransporte()", () => {
    it("crea un transporte con host/port/auth desde env", () => {
      process.env.SMTP_HOST = "smtp.example.com"
      process.env.SMTP_PORT = "465"
      process.env.SMTP_SECURE = "true"
      process.env.SMTP_USER = "user@test.com"
      process.env.SMTP_PASSWORD = "pass123"

      const transporte = crearTransporte()
      expect(transporte).toBeDefined()
      expect(transporte.options.host).toBe("smtp.example.com")
      expect(transporte.options.port).toBe(465)
      expect(transporte.options.secure).toBe(true)
    })

    it("usa puerto 587 y secure=false por defecto", () => {
      process.env.SMTP_HOST = "smtp.example.com"
      process.env.SMTP_USER = "user@test.com"
      process.env.SMTP_PASSWORD = "pass123"

      const transporte = crearTransporte()
      expect(transporte.options.port).toBe(587)
      expect(transporte.options.secure).toBe(false)
    })
  })
})
