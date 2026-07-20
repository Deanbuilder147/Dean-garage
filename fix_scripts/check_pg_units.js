// 检查 PostgreSQL 中 dean147 及全部单位数据
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    host: 'mecha-battle-db',
    port: 5432,
    database: 'mecha_battle',
    user: 'mecha_user',
    password: 'mecha_user_password',
  });

  try {
    // 查 dean147 的单位 (owner_id)
    const deanUnits = await pool.query("SELECT id, name, owner_id, faction, category, tier FROM units WHERE owner_id = 'dominator-dean147'");
    console.log(`=== PG: dean147 (owner_id=dominator-dean147) 单位数: ${deanUnits.rows.length} ===`);
    deanUnits.rows.forEach((r, i) => console.log(`  [${i}] id=${r.id}, name=${r.name}, owner=${r.owner_id}, faction=${r.faction}`));

    // 查全部单位
    const allUnits = await pool.query("SELECT id, name, owner_id, faction FROM units LIMIT 30");
    console.log(`\n=== PG: 全部单位数: ${allUnits.rows.length} ===`);
    allUnits.rows.forEach(r => console.log(`  id=${r.id}, name=${r.name}, owner=${r.owner_id}, faction=${r.faction}`));

    // 查 dean147 的用户信息
    const deanUser = await pool.query("SELECT id, username, role, credits FROM users WHERE username = 'dean147'");
    console.log(`\n=== PG: dean147 用户: ${JSON.stringify(deanUser.rows)} ===`);

  } catch(e) {
    console.log('PG 错误:', e.message);
  }
  await pool.end();
})();
