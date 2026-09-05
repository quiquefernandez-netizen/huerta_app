// Copia estos valores en config.js cuando se conecte Supabase.
// La URL y la clave publicable son datos de cliente. Nunca añadas una clave
// secreta, service_role, contraseña ni cadena de conexión a este repositorio.
globalThis.APP_CONFIG = {
  dataSource: "demo", // Cambiar a "supabase" tras activar Auth y RLS.
  supabaseUrl: "https://TU_PROYECTO.supabase.co",
  supabasePublishableKey: "sb_publishable_REEMPLAZAR"
};
