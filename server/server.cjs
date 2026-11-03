const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash,timingSafeEqual} = require('node:crypto');
const {ChatError,validateRequest,requestOpenAI} = require('./openai.cjs');

function createServer({env=process.env,fetchImpl=fetch}={}) {
  const root = path.resolve(__dirname,'..');
  const origins = new Set((env.AI_ALLOWED_ORIGINS || 'http://localhost:8787,http://127.0.0.1:8787').split(',').map(s => s.trim()).filter(Boolean));
  const token = env.AI_CHAT_TOKEN || '';
  const digest = value => createHash('sha256').update(value).digest();
  const expectedToken = digest(token);
  let count = 0, windowStart = Date.now(), active = 0;

  return http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const reply = (status,body) => {
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(body));
    };
    let pathname;
    try { pathname = new URL(req.url,'http://localhost').pathname; }
    catch (_) { reply(400,{error:'Ungültige Adresse.'}); return; }
    if (pathname === '/health' && req.method === 'GET') { reply(200,{ok:true,commandVersion:4}); return; }

    if (pathname === '/api/chat') {
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) { reply(403,{error:'Dieser Editor ist nicht freigeschaltet.'}); req.resume(); return; }
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin',origin);
        res.setHeader('Vary','Origin');
        res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
      if (req.method !== 'POST') { res.setHeader('Allow','POST, OPTIONS'); reply(405,{error:'Nur POST ist erlaubt.'}); return; }
      if (token.length < 24 || !env.OPENAI_API_KEY || !env.OPENAI_MODEL) { reply(503,{error:'Der KI-Dienst ist noch nicht eingerichtet.'}); req.resume(); return; }
      const authorization = req.headers.authorization || '';
      if (authorization.length > 512 || !authorization.startsWith('Bearer ') || !timingSafeEqual(digest(authorization.slice(7)),expectedToken)) { reply(401,{error:'Ungültiger Zugangscode.'}); req.resume(); return; }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) { reply(415,{error:'JSON erforderlich.'}); req.resume(); return; }
      if (Date.now()-windowStart >= 60000) { count = 0; windowStart = Date.now(); }
      if (count >= 20 || active >= 2) { res.setHeader('Retry-After','60'); reply(429,{error:'Bitte kurz warten.'}); req.resume(); return; }
      const chunks = [];
      let length = 0;
      try {
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 256000) throw new ChatError(413,'Die Anfrage ist zu groß.');
          chunks.push(chunk);
        }
      } catch (error) {
        if (!res.destroyed) reply(error.status || 400,{error:error.status === 413 ? error.message : 'Anfrage konnte nicht gelesen werden.'});
        return;
      }
      let body;
      try { body = validateRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reply(400,{error:'Ungültige Skizzen- oder Chatdaten.'}); return; }
      // Other uploads may have completed while this body was being read.
      if (count >= 20 || active >= 2) { res.setHeader('Retry-After','60'); reply(429,{error:'Bitte kurz warten.'}); return; }
      count++; active++;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(),45000);
      const disconnect = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close',disconnect);
      try {
        const result = await requestOpenAI(body,{apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL,fetchImpl,signal:controller.signal});
        if (!res.destroyed) reply(200,result);
      } catch (error) {
        if (!res.destroyed) reply(error.status || 502,{error:'Die KI-Anfrage konnte nicht abgeschlossen werden.'});
      } finally {
        clearTimeout(timeout); active--; res.off('close',disconnect);
      }
      return;
    }

    const staticFile = pathname === '/' ? 'index.html' : pathname.slice(1);
    const allowed = ['index.html','ai-chat.css','manifest.webmanifest','service-worker.js','README.md'].includes(staticFile) || /^js\/[a-z0-9-]+\.js$/.test(staticFile) || /^icons\/[a-z0-9-]+\.png$/.test(staticFile);
    if (env.SERVE_EDITOR !== 'true' || req.method !== 'GET' || !allowed) { reply(404,{error:'Nicht gefunden.'}); return; }
    try {
      const data = await fs.readFile(path.join(root,staticFile));
      const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.md':'text/plain','.png':'image/png','.webmanifest':'application/manifest+json'};
      res.writeHead(200,{'Content-Type':`${types[path.extname(staticFile)] || 'application/octet-stream'}${path.extname(staticFile) === '.png' ? '' : '; charset=utf-8'}`});
      res.end(data);
    } catch (_) { reply(404,{error:'Nicht gefunden.'}); }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(port,host,() => console.log(`Handball-KI-Dienst gestartet auf ${host}:${port}`));
}

module.exports = {createServer};
