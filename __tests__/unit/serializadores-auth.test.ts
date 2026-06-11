/**
 * Tests para lib/api/serializadores-auth.ts
 * Valida que los DTOs nunca exponen campos sensibles (hash_contrasena, hash_sesion, token_hash).
 */
import {
  toUsuarioDTO,
  toOrganizacionDTO,
  toMiembroDTO,
  toInvitacionDTO,
  toHorarioDTO,
  toRolDTO,
} from "@/lib/api/serializadores-auth"

// ---- Fixtures ----

const ahora = new Date("2024-01-15T10:00:00.000Z")

const usuarioFake = {
  id: "u-001",
  correo: "test@example.com",
  nombre: "Test User",
  hash_contrasena: "$2b$12$secrethashvalue",
  correo_verificado: true,
  estado: "activo" as const,
  creado_en: ahora,
  actualizado_en: ahora,
}

const orgFake = {
  id: "org-001",
  nombre: "Mi Tienda",
  slug: "mi-tienda",
  logo: null,
  logo_aspecto: null,
  creado_por: "u-001",
  creado_en: ahora,
  actualizado_en: ahora,
}

const rolFake = {
  id: "rol-001",
  organizacion_id: "org-001",
  nombre: "Propietario",
  es_sistema: true,
  creado_en: ahora,
  permisos: [
    { id: "p-1", rol_id: "rol-001", seccion: "inventario", accion: "ver" },
    { id: "p-2", rol_id: "rol-001", seccion: "ventas", accion: "crear" },
  ],
  membresias: [],
  invitaciones: [],
}

const membresiaFake = {
  id: "mem-001",
  usuario_id: "u-001",
  organizacion_id: "org-001",
  rol_id: "rol-001",
  estado: "activa" as const,
  creado_en: ahora,
  usuario: usuarioFake,
  rol: rolFake,
  horarios: [],
}

const invitacionFake = {
  id: "inv-001",
  organizacion_id: "org-001",
  correo: "invitado@example.com",
  rol_id: "rol-001",
  estado: "pendiente" as const,
  token_hash: "sha256hashsecretvalue",
  expira_en: new Date("2024-01-18T10:00:00.000Z"),
  invitado_por: "u-001",
  creado_en: ahora,
  rol: rolFake,
}

const horarioFake = {
  id: "h-001",
  membresia_id: "mem-001",
  dia: 1,
  hora_inicio: "09:00",
  hora_fin: "17:00",
  tipo: "normal" as const,
  creado_en: ahora,
}

// ---- Tests ----

describe("serializadores-auth", () => {
  describe("toUsuarioDTO", () => {
    it("no contiene hash_contrasena en el JSON serializado", () => {
      const dto = toUsuarioDTO(usuarioFake as any)
      const json = JSON.stringify(dto)
      expect(json).not.toContain("hash_contrasena")
      expect(json).not.toContain("$2b$12$secrethashvalue")
    })

    it("incluye los campos esperados", () => {
      const dto = toUsuarioDTO(usuarioFake as any)
      expect(dto).toEqual({
        id: "u-001",
        correo: "test@example.com",
        nombre: "Test User",
        correo_verificado: true,
        estado: "activo",
        creado_en: "2024-01-15T10:00:00.000Z",
        actualizado_en: "2024-01-15T10:00:00.000Z",
      })
    })
  })

  describe("toOrganizacionDTO", () => {
    it("serializa correctamente la organización", () => {
      const dto = toOrganizacionDTO(orgFake as any)
      expect(dto).toEqual({
        id: "org-001",
        nombre: "Mi Tienda",
        slug: "mi-tienda",
        logo: null,
        logo_aspecto: null,
        creado_por: "u-001",
        creado_en: "2024-01-15T10:00:00.000Z",
        actualizado_en: "2024-01-15T10:00:00.000Z",
      })
    })
  })

  describe("toMiembroDTO", () => {
    it("no expone hash_contrasena del usuario", () => {
      const dto = toMiembroDTO(membresiaFake as any)
      const json = JSON.stringify(dto)
      expect(json).not.toContain("hash_contrasena")
    })

    it("incluye subset de usuario con id, correo, nombre", () => {
      const dto = toMiembroDTO(membresiaFake as any)
      expect(dto.usuario).toEqual({
        id: "u-001",
        correo: "test@example.com",
        nombre: "Test User",
      })
      expect(dto.rol).toBe("Propietario")
      expect(dto.estado).toBe("activa")
    })
  })

  describe("toInvitacionDTO", () => {
    it("no expone token_hash", () => {
      const dto = toInvitacionDTO(invitacionFake as any)
      const json = JSON.stringify(dto)
      expect(json).not.toContain("token_hash")
      expect(json).not.toContain("sha256hashsecretvalue")
    })

    it("incluye rol como nombre", () => {
      const dto = toInvitacionDTO(invitacionFake as any)
      expect(dto.rol).toBe("Propietario")
    })
  })

  describe("toHorarioDTO", () => {
    it("serializa correctamente el horario", () => {
      const dto = toHorarioDTO(horarioFake as any)
      expect(dto).toEqual({
        id: "h-001",
        membresia_id: "mem-001",
        dia: 1,
        hora_inicio: "09:00",
        hora_fin: "17:00",
        tipo: "normal",
        creado_en: "2024-01-15T10:00:00.000Z",
      })
    })
  })

  describe("toRolDTO", () => {
    it("incluye permisos como array de {seccion, accion}", () => {
      const dto = toRolDTO(rolFake as any)
      expect(dto).toEqual({
        id: "rol-001",
        nombre: "Propietario",
        es_sistema: true,
        permisos: [
          { seccion: "inventario", accion: "ver" },
          { seccion: "ventas", accion: "crear" },
        ],
        creado_en: "2024-01-15T10:00:00.000Z",
      })
    })
  })
})
