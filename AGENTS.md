# AGENTS.md
# Comunidad — Mini ERP para comunidad de propietarios

## Decisiones posteriores del propietario — vigentes

Estas decisiones sustituyen las previsiones incompatibles del documento original:

- Alojamiento en GitHub Pages y persistencia futura en Supabase.
- Dos perfiles de acceso: Normal, con contraseña compartida, y Administrador, que admite varias contraseñas distintas. Cada credencial administrativa podrá revocarse por separado.
- No pedir email, enlace mágico ni cuenta individual a cada familia.
- Ambos perfiles pueden consultar toda la información de la comunidad, incluidas todas las familias, cuotas, aportaciones, gastos y agua. No filtrar la consulta por familia.
- Solo Administrador puede eliminar. Las otras acciones extra de administración se concretarán; no dar por aprobada una matriz detallada de creación o edición.
- Ofrecer recordar la sesión en el dispositivo. Guardar una sesión revocable y con caducidad, nunca la contraseña en almacenamiento del frontend.
- Validar las contraseñas y el rol en backend; no incluir contraseñas reales ni su comprobación como mecanismo de seguridad en JavaScript público.
- El acceso normal compartido identifica el perfil, no a una persona concreta. En administración se podrá identificar la credencial utilizada; solo se atribuirá a una persona si se le ha asignado expresamente. No atribuir acciones a una familia por defecto.
- Antes de conectar Supabase, adaptar el código anterior de acceso por email, el snapshot y las políticas RLS a estas decisiones.
- Cuota ordinaria inicial: 20 € mensuales por familia, equivalente a 240 € anuales. Debe configurarse por año y conservar el histórico; nunca cambiar ejercicios anteriores al modificar un año nuevo.
- Cada ingreso se registra como una aportación independiente con fecha e importe. La cuota es una referencia para distinguir qué parte de lo aportado la cubre y qué parte es aportación extra; no se resta del saldo familiar. El saldo compensa aportaciones y gastos adelantados menos agua liquidada y derramas.
- El agua se liquida desde la lectura incluida en la última liquidación hasta la lectura actual. Administración revisa una previsualización y confirma el lote completo; el importe individual entra como cargo y se compensa con cualquier saldo a favor.
- Un gasto registra una salida real y quién la pagó. Si sale de la cuenta común reduce el saldo bancario; si la adelanta una o varias familias, el importe pagado se abona a sus saldos familiares. El gasto no crea por sí solo un reparto adicional.
- Una derrama es un cargo extraordinario distinto del gasto. Administración elige las familias participantes, previsualiza el reparto exacto en céntimos y solo esas familias reciben el cargo.

Ver `docs/SECURITY.md` para el alcance y los criterios de aceptación. La demo sigue usando exclusivamente datos ficticios.

## 1. Objetivo del proyecto

Construir una aplicación web sencilla para gestionar una pequeña comunidad privada formada actualmente por 5 familias.

La aplicación debe permitir gestionar:

- Familias.
- Aportaciones y cuotas.
- Movimientos bancarios.
- Importación de extractos bancarios Excel/CSV.
- Conciliación bancaria.
- Gastos.
- Consumos individuales de agua.
- Contadores.
- Presupuestos.
- Propuestas de mejoras.
- Votaciones.
- Reuniones de comunidad.
- Órdenes del día.
- Actas.
- Documentos.
- Configuración general.

No es un ERP empresarial ni debe convertirse en uno.

La prioridad absoluta es:

1. Simplicidad.
2. Facilidad de uso.
3. Claridad visual.
4. Fiabilidad de los datos.
5. Buen funcionamiento en móvil.
6. Mantenimiento sencillo.
7. Coste de infraestructura prácticamente cero.

La aplicación será utilizada por muy pocas personas y el volumen de datos será pequeño.

---

# 2. Filosofía del producto

Esta aplicación debe sentirse como:

"El panel de nuestra comunidad"

y NO como:

"Un programa de contabilidad".

Debe poder utilizarla una persona mayor sin formación informática.

Evitar:

- Interfaces recargadas.
- Terminología contable innecesaria.
- Tablas enormes.
- Menús complicados.
- Formularios largos.
- Exceso de configuración.
- Funciones empresariales que no aporten valor.

