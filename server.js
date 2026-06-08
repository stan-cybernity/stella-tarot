/* =========================================================
   星语塔罗 · 本地服务器
   - 托管静态网页
   - POST /api/reading：把请求流式代理到 DeepSeek（密钥在服务端，不进浏览器）
   只用 Node 内置模块，无需 npm install。
   ========================================================= */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { URL } = require('url');

/* ---- 读取同目录下的 .env ---- */
const env = {};
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  });
} catch (e) { /* 没有 .env 也能跑，只是 AI 不可用 */ }

const API_KEY = env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const BASE    = (env.DEEPSEEK_BASE || process.env.DEEPSEEK_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
const MODEL   = env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const PORT    = parseInt(env.PORT || process.env.PORT || '8765', 10);  // 云平台(Render等)会注入 PORT，必须优先用它

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.gif':'image/gif',
  '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff2':'font/woff2', '.woff':'font/woff'
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  /* ---------- 健康检查 ---------- */
  if (u.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, hasKey: !!API_KEY, model: MODEL }));
  }

  /* ---------- AI 流式解读代理 ---------- */
  if (req.method === 'POST' && u.pathname === '/api/reading') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!API_KEY) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '服务端未配置 DEEPSEEK_API_KEY（请检查 .env 文件）' }));
      }
      let payload;
      try { payload = JSON.parse(body); } catch (e) {
        res.writeHead(400); return res.end('bad json');
      }
      const reqBody = JSON.stringify({
        model: MODEL,
        messages: payload.messages || [],
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.85,
        stream: true
      });
      const target = new URL(BASE + '/chat/completions');
      const apiReq = https.request({
        hostname: target.hostname,
        path: target.pathname + target.search,
        port: 443,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + API_KEY,
          'Content-Length': Buffer.byteLength(reqBody)
        }
      }, apiRes => {
        if (apiRes.statusCode !== 200) {
          let err = '';
          apiRes.on('data', c => err += c);
          apiRes.on('end', () => {
            res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'DeepSeek 返回 ' + apiRes.statusCode, detail: String(err).slice(0, 600) }));
          });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        apiRes.pipe(res);            // 把 SSE 原样转发给浏览器
      });
      apiReq.on('error', e => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '无法连接 DeepSeek：' + e.message }));
      });
      apiReq.write(reqBody);
      apiReq.end();
    });
    return;
  }

  /* ---------- 静态文件 ---------- */
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const fp = path.join(__dirname, rel);
  if (!fp.startsWith(__dirname)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 未找到：' + rel); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('\n  ✦ 星语塔罗已启动');
  console.log('  ✦ 浏览器打开： http://localhost:' + PORT);
  console.log('  ✦ DeepSeek 密钥：' + (API_KEY ? '已加载 ✅' : '未配置 ❌（检查 .env）'));
  console.log('  ✦ 关闭此窗口即可停止服务\n');
});
