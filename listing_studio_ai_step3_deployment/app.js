const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const form = $("#listingForm");
const productName = $("#productName");
const features = $("#features");
const outputArea = $("#outputArea");
const resultStatus = $("#resultStatus");
const savedCount = $("#savedCount");
let activePlatform = "Shopify";
let activeTab = "description";
let currentContent = {};
let saved = [];
try { saved = JSON.parse(localStorage.getItem("listingStudioSaved") || "[]"); } catch { saved = []; }
let bulkProducts = [];
let bulkResults = [];

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3000);
}
function updateCounts() {
  $("#nameCount").textContent = `${productName.value.length} / 120`;
  $("#featuresCount").textContent = `${features.value.length} / 600`;
}
productName.addEventListener("input", updateCounts);
features.addEventListener("input", updateCounts);
updateCounts();

$$(".platform").forEach(btn => btn.addEventListener("click", () => {
  $$(".platform").forEach(item => item.classList.remove("selected"));
  btn.classList.add("selected");
  activePlatform = btn.dataset.platform;
}));

function titleCase(text) { return text.replace(/\s+/g, " ").trim(); }
function buildDemoContent() {
  const name = titleCase(productName.value);
  const facts = features.value.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  const tone = $("#tone").value.toLowerCase();
  const audience = $("#audience").value.trim();
  const extras = $("#keywords").value.split(",").map(x => x.trim()).filter(Boolean);
  const featureText = facts.length ? facts.join(", ") : "designed for everyday use";
  let intro = `Discover ${name}, designed to bring practicality and convenience to your everyday routine.`;
  if (tone === "persuasive") intro = `Make a smart addition to your routine with ${name}, designed with useful details in mind.`;
  if (tone === "friendly") intro = `Meet ${name} — a handy choice for your everyday needs.`;
  if (tone === "luxury") intro = `Experience the considered design of ${name}, created for a refined everyday experience.`;
  if (tone === "playful") intro = `Say hello to ${name} — a simple way to make everyday moments better.`;
  const audienceLine = audience ? ` A thoughtful choice for ${audience}.` : "";
  const desc = `${intro} Key details include ${featureText}.${audienceLine} Review the product specifications before publishing to make sure every detail matches the item you sell.`;
  const rawTitle = name.length > 68 ? name : `${name} — ${facts[0] || "Everyday Essential"}`;
  const bullets = facts.length ? facts.slice(0, 6).map(f => f.charAt(0).toUpperCase() + f.slice(1)) : ["Add your verified product features."];
  const baseWords = name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const keywords = [...new Set([name, `${name} online`, `buy ${name}`, ...baseWords.map(w => `${w} ${baseWords[0] || ""}`.trim()), ...extras])].slice(0, 10);
  const emoji = $("#emojiToggle").checked ? " ✨" : "";
  const social = `${name}: ${facts.slice(0, 2).join(" • ") || "A useful everyday essential."} Find the details and see if it's right for you.${emoji}`;
  return { title: rawTitle, description: desc, bullets, keywords, social, platform: activePlatform, name, features: facts, meta: `${name}: explore key features, product details, and options to help you choose. Check the full listing for specifications.` };
}
function normalizeContent(data, fallback = {}) {
  const result = { ...fallback, ...data };
  result.name = result.name || fallback.name || productName.value.trim();
  result.title = String(result.title || fallback.title || result.name);
  result.description = String(result.description || fallback.description || "");
  result.bullets = Array.isArray(result.bullets) ? result.bullets.map(String) : (fallback.bullets || []);
  result.keywords = Array.isArray(result.keywords) ? result.keywords.map(String) : (fallback.keywords || []);
  result.social = String(result.social || fallback.social || "");
  result.meta = String(result.meta || fallback.meta || "");
  result.platform = result.platform || activePlatform;
  result.features = Array.isArray(result.features) ? result.features : (fallback.features || features.value.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean));
  return result;
}
async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
function renderTab(tab) {
  activeTab = tab;
  $$(".result-tab").forEach(btn => {
    const selected = btn.dataset.tab === tab;
    btn.classList.toggle("active", selected);
    btn.setAttribute("aria-selected", String(selected));
  });
  const labels = { description: "PRODUCT COPY", seo: "SEO KEYWORDS", social: "SOCIAL CAPTION" };
  $("#resultLabel").textContent = labels[tab];
  if (tab === "description") {
    outputArea.innerHTML = `<div class="output-block"><div class="output-label"><span>Product title</span><button class="copy-mini" data-copy="title" title="Copy title">▢</button></div><p class="output-title" id="outputTitle"></p></div>
      <div class="output-block"><div class="output-label"><span>Product description</span><button class="copy-mini" data-copy="description" title="Copy description">▢</button></div><p id="outputDescription"></p></div>
      <div class="output-block"><div class="output-label"><span>Key features</span><button class="copy-mini" data-copy="bullets" title="Copy features">▢</button></div><ul id="outputBullets"></ul></div>`;
    $("#outputTitle").textContent = currentContent.title;
    $("#outputDescription").textContent = currentContent.description;
    currentContent.bullets.forEach(b => { const li = document.createElement("li"); li.textContent = b; $("#outputBullets").append(li); });
  } else if (tab === "seo") {
    outputArea.innerHTML = `<div class="output-block"><div class="output-label"><span>Suggested search phrases</span><button class="copy-mini" data-copy="keywords" title="Copy keywords">▢</button></div><div class="keyword-chips" id="keywordChips"></div></div><div class="output-block"><div class="output-label"><span>Meta description draft</span><button class="copy-mini" data-copy="meta" title="Copy meta description">▢</button></div><p id="metaDescription"></p></div>`;
    currentContent.keywords.forEach(k => { const span = document.createElement("span"); span.className = "keyword-chip"; span.textContent = k; $("#keywordChips").append(span); });
    $("#metaDescription").textContent = currentContent.meta || `${currentContent.name}: explore key features and product details.`;
  } else {
    outputArea.innerHTML = `<div class="output-block"><div class="output-label"><span>Social media caption</span><button class="copy-mini" data-copy="social" title="Copy caption">▢</button></div><p id="socialCaption"></p><div class="field-hint" style="margin-top:12px">Suggested channel: Instagram, Facebook, or Pinterest. Adapt the format to each platform.</div></div>`;
    $("#socialCaption").textContent = currentContent.social;
  }
}
function getCopyText(kind) {
  if (kind === "title") return currentContent.title || "";
  if (kind === "description") return currentContent.description || "";
  if (kind === "bullets") return (currentContent.bullets || []).map(x => "• " + x).join("\n");
  if (kind === "keywords") return (currentContent.keywords || []).join(", ");
  if (kind === "meta") return currentContent.meta || "";
  if (kind === "social") return currentContent.social || "";
  if (activeTab === "seo") return (currentContent.keywords || []).join(", ");
  if (activeTab === "social") return currentContent.social || "";
  return `${currentContent.title || ""}\n\n${currentContent.description || ""}\n\n${(currentContent.bullets || []).map(x => "• " + x).join("\n")}`;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied to clipboard."); }
  catch {
    const area = document.createElement("textarea"); area.value = text; document.body.appendChild(area); area.select();
    document.execCommand("copy"); area.remove(); toast("Copied to clipboard.");
  }
}
function refreshSavedCount() {
  savedCount.textContent = saved.length;
  const exists = saved.some(x => x.title === currentContent.title);
  $("#saveBtn").classList.toggle("saved", exists);
  $("#saveBtn").textContent = exists ? "✓ Saved" : "♡ Save listing";
}
form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!productName.value.trim() || !features.value.trim()) { toast("Add a product name and key features first."); return; }
  const submitButton = form.querySelector('[type="submit"]');
  const originalLabel = submitButton ? submitButton.textContent : "";
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Generating with Gemini…"; }
  resultStatus.innerHTML = "<i></i> Generating with Gemini";
  try {
    const data = await postJson("/api/generate-listing", {
      name: productName.value.trim(), features: features.value.trim(),
      audience: $("#audience").value.trim(), keywords: $("#keywords").value.trim(),
      platform: activePlatform, tone: $("#tone").value, language: $("#language").value,
      includeEmoji: $("#emojiToggle").checked
    });
    currentContent = normalizeContent(data.listing, buildDemoContent());
    renderTab(activeTab);
    resultStatus.innerHTML = "<i></i> Gemini generated";
    refreshSavedCount();
    toast("Listing generated with Gemini AI.");
  } catch (err) {
    currentContent = normalizeContent(buildDemoContent());
    renderTab(activeTab);
    resultStatus.innerHTML = "<i></i> Demo fallback";
    toast(`${err.message} Showing a demo draft instead.`);
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = originalLabel; }
  }
});
$$(".result-tab").forEach(btn => btn.addEventListener("click", () => renderTab(btn.dataset.tab)));
document.addEventListener("click", e => {
  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) copyText(getCopyText(copyBtn.dataset.copy));
});
$("#copyBtn").addEventListener("click", () => copyText(getCopyText()));
function downloadCsv(name, rows) {
  const csv = rows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#downloadBtn").addEventListener("click", () => {
  downloadCsv(`${safeFilename(currentContent.name || "product-listing")}.csv`, [
    ["Type", "Content"], ["Product title", currentContent.title], ["Description", currentContent.description],
    ["Key features", (currentContent.bullets || []).join(" | ")], ["SEO keywords", (currentContent.keywords || []).join(", ")],
    ["Social caption", currentContent.social]
  ]);
  toast("CSV export downloaded.");
});
function safeFilename(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "listing"; }
function getPdfDoc() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    toast("PDF library didn't load. Check your internet connection and reload."); return null;
  }
  return new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
}
function writePdfLines(doc, label, value, y) {
  const margin = 48, maxWidth = 500, lineHeight = 15;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(label, margin, y); y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const lines = doc.splitTextToSize(String(value || "—"), maxWidth);
  for (const line of lines) {
    if (y > 780) { doc.addPage(); y = 55; }
    doc.text(line, margin, y); y += lineHeight;
  }
  return y + 14;
}
function downloadListingPdf(listing = currentContent, filename) {
  const doc = getPdfDoc(); if (!doc) return;
  let y = 54;
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("Listing Studio AI", 48, y); y += 28;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`Marketplace: ${listing.platform || "Other"}  |  Generated: ${new Date().toLocaleDateString()}`, 48, y); y += 28;
  y = writePdfLines(doc, "Product title", listing.title, y);
  y = writePdfLines(doc, "Product description", listing.description, y);
  y = writePdfLines(doc, "Key features", (listing.bullets || []).map(x => `• ${x}`).join("\n"), y);
  y = writePdfLines(doc, "SEO keywords", (listing.keywords || []).join(", "), y);
  y = writePdfLines(doc, "Social caption", listing.social, y);
  doc.save(filename || `${safeFilename(listing.name || listing.product || "product-listing")}.pdf`);
}
$("#downloadPdfBtn").addEventListener("click", () => downloadListingPdf(currentContent));
$("#saveBtn").addEventListener("click", () => {
  if (!currentContent.title) currentContent = buildDemoContent();
  const exists = saved.some(x => x.title === currentContent.title);
  if (exists) saved = saved.filter(x => x.title !== currentContent.title);
  else saved.unshift({ ...currentContent, savedAt: new Date().toISOString() });
  localStorage.setItem("listingStudioSaved", JSON.stringify(saved));
  refreshSavedCount(); toast(exists ? "Removed from saved listings." : "Listing saved in this browser.");
});
$("#resetBtn").addEventListener("click", () => {
  form.reset(); productName.value = ""; features.value = ""; activePlatform = "Shopify";
  $$(".platform").forEach(b => b.classList.toggle("selected", b.dataset.platform === "Shopify"));
  currentContent = { title: "Your product title will appear here", description: "Add product details and generate a listing to preview your copy.", bullets: ["Add your verified product features."], keywords: ["product listing", "product details"], social: "Your social caption will appear here.", meta: "" };
  updateCounts(); renderTab("description"); resultStatus.innerHTML = "<i></i> Waiting for input"; toast("Form reset.");
});
$("#globalSearch").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const q = e.target.value.trim().toLowerCase();
  if (!q) { toast("Enter a search term."); return; }
  const match = saved.find(x => (x.name || "").toLowerCase().includes(q) || (x.title || "").toLowerCase().includes(q));
  if (match) { currentContent = match; productName.value = match.name || ""; features.value = (match.features || []).join(", "); renderTab("description"); updateCounts(); toast(`Loaded saved listing: ${match.name || match.title}`); }
  else toast("No matching saved listing found.");
});
function parseCsvLine(line) {
  const out = []; let cell = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { out.push(cell.trim()); cell = ""; } else cell += c;
  }
  out.push(cell.trim()); return out;
}
function parseProductsCsv(raw) {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter(x => x.trim());
  if (lines.length < 2) throw Error("CSV needs a header row and at least one product row.");
  const headers = parseCsvLine(lines[0]).map(x => x.toLowerCase().replace(/[\s-]+/g, "_"));
  const idx = (...names) => headers.findIndex(x => names.includes(x));
  const ni = idx("name", "product_name", "title", "product"), fi = idx("features", "key_features", "description", "details");
  if (ni < 0 || fi < 0) throw Error("Missing required columns. Use headers named name and features.");
  return lines.slice(1).map((line, i) => {
    const c = parseCsvLine(line);
    return { id: i + 1, name: c[ni] || "", features: c[fi] || "", audience: c[idx("audience", "target_customer")] || "", keywords: c[idx("keywords", "seo_keywords")] || "", price: c[idx("price", "price_usd", "price_pkr")] || "" };
  }).filter(p => p.name || p.features);
}
function renderBulkRows() {
  const body = $("#bulkTableBody");
  $("#bulkCount").textContent = `${bulkProducts.length} product${bulkProducts.length === 1 ? "" : "s"}`;
  if (!bulkProducts.length) { body.innerHTML = '<tr><td colspan="3" class="bulk-empty">Your imported products will appear here.</td></tr>'; return; }
  body.innerHTML = "";
  bulkProducts.slice(0, 100).forEach((p, i) => {
    const tr = document.createElement("tr"), name = document.createElement("td"), feat = document.createElement("td"), status = document.createElement("td"), pill = document.createElement("span");
    name.textContent = p.name || `Product ${i + 1}`; feat.textContent = p.features || "Missing features";
    pill.className = "bulk-status " + (p.name && p.features ? "ready" : "warning");
    pill.textContent = p.name && p.features ? (bulkResults[i] ? "Generated" : "Ready") : "Check row";
    status.append(pill); tr.append(name, feat, status); body.append(tr);
  });
  if (bulkProducts.length > 100) { const tr = document.createElement("tr"), td = document.createElement("td"); td.colSpan = 3; td.className = "bulk-empty"; td.textContent = `Preview limited to 100 rows; ${bulkProducts.length - 100} more imported.`; tr.append(td); body.append(tr); }
}
function importBulkCsv(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") { toast("Please choose a CSV file."); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      bulkProducts = parseProductsCsv(String(reader.result || ""));
      if (!bulkProducts.length) throw Error("No product rows found in this CSV.");
      bulkResults = [];
      $("#bulkFileName").textContent = file.name; $("#bulkFileMeta").textContent = `${bulkProducts.length} product rows imported`;
      $("#bulkFileRow").hidden = false; $("#generateBulkBtn").disabled = false; $("#downloadBulkBtn").disabled = true; $("#downloadBulkPdfBtn").disabled = true;
      $("#bulkStatus").textContent = "Ready to generate with Gemini."; $("#bulkResultsSummary").textContent = "Review rows, then generate listings.";
      renderBulkRows(); toast(`Imported ${bulkProducts.length} product rows.`);
    } catch (err) { toast(err.message || "Could not read this CSV."); }
  };
  reader.onerror = () => toast("Could not read this file."); reader.readAsText(file);
}
function downloadBulkCsv(name, rows) { downloadCsv(name, rows); }
function showAppView(view) {
  const isBulk = view === "Bulk Generator";
  $("#bulkView").hidden = !isBulk;
  $$(".welcome-row, .metrics-grid, .section-heading:not(.bulk-heading), .builder-grid").forEach(el => { if (!el.closest("#bulkView")) el.hidden = isBulk; });
  if (isBulk) $("#bulkView").scrollIntoView({ behavior: "smooth", block: "start" });
}
const bulkInput = $("#bulkCsvInput"), dropzone = $("#bulkDropzone");
bulkInput.addEventListener("change", e => importBulkCsv(e.target.files[0]));
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", e => { e.preventDefault(); dropzone.classList.remove("dragover"); importBulkCsv(e.dataTransfer.files[0]); });
$("#removeBulkFile").addEventListener("click", () => {
  bulkProducts = []; bulkResults = []; bulkInput.value = ""; $("#bulkFileRow").hidden = true;
  $("#generateBulkBtn").disabled = true; $("#downloadBulkBtn").disabled = true; $("#downloadBulkPdfBtn").disabled = true;
  $("#bulkStatus").textContent = "Upload a CSV to get started."; $("#bulkResultsSummary").textContent = "No listings generated yet."; renderBulkRows();
});
$("#sampleCsvBtn").addEventListener("click", e => {
  e.preventDefault();
  downloadBulkCsv("listing-studio-sample-products.csv", [
    ["name", "features", "audience", "keywords", "price", "platform"],
    ["Wireless Bluetooth Headphones", "30-hour battery; soft ear cushions; Bluetooth connection", "commuters and students", "wireless headphones, bluetooth audio", "39.99", "Shopify"],
    ["Ceramic Coffee Mug", "12 oz capacity; glossy finish; dishwasher safe", "coffee lovers", "ceramic mug, coffee cup", "14.00", "Etsy"]
  ]);
});
$("#generateBulkBtn").addEventListener("click", async () => {
  if (!bulkProducts.length) { toast("Upload a CSV first."); return; }
  if (bulkProducts.length > 20) { toast("For this starter, generate up to 20 products per CSV batch."); return; }
  const button = $("#generateBulkBtn"), original = button.innerHTML;
  button.disabled = true; button.textContent = "Generating with Gemini…"; $("#bulkStatus").textContent = "Contacting secure backend…";
  try {
    const data = await postJson("/api/generate-bulk", {
      products: bulkProducts, platform: $("#bulkPlatform").value, tone: $("#bulkTone").value
    });
    bulkResults = Array.isArray(data.listings) ? data.listings : [];
    renderBulkRows();
    $("#downloadBulkBtn").disabled = !bulkResults.length; $("#downloadBulkPdfBtn").disabled = !bulkResults.length;
    $("#bulkStatus").textContent = `${bulkResults.length} Gemini listings generated.`;
    $("#bulkResultsSummary").textContent = `${bulkResults.length} listing drafts ready to export.`;
    toast(`Generated ${bulkResults.length} listings with Gemini AI.`);
  } catch (err) {
    bulkResults = [];
    $("#bulkStatus").textContent = "Generation failed. Check server setup.";
    $("#bulkResultsSummary").textContent = "No AI results generated.";
    toast(err.message || "Bulk generation failed.");
  } finally { button.disabled = false; button.innerHTML = original; }
});
$("#downloadBulkBtn").addEventListener("click", () => {
  if (!bulkResults.length) return;
  downloadBulkCsv("listing-studio-bulk-results.csv", [
    ["product", "platform", "tone", "price", "title", "description", "key_features", "seo_keywords", "social_caption", "status"],
    ...bulkResults.map(r => [r.product || r.name, r.platform, r.tone, r.price, r.title, r.description, (r.bullets || r.features || []).join ? (r.bullets || r.features).join(" | ") : r.features, (r.keywords || []).join ? r.keywords.join(", ") : r.keywords, r.social, "Gemini generated"])
  ]);
  toast("Bulk results CSV exported.");
});
$("#downloadBulkPdfBtn").addEventListener("click", () => {
  if (!bulkResults.length) return;
  const doc = getPdfDoc(); if (!doc) return;
  let y = 48;
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("Listing Studio AI — Bulk Listings", 42, y); y += 28;
  bulkResults.forEach((item, i) => {
    if (y > 730) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(`${i + 1}. ${String(item.title || item.product || "Product").slice(0, 100)}`, 42, y); y += 20;
    y = writePdfLines(doc, "Description", item.description, y);
    y = writePdfLines(doc, "Key features", (item.bullets || item.features || []).join ? (item.bullets || item.features).join("\n") : item.features, y);
    y = writePdfLines(doc, "SEO keywords", (item.keywords || []).join ? (item.keywords || []).join(", ") : item.keywords, y);
    y += 8;
  });
  doc.save("listing-studio-bulk-listings.pdf"); toast("Bulk PDF downloaded.");
});

