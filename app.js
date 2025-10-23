import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

const graphBox = document.getElementById("graph");
const placeholder = document.getElementById("placeholder");
const summaryBox = document.getElementById("summary");
const toastBox = document.getElementById("toast");
const listEl = document.getElementById("entity-list");
const searchInput = document.getElementById("entity-search");
const showAllBtn = document.getElementById("btn-show-all");
const copyBtn = document.getElementById("btn-copy");
const exportSvgBtn = document.getElementById("btn-export-svg");
const exportPngBtn = document.getElementById("btn-export-png");
const depthRadios = Array.from(document.querySelectorAll('input[name="depth"]'));
const toggleRbac = document.getElementById("toggle-rbac");

let schema = null;
let currentSubset = null;
let currentMermaid = "";
let currentFocus = null;
let currentDepth = 1;
let showRBAC = true;

window.currentSubset = currentSubset;

async function init() {
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: {
        primaryColor: "#F8FAFC",
        primaryBorderColor: "#CBD5E1",
        primaryTextColor: "#0F172A",
        lineColor: "#64748B",
        tertiaryColor: "#FFFFFF",
      },
      er: { diagramPadding: 10, fontSize: 12 },
    });

    schema = await loadSchema();
    buildEntityList();
    await refreshGraph();
    bindEvents();
  } catch (error) {
    console.error(error);
    showToast("Error al cargar el diagrama. Revisa la consola.");
  }
}

document.addEventListener("DOMContentLoaded", init);

export async function loadSchema() {
  const response = await fetch("schema.json");
  if (!response.ok) {
    throw new Error("No se pudo cargar schema.json");
  }
  return response.json();
}

function bindEvents() {
  searchInput.addEventListener("input", handleSearch);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const value = searchInput.value.trim();
      if (!value) {
        showToast("");
        return;
      }
      focusEntity(value);
    }
  });

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-entity]");
    if (!button) return;
    const id = button.dataset.entity;
    focusEntity(id);
  });

  listEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const button = event.target.closest("button[data-entity]");
      if (button) {
        focusEntity(button.dataset.entity);
      }
    }
  });

  showAllBtn.addEventListener("click", async () => {
    currentFocus = null;
    highlightList();
    await refreshGraph();
  });

  depthRadios.forEach((radio) => {
    radio.addEventListener("change", async () => {
      if (!radio.checked) return;
      currentDepth = Number(radio.value);
      await refreshGraph();
    });
  });

  toggleRbac.addEventListener("change", async () => {
    showRBAC = toggleRbac.checked;
    buildEntityList();
    await refreshGraph();
  });

  copyBtn.addEventListener("click", copyMermaid);
  exportSvgBtn.addEventListener("click", exportSVG);
  exportPngBtn.addEventListener("click", exportPNG);
}

function handleSearch() {
  const term = searchInput.value.trim().toLowerCase();
  const items = listEl.querySelectorAll("button[data-entity]");
  items.forEach((item) => {
    const text = item.dataset.entity.toLowerCase();
    item.parentElement.hidden = term && !text.includes(term);
  });
}

function buildEntityList() {
  if (!schema) return;
  listEl.innerHTML = "";
  const entities = schema.entities
    .filter((entity) => showRBAC || entity.group !== "rbac")
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const entity of entities) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entity-item";
    button.dataset.entity = entity.id;
    button.setAttribute("role", "option");
    button.setAttribute("tabindex", "0");
    button.innerHTML = `
      <span>${entity.id}</span>
      <span class="entity-group">${entity.group}</span>
    `;
    li.appendChild(button);
    listEl.appendChild(li);
  }
  highlightList();
  handleSearch();
}

async function focusEntity(id) {
  if (!schema) return;
  const exists = schema.entities.find((entity) => entity.id === id);
  if (!exists) {
    showToast("Entidad no encontrada");
    return;
  }
  if (!showRBAC && exists.group === "rbac") {
    showToast("Entidad no encontrada");
    return;
  }
  currentFocus = id;
  highlightList();
  await refreshGraph();
}

