const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const k = Object.keys(d.skills || {});
console.log('总词条:', k.length);
k.forEach(x => {
  const s = d.skills[x];
  console.log(x, 'sv=' + s.schema_version, 'treeLen=' + ((s.tree || []).length));
});
