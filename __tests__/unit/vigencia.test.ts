import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  clampInt,
  vigenciaTokenHoras,
  vidaSesionMs,
  nuevaExpiracion,
} from "@/lib/auth/vigencia";

describe("clampInt", () => {
  it("returns def when raw is undefined", () => {
    expect(clampInt(undefined, 24, 1, 168)).toBe(24);
  });

  it("returns def when raw is empty string", () => {
    expect(clampInt("", 24, 1, 168)).toBe(24);
  });

  it("returns def when raw is not numeric", () => {
    expect(clampInt("abc", 24, 1, 168)).toBe(24);
  });

  it("returns def when value is below min", () => {
    expect(clampInt("0", 24, 1, 168)).toBe(24);
  });

  it("returns def when value is above max", () => {
    expect(clampInt("999", 24, 1, 168)).toBe(24);
  });

  it("returns parsed value when within range", () => {
    expect(clampInt("48", 24, 1, 168)).toBe(48);
  });

  it("returns min when value equals min", () => {
    expect(clampInt("1", 24, 1, 168)).toBe(1);
  });

  it("returns max when value equals max", () => {
    expect(clampInt("168", 24, 1, 168)).toBe(168);
  });
});

describe("vigenciaTokenHoras", () => {
  it("returns 24 for out-of-range value '999'", () => {
    expect(vigenciaTokenHoras("999")).toBe(24);
  });

  it("returns 48 for valid value '48'", () => {
    expect(vigenciaTokenHoras("48")).toBe(48);
  });

  it("returns 24 for undefined", () => {
    expect(vigenciaTokenHoras(undefined)).toBe(24);
  });

  it("returns 24 for non-numeric string", () => {
    expect(vigenciaTokenHoras("foo")).toBe(24);
  });
});

describe("vidaSesionMs", () => {
  const originalEnv = process.env.SESION_INACTIVIDAD_HORAS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SESION_INACTIVIDAD_HORAS;
    } else {
      process.env.SESION_INACTIVIDAD_HORAS = originalEnv;
    }
  });

  it("returns default 168h in ms when env is not set", () => {
    delete process.env.SESION_INACTIVIDAD_HORAS;
    expect(vidaSesionMs()).toBe(168 * 60 * 60 * 1000);
  });

  it("returns value in ms for valid env", () => {
    process.env.SESION_INACTIVIDAD_HORAS = "24";
    expect(vidaSesionMs()).toBe(24 * 60 * 60 * 1000);
  });

  it("returns default for out-of-range env (too high)", () => {
    process.env.SESION_INACTIVIDAD_HORAS = "1000";
    expect(vidaSesionMs()).toBe(168 * 60 * 60 * 1000);
  });

  it("returns default for non-numeric env", () => {
    process.env.SESION_INACTIVIDAD_HORAS = "nope";
    expect(vidaSesionMs()).toBe(168 * 60 * 60 * 1000);
  });
});

describe("nuevaExpiracion", () => {
  it("returns a Date in the future", () => {
    const before = Date.now();
    const result = nuevaExpiracion();
    const after = Date.now();

    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before + 168 * 60 * 60 * 1000);
    expect(result.getTime()).toBeLessThanOrEqual(after + 168 * 60 * 60 * 1000);
  });
});
