// Piano Drone — Worker Cloudflare
// - Sert l'app (fichiers de ./public via le binding ASSETS)
// - /api/sync : synchronise la bibliothèque de suites, protégée par un code d'accès
//
// Stockage : une seule clé KV "library" = { items: { [id]: suite } }.
// Fusion suite par suite : la version avec le updatedAt le plus récent gagne.
// Les suites supprimées restent comme { id, deleted: true, updatedAt } pour
// que la suppression se propage aux autres appareils.

const MAX_ITEM_BYTES = 200_000;
const MAX_LIBRARY_BYTES = 5_000_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Comparaison à temps constant (évite de deviner le code caractère par caractère)
function sameCode(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

function validItem(it) {
  return it && typeof it === 'object'
    && typeof it.id === 'string' && it.id.length > 0 && it.id.length <= 64
    && typeof it.updatedAt === 'number' && isFinite(it.updatedAt)
    && JSON.stringify(it).length <= MAX_ITEM_BYTES;
}

async function handleSync(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
  const incoming = Array.isArray(body?.items) ? body.items : [];

  const lib = (await env.LIB.get('library', 'json')) || { items: {} };
  let changed = false;
  for (const it of incoming) {
    if (!validItem(it)) continue;
    const cur = lib.items[it.id];
    if (!cur || it.updatedAt > cur.updatedAt) { lib.items[it.id] = it; changed = true; }
  }
  if (changed) {
    const raw = JSON.stringify(lib);
    if (raw.length > MAX_LIBRARY_BYTES) return json({ error: 'bibliothèque trop grande' }, 413);
    await env.LIB.put('library', raw);
  }
  return json({ items: Object.values(lib.items) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }

    if (!env.ACCESS_CODE) return json({ error: 'ACCESS_CODE non configuré' }, 500);
    if (!env.LIB) return json({ error: 'KV « LIB » non relié' }, 500);
    if (!sameCode(request.headers.get('x-access-code') || '', env.ACCESS_CODE)) {
      return json({ error: 'code' }, 401);
    }

    if (url.pathname === '/api/sync' && request.method === 'POST') return handleSync(request, env);
    if (url.pathname === '/api/ping') return json({ ok: true });
    return json({ error: 'not found' }, 404);
  },
};
