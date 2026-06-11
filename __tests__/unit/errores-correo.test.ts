import { describe, it, expect } from "vitest"
import { ErrorEnvioCorreo, ErrorAppUrl } from "@/lib/correo/errores"

describe("lib/correo/errores", () => {
  describe("ErrorEnvioCorreo", () => {
    it("es instancia de Error", () => {
      expect(new ErrorEnvioCorreo()).toBeInstanceOf(Error)
    })

    it("tiene message ENVIO_CORREO_FALLIDO", () => {
      const err = new ErrorEnvioCorreo()
      expect(err.message).toBe("ENVIO_CORREO_FALLIDO")
    })

    it("tiene name ErrorEnvioCorreo", () => {
      const err = new ErrorEnvioCorreo()
      expect(err.name).toBe("ErrorEnvioCorreo")
    })

    it("preserva la causa cuando se proporciona", () => {
      const causa = new Error("timeout SMTP")
      const err = new ErrorEnvioCorreo(causa)
      expect(err.cause).toBe(causa)
    })
  })

  describe("ErrorAppUrl", () => {
    it("es instancia de Error", () => {
      expect(new ErrorAppUrl()).toBeInstanceOf(Error)
    })

    it("tiene message APP_URL_NO_CONFIGURADA", () => {
      const err = new ErrorAppUrl()
      expect(err.message).toBe("APP_URL_NO_CONFIGURADA")
    })

    it("tiene name ErrorAppUrl", () => {
      const err = new ErrorAppUrl()
      expect(err.name).toBe("ErrorAppUrl")
    })
  })
})
