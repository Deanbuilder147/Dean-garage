// 全面检查 dean147 的单位数据 + hangar 端点
const Database = require('sql.js');
const fs = require('fs');

(async () => {
  const SQL = await Database();
  const buf = fs.readFileSync('/data/mecha-universe.db');
  const db = new SQL.Database(buf);

  // 1. 查 dean147 的单位
  const deanUnits = db.exec("SELECT * FROM units WHERE owner_id = 'dominator-dean147'");
  console.log(`=== dean147 (owner_id=dominator-dean147) 单位数: ${deanUnits.length ? deanUnits[0].values.length : 0} ===`);
  if (deanUnits.length && deanUnits[0].values.length) {
    const cols = deanUnits[0].columns;
    deanUnits[0].values.forEach((v, i) => {
      const row = {};
      cols.forEach((c, j) => row[c] = v[j]);
      console.log(`  [${i}] id=${v[0]}, name=${v[2]}, faction=${v[3]}, category=${v[4]}, tier=${v[5]}`);
    });
  }

  // 2. 查所有单位（看看有没有其他 owner_id 的数据）
  const allUnits = db.exec("SELECT id, name, owner_id, faction FROM units LIMIT 20");
  if (allUnits.length && allUnits[0].values.length) {
    console.log(`\n=== 全部单位数: ${allUnits[0].values.length} ===`);
    allUnits[0].values.forEach(v => console.log(`  id=${v[0]}, name=${v[1]}, owner_id=${v[2]}, faction=${v[3]}`));
  } else {
    console.log('\n=== 全部单位: 0 (表为空) ===');
  }

  // 3. 检查 PG 中是否有单位
  console.log('\n=== PG 检查需要单独脚本 ===');
  
  db.close();
})();
