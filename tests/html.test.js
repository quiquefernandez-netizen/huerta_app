import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, safeCssColor } from "../frontend/js/html.js";

test("los textos procedentes de datos no pueden inyectar HTML", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert('x')"> & texto`), "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; texto");
});

test("solo se aceptan colores hexadecimales seguros", () => {
  assert.equal(safeCssColor("#3f7f8b"), "#3f7f8b");
  assert.equal(safeCssColor("red; background:url(x)"), "#748078");
});
