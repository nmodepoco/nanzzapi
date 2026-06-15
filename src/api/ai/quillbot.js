// params : ?text=halo+bro+gimana+kabar+mu
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = {
  category: 'Ai-chat',
  creator: 'Nanzz',
  params: ['text'],
  'desc-text': 'Pertanyaan atau pesan untuk Quillbot AI',
  desc: 'Quillbot AI Chat — Tanya jawab dengan AI Quillbot',

  async run(req, res) {
    const text = String(req.query.text || req.body.text || '').trim();

    if (!text) {
      return res.status(400).json({
        status: false,
        creator: 'Nanzz',
        message: 'Parameter text diperlukan'
      });
    }

    const cookieFile = path.join(os.tmpdir(), `quillbot_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
    const conversationId = crypto.randomUUID();

    const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36';

    try {
      // Visit homepage
      await axios.get('https://quillbot.com/', {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html',
          'sec-ch-ua': '"Google Chrome";v="147"',
          'sec-ch-ua-mobile': '?1',
          'sec-ch-ua-platform': '"Android"'
        },
        timeout: 30000
      });

      // Chat request
      const chatRes = await axios.post(
        `https://quillbot.com/api/ai-chat/chat/conversation/${conversationId}`,
        {
          message: { content: text + '\n\n' },
          context: {
            editorContext: '',
            selectionContext: '',
            userDialect: 'en-us',
            apiVersion: 2
          },
          origin: {
            name: 'ai-chat.chat',
            url: 'https://quillbot.com'
          }
        },
        {
          headers: {
            'User-Agent': UA,
            'Accept': 'text/event-stream, application/json',
            'Content-Type': 'application/json',
            'Origin': 'https://quillbot.com',
            'Referer': `https://quillbot.com/ai-chat/c/${conversationId}`,
            'webapp-version': '42.51.6',
            'qb-product': 'AI-CHAT',
            'platform-type': 'webapp'
          },
          timeout: 60000,
          responseType: 'text'
        }
      );

      // Parse SSE
      let result = '';
      const lines = chatRes.data.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{')) {
          try {
            const json = JSON.parse(trimmed);
            if ((json.type || '') === 'content') {
              result += json.content || '';
            }
          } catch (e) { /* skip */ }
        }
      }

      return res.json({
        status: true,
        creator: 'Nanzz',
        input: text,
        result: result || 'Gagal mendapatkan response'
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        creator: 'Nanzz',
        message: err.message
      });
    } finally {
      try { fs.unlinkSync(cookieFile); } catch (e) { /* ignore */ }
    }
  }
};
