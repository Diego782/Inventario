# Design Document: Color Theme Persistence Fix

## Overview

Este documento aplica la metodología de Bug Condition para corregir el problema de persistencia de colores del tema en la sección de Configuración. El sistema actualmente no guarda los cambios de color en la base de datos, causando que se pierdan al recargar la página.

## Bug Condition Specification

### Bug Condition: C(X)

Define los inputs/condiciones que activan el bug:

```typescript
function isBugCondition(input: ColorChangeEvent): boolean {
  return (
    input.action === "applyColor" &&          // Usuario aplicó un color
    input.source === "configuracion-section" && // Desde la sección de configuración
    input.method === "setPrimaryColor" &&     // Usando solo useTheme (incorrecto)
    !input.calledActualizarColor              // NO invocó useIdentidadVisual.actualizarColor
  );
}
```

**Inputs que activan el bug:**
- Usuario hace clic en un color predefinido (ColorCircle)
- Usuario ajusta el selector avanzado y hace clic en "Aplicar Este Color"
- El componente invoca solo `setPrimaryColor` del hook `useTheme`
- NO se invoca `actualizarColor` del hook `useIdentidadVisual`

**Manifestación del bug:**
1. El color se aplica visualmente en memoria (CSS variables)
2. No se persiste en la base de datos vía `PUT /api/configuracion`
3. Al recargar la página, el sistema carga el color por defecto (Marca Dego)

### Expected Behavior Properties: P(result)

Para todos los inputs que satisfacen C(X), el comportamiento esperado es:

```typescript
function expectedBehavior(result: ColorChangeResult): boolean {
  return (
    result.persistedInDatabase === true &&           // Se guardó en BD
    result.apiCallMade === "PUT /api/configuracion" && // Se invocó API correcta
    result.apiPayload.includes("color_hue") &&       // Payload con formato correcto
    result.apiPayload.includes("color_saturation") &&
    result.apiPayload.includes("color_lightness") &&
    result.appliedToUI === true &&                   // Se aplicó en UI
    result.survivesPageReload === true               // Persiste tras reload
  );
}
```

**Propiedades del resultado esperado:**

1. **Persistencia en BD**: El color debe guardarse en la tabla `Configuracion` con campos `color_hue`, `color_saturation`, `color_lightness`

2. **Invocación de API correcta**: Debe llamar `PUT /api/configuracion` con el payload:
   ```typescript
   {
     color_hue: number,      // 0-360
     color_saturation: number, // 0.0-1.0
     color_lightness: number   // 0.0-1.0
   }
   ```

3. **Aplicación inmediata en UI**: Las variables CSS deben actualizarse:
   - `--primary`
   - `--sidebar-accent`
   - `--ring`
   - `--chart-*`

4. **Supervivencia al reload**: Al recargar la página, `GET /api/configuracion` debe devolver los colores guardados

5. **Manejo de errores**: Si la persistencia falla:
   - Mostrar `toast.error` con mensaje descriptivo
   - Mantener colores previamente guardados (no aplicar cambios fallidos)

### Preservation Requirements: ¬C(X)

Comportamientos que NO deben cambiar (casos donde isBugCondition devuelve false):

```typescript
function preservationRequirements(context: AppContext): boolean {
  return (
    // R3.1: Otros parámetros del sistema siguen funcionando
    otrosParametrosFuncionan(context) &&
    
    // R3.2: Cambio de tema claro/oscuro sigue funcionando
    temaClarodOscuroFunciona(context) &&
    
    // R3.3: Logo y nombre de organización siguen funcionando
    logoYNombreFuncionan(context) &&
    
    // R3.4: Sin org activa muestra color Dego por defecto
    sinOrgMuestraColorDego(context) &&
    
    // R3.5: Carga de identidad visual desde API sigue funcionando
    cargaIdentidadVisualFunciona(context)
  );
}

function otrosParametrosFuncionan(context: AppContext): boolean {
  // useConfiguracion sigue guardando:
  // - porcentaje_impuesto
  // - etiqueta_ancho_mm, etiqueta_alto_mm
  // - ticket_ancho_mm
  // - imprimir_automaticamente
  // - permitir_sobreventa
  return context.configHook.guardarParametros() === "success";
}

function temaClarodOscuroFunciona(context: AppContext): boolean {
  // setTheme("light" | "dark") sigue funcionando
  // Variables CSS se re-aplican con el modo correcto
  return context.theme.toggle() === "success";
}

function logoYNombreFuncionan(context: AppContext): boolean {
  // OrganizacionCard sigue guardando logo y nombre
  // No hay interferencia con persistencia de colores
  return context.organizacionCard.guardar() === "success";
}

function sinOrgMuestraColorDego(context: AppContext): boolean {
  // Sin sesión o sin org activa:
  // - Muestra COLOR_TEMA_DEGO
  // - No intenta persistir cambios
  // - No lee localStorage (excepto para migración one-time)
  return (
    context.usuario === null || context.organizacion === null
  ) ? context.colorActual === COLOR_TEMA_DEGO : true;
}

function cargaIdentidadVisualFunciona(context: AppContext): boolean {
  // GET /api/configuracion al cambiar org activa
  // Aplica color_hue, color_saturation, color_lightness
  // Inyecta variables CSS en document.documentElement
  // Timeout 5s con AbortController
  // Toast de error si falla: "No se pudo cargar la identidad visual"
  return context.identidadVisual.cargar() === "success";
}
```

