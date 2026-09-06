# Modelo de datos de Supabase PostgreSQL

## Convenciones

- Cada entidad se representa como una tabla relacional en PostgreSQL.
- Todos los registros tienen `id` UUID único y estable.
- Relaciones mediante campos `*_id`; vacío significa relación opcional.
- Dinero en céntimos enteros (`INTEGER`). La UI convierte a euros.
- Agua en m³ (`DECIMAL`) con precisión máxima recomendada de tres decimales.
- Fechas de negocio como `date`; instantes como `timestamptz`.
- Booleanos PostgreSQL, no textos libres.
- Los catálogos configurables no se hardcodean en la lógica del frontend.
- Todas las tablas expuestas deben tener RLS y permisos mínimos.

## Tablas de Fase 1

### CONFIG

| Campo | Tipo | Notas |
|---|---|---|
| key | TEXT PK | Ej. `community_name`; no guardar secretos |
| value | JSONB | Valor validado según la clave |
| description | TEXT | Explicación para administración |
| updated_at | TIMESTAMPTZ | Último cambio |

### FAMILIAS

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| nombre | TEXT | Nombre visible |
| nombre_corto | TEXT | Etiqueta breve |
| miembros | INTEGER | Número agregado, sin datos personales innecesarios |
| activa | BOOLEAN | Permite desactivar sin borrar histórico |
| notas | TEXT | Opcional |
| fecha_alta | DATE | Alta en comunidad |

### USUARIOS

Perfil técnico de la sesión anónima de Supabase. No representa obligatoriamente a una persona ni solicita email. La auditoría identifica la sesión y la credencial compartida empleada, no una familia o persona concreta.

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| familia_id | TEXT FK | Campo heredado opcional; no se usa para filtrar lecturas |
| nombre | TEXT | Etiqueta de la credencial empleada |
| rol | ENUM | `ADMINISTRADOR`, `NORMAL` |
| activo | BOOLEAN | Acceso habilitado |
| ultimo_acceso_en | DATETIME | Opcional |

### PRIVATE.ACCESS_CREDENTIALS

Tabla no expuesta por la API. Conserva `id`, `label`, `role`, `password_hash`, `active`, fechas de creación, cambio y revocación. Cada contraseña administrativa tiene su propia fila y puede revocarse sin afectar a las demás. Solo se almacena bcrypt.

### PRIVATE.APP_SESSIONS

Relaciona el usuario anónimo de Supabase con la credencial usada, caducidad y revocación. RLS consulta esta tabla mediante funciones `SECURITY DEFINER`; el navegador no puede leerla.

### PRIVATE.ACCESS_ATTEMPTS

Contador temporal de intentos con una clave de cliente anonimizada mediante SHA-256 y un secreto de servidor. No almacena contraseñas ni direcciones IP en claro.

### PLANES_CUOTA

Configuración común por ejercicio. Cambiar la cuota de un año nuevo no modifica los anteriores.

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| ejercicio | INTEGER UNIQUE | Año al que se aplica |
| importe_mensual_cents | INTEGER | Inicialmente 2.000 céntimos en demo |
| importe_anual_cents | INTEGER | 12 mensualidades; se materializa para conservar el acuerdo |
| activa | BOOLEAN | Plan vigente para el ejercicio |
| creada_en | DATETIME | Auditoría básica |

### CUOTAS

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| familia_id | TEXT FK | → FAMILIAS |
| plan_cuota_id | TEXT FK | → PLANES_CUOTA |
| tipo | ENUM | `MENSUAL`, `ANUAL` |
| concepto | TEXT | Descripción clara |
| periodo_inicio | DATE | Inicio aplicable |
| periodo_fin | DATE | Fin aplicable |
| importe_cents | INTEGER | Importe esperado |
| vencimiento | DATE | Opcional |
| estado | ENUM | `PENDIENTE`, `PARCIAL`, `PAGADA`, `EXCEDIDA` |
| activa | BOOLEAN | Control operativo |
| notas | TEXT | Opcional |

### APORTACIONES

Cada pago recibido es un registro independiente. Los totales mostrados por familia se calculan sumando estos registros; no se sobrescribe un acumulado como fuente de verdad.

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| familia_id | TEXT FK | → FAMILIAS |
| cuota_id | TEXT FK | → CUOTAS; opcional |
| movimiento_bancario_id | TEXT FK | → MOVIMIENTOS; opcional y único |
| creada_desde_banco | BOOLEAN | Distingue aportaciones generadas por conciliación |
| fecha | DATE | Fecha recibida |
| importe_cents | INTEGER | Positivo |
| tipo | ENUM | `ORDINARIA`, `EXTRAORDINARIA` |
| concepto | TEXT | Descripción |
| notas | TEXT | Opcional |

### CATEGORIAS

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| nombre | TEXT UNIQUE | Nombre visible |
| tipo | ENUM | `GASTO`, `INGRESO` |
| color | TEXT | Color de interfaz, no único indicador de estado |
| orden | INTEGER | Orden de presentación |
| activa | BOOLEAN | Sin borrar histórico |

