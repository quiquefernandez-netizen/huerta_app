# Importación y conciliación bancaria

La primera versión del flujo bancario ya está operativa con extractos XLS, XLSX y CSV. El análisis se realiza en el navegador y la escritura definitiva pasa por funciones protegidas de Supabase.

## Flujo obligatorio

1. Selección manual de XLS, XLSX o CSV.
2. Análisis local o en backend y detección de columnas.
3. Normalización de fechas, texto e importes.
4. Generación de fingerprint estable.
5. Comparación con movimientos existentes.
6. Previsualización con nuevos, duplicados y errores.
7. Confirmación explícita del administrador.
8. Escritura agrupada bajo un `import_batch_id`.
9. Aplicación de reglas deterministas de conciliación en la previsualización.
10. Envío de casos desconocidos a pendientes de revisión.

Nunca se importará un fichero directamente tras seleccionarlo.

## Normalización

El adaptador específico del banco producirá: fecha, fecha de valor, concepto, descripción, importe en céntimos con signo, saldo en céntimos, referencia y campos fuente necesarios para diagnóstico.

El lector localiza la fila cuyo primer encabezado funcional es `Fecha de operación` y normaliza las columnas del extracto aportado por la propiedad.

## Duplicados e idempotencia

El fingerprint no usará solo fecha e importe. Combinará, tras normalización, al menos fecha, importe, referencia cuando exista, concepto, saldo y una identificación del origen/formato. El texto canónico usado para calcular el hash deberá poder auditarse sin guardar datos adicionales innecesarios.

Reimportar el mismo fichero debe producir cero movimientos nuevos y mostrar los duplicados antes de confirmar.

## Reversión

Cada lote se guardará en `IMPORTACIONES`; cada movimiento tendrá `import_batch_id`. Revertir exigirá rol administrador, confirmación, comprobación de dependencias y registro en `AUDITORIA`. No se borrarán silenciosamente gastos o aportaciones asociados.

## Conciliación

Las reglas son deterministas, ordenadas por prioridad y revisables desde Administración. Antes de importar, cada ingreso puede asignarse a una familia y cada salida a una categoría de gasto. Después de importar, administración puede pulsar `Revisar` o `Editar` para cambiar el destino, enlazar una salida con un gasto ya registrado o devolver el movimiento a pendiente. Las correcciones quedan validadas en Supabase y no dependen del JavaScript público.

Crear automáticamente aportaciones o gastos a partir de la conciliación, recordar una decisión nueva desde el propio movimiento y revertir lotes completos siguen pendientes de incrementos posteriores de Fase 2.

## Pruebas mínimas de Fase 2

- separadores decimales y fechas españolas;
- cargos, abonos, saldo ausente y filas vacías;
- mismo fichero dos veces;
- movimientos con misma fecha e importe pero distinta referencia;
- regla más específica frente a regla genérica;
- lote parcialmente inválido sin escritura incompleta;
- reversión con y sin entidades relacionadas.
