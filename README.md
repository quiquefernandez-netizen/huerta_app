# Panel de comunidad

Prototipo navegable de una aplicación sencilla para gestionar una pequeña comunidad de propietarios. La interfaz está pensada para móvil, usa únicamente datos ficticios y evita el lenguaje y la densidad visual de un programa contable.

> El producto queda temporalmente sin nombre. El símbolo, la paleta y el estilo siguen siendo provisionales hasta la revisión creativa de Dani.

## Estado actual

Decisión vigente de acceso: dos perfiles, Normal con contraseña compartida y Administrador con posibilidad de varias contraseñas, con consulta de toda la comunidad para ambos y borrado exclusivo de administración. El esquema, los datos demo y la función segura de acceso ya están desplegados en Supabase; faltan habilitar el acceso anónimo y crear las credenciales elegidas por la comunidad. Ver [acceso y permisos](docs/SECURITY.md).

Esta primera iteración cubre solo la base visual de la **Fase 1**:

- Dashboard con saldo, gastos, cuotas, próxima reunión y gráficos sencillos.
- Familias con una cuenta clara de abonos, cargos y saldo a favor o pendiente.
- Cuota demo de 20 € mensuales y 240 € anuales, configurable por ejercicio.
- Histórico ficticio de aportaciones y alta temporal de nuevos pagos.
- Gastos con quién los pagó: cuenta común o una o varias familias, generando saldo a favor cuando adelantaron dinero.
- Derramas repartidas en céntimos entre las familias seleccionadas, con previsualización antes de crear el cargo.
- Agua con lecturas acumuladas; al liquidar, cada importe entra en el saldo familiar y compensa posibles adelantos.
- Navegación desktop y móvil; las fases futuras aparecen como no disponibles.
- Configurador de apariencia con el tema Plano y la entrada preparada para Aero.
- Capa de acceso a datos intercambiable entre datos demo y Supabase.
- Altas de familias, gastos y lecturas a través del servicio, con estado de guardado y error recuperable.
- Pantalla de acceso por contraseña, sesión recordable y cierre de sesión preparada para Supabase.
- Esquema relacional, RLS, RPC, Edge Function y seed ficticio de Fase 1 desplegados en Supabase.
- Auditoría automática preparada para altas, cambios y borrados relevantes.

Mientras `dataSource` siga en `demo`, los cambios realizados desde los formularios viven solo en memoria y se borran al recargar. El backend remoto ya contiene únicamente datos ficticios, pero el frontend no se activará hasta completar y probar los dos accesos. No se han implementado banco, conciliación, propuestas, votaciones, reuniones, actas ni documentos.

La apariencia se cambia desde el botón de perfil. La preferencia es local al navegador y no contiene datos personales. Los temas Plano y Aero están disponibles; Aero reinterpreta el cristal nocturno de Windows Vista sin reutilizar recursos del sistema operativo.

## Arquitectura

```text
GitHub Pages (HTML + CSS + JavaScript)
        ↓ futuro: HTTPS
Supabase Auth + Data API
        ↓
Supabase PostgreSQL (fuente de verdad)
```

No hay dependencias de producción ni proceso de compilación. El frontend puede publicarse directamente en GitHub Pages.

## Ejecutar en local

Requisitos: Node.js 20 o posterior.

```bash
npm run dev
```

Abre `http://127.0.0.1:4173`. Para comprobar móvil en Chrome: abre DevTools, activa la barra de dispositivos y usa como referencia `390 × 844 px`. También se recomienda revisar `360 × 800`, `768 × 1024` y escritorio desde `1280 px`.

## Pruebas

```bash
npm test
npm run check
```

Las pruebas cubren cálculos monetarios, saldos familiares, reparto exacto de derramas, consumo y coste de agua, datos ficticios y estructura mínima de la interfaz.

## Configuración del frontend

`frontend/config.js` contiene solo configuración pública:

```js
globalThis.APP_CONFIG = {
  dataSource: "demo",
  supabaseUrl: "https://rdjcwroddkhmjtfocbdg.supabase.co",
  supabasePublishableKey: ""
};
```

Después de crear y probar los accesos, `dataSource` podrá cambiarse a `supabase`. La URL y la clave publicable ya están preparadas en la configuración pública del cliente; nunca deben añadirse claves secretas, `service_role`, contraseñas ni cadenas de conexión.

## Activar Supabase

La guía completa está en [supabase/README.md](supabase/README.md). En resumen: habilitar accesos anónimos, revisar y aplicar las migraciones, cargar `seed.sql` solo mientras se prueban datos ficticios, desplegar `unlock-access`, crear las credenciales iniciales fuera del repositorio y finalmente activar `dataSource: "supabase"` con la clave publicable.

El backend remoto ya tiene las migraciones `001` a `010`, el seed ficticio y la función `unlock-access`. Los accesos anónimos están habilitados; todavía falta crear las dos contraseñas elegidas por la comunidad antes de activar el frontend.

## Publicar el frontend en GitHub Pages

El directorio publicable es `frontend/`. Puede usarse una GitHub Action que copie su contenido a Pages, o una rama de publicación dedicada. Antes de publicar:

1. Ejecutar `npm test` y `npm run check`.
2. Confirmar que `frontend/config.js` no contiene secretos.
3. Comprobar que las rutas relativas funcionan bajo el subdirectorio del repositorio.
4. Revisar móvil y escritorio.

El repositorio incluye `.github/workflows/pages.yml`, que ejecuta las pruebas y publica `frontend/` al hacer `push` a `main`. En **Settings → Pages**, la fuente debe configurarse como **GitHub Actions**.

## Importar extractos

La importación bancaria pertenece a la Fase 2 y **no está disponible**. El contrato previsto, incluyendo previsualización, duplicados e idempotencia, se documenta en [docs/BANK_IMPORT.md](docs/BANK_IMPORT.md).

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Importación bancaria futura](docs/BANK_IMPORT.md)
- [Diseño](docs/DESIGN.md)
- [Seguridad y permisos](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
