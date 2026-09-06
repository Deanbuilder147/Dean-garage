// 为 dean147 重置密码为 1234567
const bcrypt = require('bcryptjs');
const Database = require('sql.js');
const fs = require('fs');

(async () => {
  const newPassword = '1234567';
  
  // 1. 生成新哈希
  const newHash = await bcrypt.hash(newPassword, 10);
  console.log(`新哈希: ${newHash.substring(0, 30)}...`);
  
  // 2. 验证新哈希能匹配 1234567
  const matchNew = await bcrypt.compare(newPassword, String(newHash));
  console.log(`新哈希自我验证: ${matchNew}`);
  
  const SQL = await Database();
  const buf = fs.readFileSync('/data/mecha-universe.db');
  const db = new SQL.Database(buf);
  
  // 3. 查询旧哈希及类型诊断
  const rows = db.exec("SELECT password_hash FROM users WHERE username = 'dean147'");
  if (rows.length && rows[0].values.length) {
    const rawHash = rows[0].values[0];
    console.log(`旧哈希类型: ${typeof rawHash}, 值类型: ${rawHash ? rawHash.constructor.name : 'NULL'}`);
    const oldHashStr = String(rawHash);
    console.log(`旧哈希 (str): ${oldHashStr.substring(0, 30)}...`);
    const matchOld = await bcrypt.compare(newPassword, oldHashStr);
    console.log(`旧哈希验证 1234567: ${matchOld}`);
  }
  
  // 4. 更新 SQLite 密码
  db.run("UPDATE users SET password_hash = ?", [newHash]);
  // 验证写入
  const checkWrite = db.exec("SELECT password_hash FROM users WHERE username = 'dean147'");
  console.log(`写入后查询结果类型: ${typeof checkWrite[0].values[0]}, 前30字符: ${String(checkWrite[0].values[0]).substring(0, 30)}`);
  
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync('/data/mecha-universe.db', buffer);
  console.log('✅ SQLite 文件写入完成');
  
  // 5. 重新读取验证
  const db2 = new SQL.Database(fs.readFileSync('/data/mecha-universe.db'));
  const verify = db2.exec("SELECT password_hash FROM users WHERE username = 'dean147'");
  const vHash = String(verify[0].values[0]);
  const ok = await bcrypt.compare(newPassword, vHash);
  console.log(`持久化后验证 1234567: ${ok}`);
  
  db.close();
  db2.close();
})();
