// 检查 SQLite 中 dean147 账户状态
const Database = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const SQL = await Database();
  const dbPath = '/data/mecha-universe.db';
  
  if (!fs.existsSync(dbPath)) {
    console.log(JSON.stringify({ error: 'DB_FILE_NOT_FOUND', path: dbPath }));
    return;
  }
  
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);
  
  // 查询 dean147
  const rows = db.exec("SELECT id, username, email, role, credits, password_hash FROM users WHERE username = 'dean147'");
  if (rows.length && rows[0].values.length) {
    const v = rows[0].values[0];
    console.log(JSON.stringify({
      status: 'FOUND',
      id: v[0],
      username: v[1],
      email: v[2],
      role: v[3],
      credits: v[4],
      hash_length: v[5] ? v[5].length : 0,
      hash_start: v[5] ? v[5].substring(0, 20) : 'NULL'
    }));
  } else {
    console.log(JSON.stringify({ status: 'NOT_FOUND', username: 'dean147' }));
  }
  
  // 也列出所有用户
  const allUsers = db.exec("SELECT username, role, credits FROM users");
  if (allUsers.length && allUsers[0].values.length) {
    console.log('\n所有用户列表:');
    allUsers[0].values.forEach(v => {
      console.log(`  username=${v[0]}, role=${v[1]}, credits=${v[2]}`);
    });
  }
  
  db.close();
})();
