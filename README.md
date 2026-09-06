# Panel de comunidad

Aplicación web para gestionar de forma sencilla una pequeña comunidad de propietarios. La interfaz está pensada para móvil y evita el lenguaje y la densidad visual de un programa contable.

> El producto queda temporalmente sin nombre. El símbolo, la paleta y el estilo siguen siendo provisionales hasta la revisión creativa de Dani.

## Estado actual

Decisión vigente de acceso: dos perfiles, Normal con contraseña compartida y Administrador con posibilidad de varias contraseñas, con consulta de toda la comunidad para ambos y borrado exclusivo de administración. El esquema, los datos demo y la función segura de acceso ya están desplegados en Supabase; faltan habilitar el acceso anónimo y crear las credenciales elegidas por la comunidad. Ver [acceso y permisos](docs/SECURITY.md).

El proyecto incluye la base funcional de la **Fase 1** y el flujo bancario principal de la **Fase 2**:

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
- Banco con importación manual XLS/XLSX/CSV, previsualización, duplicados, conciliación y movimientos pendientes.
- Reglas de conciliación editables desde Administración, aplicables automáticamente en la previsualización y a operaciones ya importadas.
- Histórico de importaciones con reversión segura y aportaciones/gastos vinculados a su movimiento bancario.
- Propuestas accesibles para toda la comunidad, con estados claros y varios presupuestos comparables por propuesta.

El frontend local está conectado a Supabase mediante su clave publicable. Las contraseñas se validan en servidor y la sesión, no la contraseña, se conserva en el dispositivo cuando se solicita. Votaciones, reuniones, actas y documentos siguen fuera del alcance actual.

La apariencia se cambia desde el botón de perfil. La preferencia es local al navegador y no contiene datos personales. Los temas Plano y Aero están disponibles; Aero reinterpreta el cristal nocturno de Windows Vista sin reutilizar recursos del sistema operativo.

## Arquitectura

```text
GitHub Pages (HTML + CSS + JavaScript)
        ↓ futuro: HTTPS
Supabase Auth + Data API
        ↓
Supabase PostgreSQL (fuente de verdad)
```

No hay proceso de compilación. El frontend puede publicarse directamente en GitHub Pages; la lectura local de XLS/XLSX usa SheetJS.

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
  dataSource: "supabase",
  supabaseUrl: "https://rdjcwroddkhmjtfocbdg.supabase.co",
  supabasePublishableKey: ""
};
```

La URL y la clave publicable son configuración pública del cliente. Nunca deben añadirse claves secretas, `service_role`, contraseñas ni cadenas de conexión.

## Activar Supabase

La guía completa está en [supabase/README.md](supabase/README.md). En resumen: habilitar accesos anónimos, revisar y aplicar las migraciones, cargar `seed.sql` solo mientras se prueban datos ficticios, desplegar `unlock-access`, crear las credenciales iniciales fuera del repositorio y finalmente activar `dataSource: "supabase"` con la clave publicable.

Las migraciones de Fase 1 y Banco están aplicadas en el proyecto enlazado. Los accesos anónimos, las credenciales compartidas y la función `unlock-access` se gestionan en Supabase sin exponer contraseñas en el repositorio.

## Publicar el frontend en GitHub Pages

El directorio publicable es `frontend/`. Puede usarse una GitHub Action que copie su contenido a Pages, o una rama de publicación dedicada. Antes de publicar:

1. Ejecutar `npm test` y `npm run check`.
2. Confirmar que `frontend/config.js` no contiene secretos.
3. Comprobar que las rutas relativas funcionan bajo el subdirectorio del repositorio.
4. Revisar móvil y escritorio.

El repositorio incluye `.github/workflows/pages.yml`, que ejecuta las pruebas y publica `frontend/` al hacer `push` a `main`. En **Settings → Pages**, la fuente debe configurarse como **GitHub Actions**.

## Importar extractos

Entra con perfil Administrador, abre **Banco** y pulsa el botón superior **Añadir** (iconos `+` y Excel). Selecciona un `.xls`, `.xlsx` o `.csv`, revisa las asignaciones propuestas y confirma al final de la previsualización. Los movimientos quedan editables después y las reglas se gestionan desde **Administración → Reglas de conciliación**. Los detalles técnicos están en [docs/BANK_IMPORT.md](docs/BANK_IMPORT.md).

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Importación bancaria futura](docs/BANK_IMPORT.md)
- [Diseño](docs/DESIGN.md)
- [Seguridad y permisos](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