Priorizar:

- Tarjetas.
- Resúmenes.
- Estados visuales.
- Botones grandes.
- Iconos fáciles de entender.
- Textos claros.
- Navegación evidente.
- Diseño mobile-first.

---

# 3. Arquitectura

Arquitectura prevista:

Frontend
↓
Google Apps Script API
↓
Google Sheets

## Frontend

Aplicación web estática.

Preferencia:

- HTML
- CSS
- JavaScript

Se pueden utilizar librerías ligeras cuando aporten valor real.

No introducir frameworks pesados sin necesidad.

Debe poder desplegarse mediante GitHub Pages.

Nunca incluir secretos, contraseñas reales, IDs privados o credenciales dentro del repositorio público.

## Backend

Google Apps Script.

Responsabilidades:

- Lectura/escritura en Google Sheets.
- Validación de datos.
- Importación de movimientos.
- Conciliación.
- Reglas de negocio.
- Gestión de permisos básicos.
- API para el frontend.

## Base de datos

Google Sheets.

Sheets será la fuente de verdad de los datos.

Diseñar la estructura de hojas como si fuera una pequeña base de datos relacional.

Cada registro debe tener un ID único estable.

No depender del número de fila como identificador.

---

# 4. Seguridad

La aplicación es privada y contiene información de una comunidad pequeña.

No contiene inicialmente información especialmente crítica.

Aun así:

- Nunca almacenar credenciales reales en GitHub.
- Nunca exponer secretos de Apps Script en frontend.
- Validar datos también en backend.
- No confiar exclusivamente en validaciones JavaScript.
- Evitar almacenar información personal innecesaria.

Inicialmente queremos un acceso muy sencillo.

Debe existir:

- Sesión de usuario.
- Rol administrador.
- Rol vecino.

La primera versión puede implementar un sistema sencillo, pero la arquitectura debe permitir mejorar posteriormente la autenticación.

IMPORTANTE:

Una contraseña estática incluida directamente en JavaScript NO debe considerarse seguridad válida.

Si se implementa contraseña compartida, debe validarse en backend y nunca quedar visible en el repositorio.

---

# 5. Roles

## ADMINISTRADOR

Puede:

- Importar extractos bancarios.
- Conciliar movimientos.
- Corregir conciliaciones.
- Crear/modificar familias.
- Configurar cuotas.
- Registrar gastos.
- Modificar precio del agua.
- Gestionar reuniones.
- Crear/modificar propuestas.
- Registrar resultados de votaciones.
- Gestionar documentos.
- Modificar configuración.

## VECINO

Puede:

- Consultar dashboard.
- Consultar movimientos permitidos.
- Consultar estado de aportaciones.
- Consultar gastos.
- Introducir lectura de su contador.
- Consultar sus consumos.
- Consultar propuestas.
- Votar cuando corresponda.
- Consultar reuniones.
- Consultar actas.
- Consultar documentación autorizada.

La aplicación debe estar preparada para limitar información por rol.

---

# 6. Navegación principal

La navegación inicial será:

1. Inicio
2. Familias
3. Banco
4. Gastos
5. Agua
6. Propuestas
7. Reuniones
8. Documentos
9. Administración

En móvil utilizar navegación adaptada.

No mostrar Administración a usuarios sin permisos.

---

# 7. Dashboard

La pantalla Inicio debe mostrar inmediatamente el estado general de la comunidad.

Ejemplos de tarjetas:

SALDO ACTUAL
2.847 €

INGRESOS DEL AÑO
4.350 €

GASTOS DEL AÑO
3.122 €

CUOTAS
4 de 5 familias al corriente

AGUA
460 € este año

ELECTRICIDAD
780 € este año

PRÓXIMA REUNIÓN
18 octubre

MOVIMIENTOS PENDIENTES
3 por conciliar

También mostrar gráficos sencillos:

- Gastos por categoría.
- Evolución mensual de gastos.
- Evolución de saldo.
- Consumo de agua.

Los gráficos deben ser útiles y no decorativos.

---

# 8. Familias

Actualmente existen 5 familias.

No hardcodear el número 5.

