// __tests__/integration/boot.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("Boot — MISSING_DATABASE_URL", () => {
  let originalUrl: string | undefined

  beforeEach(() => {
    originalUrl = process.env.DATABASE_URL
  })

  afterEach(() => {
    if (originalUrl !== undefined) {
      process.env.DATABASE_URL = originalUrl
    } else {
      delete process.env.DATABASE_URL
    }
    vi.resetModules()
  })

  it("registra MISSING_DATABASE_URL en consola cuando DATABASE_URL no está definida", async () => {
    delete process.env.DATABASE_URL
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    // Re-importar lib/db.ts para que evalúe la condición
    await import("@/lib/db")

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("MISSING_DATABASE_URL")
    )
    consoleSpy.mockRestore()
  })
})