### GASTOS

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| fecha | DATE | Fecha del gasto |
| concepto | TEXT | Requerido |
| importe_cents | INTEGER | Positivo; la naturaleza de gasto la da la entidad |
| categoria_id | TEXT FK | → CATEGORIAS |
| proveedor | TEXT | Opcional |
| origen_pago | ENUM | `CUENTA_COMUNIDAD`, `FAMILIAS` |
| movimiento_bancario_id | TEXT FK | → MOVIMIENTOS; opcional y único |
| creado_desde_banco | BOOLEAN | Permite corregir/revertir solo gastos generados automáticamente |
| documento_id | TEXT FK | → DOCUMENTOS; opcional |
| notas | TEXT | Opcional |
| creado_por_usuario_id | TEXT FK | → USUARIOS |
| creado_en | DATETIME | Auditoría básica |

### GASTO_PAGADORES

Solo contiene filas cuando una o varias familias han pagado el gasto fuera de la cuenta común. Cada importe genera un abono en la cuenta de esa familia.

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| gasto_id | TEXT FK | → GASTOS |
| familia_id | TEXT FK | → FAMILIAS |
| importe_cents | INTEGER | Parte pagada realmente por esa familia |

### DERRAMAS

Cargo extraordinario independiente de los gastos. Permite que una actuación se reparta entre todas las familias o únicamente entre las que participan.

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| fecha | DATE | Fecha efectiva |
| concepto | TEXT | Motivo claro |
| importe_total_cents | INTEGER | Total exacto |
| estado | ENUM | `BORRADOR`, `ACTIVA`, `ANULADA` |
| notas | TEXT | Opcional |

### DERRAMA_FAMILIAS

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| derrama_id | TEXT FK | → DERRAMAS |
| familia_id | TEXT FK | → FAMILIAS |
| importe_cents | INTEGER | Cargo individual; la suma coincide con la derrama |

### CONTADORES

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| familia_id | TEXT FK | → FAMILIAS |
| codigo | TEXT | Referencia visible |
| unidad | ENUM | Inicialmente `M3` |
| fecha_alta | DATE | Instalación/alta |
| lectura_inicial_m3 | DECIMAL | Base acumulada |
| activo | BOOLEAN | Un contador activo por familia normalmente |
| fecha_baja | DATE | Opcional |
| motivo_baja | TEXT | Cambio o reinicio |

### LECTURAS_AGUA

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| familia_id | TEXT FK | → FAMILIAS, redundancia controlada para consulta |
| contador_id | TEXT FK | → CONTADORES |
| fecha_lectura | DATE | Fecha efectiva |
| lectura_m3 | DECIMAL | Acumulada, no consumo |
| usuario_id | TEXT FK | → USUARIOS |
| observaciones | TEXT | Opcional |
| validacion_estado | ENUM | `VALIDA`, `REQUIERE_REVISION`, `AJUSTADA` |
| creada_en | DATETIME | Registro técnico |

### TARIFAS_AGUA

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| vigente_desde | DATE | Inicio inclusivo |
| vigente_hasta | DATE | Opcional, fin inclusivo |
| precio_cents_m3 | INTEGER | Tarifa por m³ en céntimos |
| activa | BOOLEAN | Vigencia operativa |
| notas | TEXT | Motivo o referencia |

Las tarifas no se sobrescriben para alterar liquidaciones ya emitidas. Administración crea una nueva vigencia desde la fecha actual; la tarifa anterior conserva su final de vigencia y cada liquidación mantiene además el precio aplicado.

## Modelo de liquidación de agua

Una pulsación de «Liquidar agua» crea un lote y una liquidación individual por familia dentro de la misma transacción. Cada importe es un cargo de la cuenta familiar y se compensa automáticamente con sus abonos.

### LOTES_LIQUIDACION_AGUA

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | Agrupa una liquidación completa |
| periodo_desde | DATE | Fecha de la liquidación anterior |
| periodo_hasta | DATE | Última fecha incluida |
| tarifa_id | TEXT FK | → TARIFAS_AGUA |
| consumo_total_m3 | DECIMAL | Suma verificable |
| importe_total_cents | INTEGER | Suma de familias |
| estado | ENUM | `BORRADOR`, `EMITIDA`, `ANULADA` |
| creado_por_credencial_id | TEXT FK | Credencial administrativa usada |
| creada_en | DATETIME | Confirmación del lote |

### LIQUIDACIONES_AGUA — detalle por familia

| Campo | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ID estable |
| familia_id | TEXT FK | → FAMILIAS |
| lote_id | TEXT FK | → LOTES_LIQUIDACION_AGUA |
| contador_id | TEXT FK | → CONTADORES |
| lectura_anterior_id | TEXT FK | → LECTURAS_AGUA |
| lectura_actual_id | TEXT FK | → LECTURAS_AGUA |
| consumo_m3 | DECIMAL | Valor materializado y verificable |
| tarifa_id | TEXT FK | → TARIFAS_AGUA |
| precio_aplicado_cents_m3 | INTEGER | Congela el precio histórico |
| importe_cents | INTEGER | Resultado redondeado |
| estado | ENUM | `PENDIENTE`, `PAGADA`, `ANULADA` |
| creada_en | DATETIME | Instante de cálculo |

