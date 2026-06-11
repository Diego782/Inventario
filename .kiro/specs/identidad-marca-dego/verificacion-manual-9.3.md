# Verificación Manual - Task 9.3

**Fecha de verificación**: [Pendiente - requiere inspección manual del usuario]

**Tarea**: 9.3 Verificación manual de idioma, tiempo de re-render y contraste WCAG

**Referencias de requisitos**: R3.1 (Spanish), R7.4 (re-render time), R8.1-R8.3 (WCAG contrast)

---

## 1. Verificación de Idioma Español (R3.1, R3.9)

### 1.1 LoginScreen (Pantalla de Login)

**Ubicación**: `components/auth/login-screen.tsx`

#### ✅ Elementos verificados automáticamente:

- [x] **Título del panel de marca**: "Sistema de Inventario" ✓
- [x] **Subtítulo**: "Gestiona el inventario y las ventas de tu organización desde un solo lugar, de forma simple y segura." (160 caracteres, menciona inventario y ventas) ✓
- [x] **Título del formulario**: "Inicia sesión" ✓
- [x] **Descripción**: "Accede a tu cuenta para gestionar tu organización." ✓
- [x] **Etiquetas de campos**:
  - Correo electrónico ✓
  - Contraseña ✓
- [x] **Botón primario**: "Iniciar sesión" / "Iniciando sesión…" ✓
- [x] **Enlace a registro**: "¿No tienes cuenta? Regístrate" ✓
- [x] **Enlace a verificación**: "Reenviar correo de verificación" ✓

#### 📋 Mensajes de error en español:

```typescript
const MENSAJES_ERROR: Record<string, string> = {
  CREDENCIALES_INVALIDAS: "Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.",
  CORREO_NO_VERIFICADO: "Tu correo aún no ha sido verificado. Revisa tu bandeja de entrada.",
  DEMASIADOS_INTENTOS: "Demasiados intentos fallidos. Espera 15 minutos antes de intentarlo de nuevo.",
  SESION_INVALIDA: "La sesión no es válida. Por favor inicia sesión de nuevo.",
}
```

### 1.2 Toasts y Notificaciones

#### ✅ Mensajes del sistema en español:

**IdentidadVisualProvider** (`hooks/use-identidad-visual.tsx`):
- [x] "No se pudo cargar la identidad visual" ✓
- [x] "Color heredado detectado" ✓
- [x] "Se detectó un color personalizado guardado localmente. ¿Deseas aplicarlo a esta organización?" ✓
- [x] "Color aplicado correctamente" ✓
- [x] "Color aplicado. No se pudieron limpiar las claves heredadas." ✓
- [x] "No se pudo completar la migración del color. Inténtalo de nuevo." ✓

**Componentes de Inventario**:
- [x] "Producto eliminado" ✓
- [x] "Producto creado" / "Producto actualizado" ✓
- [x] "Error de conexión" ✓
- [x] "Categoría creada" / "Categoría actualizada" / "Categoría eliminada" ✓
- [x] "Talla creada" / "Talla actualizada" / "Talla eliminada" ✓
- [x] "Unidad creada" / "Unidad actualizada" / "Unidad eliminada" ✓

**Componentes de Usuarios**:
- [x] "No se puede eliminar al propietario de la organización" ✓
- [x] "Miembro actualizado correctamente" ✓

**Componentes de Horarios**:
- [x] "Horario asignado correctamente" ✓

### 1.3 Constantes de Marca

**Ubicación**: `lib/marca.ts`

```typescript
export const MARCA = {
  nombre: "Dego",                      // ✓ Español
  fallback: "Sistema de Inventario",   // ✓ Español
  remitenteCorreo: "Dego",            // ✓ Español
  prefijoLog: "[dego]",               // ✓ Técnico (aceptable)
}
```

### 📝 Checklist Manual - Idioma

**Instrucciones**: El usuario debe verificar visualmente en el navegador:

- [ ] **Login Screen**: Todos los textos visibles están en español
- [ ] **Toasts**: Al probar operaciones (login, cambio de color, errores), los mensajes aparecen en español
- [ ] **Botones**: Ningún botón muestra texto en inglés
- [ ] **Placeholders**: Los campos de entrada usan placeholders en español
- [ ] **Mensajes de validación**: Errores de formulario en español
- [ ] **Confirmaciones**: Diálogos de confirmación en español

**Estado**: ⏳ Pendiente de verificación manual por el usuario

---