function highlightList() {
  const buttons = listEl.querySelectorAll("button[data-entity]");
  buttons.forEach((btn) => {
    const isActive = btn.dataset.entity === currentFocus;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
}

function neighborsGraph(schemaData, focus, depth, includeRBAC) {
  const allow = new Set();
  const byId = new Map(schemaData.entities.map((e) => [e.id, e]));
  const rels = schemaData.relations.slice();

  const isRBAC = (id) => byId.get(id)?.group === "rbac";
  const push = (id) => {
    if (!id) return;
    if (!includeRBAC && isRBAC(id)) return;
    allow.add(id);
  };

  if (!focus) {
    schemaData.entities.forEach((entity) => {
      if (includeRBAC || entity.group !== "rbac") {
        allow.add(entity.id);
      }
    });
  } else {
    push(focus);
    for (let d = 0; d < depth; d += 1) {
      for (const relation of rels) {
        if (allow.has(relation.from)) push(relation.to);
        if (allow.has(relation.to)) push(relation.from);
      }
    }
  }

  const entities = schemaData.entities.filter((entity) => allow.has(entity.id));

  const relations = schemaData.relations.filter((relation) => {
    if (!allow.has(relation.from) || !allow.has(relation.to)) {
      return false;
    }
    if (!includeRBAC) {
      const fromGroup = byId.get(relation.from)?.group;
      const toGroup = byId.get(relation.to)?.group;
      if (fromGroup === "rbac" || toGroup === "rbac") {
        return false;
      }
    }
    return true;
  });

  return { entities, relations };
}

function buildMermaid(subset, options = {}) {
  const { attrsMode = "pkfk" } = options;
  const lines = ["erDiagram"];
  const attrsOf = (entity) => {
    const attrs = entity.attrs || [];
    if (attrsMode === "pkfk") {
      return attrs.filter((attr) => /\b(PK|FK)\b/.test(attr));
    }
    return attrs;
  };

  const formatAttribute = (attr) => {
    const tokens = attr.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return "string value";
    }

    const qualifiers = tokens.filter((token) => /^(?:PK|FK)$/i.test(token));
    const baseTokens = tokens.filter((token) => !/^(?:PK|FK)$/i.test(token));

    if (baseTokens.length === 0) {
      // If we only received qualifiers, fallback to a default name.
      baseTokens.push("value");
    }

    const name = baseTokens.pop();
    const typeToken = baseTokens.length > 0 ? baseTokens.join(" ") : inferType(name);
    const suffix = qualifiers.join(" ");

    return `${typeToken} ${name}${suffix ? ` ${suffix}` : ""}`;
  };

  const sortedEntities = [...subset.entities].sort((a, b) => a.id.localeCompare(b.id));
  for (const entity of sortedEntities) {
    lines.push(`  ${entity.id} {`);
    const attributes = attrsOf(entity);
    if (attributes.length === 0) {
      lines.push("    int id PK");
    } else {
      attributes.forEach((attr) => lines.push(`    ${formatAttribute(attr)}`));
    }
    lines.push("  }");
  }

  const typeMap = {
    "1-N": "||--o{",
    "1-1": "||--||",
    "N-N": "}o--o{",
  };

  const uniqueRelations = dedupeRelations(subset.relations);
  const sortedRelations = uniqueRelations.sort((a, b) => {
    const keyA = `${a.from}|${a.to}|${a.label}`;
    const keyB = `${b.from}|${b.to}|${b.label}`;
    return keyA.localeCompare(keyB);
  });

  for (const relation of sortedRelations) {
    const connector = typeMap[relation.type] || "||--o{";
    lines.push(`  ${relation.from} ${connector} ${relation.to} : ${relation.label}`);
  }

  return lines.join("\n");
}

function inferType(attributeName) {
  if (!attributeName) {
    return "string";
  }
  if (/id$/i.test(attributeName) || attributeName.toLowerCase() === "id") {
    return "int";
  }
  return "string";
}

function dedupeRelations(relations) {
  const seen = new Set();
  const result = [];
  for (const relation of relations) {
    const key = `${relation.from}|${relation.to}|${relation.label}|${relation.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(relation);
    }
  }
  return result;
}

async function refreshGraph() {
  if (!schema) return;
  const subset = neighborsGraph(schema, currentFocus, currentDepth, showRBAC);
  currentSubset = subset;
  window.currentSubset = subset;
  if (!subset.entities.length) {
    graphBox.innerHTML = "";
    placeholder.hidden = false;
    placeholder.setAttribute("aria-hidden", "false");
    summaryBox.textContent = "No hay entidades ni relaciones";
    currentMermaid = "";
    return;
  }

  placeholder.hidden = true;
  placeholder.setAttribute("aria-hidden", "true");
  const code = buildMermaid(subset, { attrsMode: "pkfk" });
  currentMermaid = code;
  await render(code, subset);
  updateSummary(subset);
}

async function render(code, subset) {
  try {
    const { svg } = await mermaid.render(`er-${Date.now()}`, code);
    graphBox.innerHTML = svg;
    const svgElement = graphBox.querySelector("svg");
    colorize(svgElement, subset);
  } catch (error) {
    console.error(error);
    showToast("No se pudo renderizar el diagrama");
  }
}

function colorize(svgRoot, subset) {
  if (!svgRoot || !subset) return;
  const palette = {
    hub: { fill: "#E0F2FE", stroke: "#0284C7", text: "#0C4A6E", dash: null },
    catalog: { fill: "#ECFCCB", stroke: "#16A34A", text: "#14532D", dash: null },
    tickets: { fill: "#F1F5F9", stroke: "#64748B", text: "#0F172A", dash: null },
    rbac: { fill: "#FEF3C7", stroke: "#D97706", text: "#7C2D12", dash: "4,3" },
  };

  const entitiesById = new Map(subset.entities.map((entity) => [entity.id, entity]));
  const textNodes = svgRoot.querySelectorAll("g text");

  textNodes.forEach((text) => {
    const name = text.textContent?.trim();
    if (!name) return;
    const entity = entitiesById.get(name);
    if (!entity) return;
    const wrapper = text.closest("g");
    if (!wrapper) return;
    const rect = wrapper.querySelector("rect");
    const colors = palette[entity.group];
    if (rect && colors) {
      rect.setAttribute("fill", colors.fill);
      rect.setAttribute("stroke", colors.stroke);
      rect.setAttribute("stroke-width", "2");
      if (colors.dash) {
        rect.setAttribute("stroke-dasharray", colors.dash);
      } else {
        rect.removeAttribute("stroke-dasharray");
      }
    }
    text.setAttribute("fill", colors?.text || "#0F172A");
    wrapper.dataset.entity = entity.id;
    wrapper.dataset.group = entity.group;
    wrapper.classList.toggle("focused", entity.id === currentFocus);
  });
}

function updateSummary(subset) {
  const ent = subset.entities.length;
  const rel = subset.relations.length;
  summaryBox.textContent = `${ent} ${ent === 1 ? "entidad" : "entidades"}, ${rel} ${rel === 1 ? "relación" : "relaciones"}`;
}

async function copyMermaid() {
  if (!currentMermaid) {
    showToast("No hay código Mermaid para copiar");
    return;
  }
  try {
    await navigator.clipboard.writeText(currentMermaid);
    showToast("Código Mermaid copiado");
  } catch (error) {
    console.error(error);
    showToast("No se pudo copiar al portapapeles");
  }
}

function exportSVG() {
  const svgElement = graphBox.querySelector("svg");
  if (!svgElement) {
    showToast("No hay SVG para exportar");
    return;
  }
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgElement);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, "er.svg");
  showToast("SVG descargado");
}

function exportPNG() {
  const svgElement = graphBox.querySelector("svg");
  if (!svgElement) {
    showToast("No hay SVG para exportar");
    return;
  }
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgElement);
  const encoded = btoa(unescape(encodeURIComponent(source)));
  const img = new Image();
  const svgUrl = `data:image/svg+xml;base64,${encoded}`;

  img.onload = () => {
    const viewBox = svgElement.viewBox.baseVal;
    const width = viewBox?.width || svgElement.getBoundingClientRect().width || 800;
    const height = viewBox?.height || svgElement.getBoundingClientRect().height || 600;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    const png = canvas.toDataURL("image/png");
    downloadDataUrl(png, "er.png");
    showToast("PNG descargado");
  };
  img.onerror = () => showToast("No se pudo generar el PNG");
  img.src = svgUrl;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function showToast(message) {
  toastBox.textContent = message;
  if (!message) return;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    toastBox.textContent = "";
  }, 4000);
}

// Export functions for testing if needed
export { neighborsGraph, buildMermaid, render, colorize, exportSVG, exportPNG };
