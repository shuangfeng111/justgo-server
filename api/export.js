// GET /api/export
// 把所有上报导成一份 poi_presets.json 兼容的 JSON，浏览器直接打开就能下载。
// 环境变量同 report.js

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const base = process.env.UPSTASH_URL;
  const token = process.env.UPSTASH_TOKEN;
  if (!base || !token) return res.status(500).json({ error: 'server not configured' });

  const auth = { Authorization: `Bearer ${token}` };

  try {
    // 扫出所有 poi:* 键
    const scanRes = await fetch(base, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SCAN', '0', 'MATCH', 'poi:*', 'COUNT', '1000']),
    });
    const scan = await scanRes.json();
    const keys = scan?.result?.[1] || [];

    const items = [];
    for (const k of keys) {
      const r = await fetch(base, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(['GET', k]),
      });
      const j = await r.json();
      const v = j?.result;
      if (!v) continue;
      const o = JSON.parse(v);
      items.push({
        name: o.name,
        city: '',
        lat: o.lat,
        lon: o.lon,
        type: o.kind || '',
        rating: '',
        photos: 0,
        hits: o.hits || 1,
      });
    }

    // 按被走到次数排序，前 N 个最受欢迎
    items.sort((a, b) => b.hits - a.hits);

    const out = {
      generatedAt: new Date().toISOString().slice(0, 10),
      source: 'justgo reports',
      note: '坐标已转 WGS-84',
      count: items.length,
      pois: items,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="poi_presets_merged.json"');
    return res.status(200).send(JSON.stringify(out, null, 1));
  } catch (e) {
    return res.status(502).json({ error: 'upstream failed' });
  }
}
