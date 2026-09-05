const proposals = {
  gingerbread: { title: "A · Gingerbread cálido", copy: "Botones táctiles y reconocibles." },
  honeycomb: { title: "B · Honeycomb nocturno", copy: "Cristal oscuro y brillo cian." },
  holo: { title: "C · Holo esencial", copy: "Trazos limpios y carácter técnico." },
  huerta: { title: "D · Cálido Droid", copy: "Nostalgia Android adaptada al panel de la comunidad." }
};

const storageKey = "huerta.iconDraft";
const cards = [...document.querySelectorAll("[data-variant]")];
const selectionBar = document.querySelector(".selection-bar");
const selectionTitle = document.querySelector("[data-selection-title]");
const selectionCopy = document.querySelector("[data-selection-copy]");

function setSelection(id) {
  const proposal = proposals[id];
  if (!proposal) return;

  cards.forEach((card) => {
    const selected = card.dataset.variant === id;
    card.classList.toggle("is-selected", selected);
    card.querySelector(".choose-button").setAttribute("aria-pressed", String(selected));
  });
  selectionBar.classList.add("has-selection");
  selectionTitle.textContent = proposal.title;
  selectionCopy.textContent = `${proposal.copy} La elección queda guardada solo como borrador.`;

  try {
    localStorage.setItem(storageKey, id);
  } catch {
    // La galería sigue funcionando aunque el navegador bloquee el almacenamiento local.
  }
}

document.querySelectorAll("[data-choose]").forEach((button) => {
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => setSelection(button.dataset.choose));
});

try {
  const saved = localStorage.getItem(storageKey);
  if (saved) setSelection(saved);
} catch {
  // Sin preferencia inicial; no afecta a la comparación.
}
