/**
 * __tests__/unit/correo.test.ts
 * Pruebas ejemplares del servicio de correo con mock de nodemailer.
 * Cubre: éxito SMTP, fallback consola, ErrorAppUrl y ErrorEnvioCorreo.
 * Validates: Requirements R2.7, R2.8, R6.3, R6.4, R6.6
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// Mock nodemailer antes de importar módulos
const mockSendMail = vi.fn()
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      options: { host: "smtp.test.com", port: 587, secure: false },
    })),
  },
}))

import { enviarCorreo } from "@/lib/correo/enviar"
import { ErrorAppUrl, ErrorEnvioCorreo } from "@/lib/correo/errores"

describe("Servicio de correo (mock nodemailer)", () => {
  const originalEnv = { ...process.env }

  const opcionesBase = {
    para: "dest@example.com",
    asunto: "Bienvenido",
    html: "<p>Hola</p>",
    texto: "Hola",
  }

  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  it("éxito SMTP: envía correo y devuelve modo smtp", async () => {
    process.env.APP_URL = "https://miapp.com"
    process.env.SMTP_HOST = "smtp.test.com"
    process.env.SMTP_USER = "user@test.com"
    process.env.SMTP_PASSWORD = "secret"

    mockSendMail.mockResolvedValueOnce({ messageId: "<abc@test>" })

    const resultado = await enviarCorreo(opcionesBase)

    expect(resultado).toEqual({ entregado: true, modo: "smtp" })
    expect(mockSendMail).toHaveBeenCalledOnce()
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "dest@example.com",
        subject: "Bienvenido",
        html: "<p>Hola</p>",
        text: "Hola",
      })
    )
  })

  it("fallback consola: sin credenciales SMTP registra en consola", async () => {
    process.env.APP_URL = "https://miapp.com"
    // No se configuran SMTP_HOST, SMTP_USER, SMTP_PASSWORD

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const resultado = await enviarCorreo(opcionesBase)

    expect(resultado).toEqual({ entregado: true, modo: "consola" })
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("dest@example.com")
    )
    expect(mockSendMail).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("ErrorAppUrl: lanza error si APP_URL no está definida", async () => {
    // APP_URL no definida
    await expect(enviarCorreo(opcionesBase)).rejects.toThrow(ErrorAppUrl)
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it("ErrorEnvioCorreo: lanza error ante rechazo del transporte SMTP", async () => {
    process.env.APP_URL = "https://miapp.com"
    process.env.SMTP_HOST = "smtp.test.com"
    process.env.SMTP_USER = "user@test.com"
    process.env.SMTP_PASSWORD = "secret"

    mockSendMail.mockRejectedValueOnce(new Error("Connection refused"))

    await expect(enviarCorreo(opcionesBase)).rejects.toThrow(ErrorEnvioCorreo)
    expect(mockSendMail).toHaveBeenCalledOnce()
  })
})
