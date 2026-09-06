# Roadmap

## Fase 1 — base del producto

### Completado en esta iteración

- Estructura del repositorio y documentación base.
- Modelo relacional previsto para Supabase PostgreSQL.
- Frontend estático, responsive y navegable.
- Dashboard, Familias, Gastos y Agua con datos ficticios.
- Cálculos de cuotas, dinero y agua aislados y probados.
- Adaptador demo y frontera preparada para Supabase.
- Acceso compartido Normal/Administrador con contraseñas validadas en servidor, sesión recordable y revocación independiente.
- Servicios de lectura y escritura de gastos y agua, con estado Guardando y errores recuperables.
- Funciones SQL revisables para snapshot y altas de familia, gasto y lectura de agua.
- Pantalla y servicio local de sesión anónima de Supabase sin email ni cuentas individuales.
- Edge Function de desbloqueo con origen controlado y limitación de intentos.
- RLS con lectura completa para ambos perfiles y escrituras administrativas en esta fase.
- Contratos RPC completos para aportaciones, cuotas, gastos, derramas, lecturas y liquidación de agua.
- Seed idempotente con cinco familias y movimientos exclusivamente ficticios.
- Auditoría automática preparada para las escrituras relevantes de Fase 1.
- Demo de cuota anual configurable, aportaciones individuales y liquidación de agua por lote.
- Cuenta corriente familiar demo con compensación de cuotas, agua, derramas y gastos adelantados.
- Alta demo de gastos pagados desde la cuenta común o por varias familias y creación de derramas selectivas.
- Corrección de gastos y derramas para ambos perfiles, con validación de reparto exacto y sin eliminación.
- Corrección de lecturas no liquidadas; las lecturas liquidadas quedan protegidas en servidor.
- Configuración centralizada en Administración: cuota anual por ejercicio y tarifa de agua versionada.
- Protección del histórico: no se pueden modificar cuotas de ejercicios ya cerrados.
- Módulo Banco con lectura XLS/XLSX/CSV, localización automática de cabecera, previsualización y confirmación explícita.
- Importaciones agrupadas, duplicados validados en cliente y servidor, histórico y reversión segura.
- Conciliación editable de movimientos importados con creación automática de aportaciones y gastos.
- Reglas deterministas configurables desde Administración, aplicables tanto en la previsualización como a movimientos pendientes.
- Manifest inicial para evolución futura a PWA.

### Pendiente dentro de Fase 1

- Concretar las restantes acciones extra de gestión sin añadir restricciones de lectura por familia.
- Crear una pantalla administrativa para altas y revocación de credenciales; la base de datos ya permite varias.

- Revisión visual con Dani y aplicación de su dirección definitiva.
- Desplegar `unlock-access`, configurar sus orígenes y habilitar Anonymous Sign-Ins.
- Probar ambos accesos, persistencia, caducidad y revocación contra el proyecto remoto.
- Completar casos de error de red contra un backend real.

## Fase 2 — banco

El flujo principal está completado: importación XLS/XLSX/CSV, previsualización, idempotencia, persistencia por lotes, conciliación, reglas, bandeja de pendientes, edición posterior e histórico/reversión. Quedan para una iteración posterior los refinamientos que surjan al validar más formatos reales de extracto y una pantalla de detalle de auditoría por lote.

## Fase 3 — vida comunitaria

Completados propuestas, presupuestos, votaciones internas, reuniones, orden del día, actas estructuradas y catálogo documental. Administración prepara el borrador por puntos, indica asistentes, revisa y cierra; un acta cerrada y su reunión quedan protegidas. Documentos permite catalogar enlaces HTTPS, clasificarlos y relacionarlos con gastos, propuestas, reuniones o actas. La subida de binarios queda pendiente hasta decidir el proveedor de almacenamiento.

## Fase 4 — solo tras estabilizar lo anterior

PWA completa, notificaciones, informes, exportación PDF, consultas mediante IA, mejoras de autenticación y copias de seguridad.

## Decisiones abiertas

Nombre, logo, paleta, proveedor de almacenamiento y subida de documentos, formato bancario exacto, precio real de agua, familias y cuotas reales. Hasta resolverlas se usarán datos ficticios.