**Requisitos de preservación detallados:**

#### P1: Hook `useConfiguracion` (NO debe cambiar)
- Sigue guardando parámetros numéricos y booleanos
- No hay interferencia con el nuevo flujo de colores
- Form submission en ConfiguracionSection continúa funcionando

#### P2: Hook `useTheme` de next-themes (NO debe cambiar completamente)
- `setTheme("light" | "dark")` sigue funcionando
- `setPrimaryColor` sigue actualizando estado local PERO ahora también debe invocar `useIdentidadVisual.actualizarColor`
- Variables CSS se re-aplican correctamente cuando cambia `isDark`

#### P3: Hook `useIdentidadVisual` (comportamiento existente se preserva)
- Carga inicial desde `GET /api/configuracion` sigue funcionando
- Aplicación de variables CSS sigue funcionando
- Flujo de migración localStorage → BD NO debe romperse
- Manejo de timeout y errores sigue igual

#### P4: Componente `OrganizacionCard` (NO debe cambiar)
- Guardado de logo y nombre sigue funcionando
- No hay conflictos con persistencia de colores

#### P5: Estados sin sesión/org (NO debe cambiar)
- Sin usuario → Marca Dego, sin intentos de persistencia
- Sin org activa → Marca Dego, sin intentos de persistencia
- Logout → reset a Marca Dego, limpieza de memoria

## Implementation Strategy

### Root Cause Analysis

**Problema identificado:**
El componente `configuracion-section.tsx` usa:
```typescript
const { setPrimaryColor } = useTheme()
```

Esto solo actualiza el estado local de `ThemeProvider` (next-themes) sin persistir en la base de datos.

**Solución:**
Debe usar:
```typescript
const { actualizarColor } = useIdentidadVisual()
```

Que invoca `PUT /api/configuracion` y LUEGO aplica el color en UI.

### Change Points

1. **Componente `ColorCircle`** (línea ~136 en configuracion-section.tsx):
   - Actual: `onClick={() => setPrimaryColor(color)}`
   - Debe: `onClick={() => handleColorChange(color)}`

2. **Componente `AdvancedColorPicker`** (línea ~253 en configuracion-section.tsx):
   - Actual: `onClick={() => setPrimaryColor(color)}`
   - Debe: `onClick={() => handleColorChange(color)}`

3. **Nuevo handler `handleColorChange`**:
   ```typescript
   async function handleColorChange(color: ColorValue) {
     try {
       await actualizarColor({
         color_hue: color.hue,
         color_saturation: color.saturation,
         color_lightness: color.lightness,
       });
       toast.success("Color aplicado correctamente");
     } catch (error) {
       toast.error("No se pudo guardar el color. Inténtalo de nuevo.");
       // No aplicar el color si la persistencia falla
     }
   }
   ```

### Integration with Existing System

**Hook `useIdentidadVisual` ya soporta todo lo necesario:**
- Método `actualizarColor(color: ColorTema): Promise<void>`
- Validación: solo persiste si `organizacion` está activa
- Manejo de errores: lanza excepción si `PUT` falla
- Aplicación en UI: inyecta variables CSS solo tras éxito

**No se requieren cambios en:**
- `/app/api/configuracion/route.ts` (ya soporta PUT)
- `/hooks/use-identidad-visual.tsx` (ya tiene `actualizarColor`)
- `/lib/tema/aplicar-color.ts` (ya inyecta variables CSS)

**Solo se requieren cambios en:**
- `/components/sections/configuracion-section.tsx` (usar `useIdentidadVisual` en lugar de solo `useTheme`)

## Testing Strategy

### Bug Condition Exploration Test (Property 1)

**Objetivo:** Confirmar que el bug existe en código no corregido

