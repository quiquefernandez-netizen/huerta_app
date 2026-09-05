# Supabase — despliegue de Fase 1

Este directorio contiene el backend versionado. Nada se aplica automáticamente al proyecto remoto.

## Contenido

- `migrations/001…009`: esquema, RLS, auditoría, cuenta familiar, contratos RPC y ajustes del catálogo demo.
- `functions/unlock-access`: verifica el JWT anónimo, limita intentos y valida la contraseña solo en servidor.
- `seed.sql`: cinco familias y movimientos exclusivamente ficticios; no contiene credenciales.

Las nueve migraciones, el seed ficticio y la Edge Function están desplegados en el proyecto remoto `rdjcwroddkhmjtfocbdg`, sobre PostgreSQL 17. La función tiene configurados sus orígenes permitidos y un secreto aleatorio para limitar intentos. Falta habilitar Anonymous Sign-Ins, crear los accesos elegidos por la comunidad y realizar la prueba final antes de cambiar el frontend a modo Supabase.

## Antes de desplegar

1. Confirmar en el Dashboard que el proyecto `rdjcwroddkhmjtfocbdg` está vacío o hacer una copia de cualquier dato que ya exista.
2. En **Authentication → Sign In / Providers**, activar **Allow anonymous sign-ins**.
3. Instalar la CLI oficial de Supabase y autenticarla.

No ejecutar `db reset --linked`: esa operación borra el esquema y los datos remotos.

## Aplicar esquema y datos ficticios

Desde la raíz del repositorio:

```bash
supabase login
supabase link --project-ref rdjcwroddkhmjtfocbdg
supabase db push --dry-run
supabase db push --include-seed
```

`--include-seed` es correcto únicamente durante esta fase de pruebas. No debe usarse cuando haya datos reales.

## Configurar y desplegar la Edge Function

Crear localmente un archivo `.env.supabase` —ya queda ignorado por Git— con:

```dotenv
ALLOWED_ORIGINS=http://127.0.0.1:4173,http://localhost:4173,https://quiquefernandez-netizen.github.io
RATE_LIMIT_PEPPER=un-valor-aleatorio-largo-y-unico
```

Después:

```bash
supabase secrets set --env-file .env.supabase
supabase functions deploy unlock-access
```

Supabase proporciona automáticamente a la función la URL y las claves de servidor. No copiarlas a ese archivo ni al repositorio.

## Crear los dos accesos iniciales

La base de datos no incluye contraseñas por diseño. Desde un contexto administrativo del Dashboard se crean una vez:

```sql
select public.create_access_credential('Acceso normal', 'NORMAL', 'CONTRASEÑA_ELEGIDA');
select public.create_access_credential('Administración principal', 'ADMINISTRADOR', 'OTRA_CONTRASEÑA_ELEGIDA');
```

Sustituir los textos en mayúsculas por contraseñas diferentes de al menos 10 caracteres. No guardar esa consulta, no copiarla a Git y no utilizar contraseñas reales durante una demostración. Para añadir otro administrador se repite la segunda llamada con otra etiqueta y contraseña.

La revocación independiente está disponible para el backend:

```sql
select public.revoke_access_credential('UUID_DE_LA_CREDENCIAL');
```

La pantalla de gestión de credenciales queda como siguiente mejora; hasta entonces estas funciones solo se ejecutan desde un contexto administrativo de Supabase.

## Activar el frontend

1. Copiar desde **Settings → API Keys** únicamente una clave publicable `sb_publishable_...`.
2. Completar `frontend/config.js`:

```js
globalThis.APP_CONFIG = {
  dataSource: "supabase",
  supabaseUrl: "https://rdjcwroddkhmjtfocbdg.supabase.co",
  supabasePublishableKey: "sb_publishable_..."
};
```

3. Probar primero en local los accesos Normal y Administrador, un fallo de contraseña, cerrar sesión y «Recordar acceso».
4. Publicar en GitHub Pages solo después de confirmar que el perfil Normal no puede escribir llamando directamente a la API.

La clave publicable puede estar en el frontend porque RLS es la autoridad. Nunca colocar allí una clave secreta, `service_role`, una contraseña o una cadena PostgreSQL.
