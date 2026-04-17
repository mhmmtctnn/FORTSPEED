/**
 * ITAI Hub Integration Middleware
 *
 * ITAI_MODE=true oldugunda aktif:
 *  - SSO endpoint (POST /auth/sso) — JWT dogrulama ile session olusturma
 *  - SSO auto-login via itai_token query param (iframe first load)
 *  - Trace ID propagation (X-ITAI-Trace-ID header)
 *  - GET / root route (NOC Dashboard)
 *  - GET /health endpoint
 *  - API key dogrulama (adapter cagirilari icin)
 *
 * ITAI_MODE=false (standalone) → SSO 403 doner, diger middleware'ler pasif.
 */

import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export const ITAI_MODE = process.env.ITAI_MODE?.toLowerCase() === 'true';

function getJwtSecret(): string {
  return process.env.ITAI_JWT_SECRET || '';
}

function getApiKey(): string {
  return process.env.FORTSPEED_API_KEY || '';
}

// --- JWT HS256 Verification ---

function base64UrlDecode(str: string): Buffer {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

export function verifyHS256Token(
  token: string,
  secret: string,
): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerJson = base64UrlDecode(parts[0]).toString('utf8');
    const header = JSON.parse(headerJson);
    if (header.alg !== 'HS256') return null;

    const signingInput = `${parts[0]}.${parts[1]}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(signingInput)
      .digest();
    const actualSig = base64UrlDecode(parts[2]);

    if (expectedSig.length !== actualSig.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;

    const payloadJson = base64UrlDecode(parts[1]).toString('utf8');
    const payload = JSON.parse(payloadJson);

    if (!payload.exp) return null;
    if (Date.now() / 1000 > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

// --- NOC Dashboard HTML (inline, no external deps) ---

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FORTSPEED NOC</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0}
.hdr{background:#1e293b;padding:16px 24px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #334155}
.hdr h1{font-size:18px;font-weight:600}
.badge{font-size:11px;padding:2px 8px;border-radius:12px;color:#fff}
.badge-ok{background:#059669}
.badge-err{background:#dc2626}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:24px}
.card{background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155}
.card .lbl{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.card .val{font-size:28px;font-weight:700}
.card .unit{font-size:14px;color:#94a3b8;margin-left:4px}
.val-grn{color:#34d399} .val-blu{color:#60a5fa} .val-amb{color:#fbbf24}
.sec{padding:0 24px 24px}
.sec h2{font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155}
th{background:#0f172a;padding:10px 16px;text-align:left;font-size:12px;color:#94a3b8;text-transform:uppercase}
td{padding:10px 16px;border-top:1px solid #0f172a;font-size:13px}
tr:hover td{background:#334155}
.s-ok{color:#34d399} .s-mid{color:#fbbf24} .s-bad{color:#f87171}
.ld{text-align:center;padding:40px;color:#64748b}
.btn{background:#334155;border:1px solid #475569;color:#e2e8f0;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px}
.btn:hover{background:#475569}
</style>
</head>
<body>
<div class="hdr">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
  <h1>FORTSPEED NOC Dashboard</h1>
  <span class="badge badge-ok" id="status">Yukleniyor...</span>
  <div style="flex:1"></div>
  <button class="btn" id="refresh-btn">Yenile</button>
</div>
<div class="grid" id="kpi-grid"><div class="ld">Veriler yukleniyor...</div></div>
<div class="sec">
  <h2>Misyon Durumlari</h2>
  <table><thead><tr><th>Misyon</th><th>Ulke</th><th>Kita</th><th>Download</th><th>Upload</th><th>Son Test</th></tr></thead>
  <tbody id="mtb"><tr><td colspan="6" class="ld">Yukleniyor...</td></tr></tbody></table>
</div>
<script>
(function(){
  var BASE = window.location.pathname.replace(/\\\/$/,'');
  function api(p){return fetch(BASE+p).then(function(r){return r.json();})}
  function sc(v){return v>=50?'s-ok':v>=10?'s-mid':'s-bad'}
  function fs(v){return v!=null?v.toFixed(1):'-'}
  function esc(s){if(!s&&s!==0)return'-';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

  function loadKPI(){
    Promise.all([api('/api/reports/summary'),api('/api/webhook/stats')]).then(function(res){
      var s=res[0].data||res[0], w=res[1].data||res[1];
      var g=document.getElementById('kpi-grid');
      g.textContent='';
      var items=[
        {l:'Toplam Misyon',v:s.totalMissions||s.total_missions||0,c:'val-blu',u:''},
        {l:'Ort. Download',v:fs(s.avgDownload||s.avg_download),c:'val-grn',u:'Mbps'},
        {l:'Ort. Upload',v:fs(s.avgUpload||s.avg_upload),c:'val-grn',u:'Mbps'},
        {l:'Webhook Bugun',v:w.today||0,c:'val-amb',u:''},
        {l:'Webhook Toplam',v:w.total||0,c:'val-blu',u:''}
      ];
      items.forEach(function(it){
        var card=document.createElement('div');card.className='card';
        var lbl=document.createElement('div');lbl.className='lbl';lbl.textContent=it.l;
        var val=document.createElement('div');val.className='val '+it.c;val.textContent=it.v;
        if(it.u){var sp=document.createElement('span');sp.className='unit';sp.textContent=it.u;val.appendChild(sp)}
        card.appendChild(lbl);card.appendChild(val);g.appendChild(card);
      });
      var st=document.getElementById('status');st.textContent='Canli';st.className='badge badge-ok';
    }).catch(function(e){
      document.getElementById('kpi-grid').textContent='KPI verileri yuklenemedi: '+e.message;
      var st=document.getElementById('status');st.textContent='Hata';st.className='badge badge-err';
    });
  }

  function loadMissions(){
    api('/api/missions').then(function(res){
      var missions=res.data||res;
      var tb=document.getElementById('mtb');
      tb.textContent='';
      if(!Array.isArray(missions)||missions.length===0){
        var tr=document.createElement('tr');var td=document.createElement('td');
        td.colSpan=6;td.className='ld';td.textContent='Misyon bulunamadi';
        tr.appendChild(td);tb.appendChild(tr);return;
      }
      missions.forEach(function(m){
        var tr=document.createElement('tr');
        var dl=m.latestDownload||m.latest_download;
        var ul=m.latestUpload||m.latest_upload;
        var cells=[
          esc(m.CityName||m.city_name),
          esc(m.ULKE||m.country),
          esc(m.KITA||m.continent),
          {t:fs(dl)+' Mbps',c:sc(dl)},
          {t:fs(ul)+' Mbps',c:sc(ul)},
          esc(m.latestTest||m.latest_test)
        ];
        cells.forEach(function(c){
          var td=document.createElement('td');
          if(typeof c==='object'){td.textContent=c.t;td.className=c.c}
          else{td.textContent=c}
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
    }).catch(function(){
      var tb=document.getElementById('mtb');tb.textContent='';
      var tr=document.createElement('tr');var td=document.createElement('td');
      td.colSpan=6;td.textContent='Misyon verileri yuklenemedi';
      tr.appendChild(td);tb.appendChild(tr);
    });
  }

  function loadAll(){loadKPI();loadMissions()}
  document.getElementById('refresh-btn').addEventListener('click',loadAll);
  loadAll();
  setInterval(loadAll,30000);
})();
</script>
</body>
</html>`;

// --- Middleware Registration ---

export async function registerItaiMiddleware(
  fastify: FastifyInstance,
  opts: { itaiMode?: boolean } = {},
): Promise<void> {
  const isItaiMode = opts.itaiMode ?? ITAI_MODE;

  fastify.decorateRequest('itaiTraceId', '');
  fastify.decorateRequest('itaiUser', null);

  // Root route: NOC Dashboard
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.type('text/html; charset=utf-8').send(DASHBOARD_HTML);
  });

  // Health endpoint
  fastify.get('/health', async () => {
    return { status: 'healthy', module: 'fortspeed-noc', itai_mode: isItaiMode };
  });

  // SSO Endpoint — always registered, returns 403 when disabled
  // Rate limit: brute-force koruması için 5 deneme/dakika
  fastify.post('/auth/sso', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isItaiMode) {
      return reply.status(403).send({
        status: 'error',
        message: 'SSO disabled',
        code: 'SSO_DISABLED',
      });
    }

    const authHeader = request.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        status: 'error',
        message: 'Missing Bearer token',
        code: 'SSO_MISSING_TOKEN',
      });
    }

    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return reply.status(500).send({
        status: 'error',
        message: 'SSO not configured',
        code: 'SSO_NOT_CONFIGURED',
      });
    }

    const token = authHeader.slice(7);
    const payload = verifyHS256Token(token, jwtSecret);

    if (!payload) {
      return reply.status(401).send({
        status: 'error',
        message: 'Invalid or expired token',
        code: 'SSO_INVALID_TOKEN',
      });
    }

    const username =
      (payload.preferred_username as string) ||
      (payload.sub as string) ||
      'itai_user';

    fastify.log.info(`SSO login successful for user: ${username}`);

    return reply.send({
      status: 'success',
      data: { session: 'created', username },
      timestamp: new Date().toISOString(),
    });
  });

  if (!isItaiMode) {
    fastify.log.info('ITAI_MODE is disabled — middleware inactive.');
    return;
  }

  if (!getJwtSecret()) {
    fastify.log.error(
      'ITAI_MODE is enabled but ITAI_JWT_SECRET is not set!',
    );
  }

  fastify.log.info('ITAI_MODE is enabled — registering middleware.');

  // onRequest: Trace ID + itai_token query param SSO
  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest) => {
      const traceId =
        (request.headers['x-itai-trace-id'] as string) ||
        crypto.randomUUID();
      (request as any).itaiTraceId = traceId;

      // SSO auto-login via itai_token query param (iframe first load)
      const query = request.query as Record<string, string>;
      const itaiToken = query?.itai_token;
      if (itaiToken) {
        const jwtSecret = getJwtSecret();
        if (jwtSecret) {
          const payload = verifyHS256Token(itaiToken, jwtSecret);
          if (payload) {
            const username =
              (payload.preferred_username as string) ||
              (payload.sub as string) ||
              'itai_user';
            (request as any).itaiUser = username;
            fastify.log.info(`SSO auto-login via query param for user: ${username}`);
          } else {
            fastify.log.warn('SSO query param token verification failed.');
          }
        }
      }
    },
  );

  fastify.addHook(
    'onSend',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
      _payload: unknown,
    ) => {
      const traceId = (request as any).itaiTraceId;
      if (traceId) {
        reply.header('X-ITAI-Trace-ID', traceId);
      }
      return _payload;
    },
  );
}

// --- API Key Validation Helper ---

export function validateApiKey(request: FastifyRequest): boolean {
  const apiKey = getApiKey();
  if (!ITAI_MODE || !apiKey) return true;

  const authHeader = request.headers.authorization || '';
  const apiKeyHeader = (request.headers['x-api-key'] as string) || '';

  let clientKey = '';
  if (authHeader.startsWith('Bearer ')) {
    clientKey = authHeader.slice(7);
  } else if (apiKeyHeader) {
    clientKey = apiKeyHeader;
  }

  if (!clientKey) return false;

  try {
    const expected = Buffer.from(apiKey);
    const actual = Buffer.from(clientKey);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
