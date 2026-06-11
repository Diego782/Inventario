# Bugfix Requirements Document

## Introduction

El sistema de guardado de colores del tema en la sección de Configuración no persiste los cambios realizados por el usuario. Cuando el usuario modifica los colores del tema (Primary Color, Secondary Color, Accent Color) y hace clic en "Guardar Cambios", los colores no se guardan en la base de datos y se pierden al recargar la página.

**Impacto:** Los usuarios no pueden personalizar de forma permanente los colores de su tema, lo que afecta negativamente la experiencia de marca y personalización de la aplicación.

**Archivos involucrados:**
- `/components/sections/configuracion-section.tsx` - Componente que intenta guardar colores usando el hook `useTheme` en lugar de `useIdentidadVisual`
- `/app/api/configuracion/route.ts` - Endpoint que ya soporta persistencia de colores (funciona correctamente)
- `/hooks/use-identidad-visual.tsx` - Hook que se comunica correctamente con la API de configuración (funciona correctamente)

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN el usuario modifica los colores del tema en la sección de Configuración usando el selector de color avanzado o los colores predefinidos THEN el sistema solo aplica los cambios en memoria a través de `setPrimaryColor` del hook `useTheme` sin persistir en la base de datos

1.2 WHEN el usuario recarga la página después de haber cambiado los colores del tema THEN el sistema pierde los colores personalizados y vuelve a cargar el color por defecto (Marca Dego) porque los cambios nunca se guardaron en la base de datos

1.3 WHEN el usuario hace clic en "Aplicar Este Color" en el selector avanzado THEN el sistema solo actualiza el estado local de `useTheme` sin invocar el método `actualizarColor` de `useIdentidadVisual` que persiste en la API

### Expected Behavior (Correct)

2.1 WHEN el usuario modifica los colores del tema en la sección de Configuración usando el selector de color avanzado o los colores predefinidos THEN el sistema SHALL persistir los cambios en la base de datos a través del método `actualizarColor` del hook `useIdentidadVisual` invocando `PUT /api/configuracion`

2.2 WHEN el usuario recarga la página después de haber cambiado los colores del tema THEN el sistema SHALL cargar y aplicar los colores personalizados guardados en la base de datos desde `GET /api/configuracion`

2.3 WHEN el usuario hace clic en "Aplicar Este Color" en el selector avanzado THEN el sistema SHALL invocar `actualizarColor` con el formato `{ color_hue, color_saturation, color_lightness }` para persistir en la API y aplicar inmediatamente en la interfaz

2.4 WHEN la persistencia de colores en la API falla THEN el sistema SHALL mostrar un mensaje de error descriptivo usando `toast.error` y mantener los colores previamente guardados sin aplicar los cambios fallidos

### Unchanged Behavior (Regression Prevention)

3.1 WHEN el usuario modifica otros parámetros del sistema (porcentaje de impuesto, dimensiones de etiquetas, configuración de tickets, opciones de inventario) THEN el sistema SHALL CONTINUE TO guardar y cargar correctamente estos valores a través del hook `useConfiguracion`

3.2 WHEN el usuario cambia el modo de pantalla (claro/oscuro) THEN el sistema SHALL CONTINUE TO aplicar correctamente el tema visual sin afectar la persistencia de colores

3.3 WHEN el usuario modifica el logo y nombre de la organización en la tarjeta de identidad THEN el sistema SHALL CONTINUE TO guardar y cargar correctamente estos valores sin interferir con la persistencia de colores

3.4 WHEN el usuario no tiene una organización activa o no ha iniciado sesión THEN el sistema SHALL CONTINUE TO mostrar el color por defecto de Marca Dego sin intentar persistir cambios

3.5 WHEN se carga la identidad visual desde la API (`GET /api/configuracion`) THEN el sistema SHALL CONTINUE TO aplicar correctamente los colores en las variables CSS del documento (`--primary`, `--sidebar-accent`, `--ring`, `--chart-*`)
