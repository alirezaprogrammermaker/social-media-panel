/**
 * One-off: fetch Instagram/Telegram services from connected SMM providers
 * and insert curated services into remote D1 with Toman pricing.
 *
 * Pricing: rate_toman = ceil(provider_usd * dollar_rate * 1.30)
 *   - Default: rate is per 1000
 *   - Package: rate is flat package price
 *
 * Usage: node scripts/import-ig-tg-services.mjs [--dry-run]
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DOLLAR_RATE = 200000;
const MARKUP = 0.30; // 30% — no profit/margin setting in project
const DRY_RUN = process.argv.includes('--dry-run');
const TMP = mkdtempSync(join(tmpdir(), 'smm-import-'));

const SKIP_RE =
  /\b(adult|porn|xxx|nude|sex|nsfw|onlyfans|dating|illegal|hack|password|crack)\b/i;

const IG_TYPES = [
  { key: 'followers', re: /follower/i, fa: 'فالوور اینستاگرام', cat: 'اینستاگرام - فالوور', limit: 3, maxUsd: 3 },
  { key: 'likes', re: /\blike/i, fa: 'لایک اینستاگرام', cat: 'اینستاگرام - لایک', limit: 3, maxUsd: 1 },
  { key: 'reels', re: /reel/i, fa: 'بازدید ریلز اینستاگرام', cat: 'اینستاگرام - ریلز', limit: 2, maxUsd: 0.5 },
  { key: 'story', re: /stor(y|ies)/i, fa: 'بازدید استوری اینستاگرام', cat: 'اینستاگرام - استوری', limit: 2, maxUsd: 1.5 },
  { key: 'views', re: /\b(view|views)\b/i, fa: 'بازدید ویدیو اینستاگرام', cat: 'اینستاگرام - بازدید', limit: 2, maxUsd: 0.5 },
  { key: 'comments', re: /comment/i, fa: 'کامنت رندوم اینستاگرام', cat: 'اینستاگرام - کامنت', limit: 1, maxUsd: 4 },
  { key: 'saves', re: /\bsave/i, fa: 'سیو اینستاگرام', cat: 'اینستاگرام - تعامل', limit: 2, maxUsd: 0.3 },
  { key: 'shares', re: /\bshare/i, fa: 'شیر اینستاگرام', cat: 'اینستاگرام - تعامل', limit: 2, maxUsd: 0.5 },
];

const TG_TYPES = [
  { key: 'members', re: /member|subscriber/i, fa: 'عضو کانال تلگرام', cat: 'تلگرام - عضو', limit: 3, maxUsd: 1.5 },
  { key: 'views', re: /\b(view|views|post view)/i, fa: 'بازدید پست تلگرام', cat: 'تلگرام - بازدید', limit: 3, maxUsd: 0.3 },
  { key: 'reactions', re: /reaction|emoji/i, fa: 'ری‌اکشن تلگرام', cat: 'تلگرام - ری‌اکشن', limit: 2, maxUsd: 1.5 },
  { key: 'votes', re: /\bvote|poll/i, fa: 'رأی نظرسنجی تلگرام', cat: 'تلگرام - رأی', limit: 2, maxUsd: 2.5 },
];

const TT_TYPES = [
  { key: 'followers', re: /follower/i, fa: 'فالوور تیک تاک', cat: 'تیک تاک - فالوور', limit: 3, maxUsd: 3 },
  { key: 'likes', re: /\blike/i, fa: 'لایک تیک تاک', cat: 'تیک تاک - لایک', limit: 3, maxUsd: 1 },
  { key: 'views', re: /\b(view|views)\b/i, fa: 'بازدید ویدیو تیک تاک', cat: 'تیک تاک - بازدید', limit: 3, maxUsd: 0.5 },
  { key: 'shares', re: /\bshare/i, fa: 'شیر تیک تاک', cat: 'تیک تاک - شیر', limit: 2, maxUsd: 0.5 },
  { key: 'comments', re: /comment/i, fa: 'کامنت تیک تاک', cat: 'تیک تاک - کامنت', limit: 1, maxUsd: 4 },
];

const ALLOWED_TYPES = new Set(['Default', 'Package']);

function wranglerSelect(command) {
  const escaped = command.replace(/"/g, '\\"');
  const cmdline = `npx wrangler d1 execute DB --remote --json --command "${escaped}"`;
  const r = spawnSync(cmdline, {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 50 * 1024 * 1024,
    cwd: process.cwd(),
  });
  if (r.status !== 0) throw new Error(`wrangler failed: ${r.stderr || r.stdout}`);
  const out = (r.stdout || '').trim();
  const start = out.indexOf('[');
  if (start < 0) throw new Error(`No JSON: ${out.slice(0, 300)}`);
  return JSON.parse(out.slice(start));
}

function wranglerFile(sql) {
  const file = join(TMP, `batch-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(file, sql, 'utf8');
  // Keep the SQL file path simple; use shell so npx resolves on Windows.
  const cmdline = `npx wrangler d1 execute DB --remote --file "${file}" --json`;
  const r = spawnSync(cmdline, {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 50 * 1024 * 1024,
    cwd: process.cwd(),
  });
  if (r.status !== 0) {
    throw new Error(
      `wrangler --file failed (status=${r.status}): ${(r.stderr || r.stdout || r.error || 'no output').toString().slice(0, 1000)}`
    );
  }
  try {
    unlinkSync(file);
  } catch {}
  return r.stdout;
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

async function fetchServices(apiUrl, apiKey) {
  const body = new URLSearchParams({ key: apiKey, action: 'services' });
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from provider: ${text.slice(0, 200)}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected provider response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

function platformOf(svc) {
  const hay = `${svc.category || ''} ${svc.name || ''}`;
  if (/instagram|اینستا/i.test(hay)) return 'instagram';
  if (/telegram|تلگرام/i.test(hay)) return 'telegram';
  if (/tiktok|تیک\s*تاک/i.test(hay)) return 'tiktok';
  return null;
}

function classify(svc, platform) {
  const hay = `${svc.category || ''} ${svc.name || ''}`;
  let list;
  if (platform === 'instagram') list = IG_TYPES;
  else if (platform === 'telegram') list = TG_TYPES;
  else if (platform === 'tiktok') list = TT_TYPES;
  else return null;
  // More specific types first (reels/story before generic views)
  for (const t of list) {
    if (t.re.test(hay)) return t;
  }
  return null;
}

function scoreService(svc, kind) {
  let score = 0;
  const name = String(svc.name || '');
  const rate = parseFloat(svc.rate || '0');
  const min = parseInt(svc.min || '0', 10);
  const max = parseInt(svc.max || '0', 10);

  if (svc.refill) score += 30;
  if (svc.cancel) score += 5;
  if (/guarantee|guaranteed|refill|HQ|real|premium|high.?quality/i.test(name)) score += 15;
  if (/fast|instant/i.test(name)) score += 8;
  if (/0\s*day|no\s*refill|\bbot\b/i.test(name)) score -= 25;
  if (SKIP_RE.test(name) || SKIP_RE.test(svc.category || '')) score -= 1000;

  if (rate > 0 && rate < 0.005) score -= 15;
  if (kind.maxUsd && rate > kind.maxUsd) score -= 100;
  if (rate >= 0.02 && rate <= (kind.maxUsd || 10)) score += 10;

  if (min > 0 && min <= 100) score += 5;
  if (max >= 5000) score += 5;

  if ((svc.type || 'Default') === 'Default') score += 8;
  if ((svc.type || '') === 'Package') score -= 5;

  if (kind.key === 'members' && /private/i.test(name)) score -= 20;
  if (kind.key === 'members' && /public/i.test(name)) score += 10;
  if (kind.key === 'followers' && /mixed|mix\b|bot/i.test(name)) score -= 10;

  // Prefer funded provider
  if (svc._providerName === 'bestofpanel') score += 20;
  if (svc._providerName === 'socialpanel24') score -= 5;

  return score;
}

function tierLabel(rate) {
  const r = parseFloat(rate);
  if (r <= 0.1) return 'اقتصادی';
  if (r <= 0.5) return 'استاندارد';
  return 'پرمیوم';
}

function persianName(svc, kind) {
  const name = String(svc.name || '');
  const parts = [kind.fa, tierLabel(svc.rate)];

  const days = name.match(/(\d+)\s*day/i);
  if (svc.refill || /refill|guarantee/i.test(name)) {
    parts.push(days ? `گارانتی ${days[1]} روزه` : 'با گارانتی');
  }
  if (/non.?drop/i.test(name)) parts.push('بدون ریزش');
  if (/real|hq|high.?quality|premium/i.test(name)) parts.push('کیفیت بالا');
  if (/fast|instant/i.test(name)) parts.push('سریع');
  if (/public/i.test(name) && kind.key === 'members') parts.push('کانال عمومی');
  if ((svc.type || '') === 'Package') parts.push('پکیج');

  return parts.join(' | ');
}

function sellRateToman(providerUsd) {
  const cost = parseFloat(providerUsd || '0');
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return Math.ceil(cost * DOLLAR_RATE * (1 + MARKUP));
}

function pickCurated(services, platform, existingKeys) {
  let typeDefs;
  if (platform === 'instagram') typeDefs = IG_TYPES;
  else if (platform === 'telegram') typeDefs = TG_TYPES;
  else if (platform === 'tiktok') typeDefs = TT_TYPES;
  else return [];
  const byKind = new Map(typeDefs.map((t) => [t.key, []]));

  for (const svc of services) {
    if (platformOf(svc) !== platform) continue;
    if (SKIP_RE.test(`${svc.category} ${svc.name}`)) continue;
    const type = svc.type || 'Default';
    if (!ALLOWED_TYPES.has(type)) continue;
    if (/mention|subscription|drip.?feed|custom comment/i.test(`${svc.name} ${type}`)) continue;

    const kind = classify(svc, platform);
    if (!kind) continue;
    if (kind.maxUsd && parseFloat(svc.rate) > kind.maxUsd) continue;

    const key = `${svc._providerId}:${svc.service}`;
    if (existingKeys.has(key)) continue;

    const score = scoreService(svc, kind);
    if (score < 0) continue;
    byKind.get(kind.key).push({ svc, kind, score });
  }

  const picked = [];
  for (const kind of typeDefs) {
    const arr = byKind.get(kind.key) || [];
    arr.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return parseFloat(a.svc.rate) - parseFloat(b.svc.rate);
    });
    const chosen = [];
    for (const item of arr) {
      const rate = parseFloat(item.svc.rate);
      const similar = chosen.find(
        (c) => Math.abs(parseFloat(c.svc.rate) - rate) / Math.max(rate, 0.0001) < 0.2
      );
      if (similar) continue;
      // Prefer different providers when possible for variety, but not required
      chosen.push(item);
      if (chosen.length >= kind.limit) break;
    }
    picked.push(...chosen);
  }
  return picked;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE IMPORT ===');
  console.log(`dollar_rate=${DOLLAR_RATE}, markup=${MARKUP * 100}%`);
  console.log('formula: ceil(usd * dollar_rate * 1.30); Default=/1000, Package=flat');

  const providerRows = wranglerSelect(
    'SELECT id, name, api_url, api_key, currency, is_active, balance FROM api_providers WHERE is_active = 1'
  )[0].results;

  console.log(
    'Providers:',
    providerRows.map((p) => `${p.id}:${p.name} bal=${p.balance}`).join(', ')
  );

  const existing = wranglerSelect(
    'SELECT id, name, api_provider_id, api_provider_service_id, category_id FROM services'
  )[0].results;
  const existingKeys = new Set(
    existing
      .filter((s) => s.api_provider_id && s.api_provider_service_id)
      .map((s) => `${s.api_provider_id}:${s.api_provider_service_id}`)
  );
  console.log(`Existing services: ${existing.length}, linked: ${existingKeys.size}`);

  let cats = wranglerSelect('SELECT id, name FROM categories')[0].results;
  const catByName = new Map(cats.map((c) => [c.name, c.id]));

  const allRemote = [];
  const providerStats = [];

  for (const p of providerRows) {
    try {
      const list = await fetchServices(p.api_url, p.api_key);
      for (const s of list) {
        s._providerId = p.id;
        s._providerName = p.name;
      }
      allRemote.push(...list);
      const ig = list.filter((s) => platformOf(s) === 'instagram').length;
      const tg = list.filter((s) => platformOf(s) === 'telegram').length;
      const tt = list.filter((s) => platformOf(s) === 'tiktok').length;
      providerStats.push({ id: p.id, name: p.name, total: list.length, ig, tg, tt, ok: true, balance: p.balance });
      console.log(`Fetched ${list.length} from ${p.name} (IG=${ig}, TG=${tg}, TT=${tt})`);
    } catch (e) {
      providerStats.push({ id: p.id, name: p.name, ok: false, error: e.message });
      console.error(`Provider ${p.name} failed:`, e.message);
    }
  }

  const selected = [
    ...pickCurated(allRemote, 'instagram', existingKeys),
    ...pickCurated(allRemote, 'telegram', existingKeys),
    ...pickCurated(allRemote, 'tiktok', existingKeys),
  ];

  const igCount = selected.filter((x) => platformOf(x.svc) === 'instagram').length;
  const tgCount = selected.filter((x) => platformOf(x.svc) === 'telegram').length;
  const ttCount = selected.filter((x) => platformOf(x.svc) === 'tiktok').length;
  console.log(`Selected: IG=${igCount}, TG=${tgCount}, TT=${ttCount}, total=${selected.length}`);

  const neededCats = [...new Set(selected.map((x) => x.kind.cat))];
  const catSql = [];
  for (const name of neededCats) {
    if (!catByName.has(name)) {
      catSql.push(
        `INSERT INTO categories (name, sort_order, is_active) VALUES ('${sqlEscape(name)}', 0, 1);`
      );
      console.log(`${DRY_RUN ? '[dry] ' : ''}create category: ${name}`);
    }
  }

  if (!DRY_RUN && catSql.length) {
    wranglerFile(catSql.join('\n'));
    cats = wranglerSelect('SELECT id, name FROM categories')[0].results;
    for (const c of cats) catByName.set(c.name, c.id);
  }

  if (!DRY_RUN) {
    wranglerSelect(
      `INSERT INTO settings (key, value) VALUES ('dollar_rate', '${DOLLAR_RATE}') ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    console.log('Set dollar_rate =', DOLLAR_RATE);
  } else {
    console.log('[dry] would set dollar_rate =', DOLLAR_RATE);
  }

  const inserted = [];
  const insertLines = [];
  const usedNames = new Set(existing.map((s) => s.name));

  for (const item of selected) {
    const { svc, kind } = item;
    const platform = platformOf(svc);
    let finalName = persianName(svc, kind);
    let n = 2;
    while (usedNames.has(finalName)) {
      finalName = `${persianName(svc, kind)} (${n++})`;
    }
    usedNames.add(finalName);

    const type = svc.type || 'Default';
    const rate = String(sellRateToman(svc.rate));
    const catId = DRY_RUN && !catByName.has(kind.cat) ? 'NEW' : catByName.get(kind.cat);
    const desc =
      type === 'Package'
        ? `پکیج ${kind.fa} — قیمت ثابت برای کل پکیج.`
        : `${kind.fa}. حداقل ${svc.min}، حداکثر ${svc.max}. قیمت به ازای هر ۱۰۰۰ واحد.`;

    const row = {
      name: finalName,
      description: desc,
      category_id: catId,
      type,
      rate,
      min: String(svc.min),
      max: String(svc.max),
      refill: svc.refill ? 1 : 0,
      cancel: svc.cancel ? 1 : 0,
      api_provider_id: svc._providerId,
      api_provider_service_id: Number(svc.service),
      api_provider_service_price: String(svc.rate),
      provider: svc._providerName,
      platform,
      kind: kind.key,
      cost_usd: svc.rate,
      score: item.score,
    };

    console.log(
      `${DRY_RUN ? '[dry] ' : '+'}${platform}/${kind.key}: ${finalName} | sell=${Number(rate).toLocaleString('en-US')} | cost=${svc.rate} USD | ${svc._providerName}#${svc.service} | refill=${!!svc.refill}`
    );

    if (!DRY_RUN) {
      insertLines.push(
        `INSERT INTO services (name, description, category_id, type, rate, min, max, refill, cancel, api_provider_id, api_provider_service_id, api_provider_service_price, is_active) VALUES ('${sqlEscape(finalName)}', '${sqlEscape(desc)}', ${catId}, '${sqlEscape(type)}', '${sqlEscape(rate)}', '${sqlEscape(String(svc.min))}', '${sqlEscape(String(svc.max))}', ${row.refill}, ${row.cancel}, ${svc._providerId}, ${Number(svc.service)}, '${sqlEscape(String(svc.rate))}', 1);`
      );
    }
    inserted.push(row);
  }

  if (!DRY_RUN && insertLines.length) {
    // Batch inserts to avoid huge single files
    const chunkSize = 10;
    for (let i = 0; i < insertLines.length; i += chunkSize) {
      wranglerFile(insertLines.slice(i, i + chunkSize).join('\n'));
      console.log(`Inserted batch ${i / chunkSize + 1}`);
    }

    const sample = wranglerSelect(
      `SELECT s.id, s.name, s.type, s.rate, s.api_provider_service_price, s.api_provider_id, s.api_provider_service_id, c.name as category FROM services s LEFT JOIN categories c ON c.id = s.category_id WHERE s.api_provider_id IS NOT NULL ORDER BY s.id DESC LIMIT 20`
    )[0].results;
    console.log('\n=== Sample inserted ===');
    for (const s of sample) {
      console.log(
        `#${s.id} ${s.name} | rate=${s.rate} | costUSD=${s.api_provider_service_price} | ${s.category} | p=${s.api_provider_id}:${s.api_provider_service_id}`
      );
    }
    const dr = wranglerSelect(`SELECT value FROM settings WHERE key='dollar_rate'`)[0].results[0];
    console.log('dollar_rate now:', dr.value);

    const counts = wranglerSelect(
      `SELECT CASE WHEN c.name LIKE '%اینستاگرام%' THEN 'instagram' WHEN c.name LIKE '%تلگرام%' THEN 'telegram' ELSE 'other' END as platform, COUNT(*) as cnt FROM services s JOIN categories c ON c.id = s.category_id WHERE s.api_provider_id IS NOT NULL GROUP BY 1`
    )[0].results;
    console.log('Linked counts:', counts);
  }

  const summary = {
    dollar_rate: DOLLAR_RATE,
    markup_percent: MARKUP * 100,
    formula: 'rate_toman = ceil(provider_usd * dollar_rate * 1.30); Package = flat; Default = per 1000',
    providers: providerStats.map(({ id, name, total, ig, tg, ok, balance, error }) => ({
      id, name, total, ig, tg, ok, balance, error,
    })),
    added_ig: inserted.filter((i) => i.platform === 'instagram').length,
    added_tg: inserted.filter((i) => i.platform === 'telegram').length,
    added_total: inserted.length,
    samples: inserted.map((i) => ({
      name: i.name,
      rate: i.rate,
      cost_usd: i.cost_usd,
      type: i.type,
      provider: i.provider,
      platform: i.platform,
      kind: i.kind,
      api_provider_service_id: i.api_provider_service_id,
    })),
  };

  writeFileSync(join(process.cwd(), 'scripts', 'import-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log('\nSummary written to scripts/import-summary.json');
  console.log(JSON.stringify({ added_ig: summary.added_ig, added_tg: summary.added_tg, total: summary.added_total }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