La aplicación debe permitir añadir/eliminar/desactivar familias.

Entidad Familia:

- id
- nombre
- nombre_corto
- miembros
- activa
- notas
- fecha_alta

Vista de familias mediante tarjetas.

Ejemplo:

Familia Quique

Aportado este año: 600 €
Pendiente: 0 €
Agua pendiente: 18,40 €
Estado: AL CORRIENTE

Al pulsar:

- Resumen.
- Aportaciones.
- Cuotas.
- Agua.
- Histórico.
- Observaciones.

---

# 9. Cuotas y aportaciones

Debe diferenciarse entre:

CUOTA
Cantidad que una familia debería aportar.

APORTACIÓN
Dinero realmente recibido.

Permitir:

- Cuotas mensuales.
- Cuotas anuales.
- Derramas extraordinarias.
- Aportaciones extraordinarias.

Estados:

- Pagada.
- Parcial.
- Pendiente.
- Excedida.

Nunca calcular simplemente "ha pagado / no ha pagado".

Debe permitirse pago parcial.

Ejemplo:

Cuota anual: 600 €
Aportado: 450 €
Pendiente: 150 €

---

# 10. Banco

NO habrá conexión automática con ninguna entidad bancaria.

Los movimientos se introducirán mediante importación manual de un extracto descargado del banco.

Flujo:

Banco
→ Importar extracto
→ Seleccionar archivo
→ Analizar
→ Previsualizar
→ Detectar duplicados
→ Importar
→ Conciliar

Formatos prioritarios:

- XLSX
- CSV

La arquitectura debe permitir añadir formatos posteriormente.

---

# 11. Importación bancaria

NUNCA importar directamente sin mostrar previamente un resumen.

Flujo obligatorio:

1. Usuario selecciona archivo.
2. Aplicación analiza columnas.
3. Detecta formato.
4. Normaliza datos.
5. Busca duplicados.
6. Presenta preview.
7. Usuario confirma.
8. Se importan movimientos nuevos.
9. Se ejecuta conciliación.

Campos normalizados:

- id
- fecha
- fecha_valor
- concepto
- descripción
- importe
- saldo
- referencia
- hash_importacion
- conciliado
- categoria_id
- familia_id
- regla_id
- notas

Generar fingerprint/hash estable para reducir duplicados.

Nunca usar únicamente fecha + importe para detectar duplicados.

---

# 12. Conciliación bancaria

La conciliación es una función central.

Cuando entra un movimiento:

Ejemplo:

TRANSFERENCIA ENRIQUE FERNANDEZ
+100 €

La aplicación debe intentar identificar:

Familia Quique
→ Aportación comunidad

Otro ejemplo:

IBERDROLA CLIENTES
-183,27 €

Debe poder reconocer:

Electricidad
→ Gasto general

---

# 13. Reglas de conciliación

Crear sistema sencillo de reglas.

Ejemplo:

Si concepto contiene:
"FERNANDEZ"

Entonces:
familia = Quique
tipo = aportación

Otro:

Si concepto contiene:
"IBERDROLA"

Entonces:
categoría = Electricidad

Las reglas deben guardarse.

Campos aproximados:

- id
- patrón
- tipo_match
- familia_id
- categoria_id
- prioridad
- activa
- contador_usos

No utilizar IA para resolver algo que puede resolverse mediante reglas deterministas.

---

# 14. Aprendizaje de conciliación

Cuando un movimiento no se reconoce:

Mostrar:

"No sabemos dónde colocar este movimiento."

Permitir:

- Elegir familia.
- Elegir categoría.
- Marcar como gasto general.
- Marcar como ingreso.
- Ignorar.
- Añadir nota.

Añadir opción:

"Recordar esta decisión para movimientos similares."

Si está activada:

crear regla de conciliación.

La siguiente vez se aplicará automáticamente.

Debe existir una pantalla:

Administración
→ Reglas de conciliación

para revisar, modificar o eliminar reglas.

---

# 15. Bandeja de movimientos pendientes

Crear una bandeja específica:

"PENDIENTES DE REVISAR"

Ejemplo:

3 movimientos necesitan revisión.

Cada movimiento debe poder resolverse rápidamente.

Objetivo:

conciliar un movimiento desconocido en menos de 15 segundos.

---

# 16. Gastos

Categorías iniciales:

- Agua general
- Electricidad
- Mantenimiento
- Reparaciones
- Mejoras
- Seguros
- Impuestos / tasas
- Material
- Otros

Las categorías deben ser configurables.

Cada gasto:

- id
- fecha
- concepto
- importe
- categoría
- proveedor
- movimiento_bancario_id
- documento_id
- notas

Un gasto puede estar vinculado a un movimiento bancario.

---

# 17. Agua individual

Cada familia dispone de contador individual.

Debe registrarse:

- familia
- contador
- fecha lectura
- lectura
- usuario que introduce lectura
- observaciones

NO almacenar simplemente "litros consumidos".

Guardar lecturas acumuladas del contador.

Consumo:

lectura_actual - lectura_anterior

---

# 18. Unidades del agua

Internamente utilizar una unidad consistente.

Preferencia:

m³

1 m³ = 1000 litros.

La interfaz puede mostrar:

3,4 m³
3.400 litros

cuando resulte útil.

---

# 19. Precio del agua

Debe existir configuración:

precio_m3

Debe permitirse mantener histórico de precios.

Nunca modificar cálculos históricos porque cambie el precio actual.

Cada liquidación debe guardar el precio aplicado en ese momento.

Ejemplo:

Lectura anterior:
31,5 m³

Lectura actual:
35,2 m³

Consumo:
3,7 m³

Precio:
1,85 €/m³

Importe:
6,85 €

---

# 20. Validación de lecturas

No permitir normalmente:

lectura_actual < lectura_anterior

Si sucede:

mostrar advertencia.

Puede significar:

- Error de introducción.
- Sustitución de contador.
- Reinicio del contador.

Debe poder resolverse manualmente por administrador.

---

# 21. Histórico de agua

Mostrar por familia:

- Lecturas.
- Consumo entre lecturas.
- Coste.
- Evolución.
- Total anual.

También vista general comparativa.

Evitar rankings competitivos innecesarios.

El objetivo es informar, no señalar.

---

# 22. Propuestas / mejoras

Los vecinos o administradores podrán registrar propuestas.

Ejemplo:

"Instalar iluminación LED exterior"

Campos:

- id
- título
- descripción
- creador
- fecha
- presupuesto_estimado
- estado
- documentos
- reunión_id
- notas

Estados:

- Idea
- En estudio
- Pendiente de votación
- Aprobada
- Rechazada
- En ejecución
- Finalizada

---

# 23. Presupuestos

Una propuesta puede tener varios presupuestos.

Ejemplo:

Iluminación LED

Empresa A: 850 €
Empresa B: 940 €
Empresa C: 790 €

Guardar:

- proveedor
- importe
- descripción
- documento
- fecha
- observaciones

No limitar a un único presupuesto.

---

# 24. Votaciones

Una propuesta puede someterse a votación.

Opciones iniciales:

- A favor.
- En contra.
- Abstención.

Guardar:

- propuesta
- familia
- voto
- fecha

Evitar voto duplicado de la misma familia.

Debe poder cambiarse el voto mientras la votación esté abierta.

Estados:

- No iniciada.
- Abierta.
- Cerrada.

Mostrar resultado claramente.

IMPORTANTE:

Esta funcionalidad es inicialmente una herramienta organizativa interna.

No asumir automáticamente que una votación digital sustituye los requisitos legales de una junta de propietarios.

---

# 25. Reuniones

Debe existir:

PRÓXIMA REUNIÓN

Mostrar:

- fecha
- hora
- lugar
- estado
- orden del día

Estados:

- Planificada.
- Celebrada.
- Cancelada.

---

# 26. Orden del día

Cada reunión tendrá puntos.

Ejemplo:

1. Estado de cuentas.
2. Consumo de agua.
3. Presupuesto iluminación.
4. Reparación puerta.
5. Ruegos y preguntas.

Cada punto:

- id
- reunión_id
- orden
- título
- descripción
- propuesta_id opcional
- notas

Permitir reordenar los puntos fácilmente.

---

# 27. Actas

Después de celebrar una reunión debe poder generarse su acta.

Por cada punto:

- asunto
- resumen
- decisión
- resultado de votación
- observaciones

El acta tendrá:

- fecha
- asistentes
- contenido
- estado

Estados:

- Borrador.
- Revisada.
- Cerrada.

Una vez cerrada, evitar modificaciones accidentales.

---

# 28. Histórico de reuniones

Mostrar:

2026

18 octubre
12 julio
15 marzo

Al entrar en una reunión pasada:

- Orden del día.
- Asistentes.
- Decisiones.
- Votaciones.
- Acta.
- Documentos.

---

# 29. Documentos

Crear módulo documental sencillo.

Categorías:

- Facturas.
- Presupuestos.
- Actas.
- Recibos.
- Contratos.
- Otros.

No guardar archivos binarios dentro de Google Sheets.

Guardar:

- id
- nombre
- tipo
- fecha
- URL/referencia
- entidad relacionada
- notas

El sistema de almacenamiento real podrá decidirse posteriormente.

---

# 30. Configuración

Administración → Configuración

Debe permitir configurar:

- Nombre de comunidad.
- Precio actual del agua.
- Categorías de gasto.
- Tipos de cuota.
- Familias.
- Parámetros generales.
- Reglas de conciliación.

Evitar constantes de negocio hardcodeadas.

---

# 31. Estructura de Google Sheets

Propuesta inicial de hojas:

CONFIG
FAMILIAS
USUARIOS
CUOTAS
APORTACIONES
MOVIMIENTOS
REGLAS_CONCILIACION
CATEGORIAS
GASTOS
CONTADORES
LECTURAS_AGUA
TARIFAS_AGUA
LIQUIDACIONES_AGUA
PROPUESTAS
PRESUPUESTOS
VOTACIONES
REUNIONES
ORDEN_DIA
ACTAS
DOCUMENTOS
AUDITORIA

Codex puede modificar esta estructura si existe una razón técnica clara.

Debe documentar cualquier cambio.

---

# 32. Auditoría

Registrar acciones importantes:

- Importación bancaria.
- Conciliaciones manuales.
- Modificación de movimientos.
- Cambio de lecturas.
- Cambio de cuotas.
- Cierre de votaciones.
- Cierre de actas.

Campos:

- fecha
- usuario
- acción
- entidad
- entidad_id
- detalle

No hace falta registrar cada clic.

---

# 33. Diseño

El diseño es parte importante del proyecto.

Debe ser:

- Moderno.
- Familiar.
- Elegante.
- Discreto.
- Amable.
- Claro.
- Mobile-first.
- Responsive.

NO debe parecer:

- Software bancario.
- ERP empresarial.
- Aplicación infantil.
- Panel técnico.
- Hoja Excel disfrazada.

Debe funcionar especialmente bien en móvil.

---

# 34. Diseño de Dani

Dani participará como responsable creativo del look & feel.

Sus propuestas pueden definir:

- Nombre.
- Logo.
- Paleta.
- Iconografía.
- Tarjetas.
- Distribución.
- Estilo visual.

Codex NO debe interpretar "familiar" como "infantil".

Cuando se proporcionen bocetos, imágenes o indicaciones de Dani:

respetarlas como referencia principal de diseño.

Principio de UX:

"Una persona mayor debe entender qué hacer sin recibir instrucciones."

---

# 35. Accesibilidad

Usar:

- Tipografía suficientemente grande.
- Contraste correcto.
- Botones grandes.
- Áreas táctiles cómodas.
- Etiquetas además de iconos cuando sea necesario.
- Estados que no dependan exclusivamente del color.

Evitar textos diminutos.

---

# 36. Responsive

Prioridades:

1. Smartphone.
2. Tablet.
3. Escritorio.

Todas las funciones principales deben poder utilizarse desde móvil.

No crear tablas que requieran desplazamiento horizontal constante.

En móvil transformar tablas complejas en tarjetas cuando tenga sentido.

---

# 37. Formato regional

Aplicación orientada a España.

Idioma inicial:

Español.

Formato fecha:

DD/MM/YYYY

Moneda:

EUR (€)

Decimales:

coma visual cuando corresponda.

Ejemplo:

1.234,56 €