## 2. Verificación de Tiempo de Re-Render (R7.4, R4.4)

### 2.1 Especificación del Requisito

**R4.4**: "WHEN el usuario alterna entre el modo claro y el modo oscuro provisto por `next-themes`, THE Pantalla_Login SHALL re-renderizar aplicando los tokens de color del tema correspondiente en un máximo de 1 segundo"

**R7.4**: "WHILE se carga la Identidad_Visual de una Organizacion_Activa recién seleccionada, THE App_Cliente SHALL aplicar la paleta predeterminada de la Marca_Dego hasta completar la carga o hasta que transcurran 5 segundos"

### 2.2 Implementación Técnica

**Mecanismo de aplicación de color**:
- La función `aplicarColorTema` inyecta variables CSS de forma síncrona
- El `IdentidadVisualProvider` usa `useEffect` para reaccionar a cambios de tema
- El script anti-flash establece colores por defecto antes del primer render

**Código relevante** (`hooks/use-identidad-visual.tsx`):

```typescript
// Re-aplica el color vigente cuando cambia el modo claro/oscuro
React.useEffect(() => {
  aplicar(colorAplicadoRef.current, isDark)
}, [isDark, aplicar])
```

**Función de aplicación** (`lib/tema/aplicar-color.ts`):

```typescript
export function aplicarColorTema(
  root: RootEstilizable,
  color: ColorTema,
  isDark: boolean
): void {
  const set = (name: string, value: string) => root.style.setProperty(name, value)
  // Aplicación síncrona de 8 variables CSS
  set("--primary", `oklch(...)`)
  set("--sidebar-accent", `oklch(...)`)
  set("--ring", `oklch(...)`)
  set("--chart-1", `oklch(...)`)
  // ... chart-2 a chart-5
}
```

### 📝 Checklist Manual - Tiempo de Re-Render

**Instrucciones**: El usuario debe medir el tiempo de respuesta:

#### Prueba 1: Cambio de Tema Claro/Oscuro

1. [ ] Abrir la aplicación en el navegador
2. [ ] Abrir DevTools → Performance tab
3. [ ] Iniciar grabación de performance
4. [ ] Alternar entre modo claro y oscuro usando el toggle de tema
5. [ ] Detener grabación
6. [ ] **Verificar**: El cambio visual se completa en < 1000ms (idealmente < 100ms por ser síncrono)
7. [ ] **Observación**: No se observan colores fijos o flash de color incorrecto

#### Prueba 2: Carga de Identidad Visual de Organización

1. [ ] Login con un usuario que pertenece a una organización
2. [ ] Observar el tiempo desde "seleccionar organización" hasta que el color personalizado se aplica
3. [ ] **Verificar**: Durante la carga se mantiene la paleta Dego (negro/neutral)
4. [ ] **Verificar**: El color personalizado se aplica en < 5000ms (timeout configurado)
5. [ ] **Verificar**: No hay flash de color de otra organización

#### Prueba 3: Imperceptibilidad del Re-Render

1. [ ] Realizar cambios de tema múltiples veces rápidamente
2. [ ] **Verificar**: El cambio se siente instantáneo (no hay "lag" perceptible)
3. [ ] **Verificar**: No hay parpadeo o flash de contenido sin estilo (FOUC)

**Resultado esperado**: 
- Cambio de tema: **< 100ms** (aplicación síncrona de CSS vars)
- Carga de organización: **< 5000ms** con timeout + toast si falla
- **Imperceptible** a percepción humana (~16ms por frame)

**Estado**: ⏳ Pendiente de verificación manual por el usuario

---

## 3. Verificación de Contraste WCAG AA (R4.3, R8.1-R8.3)

### 3.1 Especificación del Requisito

**R4.3**: "THE Pantalla_Login SHALL garantizar, conforme a WCAG 2.1 nivel AA, una relación de contraste mínima de 4.5:1 para el texto normal y de 3:1 para el texto grande (≥ 18 pt, o ≥ 14 pt en negrita) y los bordes de los controles, entre el contenido y su fondo, tanto en el panel de marca como en el panel de formulario, medida en modo claro y en modo oscuro."

### 3.2 Paleta de Marca Dego

**Color_Tema_Dego** (negro/neutral):

```typescript
export const COLOR_TEMA_DEGO: ColorTema = {
  color_hue: 0,
  color_saturation: 0,
  color_lightness: 0.18, // HSL(0, 0%, 18%) → neutral gray/black
}
```

