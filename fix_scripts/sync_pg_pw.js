// 更新 PostgreSQL 中 dean147 密码为 1234567
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

(async () => {
  const newPassword = '1234567';
  const newHash = await bcrypt.hash(newPassword, 10);
  
  const pool = new Pool({
    host: 'mecha-battle-db',
    port: 5432,
    database: 'mecha_battle',
    user: 'mecha_user',
    password: 'mecha_user_password',
  });

  try {
    const check = await pool.query("SELECT username, role FROM users WHERE username = 'dean147'");
    console.log('PG 查询结果:', JSON.stringify(check.rows));
    
    if (check.rows.length > 0) {
      await pool.query("UPDATE users SET password_hash = $1 WHERE username = 'dean147'", [newHash]);
      console.log('✅ PG: dean147 密码已更新');
    } else {
      await pool.query("INSERT INTO users (id, username, email, password_hash, role, credits) VALUES ($1, $2, $3, $4, $5, $6)",
        ['dominator-dean147', 'dean147', 'dean147', newHash, 'dominator', 999]);
      console.log('✅ PG: dean147 账号已创建');
    }
    
    const verify = await pool.query("SELECT password_hash FROM users WHERE username = 'dean147'");
    const vHash = verify.rows[0].password_hash;
    const ok = await bcrypt.compare(newPassword, vHash);
    console.log(`✅ PG 持久化验证: ${ok}`);
  } catch(e) {
    console.log('PG 错误:', e.message);
  }
  
  await pool.end();
})();
