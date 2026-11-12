
const STORE_KEY = 'mahigo_group_state_v1';
const COOKIE_NAME = 'mahigo_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

const DEFAULTS = {
  websites: [],
  games: [],
  apis: [],
  db: null,
  activity: [],
  brands: [
    { name: 'MahigoWebs', desc: 'Website creation and subdomain hosting', domain: '.mahigo.com' },
    { name: 'Mahigo Kusum API', desc: 'Custom API and endpoint platform', domain: 'api.mahigo.com' },
    { name: 'MahigoHeadquarters Bangladesh', desc: 'Corporate headquarters and administration', domain: '—' },
    { name: 'MahigoGames', desc: 'Interactive Scratch game hosting', domain: '.games.mahigo.com' }
  ],
  settings: {
    hq: 'Bangladesh',
    address: '',
    contact: '',
    siteTitle: 'Mahigo Group',
    adminName: 'Administrator'
  }
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers
    }
  });
}

function text(data, status = 200, headers = {}) {
  return new Response(data, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      ...headers
    }
  });
}

function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function unb64url(value) {
  const base = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base + '='.repeat((4 - base.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function issueToken(username, secret) {
  const payload = b64url(
    encoder.encode(JSON.stringify({
      u: username,
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
    }))
  );

  const key = await hmacKey(secret);

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    )
  );

  return `${payload}.${b64url(signature)}`;
}

async function verifyToken(token, secret) {
  if (!token || !secret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  try {
    const key = await hmacKey(secret);

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      unb64url(parts[1]),
      encoder.encode(parts[0])
    );

    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(unb64url(parts[0]))
    );

    if (
      !payload.u ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) return null;

    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};

  for (const chunk of header.split(';')) {
    const index = chunk.indexOf('=');

    if (index > 0) {
      out[chunk.slice(0, index).trim()] =
        chunk.slice(index + 1).trim();
    }
  }

  return out;
}

function cookieHeader(value, maxAge = SESSION_SECONDS) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function sameSecret(a, b) {
  const x = encoder.encode(String(a ?? ''));
  const y = encoder.encode(String(b ?? ''));

  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);

  for (let i = 0; i < n; i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }

  return diff === 0;
}

function safeSlug(value) {
  const slug = String(value || '').trim().toLowerCase();

  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug)
    ? slug
    : null;
}

function logActivity(state, message) {
  state.activity.unshift({
    text: message,
    time: new Date().toLocaleString('en-GB', {
      timeZone: 'Asia/Dhaka'
    }) + ' (Asia/Dhaka)'
  });

  state.activity = state.activity.slice(0, 30);
}

function mergeDefaults(saved) {
  return {
    ...DEFAULTS,
    ...(saved || {}),

    websites: Array.isArray(saved?.websites) ? saved.websites : [],
    games: Array.isArray(saved?.games) ? saved.games : [],
    apis: Array.isArray(saved?.apis) ? saved.apis : [],
    activity: Array.isArray(saved?.activity) ? saved.activity : [],
    brands: Array.isArray(saved?.brands) ? saved.brands : DEFAULTS.brands,

    settings: {
      ...DEFAULTS.settings,
      ...(saved?.settings || {})
    }
  };
}

async function getKV() {
  // Bind EdgeOne KV using the variable name mahigo_kv.
  if (
    typeof mahigo_kv === 'undefined' ||
    !mahigo_kv ||
    typeof mahigo_kv.get !== 'function'
  ) {
    return null;
  }

  return mahigo_kv;
}

async function readState(kv) {
  const saved = await kv.get(STORE_KEY, { type: 'json' });
  return mergeDefaults(saved);
}

async function writeState(kv, state) {
  await kv.put(STORE_KEY, JSON.stringify(state));
}

async function requireAdmin(request, secret) {
  const token = parseCookies(
    request.headers.get('cookie') || ''
  )[COOKIE_NAME];

  return await verifyToken(token, secret);
}