**Valores computados en oklch**: `oklch(0.18 0 0)` ≈ `hsl(0, 0%, 18%)` ≈ `#2e2e2e`

### 3.3 Elementos a Verificar

#### Panel de Marca (bg-primary)

**Modo claro**:
- Fondo: token `--primary` (derivado de COLOR_TEMA_DEGO)
- Texto: token `--primary-foreground` (definido en Tailwind config)
- Elementos: BrandMark icon (bg-accent), título, subtítulo

**Modo oscuro**:
- Fondo: token `--primary` 
- Texto: token `--primary-foreground`
- Mismos elementos

#### Panel de Formulario (bg-background)

**Modo claro**:
- Fondo: token `--background`
- Texto: token `--foreground`
- Inputs: `border-input`, placeholder `text-muted-foreground`
- Botones: `bg-primary` con `text-primary-foreground`

**Modo oscuro**:
- Fondo: token `--background`
- Texto: token `--foreground`
- Mismos componentes con tokens de tema oscuro

### 📝 Checklist Manual - Contraste WCAG

**Herramientas recomendadas**:
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Chrome DevTools - CSS Overview](chrome://devtools → More tools → CSS Overview)
- [axe DevTools Extension](https://www.deque.com/axe/devtools/)
- [WAVE Browser Extension](https://wave.webaim.org/extension/)

#### Prueba 1: Modo Claro - Panel de Marca

1. [ ] Abrir LoginScreen en modo claro
2. [ ] Medir contraste del **título "Sistema de Inventario"** contra fondo del panel de marca
   - Relación esperada: **≥ 4.5:1** (texto normal)
3. [ ] Medir contraste del **subtítulo** contra fondo del panel de marca
   - Relación esperada: **≥ 4.5:1** (texto pequeño) o **≥ 3:1** si ≥18pt
4. [ ] Medir contraste del **icono BrandMark** (elemento con bg-accent) contra fondo accent
   - Relación esperada: **≥ 3:1** (componente de UI)
5. [ ] Medir contraste del texto "Dego · Sistema de Inventario" (footer del panel)
   - Relación esperada: **≥ 4.5:1**

#### Prueba 2: Modo Claro - Panel de Formulario

1. [ ] Medir contraste del **título "Inicia sesión"** contra fondo
   - Relación esperada: **≥ 4.5:1** (texto normal) o **≥ 3:1** si texto grande
2. [ ] Medir contraste de las **etiquetas** ("Correo electrónico", "Contraseña") contra fondo
   - Relación esperada: **≥ 4.5:1**
3. [ ] Medir contraste de los **bordes de inputs** contra fondo
   - Relación esperada: **≥ 3:1** (componente de UI)
4. [ ] Medir contraste del **placeholder** contra fondo del input
   - Relación esperada: **≥ 4.5:1** (si es texto legible) o puede ser < 4.5:1 si se considera decorativo
5. [ ] Medir contraste del **botón primario** (texto contra fondo del botón)
   - Relación esperada: **≥ 4.5:1**
6. [ ] Medir contraste de los **enlaces** ("Regístrate") contra fondo
   - Relación esperada: **≥ 4.5:1**

#### Prueba 3: Modo Oscuro - Panel de Marca

1. [ ] Alternar a modo oscuro
2. [ ] Repetir mediciones del Prueba 1 con la paleta oscura
3. [ ] Verificar que todos los elementos cumplen los mismos ratios mínimos

#### Prueba 4: Modo Oscuro - Panel de Formulario

1. [ ] Verificar LoginScreen en modo oscuro
2. [ ] Repetir mediciones del Prueba 2 con la paleta oscura
3. [ ] Verificar que todos los elementos cumplen los mismos ratios mínimos

#### Prueba 5: Estados de Foco y Hover

1. [ ] Medir contraste del **anillo de foco** (ring) en inputs
   - Relación esperada: **≥ 3:1** contra fondo adyacente
2. [ ] Verificar estado hover del botón primario
   - Relación esperada: **≥ 4.5:1** en estado hover
3. [ ] Verificar estado hover de enlaces
   - Relación esperada: **≥ 4.5:1** con subrayado visible

### 3.4 Matriz de Verificación de Contraste

| Elemento | Modo | Fondo | Texto/Borde | Ratio Mínimo | Medido | Cumple |
|----------|------|-------|-------------|--------------|--------|--------|
| Título panel marca | Claro | --primary | --primary-foreground | 4.5:1 | __ | [ ] |
| Título panel marca | Oscuro | --primary | --primary-foreground | 4.5:1 | __ | [ ] |
| Subtítulo panel marca | Claro | --primary | --primary-foreground/80 | 4.5:1 | __ | [ ] |
| Subtítulo panel marca | Oscuro | --primary | --primary-foreground/80 | 4.5:1 | __ | [ ] |
| Icon BrandMark | Claro | --accent | --accent-foreground | 3:1 | __ | [ ] |
| Icon BrandMark | Oscuro | --accent | --accent-foreground | 3:1 | __ | [ ] |
| Título formulario | Claro | --background | --foreground | 4.5:1 | __ | [ ] |
| Título formulario | Oscuro | --background | --foreground | 4.5:1 | __ | [ ] |
| Etiquetas campos | Claro | --background | --foreground | 4.5:1 | __ | [ ] |
| Etiquetas campos | Oscuro | --background | --foreground | 4.5:1 | __ | [ ] |
| Input border | Claro | --background | --input | 3:1 | __ | [ ] |
| Input border | Oscuro | --background | --input | 3:1 | __ | [ ] |
| Botón primario | Claro | --primary | --primary-foreground | 4.5:1 | __ | [ ] |
| Botón primario | Oscuro | --primary | --primary-foreground | 4.5:1 | __ | [ ] |
| Enlaces | Claro | --background | --primary | 4.5:1 | __ | [ ] |
| Enlaces | Oscuro | --background | --primary | 4.5:1 | __ | [ ] |
| Focus ring | Claro | --background | --ring | 3:1 | __ | [ ] |
| Focus ring | Oscuro | --background | --ring | 3:1 | __ | [ ] |

**Estado**: ⏳ Pendiente de verificación manual por el usuario

---

## 4. Verificación del Script Anti-Flash (R5.1, R5.3)

### 4.1 Especificación del Requisito

**R5.3**: "WHEN la App_Cliente arranca sin una Sesion válida, THE Proveedor_Tema SHALL inicializar las variables CSS de color con los valores predeterminados de la Marca_Dego antes del primer renderizado de la Pantalla_Login, sin mostrar transitoriamente un Color_Tema de ninguna Organizacion."

### 4.2 Implementación

**Ubicación**: `app/layout.tsx`

```typescript
const SCRIPT_ANTI_FLASH_DEGO = `(function(){
  try{
    var h=0,s=0,l=0.18;
    var p="oklch("+l+" "+s+" "+h+")";
    var r=document.documentElement;
    r.style.setProperty("--primary",p);
    r.style.setProperty("--sidebar-accent",p);
    r.style.setProperty("--ring",p);
    r.style.setProperty("--chart-1",p);
    r.style.setProperty("--chart-2","oklch("+(l+0.1)+" "+(s*0.8)+" "+h+")");
    r.style.setProperty("--chart-3","oklch("+(l-0.15)+" "+s+" "+h+")");
    r.style.setProperty("--chart-4","oklch("+(l+0.15)+" "+(s*0.5)+" "+h+")");
    r.style.setProperty("--chart-5","oklch("+(l-0.05)+" "+(s*1.1)+" "+h+")");
  }catch(e){}
})();`

// Inyectado en <head>:
<script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_FLASH_DEGO }} />
```

### 📝 Checklist Manual - Anti-Flash

**Instrucciones**: El usuario debe verificar la efectividad del script:

#### Prueba 1: Carga Inicial sin Sesión

1. [ ] Cerrar todas las pestañas de la aplicación
2. [ ] Limpiar localStorage (opcional: simular primera visita)
3. [ ] Abrir la aplicación en una nueva pestaña
4. [ ] **Verificar**: No se observa flash de color de ninguna organización
5. [ ] **Verificar**: La pantalla de login aparece inmediatamente con la paleta Dego (negro/neutral)
6. [ ] **Verificar**: No hay FOUC (Flash of Unstyled Content)

#### Prueba 2: Recarga con Color de Organización en localStorage

1. [ ] Login y seleccionar una organización con color personalizado (diferente a Dego)
2. [ ] Esperar a que el color se aplique
3. [ ] Cerrar sesión (logout)
4. [ ] **Verificar**: La pantalla de login vuelve inmediatamente a la paleta Dego
5. [ ] **Verificar**: No se observa transitoriamente el color de la organización

#### Prueba 3: Navegación desde Página con Color Personalizado

1. [ ] Login y navegar a una sección con color de organización aplicado
2. [ ] Forzar navegación directa a `/login` (o logout)
3. [ ] **Verificar**: No hay flash del color previo de la organización
4. [ ] **Verificar**: Transición suave a paleta Dego

#### Prueba 4: Conexión Lenta Simulada

1. [ ] Abrir DevTools → Network tab
2. [ ] Establecer throttling: "Slow 3G"
3. [ ] Recargar la página
4. [ ] **Verificar**: Incluso con carga lenta, no se observa flash de color
5. [ ] **Verificar**: El script anti-flash se ejecuta antes que React

**Resultado esperado**: 
- **0 frames** con color incorrecto visible
- Paleta Dego aplicada **antes del primer paint**
- Sin FOUC ni flash de contenido sin estilo

**Estado**: ⏳ Pendiente de verificación manual por el usuario

---

## 5. Resumen de Verificación

### 5.1 Estado de Verificación Automática

**Completado por Kiro**:
- ✅ Análisis estático de código: Todos los textos verificados están en español
- ✅ Constantes de marca: Configuradas correctamente
- ✅ Mensajes de toast: Todos en español
- ✅ Implementación técnica de re-render: Mecanismo correcto (aplicación síncrona)
- ✅ Script anti-flash: Implementado y con valores correctos
- ✅ Paleta Dego: COLOR_TEMA_DEGO configurado correctamente (HSL 0, 0%, 18%)

### 5.2 Pendiente de Verificación Manual por Usuario

**Requiere inspección visual + herramientas**:
- ⏳ **Idioma**: Verificar visualmente que TODOS los textos visibles están en español
- ⏳ **Tiempo de re-render**: Medir con DevTools Performance (< 1000ms, idealmente < 100ms)
- ⏳ **Contraste WCAG**: Medir ratios con herramientas de contraste (≥4.5:1 texto, ≥3:1 UI)
- ⏳ **Anti-flash**: Verificar que no hay flash de color en carga inicial

### 5.3 Limitaciones de Verificación Automática

**Nota importante del requisito R3.9**:
> "Esta tarea es de verificación manual (no automatizable). Nota: la validación completa de WCAG requiere pruebas manuales con tecnologías de asistencia y revisión experta."

**Aspectos que NO se pueden automatizar completamente**:
1. **Percepción visual real** del tiempo de re-render (puede ser < 100ms pero sentirse más lento por otros factores)
2. **Contraste en contexto real** (herramientas miden colores computados, pero el contexto visual afecta la legibilidad)
3. **Accesibilidad completa** con lectores de pantalla (JAWS, NVDA, VoiceOver)
4. **Usabilidad** en diferentes dispositivos y tamaños de pantalla
5. **Flash perceptible** (depende de hardware, refresh rate, etc.)

### 5.4 Próximos Pasos para el Usuario

1. **Desplegar la aplicación** o ejecutar en modo development (`pnpm dev`)
2. **Seguir las instrucciones** de las secciones 1-4 de este documento
3. **Marcar los checkboxes** según vaya completando cada verificación
4. **Documentar hallazgos** si encuentra problemas de idioma, contraste o rendimiento
5. **Actualizar este archivo** con los resultados medidos en la columna "Medido" de la tabla de contraste

---

## 6. Referencias

### Documentos del Proyecto

- **Requirements**: `.kiro/specs/identidad-marca-dego/requirements.md`
- **Design**: `.kiro/specs/identidad-marca-dego/design.md`
- **Tasks**: `.kiro/specs/identidad-marca-dego/tasks.md`

### Archivos Relevantes

- `components/auth/login-screen.tsx` - LoginScreen con Layout_Split
- `app/layout.tsx` - Script anti-flash
- `hooks/use-identidad-visual.tsx` - IdentidadVisualProvider
- `lib/tema/aplicar-color.ts` - Función de aplicación de color
- `lib/marca.ts` - Constantes de marca
- `lib/schemas/configuracion.ts` - COLOR_TEMA_DEGO

### Estándares y Herramientas

- **WCAG 2.1 AA**: https://www.w3.org/WAI/WCAG21/quickref/
- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **axe DevTools**: https://www.deque.com/axe/devtools/
- **Chrome DevTools Performance**: https://developer.chrome.com/docs/devtools/performance/

---

**Documento generado por**: Kiro (Task 9.3 execution)  
**Versión**: 1.0  
**Estado**: Pendiente de verificación manual por el usuario
