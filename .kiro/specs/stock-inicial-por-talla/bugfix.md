# Bugfix Requirements Document

## Introduction

Al crear un producto con tallas en el formulario de inventario, el campo "Stock Inicial"
muestra un único control numérico (ej. "0"). Este diseño es incorrecto para productos
con tallas porque no distingue la cantidad disponible por talla, lo que provoca que el
stock inicial se registre como un valor indiferenciado sin posibilidad de desglose. El
bugfix reemplaza ese control simple por un conjunto de campos numéricos —uno por cada
talla configurada— cuando el producto tiene tallas habilitadas.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN el usuario activa tallas para un producto en el formulario de creación THEN el sistema muestra un único campo numérico "Stock Inicial" sin distinción por talla

1.2 WHEN el usuario guarda un producto con tallas usando el campo "Stock Inicial" simple THEN el sistema registra un único valor de stock global ignorando las tallas configuradas

1.3 WHEN el producto tiene tallas definidas y el usuario intenta especificar cantidades distintas por talla THEN el sistema no provee ningún control para capturar esa información

### Expected Behavior (Correct)

2.1 WHEN el usuario activa tallas para un producto y define al menos una talla THEN el sistema SHALL reemplazar el campo "Stock Inicial" simple por un subformulario con un campo numérico por cada talla configurada (ej. S → 2, M → 10, L → 6)

2.2 WHEN el usuario guarda el producto con stock por talla THEN el sistema SHALL registrar el stock inicial de forma desglosada, asociando cada cantidad a su talla correspondiente

2.3 WHEN la lista de tallas configuradas cambia (se añade o elimina una talla) THEN el sistema SHALL actualizar dinámicamente los campos de stock inicial para reflejar únicamente las tallas actualmente definidas

### Unchanged Behavior (Regression Prevention)

3.1 WHEN el producto NO tiene tallas habilitadas THEN el sistema SHALL CONTINUE TO mostrar el campo "Stock Inicial" como un único control numérico

3.2 WHEN el usuario crea un producto sin tallas con un stock inicial numérico THEN el sistema SHALL CONTINUE TO registrar ese valor como el stock global del producto sin cambios en el flujo actual

3.3 WHEN el usuario edita un campo distinto al stock inicial (nombre, SKU, precio, categoría, etc.) THEN el sistema SHALL CONTINUE TO comportarse de la misma manera independientemente de si el producto tiene o no tallas
