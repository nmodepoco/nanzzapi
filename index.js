const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const apiDir = path.join(__dirname, "src", "api");

// Load routes
function loadRoutes(dir, base = "") {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory() && !item.name.startsWith("_")) {
      loadRoutes(full, base + "/" + item.name);
    } else if (item.name.endsWith(".js") && !item.name.startsWith("_")) {
      try {
        delete require.cache[require.resolve(full)];
        const route = require(full);
        const routePath = base + "/" + item.name.replace(".js", "");
        if (typeof route === "function") {
          app.use(routePath, route);
        } else if (route.run) {
          app.all(routePath, (req, res) => route.run(req, res));
        }
      } catch (e) {
        console.error("Error:", item.name, e.message);
      }
    }
  }
}

loadRoutes(apiDir);

// Scan openapi
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
        delete require.cache[require.resolve(full)];
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
            parameters: params
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
    info: { title: "Nanzz API", author: "Nanzz", version: "v2.0.0", description: "Simple and easy to use API." },
    servers: [{ url: "/" }],
    tags: [
      { name: "Ai-chat" }, { name: "Ai-generate" },
      { name: "Downloader" }, { name: "Image" },
      { name: "News" }, { name: "Tools" }, { name: "Search" }
    ],
    paths: scanEndpoints(apiDir)
  });
});

app.get("/docs", (req, res) => res.sendFile(path.join(__dirname, "docs.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "docs.html")));
app.use((req, res) => res.status(404).json({ status: false, message: "Not found" }));

module.exports = app;
