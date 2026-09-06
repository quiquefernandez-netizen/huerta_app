# Diseño de interfaz

## Estado

La aplicación admite dos direcciones visuales sobre la misma estructura:

- **Plano:** nombre del diseño actual. Está disponible y sigue siendo provisional.
- **Aero:** cristal nocturno inspirado en el lenguaje visual Aero de Windows Vista. Está disponible.

El nombre de producto continúa retirado de la interfaz visible: el panel se identifica de forma neutra como «la comunidad» mientras Dani trabaja el nombre definitivo. Para facilitar la instalación en móvil, el manifiesto PWA usa provisionalmente **La Huerta** como nombre y nombre corto de la aplicación instalada. Incluye iconos Android de 192 y 512 píxeles, una variante maskable y un service worker para cumplir el flujo de instalación como aplicación. Desde septiembre de 2026 se prueba una primera interpretación digital de su símbolo; continúa siendo una propuesta y no un cierre de identidad.

## Concepto de logo de Dani

El boceto original propone una marca vertical muy sencilla: un recipiente abierto, una franja de líquido rosado y un único trazo que conecta la parte superior con un pie horizontal. La primera prueba digital conserva esos rasgos, usa grafito y rosa apagado, y evita añadir hojas, texto u otros significados que no están en el dibujo.

La propuesta se muestra en la barra lateral, la cabecera móvil, el acceso, el favicon y el manifiesto PWA. El archivo `frontend/assets/logo-dani-concept.png` tiene fondo transparente y suficiente margen para probarlo como icono. Antes de considerarlo definitivo, Dani debe decidir:

- si el recipiente representa agua, una copa u otro elemento;
- si el trazo superior debe mantener el ángulo del dibujo o ser más geométrico;
- el grosor y la irregularidad deseados;
- el tono final del rosa y si el líquido debe ser una franja o un relleno continuo;
- si necesita una variante monocroma y otra específica para fondos oscuros.

La barra superior compacta reúne el nombre de la sección, el contexto y las acciones principales. No cambia el modo de instalación: la PWA se abre sin URL ni controles del navegador cuando se instala. En móvil el contexto se oculta y los botones conservan una superficie táctil de 40 px para recuperar espacio sin perder claridad. En escritorio la barra lateral muestra solo el símbolo y reduce en 30 px el espacio anterior a la navegación.

## Tema Plano

“Casa y huerta contemporánea”: una interfaz cálida y tranquila, con verde profundo, terracota puntual y fondos claros. Debe sentirse como el panel compartido de una comunidad, no como banca, contabilidad o software empresarial.

## Principios aplicados

- Información principal visible en el primer vistazo.
- Tarjetas y listas cortas en lugar de tablas anchas.
- Texto de 16 px de base, controles táctiles de al menos 44 px.
- Etiquetas junto a iconos; estados expresados con texto además del color.
- Formatos españoles de fecha, moneda y decimales.
- Mensajes humanos para carga, error y éxito.
- Las acciones demo dicen claramente que no persisten.

### Tokens provisionales

| Uso | Valor |
|---|---|
| Verde principal | `#214e3b` |
| Verde oscuro | `#17382b` |
| Terracota | `#bd654d` |
| Azul agua | `#3f7f8b` |
| Amarillo cálido | `#d69c45` |
| Fondo | `#f5f3ec` |
| Texto | `#25312c` |

La interfaz usa tipografía de sistema para cuerpo y Georgia como serif expresiva en cifras y títulos. Se evita cargar fuentes externas.

## Tema Aero

Tema oscuro basado en los rasgos visuales más reconocibles de Aero Glass: transparencias desenfocadas, reflejos, marcos iluminados, sombras profundas y acentos azul/cian. Utiliza Segoe UI y una composición más compacta, pero conserva la jerarquía, los controles grandes y la legibilidad requeridos por la aplicación.

No es una réplica de Windows Vista y no reutiliza fondos, iconos ni otros recursos de Microsoft. Es una reinterpretación para el panel de la comunidad.

### Tokens principales

| Uso | Valor aproximado |
|---|---|
| Fondo nocturno | `#07111f` |
| Vidrio | `rgba(13, 31, 51, 0.78)` |
| Acento cian | `#48c7ff` |
| Texto | `#f3f9ff` |
| Texto secundario | `#a9bfd1` |
| Acento violeta | `#c46aa8` |