function originAllowed(request) {
  const origin = request.headers.get('origin');

  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function bodyJSON(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function id() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function onRequest(context) {
  const { request, env = {} } = context;

  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  const adminUsername = env.ADMIN_USERNAME || 'admin';
  const adminPassword = env.ADMIN_PASSWORD || '';
  const sessionSecret = env.SESSION_SECRET || '';
  const apiHost = (env.API_HOST || 'api.mahigo.com').toLowerCase();

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'access-control-allow-headers': 'Content-Type'
      }
    });
  }

  // Health check
  if (pathname === '/api/health' && method === 'GET') {
    const kv = await getKV();
    const missing = [];

    if (!adminPassword) {
      missing.push('ADMIN_PASSWORD environment variable is missing');
    }

    if (sessionSecret.length < 32) {
      missing.push('SESSION_SECRET must contain at least 32 characters');
    }

    if (!kv) {
      missing.push('KV namespace is missing: bind mahigo_kv');
    }

    if (missing.length) {
      return json({
        ok: false,
        error: missing.join('; ')
      }, 503);
    }

    return json({
      ok: true,
      service: 'Mahigo Group on EdgeOne',
      storage: 'EdgeOne KV'
    });
  }

  const isAdminPath = pathname.startsWith('/api/admin/');

  if (
    isAdminPath &&
    method !== 'GET' &&
    !originAllowed(request)
  ) {
    return json({
      error: 'Request origin mismatch. Open the admin page on the same hostname.'
    }, 403);
  }

  // Administrator login
  if (pathname === '/api/admin/login' && method === 'POST') {
    if (!adminPassword || sessionSecret.length < 32) {
      return json({
        error: 'Admin secrets are not configured in EdgeOne.'
      }, 503);
    }

    const input = await bodyJSON(request);

    const userOK = sameSecret(input?.username, adminUsername);
    const passOK = sameSecret(input?.password, adminPassword);

    if (!userOK || !passOK) {
      return json({
        error: 'Incorrect administrator username or password.'
      }, 401);
    }

    const token = await issueToken(
      adminUsername,
      sessionSecret
    );

    return json(
      { ok: true },
      200,
      { 'set-cookie': cookieHeader(token) }
    );
  }

  // Administrator logout
  if (pathname === '/api/admin/logout' && method === 'POST') {
    return json(
      { ok: true },
      200,
      { 'set-cookie': cookieHeader('', 0) }
    );
  }

  const kv = await getKV();

  if (!kv) {
    return json({
      error: 'EdgeOne KV is not bound. Bind your namespace as mahigo_kv.'
    }, 503);
  }

  const isPublicApiHost = url.hostname.toLowerCase() === apiHost;

  // Public Mahigo Kusum API
  if (
    isPublicApiHost &&
    !isAdminPath &&
    !pathname.startsWith('/api/')
  ) {
    const state = await readState(kv);

    const api = state.apis.find(
      item => item.path === pathname && item.method === method
    );

    if (!api) {
      return json({
        error: 'Mahigo Kusum endpoint not found.'
      }, 404, {
        'access-control-allow-origin': '*'
      });
    }

    if (api.source === 'Custom JSON response') {
      return json(
        api.responseJson ?? {},
        200,
        { 'access-control-allow-origin': '*' }
      );
    }

    if (!state.db) {
      return json({
        error: 'No database has been imported.'
      }, 503, {
        'access-control-allow-origin': '*'
      });
    }

    if (method === 'GET') {
      return json(
        state.db.data,
        200,
        { 'access-control-allow-origin': '*' }
      );
    }

    if (method === 'POST') {
      const record = await bodyJSON(request);

      if (record === null) {
        return json({
          error: 'Request body must contain valid JSON.'
        }, 400);
      }

      if (Array.isArray(state.db.data)) {
        state.db.data.push(record);
      } else if (
        state.db.data &&
        typeof state.db.data === 'object'
      ) {
        if (!Array.isArray(state.db.data.records)) {
          state.db.data.records = [];
        }

        state.db.data.records.push(record);
      } else {
        return json({
          error: 'Imported JSON root must be an array or object.'
        }, 409);
      }

      logActivity(
        state,
        `A public POST request added a record through ${api.path}`
      );

      await writeState(kv, state);

      return json(
        { ok: true, record },
        201,
        { 'access-control-allow-origin': '*' }
      );
    }
  }

  if (!isAdminPath) {
    return text('Mahigo Group EdgeOne API route not found.', 404);
  }

  const session = await requireAdmin(request, sessionSecret);

  if (!session) {
    return json({
      error: 'Administrator session required. Sign in again.'
    }, 401);
  }

  // Session validation
  if (pathname === '/api/admin/me' && method === 'GET') {
    return json({
      ok: true,
      username: session.u
    });
  }

  // Retrieve saved workspace
  if (pathname === '/api/admin/state' && method === 'GET') {
    return json(await readState(kv));
  }

  // MahigoWebs website creation
  if (pathname === '/api/admin/websites' && method === 'POST') {
    const input = await bodyJSON(request);
    const slug = safeSlug(input?.subdomain);

    if (!String(input?.name || '').trim() || !slug) {
      return json({
        error: 'Enter a website name and valid subdomain.'
      }, 400);
    }

    if (['www', 'admin', 'api', 'games'].includes(slug)) {
      return json({
        error: 'That subdomain is reserved.'
      }, 400);
    }

    const state = await readState(kv);

    if (state.websites.some(item => item.subdomain === slug)) {
      return json({
        error: 'That website subdomain is already in use.'
      }, 409);
    }

    const website = {
      id: id(),
      name: String(input.name).trim().slice(0, 100),
      subdomain: slug,
      description: String(input.description || '').slice(0, 1000),
      html: String(input.html || '').slice(0, 100000),
      status: 'Saved in EdgeOne KV · domain routing pending',
      createdAt: new Date().toISOString()
    };

    state.websites.push(website);

    logActivity(
      state,
      `Created MahigoWebs project ${slug}.mahigo.com`
    );

    await writeState(kv, state);

    return json({
      website,
      url: `https://${slug}.mahigo.com`
    }, 201);
  }

  // Mahigo Kusum API creation
  if (pathname === '/api/admin/apis' && method === 'POST') {
    const input = await bodyJSON(request);

    const verb = String(input?.method || 'GET').toUpperCase();
    const apiPath = input?.path;

    if (
      !String(input?.name || '').trim() ||
      !['GET', 'POST'].includes(verb)
    ) {
      return json({
        error: 'Enter an API name and choose GET or POST.'
      }, 400);
    }

    if (
      typeof apiPath !== 'string' ||
      !/^\/[A-Za-z0-9_./-]*$/.test(apiPath) ||
      apiPath.includes('..') ||
      apiPath === '/'
    ) {
      return json({
        error: 'Enter a valid endpoint path.'
      }, 400);
    }

    const state = await readState(kv);

    let parsed = null;

    if (input.source === 'Custom JSON response') {
      try {
        parsed = JSON.parse(input.responseJson || '{}');
      } catch {
        return json({
          error: 'Custom JSON response is invalid.'
        }, 400);
      }
    } else if (!state.db) {
      return json({
        error: 'Import a JSON database first.'
      }, 400);
    }

    if (
      state.apis.some(
        item => item.path === apiPath && item.method === verb
      )
    ) {
      return json({
        error: 'An endpoint with this method and path already exists.'
      }, 409);
    }

    const api = {
      id: id(),
      name: String(input.name).trim().slice(0, 100),
      method: verb,
      path: apiPath,
      source: input.source || 'Imported database',
      responseJson: parsed,
      description: String(input.description || '').slice(0, 1000),
      status: 'EdgeOne route ready',
      createdAt: new Date().toISOString()
    };

    state.apis.push(api);

    logActivity(state, `Created Mahigo Kusum endpoint ${verb} ${apiPath}`);

    await writeState(kv, state);

    return json({
      api,
      url: `https://${apiHost}${apiPath}`
    }, 201);
  }

  // JSON database import
  if (pathname === '/api/admin/database' && method === 'POST') {
    let form;

    try {
      form = await request.formData();
    } catch {
      return json({
        error: 'Could not read uploaded database form.'
      }, 400);
    }

    const file = form.get('file');

    if (!file || typeof file.text !== 'function') {
      return json({
        error: 'Choose a JSON database file.'
      }, 400);
    }

    if (!String(file.name || '').toLowerCase().endsWith('.json')) {
      return json({
        error: 'Database must be a .json file.'
      }, 400);
    }

    if (file.size > 750 * 1024) {
      return json({
        error: 'Database JSON limit is 750 KB.'
      }, 413);
    }

    let data;

    try {
      data = JSON.parse(await file.text());
    } catch {
      return json({
        error: 'The uploaded file is not valid JSON.'
      }, 400);
    }

    const state = await readState(kv);

    state.db = {
      name: file.name,
      time: new Date().toLocaleString('en-GB', {
        timeZone: 'Asia/Dhaka'
      }) + ' (Asia/Dhaka)',
      bytes: file.size,
      data
    };

    logActivity(state, `Imported database ${file.name}`);

    await writeState(kv, state);

    return json({
      ok: true,
      name: state.db.name
    });
  }

  // Database removal
  if (pathname === '/api/admin/database' && method === 'DELETE') {
    const state = await readState(kv);

    state.db = null;

    logActivity(state, 'Removed imported database');

    await writeState(kv, state);

    return json({ ok: true });
  }

  // Headquarters settings
  if (pathname === '/api/admin/settings' && method === 'PUT') {
    const input = await bodyJSON(request);
    const state = await readState(kv);

    for (const key of ['siteTitle', 'hq', 'address', 'contact']) {
      if (typeof input?.[key] === 'string') {
        state.settings[key] = input[key].slice(0, 2000);
      }
    }

    logActivity(state, 'Updated organization and headquarters settings');

    await writeState(kv, state);

    return json({
      settings: state.settings
    });
  }

  // Workspace reset
  if (pathname === '/api/admin/reset' && method === 'POST') {
    await writeState(kv, mergeDefaults({}));
    return json({ ok: true });
  }

  // Scratch game upload is not supported in this Edge Functions-only version
  if (pathname === '/api/admin/games' && method === 'POST') {
    return json({
      error: 'Scratch packaging requires a separate Node.js Cloud Function and object storage. Edge Functions have a 1 MB request-body limit.'
    }, 501);
  }

  // Delete records
  const deleteMatch = pathname.match(
    /^\/api\/admin\/(websites|games|apis)\/([^/]+)$/
  );

  if (deleteMatch && method === 'DELETE') {
    const [, resource, recordId] = deleteMatch;

    const state = await readState(kv);

    const index = state[resource].findIndex(
      item => item.id === decodeURIComponent(recordId)
    );

    if (index < 0) {
      return json({
        error: 'Record not found.'
      }, 404);
    }

    const [removed] = state[resource].splice(index, 1);

    logActivity(
      state,
      `Deleted ${resource} record ${removed.name || removed.subdomain || ''}`
    );

    await writeState(kv, state);

    return json({ ok: true });
  }

  return json({
    error: 'EdgeOne admin API route not found.'
  }, 404);
}
