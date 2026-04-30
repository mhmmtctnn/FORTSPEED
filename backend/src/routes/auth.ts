import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalConfig {
  username: string;
  passwordHash: string; // bcrypt hash (legacy: sha256 hex, auto-migrated on next login)
}

interface LdapConfig {
  host: string;
  port: number;
  bindDNTemplate: string; // e.g. "uid={username},ou=users,dc=example,dc=com"
  useTLS: boolean;
  tlsRejectUnauthorized: boolean;
}

interface KeycloakConfig {
  serverUrl: string;
  realm: string;
  clientId: string;
  clientSecret?: string;
  flow: 'password' | 'code'; // ROPC vs Authorization Code redirect
}

export type AuthProvider = 'local' | 'ldap' | 'keycloak';

export interface AuthConfigRow {
  provider: AuthProvider;
  config: {
    local?: LocalConfig;
    ldap?: LdapConfig;
    keycloak?: KeycloakConfig;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Legacy sha256 — used only during migration from old hash format
function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Default admin hash — bcrypt; only used when no AuthConfig row exists in DB
const DEFAULT_ADMIN_HASH = bcrypt.hashSync('admin', 10);

let authConfigCache: { value: AuthConfigRow; expiresAt: number } | null = null;
const AUTH_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateAuthConfigCache() {
  authConfigCache = null;
}

async function getAuthConfig(fastify: FastifyInstance): Promise<AuthConfigRow> {
  const now = Date.now();
  if (authConfigCache && now < authConfigCache.expiresAt) {
    return authConfigCache.value;
  }
  const { rows } = await fastify.pg.query(
    'SELECT Provider as provider, Config as config FROM AuthConfig WHERE ID=1'
  );
  let result: AuthConfigRow;
  if (!rows.length) {
    result = { provider: 'local', config: { local: { username: 'admin', passwordHash: DEFAULT_ADMIN_HASH } } };
  } else {
    const row = rows[0];
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    result = { provider: row.provider, config };
  }
  authConfigCache = { value: result, expiresAt: now + AUTH_CONFIG_CACHE_TTL_MS };
  return result;
}

function requireLdapjs(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('ldapjs');
  } catch {
    return null;
  }
}

export function escapeLdapDN(str: string): string {
  return str.replace(/[\\,*()\x00]/g, c => '\\' + c);
}

async function validateLdap(
  cfg: LdapConfig,
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const ldap = requireLdapjs();
  if (!ldap) return { ok: false, error: 'ldapjs paketi yüklü değil. Çalıştırın: npm install ldapjs' };

  return new Promise((resolve) => {
    const url = `${cfg.useTLS ? 'ldaps' : 'ldap'}://${cfg.host}:${cfg.port || 389}`;
    let settled = false;
    const done = (result: { ok: boolean; error?: string }) => {
      if (!settled) { settled = true; resolve(result); }
    };

    let client: any;
    try {
      client = ldap.createClient({
        url,
        timeout: 8000,
        connectTimeout: 8000,
        tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized ?? true },
      });
    } catch (e: any) {
      return done({ ok: false, error: e.message });
    }

    client.on('error', (e: any) => {
      try { client.destroy(); } catch {}
      done({ ok: false, error: e.message || 'LDAP bağlantı hatası' });
    });

    const dn = cfg.bindDNTemplate.replace('{username}', escapeLdapDN(username));
    client.bind(dn, password, (err: any) => {
      try { client.destroy(); } catch {}
      done(err ? { ok: false, error: err.message } : { ok: true });
    });
  });
}