## Tablas previstas para Fases 2 y 3

### MOVIMIENTOS

`id`, `import_batch_id`, `fecha`, `fecha_valor`, `concepto`, `descripcion`, `importe_cents` (con signo), `saldo_cents`, `referencia`, `hash_importacion`, `conciliado`, `categoria_id`, `familia_id`, `regla_id`, `notas`, `creado_en`.

### REGLAS_CONCILIACION

`id`, `patron`, `tipo_match`, `familia_id`, `categoria_id`, `tipo_resultado`, `prioridad`, `activa`, `contador_usos`, `creada_en`, `actualizada_en`.

### IMPORTACIONES

Tabla añadida para soportar reversión e idempotencia con claridad: `id`, `nombre_archivo`, `hash_archivo`, `fecha_importacion`, `usuario_id`, `filas_analizadas`, `nuevos`, `duplicados`, `estado`, `revertida_en`, `revertida_por_usuario_id`.

### PROPUESTAS

`id`, `titulo`, `descripcion`, `creador_usuario_id`, `fecha`, `presupuesto_estimado_cents`, `estado`, `reunion_id`, `notas`, `creada_en`, `actualizada_en`.

### PRESUPUESTOS

`id`, `propuesta_id`, `proveedor`, `importe_cents`, `descripcion`, `documento_id`, `fecha`, `observaciones`.

### VOTACIONES

`id`, `propuesta_id`, `familia_id`, `voto`, `fecha`, `estado`; restricción lógica única por `propuesta_id + familia_id`.

### REUNIONES

`id`, `fecha`, `hora`, `lugar`, `estado`, `notas`, `creada_en`, `actualizada_en`.

### ORDEN_DIA

`id`, `reunion_id`, `orden`, `titulo`, `descripcion`, `propuesta_id`, `notas`.

### ACTAS

`id`, `reunion_id`, `fecha`, `asistentes_json`, `contenido`, `estado`, `cerrada_en`, `cerrada_por_usuario_id`.

### ACTA_PUNTOS

Tabla añadida para evitar contenido opaco por punto: `id`, `acta_id`, `orden_dia_id`, `asunto`, `resumen`, `decision`, `resultado_votacion_json`, `observaciones`.

### DOCUMENTOS

`id`, `nombre`, `tipo`, `fecha`, `url`, `entidad_tipo`, `entidad_id`, `visibilidad`, `notas`, `creado_en`. Los binarios se almacenarán en Supabase Storage y la tabla conservará solo la referencia.

### AUDITORIA

`id`, `fecha`, `usuario_id`, `accion`, `entidad`, `entidad_id`, `detalle_json`. Solo acciones relevantes, nunca cada clic.

## Relaciones esenciales

```text
FAMILIAS ─┬─< CUOTAS
          ├─< APORTACIONES
          ├─< DERRAMA_FAMILIAS >─ DERRAMAS
          ├─< GASTO_PAGADORES >─ GASTOS
          ├─< CONTADORES ─< LECTURAS_AGUA
          ├─< LIQUIDACIONES_AGUA >─ TARIFAS_AGUA
          ├─< VOTACIONES >─ PROPUESTAS
          └─< USUARIOS

CATEGORIAS ─< GASTOS >─ MOVIMIENTOS
REUNIONES ─< ORDEN_DIA ─< ACTA_PUNTOS >─ ACTAS
PROPUESTAS ─< PRESUPUESTOS
```

## Cuenta corriente de cada familia

No se guarda un saldo editable. Se calcula siempre desde los documentos de origen:

```text
saldo = aportaciones + gastos adelantados − cuotas − agua liquidada − derramas
```

Un saldo positivo está a favor de la familia; uno negativo está pendiente. Corregir un histórico requiere anular o ajustar el documento origen, nunca sobrescribir el saldo.

## Validaciones críticas de PostgreSQL y servicios

- IDs relacionados deben existir y estar activos cuando corresponda.
- `importe_cents` siempre entero; no aceptar importes ya formateados.
- Una lectura normal no puede ser menor que la anterior del mismo contador.
- Cambiar contador requiere cerrar el anterior y dejar motivo.
- Una liquidación conserva tarifa y precio aplicado aunque cambie la tarifa actual.
- Aportaciones parciales y pagos agrupados conservan cualquier excedente para compensar cargos posteriores.
- La suma de pagadores debe coincidir exactamente con el gasto cuando `origen_pago = FAMILIAS`.
- La suma de `DERRAMA_FAMILIAS` debe coincidir exactamente con el total de la derrama.
- Voto único por familia y propuesta mientras la votación esté abierta.
- Hash de movimiento e importación únicos dentro del alcance definido.
