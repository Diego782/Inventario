import { describe, it, expect } from "vitest"
import {
  escHtml,
  plantillaVerificacion,
  plantillaInvitacion,
} from "@/lib/correo/plantillas"

describe("escHtml", () => {
  it("escapa < > & \" '", () => {
    expect(escHtml('<script>"alert&\'hi\'</script>')).toBe(
      "&lt;script&gt;&quot;alert&amp;&#39;hi&#39;&lt;/script&gt;"
    )
  })

  it("no modifica texto sin caracteres especiales", () => {
    expect(escHtml("Hola mundo")).toBe("Hola mundo")
  })
})

describe("plantillaVerificacion", () => {
  it("asunto contiene 'Verifica'", () => {
    const result = plantillaVerificacion("Ana", "https://example.com/v")
    expect(result.asunto).toContain("Verifica")
  })

  it("html escapa caracteres peligrosos en nombre", () => {
    const result = plantillaVerificacion("<b>Ana</b>", "https://example.com/v")
    expect(result.html).toContain("&lt;b&gt;Ana&lt;/b&gt;")
    expect(result.html).not.toContain("<b>Ana</b>")
  })

  it("texto incluye nombre y enlace sin escapar", () => {
    const result = plantillaVerificacion("Ana", "https://example.com/v")
    expect(result.texto).toContain("Ana")
    expect(result.texto).toContain("https://example.com/v")
  })
})

describe("plantillaInvitacion", () => {
  it("asunto incluye nombre de organización", () => {
    const result = plantillaInvitacion("Mi Tienda", "Admin", "https://x.com/i")
    expect(result.asunto).toContain("Mi Tienda")
  })

  it("html escapa org y rol", () => {
    const result = plantillaInvitacion("<Org>", "<Rol>", "https://x.com/i")
    expect(result.html).toContain("&lt;Org&gt;")
    expect(result.html).toContain("&lt;Rol&gt;")
    expect(result.html).not.toContain("<Org>")
    expect(result.html).not.toContain("<Rol>")
  })

  it("texto incluye org, rol y enlace", () => {
    const result = plantillaInvitacion("Tienda", "Vendedor", "https://x.com/i")
    expect(result.texto).toContain("Tienda")
    expect(result.texto).toContain("Vendedor")
    expect(result.texto).toContain("https://x.com/i")
  })
})
