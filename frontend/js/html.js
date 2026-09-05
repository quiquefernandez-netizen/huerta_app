export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

export function safeCssColor(value, fallback = "#748078") {
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : fallback;
}
