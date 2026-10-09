import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY;

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "250kb" }));
const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many generation requests. Please wait a minute and try again." }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, geminiConfigured: Boolean(API_KEY), model: MODEL });
});

function cleanString(value, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function normalizeListing(raw, source = {}) {
  return {
    name: cleanString(raw.name || source.name, 180),
    product: cleanString(raw.product || source.name, 180),
    platform: cleanString(raw.platform || source.platform, 40),
    tone: cleanString(raw.tone || source.tone, 40),
    price: cleanString(raw.price || source.price, 40),
    title: cleanString(raw.title, 300),
    description: cleanString(raw.description, 5000),
    bullets: Array.isArray(raw.bullets) ? raw.bullets.slice(0, 10).map(x => cleanString(String(x), 400)) : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords.slice(0, 20).map(x => cleanString(String(x), 120)) : [],
    social: cleanString(raw.social, 1500),
    meta: cleanString(raw.meta, 500),
    features: Array.isArray(raw.features) ? raw.features.slice(0, 10).map(x => cleanString(String(x), 400)) : (Array.isArray(source.features) ? source.features : cleanString(source.features, 1200).split(/[;\n|]+/).map(x => x.trim()).filter(Boolean))
  };
}
async function callGemini(prompt) {
  if (!API_KEY) {
    const error = new Error("Gemini is not configured yet. Add GEMINI_API_KEY to your .env file and restart the server.");
    error.status = 503; throw error;
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
    }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini API request failed (${response.status}).`;
    const error = new Error(message); error.status = response.status === 429 ? 429 : 502; throw error;
  }
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
  if (!text) { const error = new Error("Gemini returned an empty response. Try again."); error.status = 502; throw error; }
  try { return JSON.parse(text); }
  catch { const error = new Error("Gemini returned an unexpected format. Please retry."); error.status = 502; throw error; }
}
function listingPrompt(input) {
  return `You are an expert e-commerce copywriter. Create accurate product listing content in the requested language.
Use only facts supplied below. Do not invent certifications, guarantees, medical claims, materials, sizes, or performance claims.
Marketplace: ${input.platform}; tone: ${input.tone}; language: ${input.language || "English"}.
Product name: ${input.name}
Verified features: ${input.features}
Target audience: ${input.audience || "Not specified"}
SEO keyword ideas: ${input.keywords || "Use relevant natural search phrases"}
Optional emojis in social caption: ${input.includeEmoji ? "Allowed sparingly" : "Do not use emojis"}.
Return only JSON with this shape:
{"name":"...","platform":"...","title":"...","description":"...","bullets":["..."],"keywords":["..."],"social":"...","meta":"...","features":["..."]}
Create a concise marketplace-appropriate title, useful description, 3-6 feature bullets, 6-12 relevant keywords, one social caption, and a meta description.`;
}
app.post("/api/generate-listing", generationLimiter, async (req, res) => {
  try {
    const input = {
      name: cleanString(req.body?.name, 180),
      features: cleanString(req.body?.features, 2000),
      audience: cleanString(req.body?.audience, 300),
      keywords: cleanString(req.body?.keywords, 500),
      platform: ["Shopify", "Amazon", "Etsy", "Other"].includes(req.body?.platform) ? req.body.platform : "Other",
      tone: ["Professional", "Persuasive", "Friendly", "Luxury", "Playful"].includes(req.body?.tone) ? req.body.tone : "Professional",
      language: ["English", "Urdu", "Spanish", "French", "German"].includes(req.body?.language) ? req.body.language : "English",
      includeEmoji: Boolean(req.body?.includeEmoji)
    };
    if (!input.name || !input.features) return res.status(400).json({ error: "Product name and key features are required." });
    const raw = await callGemini(listingPrompt(input));
    const listing = normalizeListing(raw, input);
    if (!listing.title || !listing.description) return res.status(502).json({ error: "Gemini did not return a title and description. Please retry." });
    res.json({ listing });
  } catch (error) {
    console.error("generate-listing:", error.message);
    res.status(error.status || 500).json({ error: error.message || "Could not generate this listing." });
  }
});
app.post("/api/generate-bulk", generationLimiter, async (req, res) => {
  try {
    const products = Array.isArray(req.body?.products) ? req.body.products.slice(0, 20) : [];
    const platform = ["Shopify", "Amazon", "Etsy", "Other"].includes(req.body?.platform) ? req.body.platform : "Other";
    const tone = ["Professional", "Persuasive", "Friendly", "Luxury", "Playful"].includes(req.body?.tone) ? req.body.tone : "Professional";
    if (!products.length) return res.status(400).json({ error: "Upload at least one product row." });
    if (req.body?.products?.length > 20) return res.status(400).json({ error: "This starter supports up to 20 products per batch." });
    const cleanProducts = products.map((p, i) => ({
      id: i + 1, name: cleanString(p?.name, 180), features: cleanString(p?.features, 1200),
      audience: cleanString(p?.audience, 250), keywords: cleanString(p?.keywords, 400), price: cleanString(p?.price, 40)
    })).filter(p => p.name && p.features);
    if (!cleanProducts.length) return res.status(400).json({ error: "Every product needs a name and features." });
    const prompt = `You are an e-commerce copywriter. Create listing drafts for every product below.
Marketplace: ${platform}. Tone: ${tone}. Use English. Only use the supplied facts; do not invent specs, certifications, or guarantees.
Return ONLY a JSON object in this shape: {"listings":[{"product":"exact source product name","platform":"${platform}","tone":"${tone}","price":"source price if supplied","title":"...","description":"...","bullets":["..."],"keywords":["..."],"social":"...","meta":"...","features":["..."]}]}.
Preserve the original product order and return exactly ${cleanProducts.length} listing objects. Give each a title, accurate description, 3-5 bullets, 5-10 keywords, and a social caption.
Products JSON: ${JSON.stringify(cleanProducts)}`;
    const raw = await callGemini(prompt);
    const rawListings = Array.isArray(raw) ? raw : raw.listings;
    if (!Array.isArray(rawListings)) return res.status(502).json({ error: "Gemini returned an unexpected bulk format. Please retry." });
    const listings = rawListings.slice(0, cleanProducts.length).map((item, i) => normalizeListing(item, { ...cleanProducts[i], platform, tone }));
    if (!listings.length) return res.status(502).json({ error: "Gemini returned no listing results." });
    res.json({ listings });
  } catch (error) {
    console.error("generate-bulk:", error.message);
    res.status(error.status || 500).json({ error: error.message || "Could not generate bulk listings." });
  }
});

app.use(express.static(__dirname, { extensions: ["html"], dotfiles: "ignore" }));
app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint not found." }));
app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err.message);
  res.status(500).json({ error: "Unexpected server error. Please try again." });
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Listing Studio AI running at http://localhost:${PORT}`);
  console.log(API_KEY ? `Gemini configured (${MODEL}).` : "Gemini API key missing. Copy .env.example to .env and add your NEW key.");
});
