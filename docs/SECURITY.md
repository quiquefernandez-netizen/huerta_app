# Acceso y permisos

## Decisión vigente

La comunidad tendrá dos perfiles de acceso: Normal con contraseña compartida y Administrador con posibilidad de varias contraseñas distintas. Cada credencial administrativa podrá desactivarse o revocarse por separado, incluidas sus sesiones, sin afectar a las demás.

| Acción | Normal | Administrador |
|---|---|---|
| Consultar toda la información comunitaria | Sí | Sí |
| Ver todas las familias, cuotas y aportaciones | Sí | Sí |
| Ver todos los gastos, contadores y consumos | Sí | Sí |
| Registrar aportaciones | Sí | Sí |
| Registrar un gasto y sus pagadores | Sí | Sí |
| Crear una derrama y elegir participantes | Sí | Sí |
| Registrar una lectura de agua | Sí | Sí |
| Confirmar una liquidación de agua | No | Sí |
| Crear familias, configurar cuotas y cambiar la tarifa de agua | No | Sí |
| Editar o eliminar registros | No | Sí, con confirmación |
| Gestionar credenciales administrativas | No | Próxima mejora segura |

No se solicitarán emails, enlaces mágicos ni cuentas individuales. No habrá filtros de lectura por familia. La consulta completa requiere haber entrado con contraseña.

## Experiencia prevista

Al abrir sin sesión válida, mostrar un formulario de contraseña y la opción «Recordar acceso en este dispositivo». El servidor determinará el perfil correspondiente a la contraseña. Con sesión recordada válida se entrará directamente. Cerrar sesión permitirá salir o entrar con la otra contraseña.

El navegador guardará una sesión con caducidad y revocable, nunca la contraseña. El almacenamiento concreto se decidirá al implementar el backend compatible con GitHub Pages. Las contraseñas se validarán en servidor, con limitación de intentos; no se añadirán al repositorio, a la configuración pública ni a los datos demo.

Las operaciones de borrado deben comprobar el rol en servidor. Ocultar el botón solo simplifica la interfaz. Cambiar valores del navegador no debe conceder permisos de administración.

El acceso normal compartido permite identificar el perfil o sesión, pero no asegurar quién hizo una acción. En administración se registrará qué credencial se utilizó; podrá llevar un nombre identificativo si se asigna expresamente a una persona. No se atribuirán cambios a una persona o familia por defecto. Las distintas credenciales tendrán inicialmente el mismo perfil administrador; los permisos específicos por usuario siguen pendientes de definición.

## Estado actual y transición

La implementación local ya sustituye el diseño anterior de email y privacidad por familia. Incluye formulario de contraseña, sesión anónima por dispositivo, validación bcrypt en servidor, límite de cinco fallos por quince minutos, caducidad, revocación por credencial y RLS con lectura comunitaria completa para ambos perfiles.

El frontend usa Supabase y las migraciones `001` a `011`, el seed ficticio, los secretos de función y `unlock-access` están desplegados. Anonymous Sign-Ins ya está habilitado. Las altas permitidas al perfil Normal se ejecutan mediante RPC validadas en servidor; el cliente no obtiene permiso directo para editar o borrar tablas. No se usan contraseñas reales en el seed ni en los tests.

## Criterios de aceptación

- Sin sesión: ningún dato comunitario real accesible por la API.
- Contraseña normal: lectura de todos los datos comunitarios, también los de otras familias.
- Contraseña administrativa: la misma lectura y las operaciones extra autorizadas.
- Borrado con sesión normal: rechazado también al llamar directamente a la API.
- Contraseña incorrecta: error claro; intentos repetidos limitados por servidor.
- Sesión recordada: se restaura sin persistir la contraseña.
- Cierre, caducidad o revocación: se requiere volver a entrar.
- Revocar una credencial administrativa invalida sus sesiones y conserva el acceso de las demás credenciales administrativas.
- Manipular el perfil en el navegador no cambia los permisos del servidor.
- Las contraseñas y tokens de sesión nunca se registran en logs o auditoría.

Los textos procedentes de datos se escapan antes de insertarse en HTML y los colores configurables se limitan a valores hexadecimales válidos.
