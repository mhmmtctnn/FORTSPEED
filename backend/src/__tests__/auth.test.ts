/**
 * Auth Routes Tests
 * =================
 * POST /api/auth/login, PUT /api/auth/config, POST /api/auth/change-password,
 * GET /api/auth/config, GET /api/auth/keycloak-url, POST /api/auth/config/test
 */

import { buildApp } from '../app';
import { invalidateAuthConfigCache, escapeLdapDN } from '../routes/auth';
import bcrypt from 'bcrypt';

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    publish:   jest.fn().mockResolvedValue(1),
    subscribe: jest.fn(),
    on:        jest.fn(),
  }))
);

const mockQuery = jest.fn();
const mockPg    = { query: mockQuery, connect: jest.fn() };
const mockRedis = {
  publish:   jest.fn().mockResolvedValue(1),
  subscribe: jest.fn(),
  on:        jest.fn(),
  get:       jest.fn().mockResolvedValue(null),
  setex:     jest.fn().mockResolvedValue('OK'),
  del:       jest.fn().mockResolvedValue(1),
};

describe('Auth Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, mockPg, mockRedis });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockQuery.mockReset();
    invalidateAuthConfigCache();
  });

  // ─── GET /api/auth/config ──────────────────────────────────────────────────

  describe('GET /api/auth/config', () => {
    it('200 döndürmeli ve passwordHash gizlenmeli', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ provider: 'local', config: { local: { username: 'admin', passwordHash: 'somehash' } } }],
      });

      const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.provider).toBe('local');
      expect(body.config.local.passwordHash).toBe('');
    });

    it('DB\'de config yoksa varsayılan local provider döndürmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.provider).toBe('local');
    });
  });

  // ─── POST /api/auth/login ──────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('varsayılan admin/admin ile giriş başarılı olmalı (DB\'de config yok)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // getAuthConfig → no rows → default

      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.username).toBe('admin');
    });

    it('yanlış şifre ile giriş 401 döndürmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // default config

      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'yanlis_sifre' }),
      });

      expect(res.statusCode).toBe(401);
    });

    it('yanlış kullanıcı adı ile giriş 401 döndürmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // default config

      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'hacker', password: 'admin' }),
      });

      expect(res.statusCode).toBe(401);
    });

    it('body eksikse 400 döndürmeli (JSON schema)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin' }), // password eksik
      });

      expect(res.statusCode).toBe(400);
    });

    it('bcrypt hash ile saklanmış şifre doğrulanmalı', async () => {
      const hash = await bcrypt.hash('mysecret', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{ provider: 'local', config: { local: { username: 'admin', passwordHash: hash } } }],
      });

      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'mysecret' }),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });

    it('eski sha256 hash ile saklanmış şifre bcrypt\'e migrate edilmeli', async () => {
      const crypto = require('crypto');
      const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
      const legacyHash = sha256('legacypass');

      mockQuery
        .mockResolvedValueOnce({ rows: [{ provider: 'local', config: { local: { username: 'admin', passwordHash: legacyHash } } }] }) // getAuthConfig
        .mockResolvedValueOnce({ rows: [] }); // bcrypt migration UPDATE

      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'legacypass' }),
      });

      expect(res.statusCode).toBe(200);
      // Migration UPDATE should have been called
      const insertCall = mockQuery.mock.calls.find((c: any[]) =>
        typeof c[0] === 'string' && c[0].includes('ON CONFLICT (ID) DO UPDATE')
      );
      expect(insertCall).toBeTruthy();
    });
  });

  // ─── PUT /api/auth/config ──────────────────────────────────────────────────

  describe('PUT /api/auth/config', () => {
    it('FORTSPEED_API_KEY yokken herkes erişebilmeli', async () => {
      delete process.env.FORTSPEED_API_KEY;
      mockQuery
        .mockResolvedValueOnce({ rows: [] })  // getAuthConfig (existing)
        .mockResolvedValueOnce({ rows: [] }); // INSERT/UPDATE AuthConfig

      const res = await app.inject({
        method: 'PUT', url: '/api/auth/config',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'local', config: { local: { username: 'admin', passwordHash: '' } } }),
      });

      expect(res.statusCode).toBe(200);
    });

    it('FORTSPEED_API_KEY varken doğru key ile erişilebilmeli', async () => {
      process.env.FORTSPEED_API_KEY = 'test-api-key-12345';
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await app.inject({
        method: 'PUT', url: '/api/auth/config',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test-api-key-12345',
        },
        body: JSON.stringify({ provider: 'local', config: { local: { username: 'admin', passwordHash: '' } } }),
      });

      expect(res.statusCode).toBe(200);
      delete process.env.FORTSPEED_API_KEY;
    });

    it('FORTSPEED_API_KEY varken yanlış key ile 403 döndürmeli', async () => {
      process.env.FORTSPEED_API_KEY = 'correct-key';

      const res = await app.inject({
        method: 'PUT', url: '/api/auth/config',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer wrong-key',
        },
        body: JSON.stringify({ provider: 'local', config: {} }),
      });

      expect(res.statusCode).toBe(403);
      delete process.env.FORTSPEED_API_KEY;
    });

    it('FORTSPEED_API_KEY varken key olmadan 403 döndürmeli', async () => {
      process.env.FORTSPEED_API_KEY = 'correct-key';

      const res = await app.inject({
        method: 'PUT', url: '/api/auth/config',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'local', config: {} }),
      });

      expect(res.statusCode).toBe(403);
      delete process.env.FORTSPEED_API_KEY;
    });

    it('geçersiz provider 400 döndürmeli', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/auth/config',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'invalid_provider', config: {} }),
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ─── POST /api/auth/change-password ───────────────────────────────────────

  describe('POST /api/auth/change-password', () => {
    it('doğru mevcut şifre ile şifre değiştirilebilmeli', async () => {
      const hash = await bcrypt.hash('oldpass', 10);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ provider: 'local', config: { local: { username: 'admin', passwordHash: hash } } }] }) // getAuthConfig
        .mockResolvedValueOnce({ rows: [] }); // UPDATE AuthConfig

      const res = await app.inject({
        method: 'POST', url: '/api/auth/change-password',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'oldpass', newPassword: 'newpass' }),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });

    it('yanlış mevcut şifre ile 401 döndürmeli', async () => {
      const hash = await bcrypt.hash('correctpass', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{ provider: 'local', config: { local: { username: 'admin', passwordHash: hash } } }],
      });

      const res = await app.inject({
        method: 'POST', url: '/api/auth/change-password',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'wrongpass', newPassword: 'newpass' }),
      });

      expect(res.statusCode).toBe(401);
    });

    it('local olmayan provider 400 döndürmeli', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ provider: 'ldap', config: { ldap: {} } }],
      });

      const res = await app.inject({
        method: 'POST', url: '/api/auth/change-password',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'x', newPassword: 'y' }),
      });

      expect(res.statusCode).toBe(400);
    });

    it('body eksikse 400 döndürmeli (JSON schema)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/auth/change-password',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'x' }), // newPassword eksik
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ─── POST /api/auth/config/test ───────────────────────────────────────────

  describe('POST /api/auth/config/test', () => {
    it('keycloak olmayan provider için ok:true döndürmeli', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/auth/config/test',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'local', config: {} }),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });
  });
});

describe('escapeLdapDN — LDAP enjeksiyon koruması', () => {
  it('temiz girdi değişmeden geçmeli', () => {
    expect(escapeLdapDN('admin')).toBe('admin');
    expect(escapeLdapDN('user123')).toBe('user123');
  });

  it('* karakterini escape etmeli', () => {
    expect(escapeLdapDN('admin*')).toBe('admin\\*');
  });

  it('parantezleri escape etmeli', () => {
    expect(escapeLdapDN('a(b)c')).toBe('a\\(b\\)c');
  });

  it('virgül ve ters eğik çizgiyi escape etmeli', () => {
    expect(escapeLdapDN('a,b')).toBe('a\\,b');
    expect(escapeLdapDN('a\\b')).toBe('a\\\\b');
  });

  it('birden fazla özel karakter içeren girdiyi escape etmeli', () => {
    expect(escapeLdapDN('admin)(uid=*')).toBe('admin\\)\\(uid=\\*');
  });
});
