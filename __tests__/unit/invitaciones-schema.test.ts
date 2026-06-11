import { describe, it, expect } from "vitest"
import { invitarSchema, aceptarInvitacionSchema } from "@/lib/schemas/invitaciones"

describe("invitarSchema", () => {
  it("acepta correo válido y rol_id uuid", () => {
    const result = invitarSchema.safeParse({
      correo: "Test@Example.COM",
      rol_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.correo).toBe("test@example.com")
    }
  })

  it("rechaza correo inválido", () => {
    const result = invitarSchema.safeParse({
      correo: "no-es-correo",
      rol_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza rol_id que no es uuid", () => {
    const result = invitarSchema.safeParse({
      correo: "user@test.com",
      rol_id: "not-a-uuid",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza correo mayor a 254 caracteres", () => {
    const correoLargo = "a".repeat(243) + "@example.com" // 255 chars
    const result = invitarSchema.safeParse({
      correo: correoLargo,
      rol_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    })
    expect(result.success).toBe(false)
  })
})

describe("aceptarInvitacionSchema", () => {
  it("acepta token no vacío", () => {
    const result = aceptarInvitacionSchema.safeParse({ token: "abc123" })
    expect(result.success).toBe(true)
  })

  it("rechaza token vacío", () => {
    const result = aceptarInvitacionSchema.safeParse({ token: "" })
    expect(result.success).toBe(false)
  })
})
