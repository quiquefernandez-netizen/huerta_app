(function initializeThemeManager() {
  const STORAGE_KEY = "huerta.theme";
  const DEFAULT_THEME_ID = "plano";
  const themes = Object.freeze([
    Object.freeze({
      id: "plano",
      name: "Plano",
      description: "Cálido, claro y familiar.",
      available: true,
      themeColor: "#214e3b"
    }),
    Object.freeze({
      id: "aero",
      name: "Aero",
      description: "Cristal nocturno inspirado en Windows Vista.",
      available: true,
      themeColor: "#07111f"
    })
  ]);

  function getTheme(themeId) {
    return themes.find((theme) => theme.id === themeId);
  }

  function readSavedThemeId() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function getActiveTheme() {
    const current = getTheme(document.documentElement.dataset.theme);
    return current?.available ? current : getTheme(DEFAULT_THEME_ID);
  }

  function applyTheme(themeId, { persist = true } = {}) {
    const theme = getTheme(themeId);
    if (!theme?.available) return { applied: false, theme: theme || null };

    document.documentElement.dataset.theme = theme.id;
    document.documentElement.style.colorScheme = "light";
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor && theme.themeColor) themeColor.content = theme.themeColor;

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, theme.id);
      } catch {
        // La preferencia sigue activa durante la sesión aunque el navegador bloquee el almacenamiento.
      }
    }

    document.dispatchEvent(new CustomEvent("huerta:themechange", { detail: { themeId: theme.id } }));
    return { applied: true, theme };
  }

  const savedThemeId = readSavedThemeId();
  const normalizedSavedThemeId = savedThemeId === "basic" ? "plano" : savedThemeId;
  const savedTheme = getTheme(normalizedSavedThemeId);
  const initialTheme = savedTheme?.available ? savedTheme : getTheme(DEFAULT_THEME_ID);
  applyTheme(initialTheme.id, { persist: savedThemeId === "basic" });

  globalThis.HUERTA_THEME_MANAGER = Object.freeze({
    storageKey: STORAGE_KEY,
    themes,
    getTheme,
    getActiveTheme,
    applyTheme
  });
})();
