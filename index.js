const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS simple
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

// ========== LOAD ENDPOINT ==========
const apiDir = path.join(__dirname, "src", "api");

function loadRoutes(dir, base = "") {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory() && !item.name.startsWith("_")) {
      loadRoutes(full, base + "/" + item.name);
    } else if (item.name.endsWith(".js") && !item.name.startsWith("_")) {
      try {
        const route = require(full);
        const routePath = base + "/" + item.name.replace(".js", "");

        if (typeof route === "function") {
          // Template v2
          app.use(routePath, route);
          console.log(`[V2] Loaded: ${routePath}`);
        } else if (route.run) {
          // Template v1
          app.all(routePath, async (req, res) => {
            try {
              await route.run(req, res);
            } catch (err) {
              res.status(500).json({ status: false, message: err.message });
            }
          });
          console.log(`[V1] Loaded: ${routePath}`);
        }
      } catch (e) {
        console.error(`Error loading ${item.name}:`, e.message);
      }
    }
  }
}

loadRoutes(apiDir);

// ========== OPENAPI AUTO ==========
function scanEndpoints(dir, base = "") {
  const paths = {};
  if (!fs.existsSync(dir)) return paths;

  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    const route = base + "/" + item.name.replace(".js", "");

    if (item.isDirectory() && !item.name.startsWith("_")) {
      Object.assign(paths, scanEndpoints(full, route));
    } else if (item.name.endsWith(".js") && !item.name.startsWith("_")) {
      try {
        const mod = require(full);
        if (typeof mod === "function" || !mod.run) continue;

        const params = (mod.params || []).map(p => ({
          name: p,
          in: mod.post ? "body" : "query",
          required: true,
          description: mod["desc-" + p] || p,
          schema: { type: "string", ...(mod.paramsSelect?.[p] ? { enum: mod.paramsSelect[p] } : {}) }
        }));

        paths[route] = {
          [mod.post ? "post" : "get"]: {
            summary: mod.desc || item.name,
            description: mod.desc || "",
            tags: [mod.category || "Tools"],
            parameters: params,
            deprecated: false
          }
        };
      } catch (e) {}
    }
  }
  return paths;
}

app.get("/src/openapi.json", (req, res) => {
  res.json({
    openapi: "1.0.0",
    info: { title: "Nanzz API", author: "Nanzz", version: "v2.0.0" },
    servers: [{ url: "/" }],
    tags: [
      { name: "Ai-chat" }, { name: "Ai-generate" },
      { name: "Downloader" }, { name: "Image" },
      { name: "News" }, { name: "Tools" }, { name: "Search" }
    ],
    paths: scanEndpoints(apiDir)
  });
});

// ========== DOCS ==========
app.get("/docs", (req, res) => {
  res.sendFile(path.join(__dirname, "docs.html"));
});

// ========== HOME ==========
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "docs.html"));
});

// ========== 404 ==========
app.use((req, res) => {
  res.status(404).json({ status: false, message: "Endpoint not found" });
});

// ========== START ==========
app.listen(PORT, () => {
  console.log(`✅ Nanzz API running on port ${PORT}`);
});
