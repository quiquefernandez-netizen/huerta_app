# Importación bancaria — contrato previsto para Fase 2

La importación bancaria **no está implementada** en esta iteración. Este documento fija límites para que la arquitectura de Fase 1 no los contradiga.

## Flujo obligatorio

1. Selección manual de XLSX o CSV.
2. Análisis local o en backend y detección de columnas.
3. Normalización de fechas, texto e importes.
4. Generación de fingerprint estable.
5. Comparación con movimientos existentes.
6. Previsualización con nuevos, duplicados y errores.
7. Confirmación explícita del administrador.
8. Escritura agrupada bajo un `import_batch_id`.
9. Aplicación de reglas deterministas de conciliación.
10. Envío de casos desconocidos a pendientes de revisión.

Nunca se importará un fichero directamente tras seleccionarlo.

## Normalización

El adaptador específico del banco producirá: fecha, fecha de valor, concepto, descripción, importe en céntimos con signo, saldo en céntimos, referencia y campos fuente necesarios para diagnóstico.

El formato bancario exacto sigue como **TODO** hasta disponer de un extracto anonimizado.

## Duplicados e idempotencia

El fingerprint no usará solo fecha e importe. Combinará, tras normalización, al menos fecha, importe, referencia cuando exista, concepto, saldo y una identificación del origen/formato. El texto canónico usado para calcular el hash deberá poder auditarse sin guardar datos adicionales innecesarios.

Reimportar el mismo fichero debe producir cero movimientos nuevos y mostrar los duplicados antes de confirmar.

## Reversión

Cada lote se guardará en `IMPORTACIONES`; cada movimiento tendrá `import_batch_id`. Revertir exigirá rol administrador, confirmación, comprobación de dependencias y registro en `AUDITORIA`. No se borrarán silenciosamente gastos o aportaciones asociados.

## Conciliación

Las reglas serán deterministas, ordenadas por prioridad y revisables. Una corrección manual podrá crear una regla solo si la persona marca “Recordar esta decisión”. La IA queda fuera del MVP.

## Pruebas mínimas de Fase 2

- separadores decimales y fechas españolas;
- cargos, abonos, saldo ausente y filas vacías;
- mismo fichero dos veces;
- movimientos con misma fecha e importe pero distinta referencia;
- regla más específica frente a regla genérica;
- lote parcialmente inválido sin escritura incompleta;
- reversión con y sin entidades relacionadas.

