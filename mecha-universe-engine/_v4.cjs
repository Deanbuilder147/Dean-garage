const http = require('http');
function req(path, method, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: 'localhost', port: 3006, path, method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } },
      (res) => { let s = ''; res.on('data', d => s += d); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve({ _raw: s }); } }); });
    if (data) r.write(data); r.end();
  });
}
(async () => {
  const login = await req('/api/auth/login', 'POST', { username: 'deantest', password: '7654321' });
  const T = login.token;
  const out = await req('/api/combat-glossary/test-skill', 'POST', {
    key: 'block', draft: { tree: [], schema_version: 2 }, targets: [{ q: 5, r: 6 }],
  }, T);
  console.log('TOP KEYS:', Object.keys(out));
  console.log(JSON.stringify(out, null, 2).slice(0, 1500));
})();
