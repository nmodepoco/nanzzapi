const express = require("express");
const chalk = require("chalk");
const fs = require("fs");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

// ========== DISCORD WEBHOOK ==========
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://discord.com/api/webhooks/1515984920760025201/ml-pkp6Fn20UOgNg6qkfojHBuCpISA5TiEhzwDMddR8al6w69pbM3-JzSCe7N_7rc6UY";
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

async function sendWebhook(content, embeds = null) {
    if (!WEBHOOK_URL) return;
    try {
        await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(embeds ? { content: content || null, embeds } : { content })
        });
    } catch (err) {
        console.error(chalk.red(`[WebhookError] ${err.message}`));
    }
}

async function sendNotification(msg) {
    sendWebhook(msg);
}

async function sendLog({ ip, method, endpoint, status, query, duration }) {
    const icons = { request: "🟡", success: "✅", error: "❌" };
    const colors = { request: 0x7289da, success: 0x57f287, error: 0xed4245 };
    const embed = [{
        title: `${icons[status]} API Activity - ${status.toUpperCase()}`,
        color: colors[status],
        fields: [
            { name: "IP", value: `\`${ip}\``, inline: true },
            { name: "Method", value: method, inline: true },
            { name: "Endpoint", value: endpoint },
            { name: "Query", value: `\`\`\`json\n${JSON.stringify(query || {}, null, 2)}\n\`\`\`` },
            { name: "Duration", value: `${duration ?? "-"}ms`, inline: true },
            { name: "Time", value: new Date().toISOString() }
        ],
        footer: { text: "Nanzz API Log System ✨" },
        timestamp: new Date()
    }];
    sendWebhook(null, embed);
}

// ========== EXPRESS SETUP ==========
app.enable("trust proxy");
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.set("json spaces", 2);

// ========== STATIC FILES ==========
app.use("/", express.static(path.join(__dirname, "api-page")));
app.use("/src", express.static(path.join(__dirname, "src")));

// ========== AUTO SCAN OPENAPI ==========
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

function buildOpenApi() {
    return {
        openapi: "1.0.0",
        info: { title: "Nanzz API", author: "Nanzz", version: "v2.0.0", description: "Simple and easy to use API." },
        servers: [{ url: "/" }],
        tags: [
            { name: "Ai-chat" }, { name: "Ai-generate" }, { name: "Downloader" },
            { name: "Image" }, { name: "News" }, { name: "Tools" }, { name: "Search" }
        ],
        paths: scanEndpoints(path.join(__dirname, "src", "api"))
    };
}

function matchOpenApiPath(requestPath) {
    const spec = buildOpenApi();
    const paths = Object.keys(spec.paths);
    for (const apiPath of paths) {
        const regex = new RegExp("^" + apiPath.replace(/{[^}]+}/g, "[^/]+") + "$");
        if (regex.test(requestPath)) return true;
    }
    return false;
}

// ========== /src/openapi.json ==========
app.get("/src/openapi.json", (req, res) => {
    res.json(buildOpenApi());
});

// ========== JSON RESPONSE WRAPPER ==========
app.use((req, res, next) => {
    const original = res.json;
    res.json = function (data) {
        if (typeof data === "object" && data.status !== undefined && !data.creator) {
            data.creator = "Nanzz";
        }
        return original.call(this, data);
    };
    next();
});

// ========== ENDPOINT LOGGER ==========
const endpointStats = {};

app.use(async (req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const method = req.method;
    const endpoint = req.originalUrl.split("?")[0];
    const query = req.query;
    const start = Date.now();

    if (matchOpenApiPath(endpoint)) {
        sendLog({ ip, method, endpoint, status: "request", query });
        console.log(chalk.yellow(`🟡 [REQUEST] ${method} ${endpoint} | IP: ${ip}`));
    }

    next();

    res.on("finish", () => {
        if (!matchOpenApiPath(endpoint)) return;
        const duration = Date.now() - start;
        const isError = res.statusCode >= 400;
        const status = isError ? "error" : "success";
        if (!endpointStats[endpoint]) endpointStats[endpoint] = { total: 0, errors: 0, totalDuration: 0 };
        endpointStats[endpoint].total++;
        endpointStats[endpoint].totalDuration += duration;
        if (isError) endpointStats[endpoint].errors++;
        const avg = (endpointStats[endpoint].totalDuration / endpointStats[endpoint].total).toFixed(2);
        sendLog({ ip, method, endpoint, status, query, duration });
        console.log(chalk[isError ? "red" : "green"](`${isError ? "❌" : "✅"} [${status.toUpperCase()}] ${method} ${endpoint} | ${res.statusCode} | ${duration}ms (Avg: ${avg}ms)`));
    });
});

// ========== LOAD API ROUTES (RECURSIVE) ==========
let totalRoutes = 0;
const apiFolder = path.join(__dirname, "src", "api");

function loadRoutesRecursive(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory() && !item.name.startsWith("_")) {
            loadRoutesRecursive(full);
        } else if (item.name.endsWith(".js") && !item.name.startsWith("_")) {
            try {
                delete require.cache[require.resolve(full)];
                const route = require(full);
                if (typeof route === "function") {
                    route(app);
                    totalRoutes++;
                    console.log(chalk.bgYellow.black(`[V2] Loaded Route: ${item.name}`));
                    sendNotification(`✅ [V2] Loaded Route: ${item.name}`);
                } else if (route.run) {
                    const routePath = full.replace(apiFolder, "").replace(/\.js$/, "").replace(/\\/g, "/");
                    app.all(routePath, (req, res) => route.run(req, res));
                    totalRoutes++;
                    console.log(chalk.bgCyan.black(`[V1] Loaded Route: ${routePath}`));
                    sendNotification(`✅ [V1] Loaded Route: ${routePath}`);
                }
            } catch (e) {
                console.error(chalk.red(`Error loading ${item.name}: ${e.message}`));
            }
        }
    }
}

loadRoutesRecursive(apiFolder);
sendNotification(`🟢 Server started. Total Routes Loaded: ${totalRoutes}`);

// ========== MAIN ROUTES ==========
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "api-page", "index.html")));
app.get("/docs", (req, res) => res.sendFile(path.join(__dirname, "api-page", "docs.html")));

// ========== 404 ==========
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "api-page", "404.html")));

// ========== 500 ==========
app.use((err, req, res, next) => {
    console.error(err.stack);
    sendNotification(`🚨 Server Error: ${err.message}`);
    res.status(500).sendFile(path.join(__dirname, "api-page", "500.html"));
});

// ========== EXPORT FOR VERCEL ==========
module.exports = app;
