/**
 * 阶段二：一次性历史单位数值重算脚本
 *
 * 用途：按新数值规则（格斗/射击仅取 机体+武器；移动范围=机体+载具+背包；
 *       防具/背包独立 HP=结构*2、耐久=5；武器/载具耐久=结构；defense=0）重算
 *       数据库中所有历史单位的 `stats` 与 `attributes`。
 *
 * 原理：`units.attributes.parts` 已保存每个部件的 格斗/射击/结构/机动/type 等字段，
 *       可直接重建 `ParsedResult.units` 喂给 `normalizeParsedData` 重新归一化。
 *
 * 运行方式（在 gateway 容器内）：
 *   cd /root/mecha-universe-engine/backend-gateway
 *   npx tsx scripts/recomputeUnitStats.ts            # 先 DRY-RUN 预览
 *   npx tsx scripts/recomputeUnitStats.ts --apply    # 真正写入
 *
 * 默认 DRY-RUN（不写库），加 --apply 才落库。
 */
import { initDatabase, all, run, saveToDisk } from '../src/db/sqlite.js';
import { normalizeParsedData } from '../src/services/excel-schema-normalizer.js';

function safeParse(v: any): any {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return undefined; }
  }
  return v;
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  await initDatabase();

  const units = all<{ id: string; stats: string; attributes: string }>(
    'SELECT id, stats, attributes FROM units',
  );

  let recomputed = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of units) {
    const attributes = safeParse(u.attributes);
    const parts = attributes?.parts;
    if (!parts || Object.keys(parts).length === 0) {
      skipped++;
      continue;
    }

    try {
      // 用已存部件重建 ParsedResult，重新归一化（套用最新规则）
      const parsed = { units: parts, errors: [], fileName: u.id };
      const result = normalizeParsedData(parsed as any);

      if (APPLY) {
        run(
          "UPDATE units SET stats = ?, attributes = ?, updated_at = datetime('now') WHERE id = ?",
          [JSON.stringify(result.stats), JSON.stringify(result.attributes), u.id],
        );
      }

      recomputed++;
      console.log(
        `[${APPLY ? 'APPLY' : 'DRY'}] ${u.id}: hp=${result.stats.hp} atk=${result.stats.attack} ` +
        `moveRange=${result.stats.speed} def=${result.stats.defense} shieldParts=` +
        `${Object.values((result.attributes as any).parts || {}).filter((p: any) => p.isShield).length}`,
      );
    } catch (e: any) {
      failed++;
      console.error(`[FAIL] ${u.id}: ${e?.message || e}`);
    }
  }

  if (APPLY) saveToDisk();
  console.log(`\n完成。recomputed=${recomputed} skipped=${skipped} failed=${failed} (mode=${APPLY ? 'APPLY' : 'DRY-RUN'})`);
}

main().catch((e) => {
  console.error('迁移脚本异常：', e);
  process.exit(1);
});