$$(".nav-item").forEach(btn => btn.addEventListener("click", () => {
  $$(".nav-item").forEach(x => x.classList.remove("active")); btn.classList.add("active");
  const view = btn.dataset.view;
  if (view === "Create Listing") { showAppView("Create Listing"); toast("You're in the listing editor."); }
  else if (view === "Saved Listings") {
    showAppView("Create Listing");
    if (saved.length) { const latest = saved[0]; currentContent = normalizeContent(latest); productName.value = latest.name || ""; features.value = (latest.features || []).join(", "); renderTab("description"); updateCounts(); toast(`Loaded saved listing: ${latest.name || latest.title}`); }
    else toast("No saved listings yet. Generate and save one first.");
  } else if (view === "Bulk Generator") { showAppView("Bulk Generator"); toast("Bulk generator ready. Import your product CSV."); }
  else if (view === "Templates") { showAppView("Create Listing"); toast("Template gallery is planned for the next version."); }
  else if (view === "History") { showAppView("Create Listing"); toast("History will be available after persistent storage is connected."); }
  else { showAppView("Create Listing"); toast(`${view} module is a frontend placeholder.`); }
}));
$("#upgradeBtn").addEventListener("click", () => toast("Upgrade plans can be added after your license and payment model are chosen."));
$("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#globalSearch").focus(); }
  if (e.key === "Escape") $("#sidebar").classList.remove("open");
});
currentContent = buildDemoContent();
renderTab("description");
refreshSavedCount();