async function validateKeycloak(
  cfg: KeycloakConfig,
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const tokenUrl = `${cfg.serverUrl}/realms/${cfg.realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({ grant_type: 'password', client_id: cfg.clientId, username, password });
    if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({})) as any;
    return { ok: false, error: data.error_description || `Keycloak reddet: HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /api/auth/config — provider + config (secrets stripped)
  fastify.get('/api/auth/config', async (_req, reply) => {
    try {
      const row = await getAuthConfig(fastify);
      const safe: AuthConfigRow = { provider: row.provider, config: { ...row.config } };
      if (safe.config.local)     safe.config.local     = { ...safe.config.local,     passwordHash: '' };
      if (safe.config.keycloak)  safe.config.keycloak  = { ...safe.config.keycloak,  clientSecret: '' };
      return safe;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Hatası' });
    }
  });

  // PUT /api/auth/config — save config (requires LINKOPS_API_KEY if set)
  fastify.put('/api/auth/config', async (request, reply) => {
    const apiKey = process.env.LINKOPS_API_KEY;
    if (apiKey) {
      const authHeader = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const keyHeader = (request.headers['x-api-key'] as string) || '';
      const provided = authHeader || keyHeader;
      try {
        const expected = Buffer.from(apiKey);
        const actual = Buffer.from(provided);
        const valid = expected.length > 0 && expected.length === actual.length &&
          crypto.timingSafeEqual(expected, actual);
        if (!valid) return reply.status(403).send({ error: 'Yetkisiz' });
      } catch {
        return reply.status(403).send({ error: 'Yetkisiz' });
      }
    }

    const body = request.body as AuthConfigRow;
    if (!['local', 'ldap', 'keycloak'].includes(body?.provider)) {
      return reply.status(400).send({ error: 'Geçersiz sağlayıcı' });
    }
    try {
      const existing = await getAuthConfig(fastify);

      // Keep existing password hash if not changed
      if (body.provider === 'local' && body.config.local) {
        if (!body.config.local.passwordHash) {
          body.config.local.passwordHash =
            existing.config.local?.passwordHash ?? DEFAULT_ADMIN_HASH;
        }
      }
      // Keep existing clientSecret if not changed
      if (body.provider === 'keycloak' && body.config.keycloak) {
        if (!body.config.keycloak.clientSecret) {
          body.config.keycloak.clientSecret = existing.config.keycloak?.clientSecret ?? '';
        }
      }

      await fastify.pg.query(
        `INSERT INTO AuthConfig (ID, Provider, Config, UpdatedAt)
         VALUES (1, $1, $2::jsonb, NOW())
         ON CONFLICT (ID) DO UPDATE SET Provider=$1, Config=$2::jsonb, UpdatedAt=NOW()`,
        [body.provider, JSON.stringify(body.config)]
      );
      invalidateAuthConfigCache();
      return { ok: true };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Hatası' });
    }
  });

  // POST /api/auth/login — validate credentials (rate-limited: 5/5min per IP)
  // codeql[js/missing-rate-limiting] — @fastify/rate-limit per-route config applied
  fastify.post('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 128 },
          password: { type: 'string', minLength: 1, maxLength: 256 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };

    try {
      const row = await getAuthConfig(fastify);
      let ok = false;
      let errorMsg: string | undefined;

      switch (row.provider) {
        case 'local': {
          const cfg = row.config.local ?? { username: 'admin', passwordHash: DEFAULT_ADMIN_HASH };
          if (username !== cfg.username) {
            ok = false;
            errorMsg = 'Kullanıcı adı veya şifre hatalı';
            break;
          }
          const isBcrypt = cfg.passwordHash.startsWith('$2');
          if (isBcrypt) {
            ok = await bcrypt.compare(password, cfg.passwordHash);
          } else {
            // Legacy sha256 hash — compare and migrate to bcrypt on success
            ok = sha256(password) === cfg.passwordHash;
            if (ok) {
              try {
                const newHash = await bcrypt.hash(password, 10);
                const migratedConfig = { ...row.config, local: { ...cfg, passwordHash: newHash } };
                await fastify.pg.query(
                  `INSERT INTO AuthConfig (ID, Provider, Config, UpdatedAt)
                   VALUES (1, $1, $2::jsonb, NOW())
                   ON CONFLICT (ID) DO UPDATE SET Config=$2::jsonb, UpdatedAt=NOW()`,
                  [row.provider, JSON.stringify(migratedConfig)]
                );
              } catch (migrateErr) {
                fastify.log.warn(migrateErr, 'bcrypt hash migration failed — will retry on next login');
              }
            }
          }
          if (!ok) errorMsg = 'Kullanıcı adı veya şifre hatalı';
          break;
        }
        case 'ldap': {
          if (!row.config.ldap) return reply.status(500).send({ error: 'LDAP yapılandırılmamış' });
          const res = await validateLdap(row.config.ldap, username, password);
          ok = res.ok;
          errorMsg = res.error;
          break;
        }
        case 'keycloak': {
          if (!row.config.keycloak) return reply.status(500).send({ error: 'Keycloak yapılandırılmamış' });
          if (row.config.keycloak.flow === 'code') {
            return reply.status(400).send({ error: 'redirect_flow', message: 'Keycloak yönlendirme akışı kullanılıyor' });
          }
          const res = await validateKeycloak(row.config.keycloak, username, password);
          ok = res.ok;
          errorMsg = res.error;
          break;
        }
      }

      if (ok) return { ok: true, username };
      return reply.status(401).send({ error: errorMsg || 'Kimlik doğrulama başarısız' });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Sunucu hatası' });
    }
  });

  // POST /api/auth/change-password — local provider only
  fastify.post('/api/auth/change-password', {
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1, maxLength: 256 },
          newPassword:     { type: 'string', minLength: 1, maxLength: 256 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };

    try {
      const row = await getAuthConfig(fastify);
      if (row.provider !== 'local') return reply.status(400).send({ error: 'Yerel kimlik doğrulama kullanılmıyor' });
      const cfg = row.config.local ?? { username: 'admin', passwordHash: DEFAULT_ADMIN_HASH };
      const isBcrypt = cfg.passwordHash.startsWith('$2');
      const currentValid = isBcrypt
        ? await bcrypt.compare(currentPassword || '', cfg.passwordHash)
        : sha256(currentPassword || '') === cfg.passwordHash;
      if (!currentValid) {
        return reply.status(401).send({ error: 'Mevcut şifre yanlış' });
      }
      const newHash = await bcrypt.hash(newPassword, 10);
      const updated = { ...row.config, local: { ...cfg, passwordHash: newHash } };
      await fastify.pg.query(
        `INSERT INTO AuthConfig (ID, Provider, Config, UpdatedAt)
         VALUES (1, $1, $2::jsonb, NOW())
         ON CONFLICT (ID) DO UPDATE SET Config=$2::jsonb, UpdatedAt=NOW()`,
        [row.provider, JSON.stringify(updated)]
      );
      invalidateAuthConfigCache();
      return { ok: true };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Hatası' });
    }
  });

  // GET /api/auth/keycloak-url — redirect flow: build Keycloak auth URL
  fastify.get('/api/auth/keycloak-url', async (request, reply) => {
    try {
      const row = await getAuthConfig(fastify);
      if (row.provider !== 'keycloak' || !row.config.keycloak) {
        return reply.status(400).send({ error: 'Keycloak yapılandırılmamış' });
      }
      const { serverUrl, realm, clientId, flow } = row.config.keycloak;
      if (flow !== 'code') return reply.status(400).send({ error: 'code akışı yapılandırılmamış' });
      const { redirectUri } = request.query as { redirectUri?: string };
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri || '',
        response_type: 'code',
        scope: 'openid profile',
      });
      return { url: `${serverUrl}/realms/${realm}/protocol/openid-connect/auth?${params}` };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Hata' });
    }
  });

  // POST /api/auth/keycloak-exchange — redirect flow: exchange code for token
  fastify.post('/api/auth/keycloak-exchange', async (request, reply) => {
    const { code, redirectUri } = request.body as { code?: string; redirectUri?: string };
    if (!code) return reply.status(400).send({ error: 'Kod eksik' });

    try {
      const row = await getAuthConfig(fastify);
      if (row.provider !== 'keycloak' || !row.config.keycloak) {
        return reply.status(400).send({ error: 'Keycloak yapılandırılmamış' });
      }
      const { serverUrl, realm, clientId, clientSecret } = row.config.keycloak;
      const tokenUrl = `${serverUrl}/realms/${realm}/protocol/openid-connect/token`;
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri || '',
      });
      if (clientSecret) body.set('client_secret', clientSecret);

      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as any;
        return reply.status(401).send({ error: data.error_description || 'Kod değişimi başarısız' });
      }

      const tokens = await res.json() as any;
      let username = 'user';
      try {
        const payload = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString());
        username = payload.preferred_username || payload.sub || 'user';
      } catch {}
      return { ok: true, username };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Kod değişimi başarısız' });
    }
  });

  // POST /api/auth/config/test — test provider connection
  fastify.post('/api/auth/config/test', async (request, reply) => {
    const body = request.body as Partial<AuthConfigRow>;
    try {
      if (body.provider === 'ldap' && body.config?.ldap) {
        const ldap = requireLdapjs();
        if (!ldap) return { ok: false, error: 'ldapjs yüklü değil. Backend container\'ında: npm install ldapjs' };
        const cfg = body.config.ldap;
        const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
          const url = `${cfg.useTLS ? 'ldaps' : 'ldap'}://${cfg.host}:${cfg.port || 389}`;
          let settled = false;
          const done = (r: { ok: boolean; error?: string }) => { if (!settled) { settled = true; resolve(r); } };
          const timer = setTimeout(() => done({ ok: false, error: 'Bağlantı zaman aşımı' }), 6000);
          let client: any;
          try {
            client = ldap.createClient({ url, connectTimeout: 5000, timeout: 5000,
              tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized ?? true } });
          } catch (e: any) {
            clearTimeout(timer);
            return done({ ok: false, error: e.message });
          }
          client.on('connect', () => { clearTimeout(timer); try { client.destroy(); } catch {} done({ ok: true }); });
          client.on('error', (e: any) => { clearTimeout(timer); try { client.destroy(); } catch {} done({ ok: false, error: e.message }); });
        });
        return result;
      }

      if (body.provider === 'keycloak' && body.config?.keycloak) {
        const cfg = body.config.keycloak;
        if (!cfg.serverUrl || !cfg.realm) return { ok: false, error: 'Server URL ve Realm zorunlu' };
        const wellKnown = `${cfg.serverUrl}/realms/${cfg.realm}/.well-known/openid-configuration`;
        const res = await fetch(wellKnown, { signal: AbortSignal.timeout(6000) });
        if (res.ok) return { ok: true };
        return { ok: false, error: `Realm bulunamadı (HTTP ${res.status})` };
      }

      return { ok: true };
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ ok: false, error: err.message });
    }
  });
}