```typescript
// __tests__/property/color-persistencia-bug.test.ts
describe("Property 1: Bug Condition", () => {
  it("debe fallar en código no corregido: colores no persisten", async () => {
    // Scoped PBT: casos concretos que demuestran el bug
    const casosFallidos = [
      { hue: 260, saturation: 0.15, lightness: 0.65, name: "Violeta" },
      { hue: 142, saturation: 0.12, lightness: 0.60, name: "Verde" },
    ];

    for (const color of casosFallidos) {
      // 1. Aplicar color usando el flujo ACTUAL (incorrecto)
      await configuracionSection.clickColorCircle(color);

      // 2. Verificar que se aplicó en memoria (esto pasa)
      expect(document.documentElement.style.getPropertyValue("--primary")).toContain(
        `oklch(${color.lightness}`
      );

      // 3. Recargar página
      await reloadPage();

      // 4. ESPERAR FALLO: color no persiste (vuelve a Marca Dego)
      const colorRecargado = await getColorFromAPI();
      expect(colorRecargado).not.toEqual({
        color_hue: color.hue,
        color_saturation: color.saturation,
        color_lightness: color.lightness,
      });
      // Bug confirmado: el color guardado no es el que aplicamos
    }
  });
});
```

**Resultado esperado en código NO corregido:** Test FALLA (confirma que el bug existe)

### Preservation Property Tests (Property 2)

**Objetivo:** Verificar que comportamientos existentes NO cambian

```typescript
// __tests__/property/color-preservacion.test.ts
describe("Property 2: Preservation", () => {
  it("useConfiguracion sigue guardando parámetros del sistema", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          porcentaje_impuesto: fc.double({ min: 0, max: 100 }),
          etiqueta_ancho_mm: fc.integer({ min: 20, max: 200 }),
          ticket_ancho_mm: fc.integer({ min: 40, max: 200 }),
          imprimir_automaticamente: fc.boolean(),
          permitir_sobreventa: fc.boolean(),
        }),
        async (params) => {
          // Guardar parámetros
          await configuracionSection.submitForm(params);

          // Recargar
          await reloadPage();

          // Verificar persistencia
          const loaded = await getConfigFromAPI();
          expect(loaded).toMatchObject(params);
        }
      )
    );
  });

  it("setTheme(light/dark) sigue funcionando independientemente", async () => {
    // Aplicar color personalizado
    await actualizarColor({
      color_hue: 260,
      color_saturation: 0.15,
      color_lightness: 0.65,
    });

    // Cambiar a modo oscuro
    await themeToggle.setDark();
    expect(document.documentElement.classList).toContain("dark");

    // Variables CSS deben re-aplicarse con modo oscuro
    const chartColors = getChartCSSVariables();
    expect(chartColors).toBeDefined();

    // Cambiar a modo claro
    await themeToggle.setLight();
    expect(document.documentElement.classList).not.toContain("dark");

    // Color personalizado debe persistir
    const colorActual = await getColorFromAPI();
    expect(colorActual.color_hue).toBe(260);
  });

  it("sin org activa muestra Marca Dego sin intentar persistir", async () => {
    // Sin organización activa
    await setOrganizacionActiva(null);

    // Intentar cambiar color
    await configuracionSection.clickColorCircle({ hue: 260, saturation: 0.15, lightness: 0.65 });

    // NO debe hacer PUT /api/configuracion
    expect(apiCallsMade).not.toContain("PUT /api/configuracion");

    // Debe mostrar COLOR_TEMA_DEGO
    const colorAplicado = getAppliedColor();
    expect(colorAplicado).toEqual(COLOR_TEMA_DEGO);
  });
});
```

**Resultado esperado:** Tests PASAN en código NO corregido (comportamiento se preserva)

## Validation Checklist

Tras implementar el fix, verificar:

- [ ] **Bug Condition Test pasa:** Colores persisten tras reload
- [ ] **Preservation Tests pasan:** Comportamientos existentes intactos
- [ ] **Integration Test:** Usuario puede cambiar color, recargar, y ver el color aplicado
- [ ] **Error Handling:** Si API falla, toast de error y color anterior se mantiene
- [ ] **Sin Org:** Sin org activa no intenta persistir y muestra Marca Dego
- [ ] **Modo Claro/Oscuro:** Cambiar tema no afecta persistencia de colores
- [ ] **Other Params:** `useConfiguracion` sigue guardando otros parámetros

## References

- **Bugfix Requirements:** `bugfix.md`
- **API Endpoint:** `/app/api/configuracion/route.ts`
- **Hook de Identidad Visual:** `/hooks/use-identidad-visual.tsx`
- **Componente a modificar:** `/components/sections/configuracion-section.tsx`
- **Schema de validación:** `/lib/schemas/configuracion.ts`