Las superficies usan gradientes, `backdrop-filter`, bordes claros semitransparentes y sombras internas. Los navegadores sin desenfoque conservan fondos suficientemente opacos para mantener el contraste.

## Configurador

Se abre desde el botón de perfil. Muestra una previsualización, nombre, descripción y disponibilidad de cada diseño. La elección se guarda únicamente en `localStorage` del dispositivo; no necesita Supabase ni forma parte de los datos personales o contables.

## Responsive

- **Móvil (< 760 px):** navegación inferior, tarjetas apiladas, formularios a una columna y sin desplazamiento horizontal obligatorio.
- **Tablet (760–1120 px):** sidebar compacto y rejillas de dos columnas.
- **Escritorio (> 1120 px):** sidebar fija y paneles más densos sin perder aire.

Medidas de revisión: 360 × 800, 390 × 844, 768 × 1024, 1280 × 800 y 1440 × 900.

## Saldos, cuotas, aportaciones y agua

Familias da protagonismo al total aportado y lo separa en «aplicado a cuota» y «aportación extra». La cuota se presenta como referencia, nunca como una resta ficticia. La ficha conserva los movimientos reales de aportaciones, agua, derramas y adelantos con fecha, concepto y signo. Administración puede cambiar la cuota del ejercicio y ve de inmediato el equivalente anual.

Agua presenta el consumo acumulado desde la última liquidación. «Liquidar agua» abre primero un resumen por familia con lectura anterior, lectura actual, consumo e importe. La confirmación crea cargos familiares que se compensan con cualquier saldo a favor.

Propuestas usa tarjetas breves con estado, fecha y referencia económica. Al abrir una propuesta se ve la explicación completa y una comparación sencilla de todos sus presupuestos, ordenados por importe, sin convertir la pantalla en una tabla empresarial.

La votación vive dentro del detalle de la propuesta: resume el resultado, muestra la situación de cada familia y pide elegir la familia de forma explícita antes de guardar. Administración abre y cierra la votación; mientras esté abierta, una familia puede corregir su decisión.

Reuniones presenta cada encuentro como una tarjeta con fecha, lugar, estado y número de puntos. El detalle muestra un orden del día numerado; en móvil las acciones de edición y orden pasan debajo del texto para conservar áreas táctiles cómodas.

El acta se prepara dentro de la propia reunión. Se divide por puntos con etiquetas claras de resumen y decisión, muestra asistentes y evita un único formulario largo. El cierre es una acción confirmada y explica qué falta antes de permitirlo.

Gastos pregunta de forma explícita si pagó la cuenta común o una o varias familias. Si pagaron familias, permite detallar cuánto adelantó cada una y valida que la suma coincida. Derramas es una acción separada: se eligen participantes y se muestra el reparto antes de confirmar.

## Pendientes de diseño

- Nombre definitivo y tono verbal.
- Validación y refinado del concepto de logo de Dani.
- Sistema de iconografía definitivo.

## Laboratorio de iconografía

`frontend/iconos.html` contiene cuatro propuestas comparables inspiradas en los lenguajes visuales de Android publicados en 2011: Gingerbread, Honeycomb, Holo/ICS y una síntesis propia llamada Huerta Droid. La opción aplicada se identifica en la galería; marcar otra opción guarda únicamente un borrador local y no modifica los iconos del panel.

### Decisión actual: C · Holo esencial para Aero

Se ha seleccionado Holo esencial para el tema Aero. La implementación vive en `frontend/css/iconography.css` y solo se activa cuando Aero está seleccionado. Emplea pictogramas originales con trazo fino, remates rectos, geometría firme y acento azul eléctrico. Plano conserva los iconos cálidos originales y sus colores semánticos. En ambos temas, los textos continúan acompañando a los iconos para preservar la comprensión y la accesibilidad.

El acceso de perfil sigue la misma separación: Aero muestra una silueta de usuario luminosa de estilo Holo y Plano conserva las iniciales del perfil.
- Paleta y tipografías definitivas.
- Radio de tarjetas, densidad y tratamiento de gráficos.
- Posible uso de fotografía o ilustración; no se ha añadido ninguna por ahora.
- Revisión de Aero con Dani y ajustes posteriores de intensidad, brillo y densidad.
