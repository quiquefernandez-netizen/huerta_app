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

El fingerprint no usa solo fecha e importe. Combina, tras normalización, fecha, fecha de valor, importe, referencia, concepto y saldo. El nombre del fichero queda fuera de la huella: renombrar un mismo extracto no debe crear movimientos nuevos. Supabase repite la comprobación por esos campos antes de insertar, por lo que la idempotencia no depende únicamente del navegador.

Reimportar el mismo fichero debe producir cero movimientos nuevos y mostrar los duplicados antes de confirmar.

## Reversión

Cada lote se guarda en `import_batches`; cada movimiento conserva su `import_batch_id`. Administración puede consultar el histórico y revertir un lote tras una confirmación explícita. Se eliminan únicamente las aportaciones o gastos creados automáticamente por ese lote. Si un movimiento está enlazado a un gasto manual, la reversión se bloquea hasta corregir esa asignación.

## Conciliación

Las reglas son deterministas, ordenadas por prioridad y revisables desde Administración. Admiten coincidencia «contiene» o «exacta», pueden activarse, desactivarse, editarse y borrarse. Antes de importar, cada ingreso puede asignarse a una familia y cada salida a una categoría de gasto. Después de importar, administración puede pulsar `Revisar` o `Editar` para cambiar el destino, enlazar una salida con un gasto ya registrado o devolver el movimiento a pendiente.

Confirmar una asignación crea o actualiza de forma idempotente la aportación o el gasto vinculado. Cambiar el destino elimina únicamente el registro generado por la conciliación anterior y crea el correcto; el movimiento nunca se duplica. También se pueden aplicar las reglas guardadas a todos los movimientos pendientes.

## Pruebas mínimas de Fase 2

- separadores decimales y fechas españolas;
- cargos, abonos, saldo ausente y filas vacías;
- mismo fichero dos veces;
- movimientos con misma fecha e importe pero distinta referencia;
- regla más específica frente a regla genérica;
- lote parcialmente inválido sin escritura incompleta;
- reversión con y sin entidades relacionadas.
