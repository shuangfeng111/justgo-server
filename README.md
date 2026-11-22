# Just Go 上报服务端

一个只做两件事的小服务：**收上报**、**导出聚合结果**。部署在 Vercel 免费额度内，存储用 Upstash Redis 免费层。

## 一、准备存储（Upstash，约 2 分钟）

1. 注册 https://upstash.com → 创建一个 Redis 数据库（选免费计划，区域随便，离你近的更好）
2. 进数据库详情页，翻到 **REST API** 那一段，记下两个值：
   - `UPSTASH_REDIS_REST_URL`（形如 `https://xxx.upstash.io`）
   - `UPSTASH_REDIS_REST_TOKEN`

## 二、部署（Vercel，约 3 分钟）

```bash
npm i -g vercel
cd dokoka/server
vercel
```

按提示走完，然后在 Vercel 项目设置里加两个环境变量：

| 变量名 | 值 |
|---|---|
| `UPSTASH_URL` | 第一步的 REST URL |
| `UPSTASH_TOKEN` | 第一步的 REST TOKEN |

改完环境变量要 **Redeploy** 一次才生效。

## 三、得到两个地址

```
https://你的项目.vercel.app/api/report    ← App 里填这个
https://你的项目.vercel.app/api/export    ← 浏览器打开就下载聚合结果
```

## 四、App 里打开上报

设置 → 数据 → 打开「匿名上报到达记录」→ 填 `/api/report` 的地址 → 保存。

之后每次到达，App 会发一条：

```json
{
  "name": "某某公园",
  "lat": 39.904585,
  "lon": 116.403998,
  "kind": "公园",
  "planned": 800,
  "actual": 18,
  "walk": 920,
  "minutes": 13,
  "ts": 1795000000,
  "v": 1
}
```

**不含**：设备 ID、账号、IP 存储、行走轨迹、其它地点。

## 五、定期把收集到的数据合进预设库

```bash
python tools/pull_reports.py https://你的项目.vercel.app/api/export
```

它会：
1. 拉 `/api/export`
2. 和现有 `poi_presets.json` 按名字合并，`hits` 累加
3. 按 `hits` 降序重排
4. 写回 `android/app/src/main/assets/poi_presets.json`

然后照旧跑 `tools/update_presets.bat` 或手动上传到 GitHub 仓库，App 那边就会通过 jsDelivr 拉到新库。

## 成本

- Vercel 免费版：每月 100GB 带宽、函数调用 100 万次
- Upstash 免费版：每天 1 万条命令

按每天几十次上报算，这两个额度都绰绰有余。

---

## 本地验证记录（2026-11-23）

服务端两个函数已用**真实 Upstash** 跑通过，不是纸面代码：

```
report #1: 200 {"ok":true}
report #2: 200 {"ok":true}
export status: 200
export count: 1
found: {"name":"自动化测试公园", ..., "hits":2}   ← 同名两次，hits 正确累加
```

修掉的两个 bug：

1. **键被二次编码**：原来 key 用 `encodeURIComponent` 拼进 URL path，Upstash 会再解一次，导致同名地点存成不同的键、hits 永远不涨。改成用 JSON 命令方式（`["SET", key, value]`），键和值都走请求体，不经 URL。
2. **返回值结构判断错**：单命令返回 `{"result": ...}`，不是 `[{...}]`，我按数组取导致旧值永远读不到。

Vercel 那一层还没部署验证（本机没有账号），但函数体逻辑已经对着真实存储跑过了。
