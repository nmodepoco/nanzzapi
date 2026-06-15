const fs = require('fs');
const path = require('path');

module.exports = function(app) {
  let manualPaths = {};

  function loadManual() {
    try {
      const manual = JSON.parse(fs.readFileSync(path.join(__dirname, 'Apipage', 'openapi-manual.json'), 'utf8'));
      manualPaths = manual.paths || {};
    } catch (e) {}
  }

  function scanEndpoints(dir, base = '') {
    const paths = {};
    if (!fs.existsSync(dir)) return paths;
    
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      const route = base + '/' + item.name.replace('.js', '');

      if (item.isDirectory() && !item.name.startsWith('_')) {
        Object.assign(paths, scanEndpoints(full, route));
      } else if (item.name.endsWith('.js') && !item.name.startsWith('_')) {
        try {
          delete require.cache[require.resolve(full)];
          const mod = require(full);
          if (typeof mod === 'function' || !mod.run) continue;

          const params = (mod.params || []).map(p => ({
            name: p,
            in: mod.post ? 'body' : 'query',
            required: true,
            description: mod['desc-' + p] || p,
            schema: { type: 'string', ...(mod.paramsSelect?.[p] ? { enum: mod.paramsSelect[p] } : {}) }
          }));

          paths[route] = {
            [mod.post ? 'post' : 'get']: {
              summary: mod.desc || item.name,
              description: mod.desc || '',
              tags: [mod.category || 'Tools'],
              parameters: params,
              deprecated: false
            }
          };
        } catch (e) {
          console.error(`Skip ${item.name}:`, e.message);
        }
      }
    }
    return paths;
  }

  app.get('/src/openapi.json', (req, res) => {
    loadManual();
    const spec = {
      openapi: "1.0.0",
      info: { title: "Nanzz API", version: "v1.0.0", description: "Simple and easy to use API." },
      servers: [{ url: "/" }],
      tags: [
        { name: "AI" }, { name: "Ai-chat" }, { name: "Ai-generate" },
        { name: "Downloader" }, { name: "Image" }, { name: "News" },
        { name: "Tools" }, { name: "Search" }, { name: "Uploader" }, { name: "Check" }
      ],
      paths: { ...scanEndpoints(path.join(__dirname, 'src', 'api')), ...manualPaths }
    };
    res.json(spec);
  });

  app.get('/docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'Apipage', 'docs.html'));
  });
};
