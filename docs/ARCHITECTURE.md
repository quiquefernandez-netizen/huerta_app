# Arquitectura técnica

## Objetivo

Requisito vigente: dos perfiles por contraseña (Normal y Administrador), con varias credenciales administrativas revocables por separado, consulta completa de la comunidad para ambos y eliminación solo para administración. La validación de contraseñas y sesiones ya está diseñada en servidor. Ver [SECURITY.md](SECURITY.md).

Mantener una aplicación pequeña, comprensible y barata de operar. GitHub Pages sirve el frontend estático y Supabase proporciona PostgreSQL, Auth y la API de datos. Supabase será la fuente de verdad cuando termine la conexión; mientras tanto la aplicación continúa usando exclusivamente datos ficticios.

```text
GitHub Pages (HTML + CSS + JavaScript)
                 ↓ HTTPS
Supabase Auth + Data API / funciones PostgreSQL
                 ↓
Supabase PostgreSQL (fuente de verdad)
```

Esta decisión sustituye la previsión inicial de Google Apps Script y Google Sheets. El cambio se documenta expresamente porque modifica la arquitectura descrita originalmente en `AGENTS.md`.

## Frontend

- `frontend/index.html`: estructura accesible, navegación, diálogo reutilizable y recursos.
- `frontend/css/styles.css`: sistema visual mobile-first y breakpoints.
- `frontend/css/themes.css`: temas Plano y Aero.
- `frontend/css/iconography.css`: tratamiento Holo exclusivo de Aero.
- `frontend/js/app.js`: enrutado por hash, vistas y comportamiento de la demo.
- `frontend/js/domain.js`: cálculos puros de dinero, cuotas, agua, repartos y saldos familiares.
- `frontend/js/data/demo-data.js`: único origen de datos ficticios.
- `frontend/js/services/data-service.js`: frontera intercambiable entre demo y Supabase.
- `frontend/js/services/auth-service.js`: sesión anónima de Supabase, desbloqueo por contraseña, persistencia opcional y renovación de token.
- `frontend/config.js`: configuración pública del despliegue.

El enrutado por hash (`#inicio`, `#familias`, etc.) evita reglas de reescritura y permite alojar la aplicación bajo el subdirectorio de GitHub Pages.

## Servicio de datos

La UI llama a `createDataService()` y no conoce el origen de los registros. En modo `demo` mantiene una copia aislada de los datos ficticios durante la sesión. Familias, gastos, derramas y agua pasan por los mismos contratos que usará Supabase. El saldo familiar es derivado, nunca un total editable: aportaciones y adelantos menos cuotas, agua liquidada y derramas.

El adaptador `SupabaseDataService` llama por HTTPS a funciones PostgreSQL y añade el token de sesión cuando Auth lo proporcione, sin guardar ese token en la configuración. Agrupar la lectura inicial en `get_community_snapshot` permite devolver solo el resumen permitido al usuario y evita acoplar cada componente a consultas de tablas. `create_family` crea la ficha y su cuota anual inicial en una sola operación; `create_expense` exige rol administrador; `create_water_reading` valida sesión, familia, contador, secuencia acumulada y tarifa antes de insertar.

El snapshot devuelve a ambos perfiles toda la información comunitaria aprobada. Las identidades técnicas de sesión y la auditoría no forman parte de esa transparencia: el perfil Normal solo ve su sesión técnica y la auditoría queda en administración.

## Supabase

Supabase sustituye a Apps Script y Sheets como capa de persistencia. Sus responsabilidades serán:

- mantener las relaciones, restricciones e importes enteros en PostgreSQL;
- crear una identidad anónima por instalación mediante Supabase Auth y desbloquearla con la contraseña comunitaria;
- filtrar cada lectura y escritura mediante Row Level Security;
- ejecutar validaciones y operaciones atómicas en funciones PostgreSQL o Edge Functions cuando sea necesario;
- registrar auditoría de los cambios relevantes.

La migración `004_phase1_audit.sql` instala triggers sobre familias, cuotas, aportaciones, gastos, lecturas y liquidaciones. La función de trigger se ejecuta con privilegios controlados, omite notas y observaciones del detalle y no puede invocarse directamente desde el cliente.

La autenticación solo se crea cuando `dataSource` vale `supabase`. En modo demo no se solicita contraseña ni se realizan peticiones externas. En modo real, el navegador obtiene un JWT anónimo, envía la contraseña por HTTPS a `unlock-access` y recibe únicamente perfil y caducidad. La Edge Function verifica el JWT y llama con privilegios de servidor a `unlock_access`; PostgreSQL compara bcrypt y crea una sesión revocable. La contraseña nunca se persiste. La opción de recordar usa `localStorage` durante 30 días; sin ella se usa `sessionStorage` durante 12 horas. RLS comprueba la sesión en cada operación.

El esquema local está en `supabase/migrations/`, la Edge Function en `supabase/functions/` y el seed ficticio en `supabase/seed.sql`. No se aplican automáticamente al proyecto remoto.

## Seguridad

- GitHub Pages es público: todo archivo servido al navegador debe considerarse visible.
- Solo se podrá incluir la URL del proyecto y una clave `sb_publishable_...`.
- Nunca se incluirán claves `sb_secret_...`, `service_role`, contraseñas ni cadenas de conexión.
- Todas las tablas expuestas tendrán RLS y permisos mínimos.
- La clave publicable identifica la aplicación; Supabase Auth identifica al usuario.
- Ocultar botones no es una medida de autorización: PostgreSQL debe rechazar cada operación no permitida.
- El acceso previsto será mediante dos contraseñas compartidas y sesión recordable. Los permisos acordados y los criterios de aceptación se detallan en [SECURITY.md](SECURITY.md).

## Integridad

- Dinero: enteros en céntimos (`*_cents`) con restricciones `CHECK`.
- Agua: `numeric(12,3)` en m³ y lecturas acumuladas; las liquidaciones guardan la tarifa aplicada.
- Fechas de negocio: `date`; auditoría: `timestamptz`.
- IDs: UUID estables, nunca posiciones de fila.
- Borrado: preferencia por desactivación o estado; las acciones destructivas requieren confirmación.

## PWA

Se mantiene el Web App Manifest y el uso de rutas relativas. El service worker, caché offline e instalación guiada quedan para Fase 4.
