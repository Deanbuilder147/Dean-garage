#!/usr/bin/env node
/**
 * 全量收束 console.* -> logger.*（覆盖 src 下所有 .ts，含子目录）
 * 动态计算 logger 相对导入路径。已转过的文件（无 console）安全跳过。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

// 收集 src 下所有 .ts
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}
const files = walk(SRC, []);

function classify(arg) {
  const s = arg.trim();
  if (s.length === 0) return '';
  if (/^['"`]/.test(s)) return s.slice(1, -1);
  if (/^(true|false|null|\d)/.test(s)) return s;
  if (/^[{(]/.test(s)) return '${ JSON.stringify(' + s + ') }';
  return '${ ' + s + ' }';
}

function transform(content) {
  const re = /console\.(log|error|warn|info|debug)\s*\(/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const method = m[1];
    const start = m.index;
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let i = open;
    let end = -1;
    for (; i < content.length; i++) {
      const ch = content[i];
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) { end = i; break; } }
      else if (ch === '`') {
        i++;
        while (i < content.length && content[i] !== '`') { if (content[i] === '\\') i++; i++; }
      }
    }
    if (end === -1) { out += content.slice(last, m.index) + m[0]; last = m.index + m[0].length; continue; }
    const argsStr = content.slice(open + 1, end);
    const args = [];
    let buf = ''; let d = 0; let inStr = false; let strCh = '';
    for (let k = 0; k < argsStr.length; k++) {
      const c = argsStr[k];
      if (inStr) {
        if (c === '\\') { buf += c + argsStr[k+1]; k++; continue; }
        if (c === strCh) inStr = false;
        buf += c;
      } else if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; buf += c; }
      else if (c === '(' || c === '[' || c === '{') { d++; buf += c; }
      else if (c === ')' || c === ']' || c === '}') { d--; buf += c; }
      else if (c === ',' && d === 0) { args.push(buf); buf = ''; }
      else buf += c;
    }
    if (buf.trim().length) args.push(buf);
    const parts = args.map(classify).filter(p => p !== '');
    out += content.slice(last, start) + `logger.${method}({ msg: \`${parts.join(' ')}\` })`;
    last = end + 1;
  }
  out += content.slice(last);
  return out;
}

for (const fp of files) {
  let content = fs.readFileSync(fp, 'utf8');
  if (!/console\./.test(content)) continue; // 无 console 跳过
  // 计算相对 src/utils/logger.js 的导入
  const rel = path.relative(path.join(__dirname, '..'), fp); // 如 src/routes/foo.ts
  const dirFromRoot = path.dirname(rel); // src/routes
  const depth = dirFromRoot.split(path.sep).length - 1; // src=1, src/routes=2
  const dots = '../'.repeat(depth) + 'src/utils/logger.js';
  // 注入 import（若尚未导入 logger）
  if (!/from ['"](\.\.\/)*src\/utils\/logger\.js['"]/.test(content) && !/from ['"]\.\/utils\/logger\.js['"]/.test(content)) {
    const idx = content.indexOf('\nimport ');
    if (idx !== -1) {
      const nl = content.indexOf('\n', idx);
      content = content.slice(0, nl + 1) + `import { logger } from '${dots}';\n` + content.slice(nl + 1);
    } else {
      content = `import { logger } from '${dots}';\n` + content;
    }
  }
  content = transform(content);
  fs.writeFileSync(fp, content);
  console.log('TRANSFORMED', rel);
}
console.log('DONE');
