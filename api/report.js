// POST /api/report
// 接收 App 的匿名到达上报，写进 Upstash Redis。
// 环境变量：UPSTASH_URL（如 https://xxx.upstash.io）、UPSTASH_TOKEN

export default async function handler(req, res) {
  // CORS，允许 App 直接调用
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body) return res.status(400).json({ error: 'bad json' });

  const { name, lat, lon, kind, planned, actual, walk, minutes, ts } = body;
  if (!name || typeof name !== 'string' || name.length > 80) {
    return res.status(400).json({ error: 'bad name' });
  }
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return res.status(400).json({ error: 'bad coord' });
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'coord out of range' });
  }

  const base = process.env.UPSTASH_URL;
  const token = process.env.UPSTASH_TOKEN;
  if (!base || !token) return res.status(500).json({ error: 'server not configured' });

  // key 直接用原始名字，不做 URL 编码——Upstash 的路径参数会对 % 再解码，导致键不一致
  const key = 'poi:' + name.slice(0, 120).replace(/[\r\n]/g, '');
  const now = num(ts) || Math.floor(Date.now() / 1000);

  const auth = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1) 读旧值
    const r = await fetch(base, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(['GET', key]),
    });
    const arr = await r.json();
    // 单命令返回 {"result": ...}，不是数组
    const old = arr?.result ? safeParse(arr.result) : null;

    const merged = JSON.stringify({
      name,
      lat: round6(lat),
      lon: round6(lon),
      kind: kind || '',
      planned: num(planned),
      actual: num(actual),
      walk: num(walk),
      minutes: num(minutes),
      ts: now,
      hits: (old && typeof old.hits === 'number' ? old.hits : 0) + 1,
      firstTs: old && old.firstTs ? old.firstTs : now,
    });

    // 2) 写回（命令方式，键和值都在 body 里，不经 URL 编码）
    const setRes = await fetch(base, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(['SET', key, merged]),
    });
    if (!setRes.ok) return res.status(502).json({ error: 'storage failed' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'upstream failed' });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round6(v) {
  return Math.round(v * 1e6) / 1e6;
}
