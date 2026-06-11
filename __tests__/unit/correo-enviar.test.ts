import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { enviarCorreo, construirEnlace } from "@/lib/correo/enviar"
import { ErrorAppUrl, ErrorEnvioCorreo } from "@/lib/correo/errores"

describe("lib/correo/enviar", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.APP_URL
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASSWORD
    delete process.env.SMTP_PORT
    delete process.env.SMTP_SECURE
    delete process.env.SMTP_FROM
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  const opcionesBase = {
    para: "test@example.com",
    asunto: "Test",
    html: "<p>Hola</p>",
    texto: "Hola",
  }

  describe("enviarCorreo()", () => {
    it("lanza ErrorAppUrl si APP_URL está vacía", async () => {
      process.env.APP_URL = ""
      await expect(enviarCorreo(opcionesBase)).rejects.toThrow(ErrorAppUrl)
    })

    it("lanza ErrorAppUrl si APP_URL no está definida", async () => {
      await expect(enviarCorreo(opcionesBase)).rejects.toThrow(ErrorAppUrl)
    })

    it("devuelve modo consola cuando SMTP no está configurado y APP_URL está definida", async () => {
      process.env.APP_URL = "https://miapp.com"
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const resultado = await enviarCorreo(opcionesBase)

      expect(resultado).toEqual({ entregado: true, modo: "consola" })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("test@example.com")
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test")
      )
    })

    it("lanza ErrorEnvioCorreo cuando SMTP falla", async () => {
      process.env.APP_URL = "https://miapp.com"
      process.env.SMTP_HOST = "smtp.test.invalid"
      process.env.SMTP_USER = "user@test.com"
      process.env.SMTP_PASSWORD = "pass"

      // El transporte intentará conectar a un host inválido
      await expect(enviarCorreo(opcionesBase)).rejects.toThrow(ErrorEnvioCorreo)
    })
  })

  describe("construirEnlace()", () => {
    it("lanza ErrorAppUrl si APP_URL no está definida", () => {
      expect(() => construirEnlace("abc123", "verificar")).toThrow(ErrorAppUrl)
    })

    it("construye enlace de verificación correctamente", () => {
      process.env.APP_URL = "https://miapp.com"
      const enlace = construirEnlace("tok123", "verificar")
      expect(enlace).toBe("https://miapp.com/?token=tok123&accion=verificar")
    })

    it("construye enlace de invitación correctamente", () => {
      process.env.APP_URL = "https://miapp.com/"
      const enlace = construirEnlace("inv456", "invitacion")
      expect(enlace).toBe("https://miapp.com/?token=inv456&accion=invitacion")
    })

    it("codifica caracteres especiales en el token", () => {
      process.env.APP_URL = "https://miapp.com"
      const enlace = construirEnlace("tok/en+especial=", "verificar")
      expect(enlace).toContain("token=tok%2Fen%2Bespecial%3D")
    })
  })
})
