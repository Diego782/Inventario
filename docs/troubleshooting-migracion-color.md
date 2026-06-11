# Guía de Resolución de Problemas — Migración de Color

## Tabla de Contenidos

1. [Síntomas Comunes y Soluciones](#síntomas-comunes-y-soluciones)
2. [Diagnóstico Paso a Paso](#diagnóstico-paso-a-paso)
3. [Herramientas de Inspección](#herramientas-de-inspección)
4. [Scripts de Recuperación](#scripts-de-recuperación)
5. [Escalamiento a Desarrollo](#escalamiento-a-desarrollo)

## Síntomas Comunes y Soluciones

### Problema 1: El toast de migración no aparece

**Síntoma**: El usuario reporta que tenía un color personalizado pero nunca vio el mensaje de migración.

**Causas posibles**:
1. La organización ya tiene un color persistido en la BD.
2. El color heredado en `localStorage` es inválido o está ausente.
3. El plazo de oferta de 2 segundos se perdió (carga lenta).
4. Ya se ofreció la migración en esta sesión del navegador.

**Diagnóstico**:
```javascript
// Ejecutar en la consola del navegador
const diagnostico = {
  colorHeredado: localStorage.getItem('invenpro-color'),
  themeHeredado: localStorage.getItem('invenpro-theme'),
  organizacionActiva: 'Ver en React DevTools: use-organizacion-activa',
};
console.log('Diagnóstico:', diagnostico);

// Validar el formato del color heredado
try {
  const color = JSON.parse(localStorage.getItem('invenpro-color') || '{}');
  console.log('Color parseado:', color);
  console.log('¿Es válido?', 
    typeof color.hue === 'number' && 
    typeof color.saturation === 'number' && 
    typeof color.lightness === 'number'
  );
} catch (e) {
  console.error('Color heredado inválido:', e);
}
```

**Soluciones**:
1. **Si el color heredado es inválido**: eliminar las claves y configurar el color manualmente.
   ```javascript
   localStorage.removeItem('invenpro-color');
   localStorage.removeItem('invenpro-theme');
   // Luego configurar desde la UI
   ```
2. **Si la organización ya tiene color**: verificar en la BD y, si es incorrecto, actualizarlo.
   ```sql
   SELECT * FROM configuracion 
   WHERE organizacion_id = 'xxx' 
   AND clave IN ('color_hue', 'color_saturation', 'color_lightness');
   ```
3. **Si la carga es lenta**: optimizar la respuesta del endpoint `/api/configuracion` o incrementar el plazo de oferta (requiere cambio de código).

### Problema 2: La migración falla con error

**Síntoma**: El usuario acepta la migración pero aparece el mensaje "No se pudo completar la migración del color. Inténtalo de nuevo."

**Causas posibles**:
1. Sin conexión a internet.
2. Error 401/403 (sesión expirada o sin organización activa).
3. Error 422 (payload de color inválido).
4. Error 500 (problema del servidor o BD).
5. Timeout (el `PUT` tardó más de lo esperado).

**Diagnóstico**:
```javascript
// Ejecutar en la consola del navegador (con Network tab abierto)
// Intentar la migración manualmente
const colorHeredado = JSON.parse(localStorage.getItem('invenpro-color'));
const payload = {
  color_hue: colorHeredado.hue,
  color_saturation: colorHeredado.saturation,
  color_lightness: colorHeredado.lightness,
};

fetch('/api/configuracion', {
  method: 'PUT',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})
  .then(res => {
    console.log('Status:', res.status);
    return res.json();
  })
  .then(data => console.log('Respuesta:', data))
  .catch(err => console.error('Error:', err));
```

**Soluciones**:
1. **Error 401**: el usuario debe volver a iniciar sesión.
2. **Error 403**: verificar que hay una organización activa seleccionada.
3. **Error 422**: el color heredado tiene valores fuera de rango. Eliminarlo y configurar manualmente.
   ```javascript
   localStorage.removeItem('invenpro-color');
   localStorage.removeItem('invenpro-theme');
   ```
4. **Error 500**: revisar logs del servidor y verificar conectividad con la BD.
5. **Timeout**: incrementar el timeout o verificar la latencia de red.

### Problema 3: Las claves heredadas no se eliminan

**Síntoma**: La migración se completa con éxito pero el mensaje dice "No se pudieron limpiar las claves heredadas."

**Causas posibles**:
1. `localStorage` está en modo de solo lectura (poco común).
2. Extensión del navegador bloqueando la eliminación.
3. Bug en el código de limpieza (verificar `limpiarClavesHeredadas`).

**Diagnóstico**:
```javascript
// Verificar si se pueden eliminar manualmente
try {
  localStorage.removeItem('invenpro-color');
  localStorage.removeItem('invenpro-theme');
  console.log('Limpieza manual exitosa');
  console.log('invenpro-color:', localStorage.getItem('invenpro-color'));
  console.log('invenpro-theme:', localStorage.getItem('invenpro-theme'));
} catch (e) {
  console.error('Error al limpiar:', e);
}
```

**Soluciones**:
1. **Limpieza manual**: eliminar las claves desde las herramientas de desarrollo.
2. **Verificar extensiones**: deshabilitar extensiones del navegador temporalmente.
3. **No es crítico**: el color ya está persistido en la BD (fuente de verdad). Las claves heredadas se ignoran.

### Problema 4: El color no se aplica tras la migración

**Síntoma**: La migración se completa con éxito pero la interfaz sigue mostrando el color por defecto de Dego.

**Causas posibles**:
1. El payload persistido es correcto pero la inyección CSS falla.
2. El color migrado coincide con `COLOR_TEMA_DEGO` (poco común).
3. El estado de React no se actualiza correctamente.

**Diagnóstico**:
```javascript
// Verificar las variables CSS aplicadas
const root = document.documentElement;
const primary = getComputedStyle(root).getPropertyValue('--primary');
console.log('Color primario aplicado:', primary);

// Verificar el estado del provider
// (requiere React DevTools: buscar IdentidadVisualProvider)
```

**Soluciones**:
1. **Recargar la página**: fuerza la recarga del estado.
2. **Verificar el color en la BD**: confirmar que se persistió correctamente.
   ```sql
   SELECT * FROM configuracion 
   WHERE organizacion_id = 'xxx' 
   AND clave IN ('color_hue', 'color_saturation', 'color_lightness');
   ```
3. **Actualizar el color manualmente**: desde la UI de configuración.

### Problema 5: El color se filtra al login

**Síntoma**: Al abrir la pantalla de login sin sesión, se ve el color de una organización en lugar de la paleta Dego.

**Causa**: Bug crítico en el aislamiento (violación de R5.1–R5.5). Este problema **no debería ocurrir** si la implementación es correcta.

**Diagnóstico**:
```javascript
// Verificar las variables CSS en el login
const root = document.documentElement;
const primary = getComputedStyle(root).getPropertyValue('--primary');
console.log('Color en login:', primary);

// Verificar el estado de sesión
console.log('Usuario autenticado:', document.cookie.includes('sesion_invenpro'));
```

**Soluciones**:
1. **Reportar inmediatamente** al equipo de desarrollo (bug crítico).
2. **Workaround temporal**: limpiar `localStorage` y cookies.
3. **Verificar el script anti-flash** en `app/layout.tsx`.

## Diagnóstico Paso a Paso

### Para Usuarios Finales (Soporte de Primera Línea)

1. **Verificar conexión a internet**: ¿el usuario está conectado?
2. **Recargar la página**: soluciona problemas de estado obsoleto.
3. **Verificar sesión**: ¿el usuario está autenticado? ¿Tiene una organización seleccionada?
4. **Intentar configuración manual**: ¿funciona cambiar el color desde la UI?
5. **Si nada funciona**: escalar a soporte técnico de segunda línea.

### Para Soporte Técnico (Segunda Línea)

1. **Reproducir el problema**: intentar replicar el comportamiento en un entorno de pruebas.
2. **Revisar logs del navegador**: abrir la consola (F12) y buscar errores.
3. **Revisar logs del servidor**: buscar errores 5xx en el endpoint `/api/configuracion`.
4. **Inspeccionar `localStorage`**: verificar el formato del color heredado.
5. **Inspeccionar la BD**: verificar que el color se persistió correctamente.
6. **Si el problema persiste**: escalar a desarrollo con toda la información recopilada.

### Para Desarrollo (Tercera Línea)

1. **Revisar el código de orquestación**: `hooks/use-identidad-visual.tsx`, función de migración.
2. **Revisar las pruebas de propiedades**: ¿fallan los tests de P8 o P9?
   ```bash
   pnpm test __tests__/property/migracion-color.test.ts
   ```
3. **Agregar logs temporales**: instrumentar el flujo de migración para capturar el estado.
4. **Verificar el endpoint**: ¿responde correctamente el `PUT /api/configuracion`?
   ```bash
   curl -X PUT http://localhost:3000/api/configuracion \
     -H "Content-Type: application/json" \
     -b "sesion_invenpro=..." \
     -d '{"color_hue":200,"color_saturation":0.5,"color_lightness":0.5}'
   ```
5. **Crear un test de regresión**: reproducir el bug en un test automatizado antes de arreglarlo.

## Herramientas de Inspección

### Herramientas del Navegador

**Chrome/Edge DevTools**:
```
F12 → Application → Storage → Local Storage → https://app.example.com
```
Buscar: `invenpro-color`, `invenpro-theme`

**Console Snippets** (útiles para diagnóstico rápido):

```javascript
// Snippet 1: Inspeccionar color heredado
(function diagnosticoColorHeredado() {
  const color = localStorage.getItem('invenpro-color');
  const theme = localStorage.getItem('invenpro-theme');
  
  console.group('🔍 Diagnóstico: Color Heredado');
  console.log('invenpro-color (raw):', color);
  console.log('invenpro-theme:', theme);
  
  if (color) {
    try {
      const parsed = JSON.parse(color);
      console.log('Parseado:', parsed);
      console.log('¿Válido?', {
        hue: typeof parsed.hue === 'number' && parsed.hue >= 0 && parsed.hue <= 360,
        saturation: typeof parsed.saturation === 'number' && parsed.saturation >= 0 && parsed.saturation <= 1,
        lightness: typeof parsed.lightness === 'number' && parsed.lightness >= 0 && parsed.lightness <= 1,
      });
    } catch (e) {
      console.error('❌ Color inválido:', e);
    }
  } else {
    console.log('✅ No hay color heredado (normal tras la migración)');
  }
  console.groupEnd();
})();

// Snippet 2: Inspeccionar variables CSS aplicadas
(function diagnosticoCSS() {
  const root = document.documentElement;
  const vars = [
    '--primary',
    '--sidebar-accent',
    '--ring',
    '--chart-1',
    '--chart-2',
  ];
  
  console.group('🎨 Variables CSS Aplicadas');
  vars.forEach(v => {
    const value = getComputedStyle(root).getPropertyValue(v);
    console.log(`${v}:`, value);
  });
  console.groupEnd();
})();

// Snippet 3: Simular migración manual
(async function migrarManualmente() {
  const colorRaw = localStorage.getItem('invenpro-color');
  if (!colorRaw) {
    console.log('❌ No hay color heredado para migrar');
    return;
  }
  
  const color = JSON.parse(colorRaw);
  const payload = {
    color_hue: color.hue,
    color_saturation: color.saturation,
    color_lightness: color.lightness,
  };
  
  console.log('📤 Enviando payload:', payload);
  
  try {
    const res = await fetch('/api/configuracion', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    console.log('📥 Status:', res.status);
    const data = await res.json();
    console.log('📥 Respuesta:', data);
    
    if (res.ok) {
      console.log('✅ Migración exitosa. Limpiando localStorage...');
      localStorage.removeItem('invenpro-color');
      localStorage.removeItem('invenpro-theme');
      console.log('✅ Limpieza completa. Recarga la página.');
    } else {
      console.error('❌ Migración fallida. Las claves heredadas se conservan.');
    }
  } catch (e) {
    console.error('❌ Error de red:', e);
  }
})();
```

### Consultas SQL

**Verificar color de una organización**:
```sql
SELECT 
  c.clave,
  c.valor,
  c.actualizado_en
FROM configuracion c
WHERE c.organizacion_id = 'UUID-DE-LA-ORG'
  AND c.clave IN ('color_hue', 'color_saturation', 'color_lightness')
ORDER BY c.clave;
```

**Contar organizaciones con color personalizado**:
```sql
SELECT COUNT(DISTINCT organizacion_id) AS total
FROM configuracion
WHERE clave = 'color_hue'
  AND valor <> '0'; -- Excluir el hue por defecto de Dego
```

**Listar organizaciones sin color persistido**:
```sql
SELECT o.id, o.nombre
FROM organizaciones o
LEFT JOIN configuracion c ON c.organizacion_id = o.id AND c.clave = 'color_hue'
WHERE c.valor IS NULL OR c.valor = '0';
```

**Auditoría de cambios recientes**:
```sql
SELECT 
  organizacion_id,
  clave,
  valor,
  actualizado_en
FROM configuracion
WHERE clave IN ('color_hue', 'color_saturation', 'color_lightness')
  AND actualizado_en > NOW() - INTERVAL 7 DAY
ORDER BY actualizado_en DESC;
```

## Scripts de Recuperación

### Script 1: Restaurar color por defecto de Dego

```sql
-- Eliminar el color personalizado de una organización
DELETE FROM configuracion
WHERE organizacion_id = 'UUID-DE-LA-ORG'
  AND clave IN ('color_hue', 'color_saturation', 'color_lightness');

-- Verificar
SELECT * FROM configuracion
WHERE organizacion_id = 'UUID-DE-LA-ORG'
  AND clave IN ('color_hue', 'color_saturation', 'color_lightness');
-- Debe estar vacío. La app aplicará COLOR_TEMA_DEGO por defecto.
```

### Script 2: Migración manual masiva desde CSV

Si tienes un CSV con colores heredados de múltiples organizaciones:

```csv
organizacion_id,hue,saturation,lightness
uuid-org-1,210,0.65,0.55
uuid-org-2,120,0.50,0.45
...
```

```sql
-- Preparar tabla temporal
CREATE TEMPORARY TABLE temp_colores (
  organizacion_id CHAR(36),
  hue DECIMAL(5,2),
  saturation DECIMAL(5,4),
  lightness DECIMAL(5,4)
);

-- Cargar desde CSV
LOAD DATA LOCAL INFILE '/path/to/colores.csv'
INTO TABLE temp_colores
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Insertar/actualizar en configuracion
INSERT INTO configuracion (organizacion_id, clave, valor, actualizado_en)
SELECT organizacion_id, 'color_hue', CAST(hue AS CHAR), NOW() FROM temp_colores
ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = NOW();

INSERT INTO configuracion (organizacion_id, clave, valor, actualizado_en)
SELECT organizacion_id, 'color_saturation', CAST(saturation AS CHAR), NOW() FROM temp_colores
ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = NOW();

INSERT INTO configuracion (organizacion_id, clave, valor, actualizado_en)
SELECT organizacion_id, 'color_lightness', CAST(lightness AS CHAR), NOW() FROM temp_colores
ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = NOW();

-- Limpiar
DROP TEMPORARY TABLE temp_colores;
```

### Script 3: Limpieza masiva de claves heredadas (cliente)

**ADVERTENCIA**: Solo ejecutar si se confirma que todas las migraciones se completaron.

```javascript
// Ejecutar en la consola del navegador de cada usuario
(function limpiarClavesHeredadasMasivo() {
  const claves = ['invenpro-color', 'invenpro-theme'];
  let eliminadas = 0;
  
  claves.forEach(clave => {
    if (localStorage.getItem(clave)) {
      localStorage.removeItem(clave);
      eliminadas++;
    }
  });
  
  if (eliminadas > 0) {
    console.log(`✅ Eliminadas ${eliminadas} claves heredadas.`);
  } else {
    console.log('✅ No hay claves heredadas (ya limpio).');
  }
})();
```

## Escalamiento a Desarrollo

### Información a Recopilar Antes de Escalar

Cuando un problema no se puede resolver en soporte, recopilar **toda** esta información antes de escalarlo:

1. **Descripción del problema**: ¿qué esperaba el usuario? ¿qué sucedió en realidad?
2. **Pasos para reproducir**: secuencia exacta de acciones que llevan al problema.
3. **Logs del navegador**: captura de pantalla de la consola (errores en rojo).
4. **Network tab**: captura del request/response del `PUT /api/configuracion` (si aplica).
5. **Datos de sesión**:
   - ¿El usuario está autenticado?
   - ¿Qué organización tiene seleccionada?
   - ¿Qué rol/permisos tiene?
6. **Estado de `localStorage`**:
   - Valor de `invenpro-color` (si existe).
   - Valor de `invenpro-theme` (si existe).
7. **Estado en la BD**:
   - Resultado de la consulta SQL del color de la organización.
8. **Variables CSS aplicadas**:
   - Valor de `--primary` en `document.documentElement`.
9. **Entorno**:
   - Navegador y versión.
   - Sistema operativo.
   - URL del entorno (producción, staging, dev).

### Plantilla de Ticket

```markdown
**Título**: Problema con la migración de color de [Org Name / Org ID]

**Descripción**:
[Descripción clara del problema]

**Pasos para reproducir**:
1. [Paso 1]
2. [Paso 2]
3. [Paso 3]

**Resultado esperado**:
[Qué debería suceder]

**Resultado actual**:
[Qué sucede en realidad]

**Logs del navegador**:
```
[Pegar logs aquí]
```

**Request/Response**:
```json
// PUT /api/configuracion
{
  "color_hue": 210,
  "color_saturation": 0.65,
  "color_lightness": 0.55
}
// Response: ...
```

**Estado de localStorage**:
- `invenpro-color`: `{"hue":210,"saturation":0.65,"lightness":0.55,"name":"azul"}`
- `invenpro-theme`: `"dark"`

**Estado en BD**:
```sql
-- Resultado de la consulta
...
```

**Entorno**:
- Navegador: Chrome 120.0.6099.109
- SO: macOS 14.2
- URL: https://app.dego.com

**Severidad**: [Crítica / Alta / Media / Baja]

**Prioridad**: [Urgente / Alta / Normal / Baja]
```

---

**Última actualización**: 2025-01-XX  
**Versión**: 1.0  
**Mantenedor**: Equipo de desarrollo Dego