Internamente utilizar formatos numéricos seguros y no strings formateados.

---

# 38. PWA

Preparar el frontend para poder convertirse en PWA.

Objetivo futuro:

"Añadir a pantalla de inicio"

en Android/iPhone.

No es obligatorio implementar todas las capacidades offline en MVP.

Pero evitar decisiones arquitectónicas que impidan convertirla posteriormente en PWA.

---

# 39. Estados de carga y errores

Nunca dejar una pantalla aparentemente bloqueada.

Mostrar:

- Cargando...
- Guardando...
- Importando...
- Conciliando...

Los errores deben explicarse en lenguaje humano.

MAL:

Error 500.

BIEN:

"No hemos podido guardar la lectura. Comprueba la conexión y vuelve a intentarlo."

---

# 40. Confirmaciones

Solicitar confirmación para operaciones destructivas:

- Eliminar.
- Revertir importación.
- Cerrar acta.
- Cerrar votación.
- Borrar regla.
- Cambiar datos históricos.

No pedir confirmación para acciones triviales.

---

# 41. Integridad de datos

El dinero es información importante.

Nunca utilizar valores flotantes de JavaScript para operaciones monetarias sensibles sin controlar precisión.

Preferiblemente trabajar internamente con céntimos enteros.

Ejemplo:

18,40 €
→ 1840

Evitar errores de redondeo.

---

# 42. Importaciones repetidas

Una misma hoja bancaria puede subirse varias veces accidentalmente.

El sistema debe ser idempotente.

Ejemplo:

Primera importación:
100 movimientos nuevos.

Segunda importación del mismo fichero:
0 movimientos nuevos.
100 duplicados detectados.

Nunca duplicar movimientos silenciosamente.

---

# 43. Deshacer importación

Cada importación tendrá:

import_batch_id

Debe ser posible identificar qué movimientos entraron en una importación concreta.

Idealmente:

Administración
→ Histórico de importaciones
→ Ver importación
→ Revertir

Solo administrador.

---

# 44. Datos de prueba

Crear seed/demo data.

Usar nombres ficticios.

Ejemplo:

Familia Roble
Familia Olivo
Familia Pino
Familia Encina
Familia Almendro

Nunca introducir datos personales reales en el repositorio.

Los datos demo deben permitir probar toda la aplicación.

---

# 45. Consultas inteligentes

NO implementar IA en el primer MVP.

Pero diseñar servicios de consulta de datos que posteriormente permitan preguntar:

"¿Quién tiene pagos pendientes?"

"¿Cuánto hemos gastado en electricidad este año?"

"¿Cuánto dinero tenemos?"

"¿Cuánto ha aportado cada familia?"

"¿Cuál ha sido el gasto de agua este año?"

Primero construir datos fiables.

La IA será una capa posterior.

---

# 46. Código

Prioridades:

- Código legible.
- Componentes pequeños.
- Nombres claros.
- Separación frontend/backend.
- Evitar duplicación.
- Comentarios solo cuando aporten información.
- Sin sobreingeniería.

Antes de añadir una dependencia:

preguntarse si realmente hace falta.

---

# 47. Estructura recomendada

/
├── AGENTS.md
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── BANK_IMPORT.md
│   ├── DESIGN.md
│   └── ROADMAP.md
├── frontend/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── assets/
├── apps-script/
│   ├── Code.gs
│   └── ...
└── tests/

Puede adaptarse si existe una estructura mejor.

---

# 48. Documentación obligatoria

Mantener:

README.md

Debe explicar:

- Qué es el proyecto.
- Arquitectura.
- Cómo ejecutar localmente.
- Cómo configurar Google Sheets.
- Cómo configurar Apps Script.
- Cómo desplegar frontend.
- Cómo desplegar backend.
- Cómo configurar variables.
- Cómo importar extractos.

docs/ARCHITECTURE.md

Arquitectura técnica.

docs/DATA_MODEL.md

Modelo completo de Sheets.

docs/BANK_IMPORT.md

Sistema de importación y conciliación.

docs/DESIGN.md

Sistema visual decidido con Dani.

docs/ROADMAP.md

Fases pendientes.

---

# 49. Testing

Añadir pruebas especialmente para:

- Cálculos monetarios.
- Consumo de agua.
- Tarifas.
- Detección de duplicados.
- Normalización bancaria.
- Reglas de conciliación.
- Cuotas pendientes.
- Pagos parciales.

No considerar terminada una funcionalidad crítica sin probar sus casos límite.

---

# 50. MVP — FASE 1

Construir primero:

1. Estructura proyecto.
2. Datos demo.
3. Layout.
4. Navegación.
5. Dashboard.
6. Familias.
7. Cuotas/aportaciones.
8. Gastos.
9. Agua.
10. Backend Apps Script.
11. Persistencia Sheets.

Debe existir una aplicación navegable y visualmente coherente antes de implementar funcionalidades avanzadas.

---

# 51. FASE 2

Después:

1. Importación bancaria.
2. Preview.
3. Duplicados.
4. Conciliación.
5. Reglas aprendidas.
6. Bandeja pendientes.
7. Histórico de importaciones.

---

# 52. FASE 3

Después:

1. Propuestas.
2. Presupuestos.
3. Votaciones.
4. Reuniones.
5. Orden del día.
6. Actas.
7. Documentos.

---

# 53. FASE 4

Posteriormente:

- PWA completa.
- Notificaciones.
- Informes.
- Exportación PDF.
- Consultas mediante IA.
- Mejoras de autenticación.
- Copias de seguridad.
- Otras automatizaciones.

NO implementar Fase 4 hasta que las anteriores sean estables.

---

# 54. Regla fundamental para Codex

NO intentes construir todo el proyecto en una única iteración.

Trabaja por fases pequeñas y verificables.

Antes de modificar código:

1. Inspecciona el repositorio.
2. Lee AGENTS.md.
3. Lee documentación relacionada.
4. Comprende la arquitectura existente.
5. Haz un plan corto.
6. Implementa.
7. Ejecuta pruebas.
8. Comprueba errores.
9. Documenta cambios relevantes.

No reescribir módulos que funcionan correctamente sin una razón.

No cambiar arquitectura porque "otra tecnología sería mejor" salvo problema real.

---

# 55. Primera ejecución de Codex

Si el repositorio está vacío:

NO empieces implementando todo.

Primero:

1. Crea estructura inicial.
2. Crea documentación.
3. Define modelo de datos.
4. Implementa frontend con datos mock.
5. Construye dashboard.
6. Construye navegación responsive.
7. Implementa Familias.
8. Implementa Agua.
9. Deja puntos claros para conectar Apps Script.

El objetivo de esta primera iteración es obtener una aplicación visual funcional con datos ficticios.

Queremos poder abrirla con Dani, verla en móvil y escritorio y decidir:

"Nos gusta / no nos gusta / cambiaríamos esto."

ANTES de dedicar tiempo a toda la lógica bancaria.

---

# 56. Decisiones pendientes

NO inventar decisiones importantes que todavía no se hayan tomado.

Marcar claramente como TODO cuestiones como:

- Nombre definitivo de la aplicación.
- Logo.
- Paleta definitiva.
- Diseño definitivo de Dani.
- Proveedor/estructura de documentos.
- Sistema definitivo de autenticación.
- Formato exacto del Excel del banco.
- Precio real del agua.
- Familias reales.
- Cuotas reales.

Usar datos ficticios mientras tanto.

---

# 57. Definition of Done

Una tarea se considera terminada cuando:

- Funciona.
- Es usable en móvil.
- No rompe funcionalidades existentes.
- Tiene estados de error.
- Tiene estados de carga cuando corresponda.
- Los cálculos son correctos.
- Se han probado casos principales.
- La documentación se actualiza si cambia arquitectura o modelo.
- No contiene secretos.
- No contiene datos personales reales.
- No deja errores relevantes en consola.

---

# 58. Principio final

Ante cualquier decisión de producto, priorizar en este orden:

1. ¿Lo entiende fácilmente una familia?
2. ¿Funciona bien desde el móvil?
3. ¿Los datos son fiables?
4. ¿Es sencillo de mantener?
5. ¿Es visualmente agradable?
6. ¿Es técnicamente elegante?

La sofisticación técnica nunca debe ganar a la simplicidad de uso.
