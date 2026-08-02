#!/usr/bin/env node
/**
 * 批量收束 console.* -> logger.*（Pino 结构化）安全转换脚本
 * 规则：把 console.<M>(a, b, c) 转为 logger.<M>({ msg: `...合并...` })
 *  - 字符串/数字字面量：去引号直接拼接
 *  - 标识符/成员表达式：包 ${ expr }
 *  - 对象字面量/调用表达式（含 { 或 ( 开头）：包 ${ JSON.stringify(expr) }
 * 仅处理指定文件。转换后由 tsc 校验。
 */
const fs = require('fs');
const path = require('path');

const FILES = [
  'src/db/sqlite.ts',
  'src/routes/auth.ts',
  'src/routes/combat.ts',
];

function classify(arg) {
  const s = arg.trim();
  if (s.length === 0) return '';
  // 字符串字面量
  if (/^['"`]/.test(s)) {
    // 去掉首尾引号，保留内部（模板字符串内 ${} 仍生效）
    return s.slice(1, -1);
  }
  // 数字 / 布尔 / null
  if (/^(true|false|null|\d)/.test(s)) return s;
  // 对象字面量 / 函数调用 / JSON.stringify 等 -> 序列化
  if (/^[{(]/.test(s)) return '${ JSON.stringify(' + s + ') }';
  // 其他表达式（标识符、成员访问、三元等）
  return '${ ' + s + ' }';
}

function transform(content) {
  // 匹配 console.<method>( ... )，括号平衡
  const re = /console\.(log|error|warn|info|debug)\s*\(/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const method = m[1];
    const start = m.index;
    const open = m.index + m[0].length - 1; // '(' 位置
    // 找匹配闭括号
    let depth = 0;
    let i = open;
    let end = -1;
    for (; i < content.length; i++) {
      const ch = content[i];
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) { end = i; break; } }
      // 简易处理模板字符串（避免误判括号内括号）
      else if (ch === '`') {
        // 跳到模板字符串结束（不支持嵌套模板，足够本仓库）
        i++;
        while (i < content.length && content[i] !== '`') {
          if (content[i] === '\\') i++;
          i++;
        }
      }
    }
    if (end === -1) { out += content.slice(last, m.index) + m[0]; last = m.index + m[0].length; continue; }
    const argsStr = content.slice(open + 1, end);
    // 按顶级逗号分割
    const args = [];
    let buf = '';
    let d = 0;
    let inStr = false;
    let strCh = '';
    for (let k = 0; k < argsStr.length; k++) {
      const c = argsStr[k];
      if (inStr) {
        if (c === '\\') { buf += c + argsStr[k+1]; k++; continue; }
        if (c === strCh) inStr = false;
        buf += c;
      } else if (c === '"' || c === "'" || c === '`') {
        inStr = true; strCh = c; buf += c;
      } else if (c === '(' || c === '[' || c === '{') {
        d++; buf += c;
      } else if (c === ')' || c === ']' || c === '}') {
        d--; buf += c;
      } else if (c === ',' && d === 0) {
        args.push(buf); buf = '';
      } else {
        buf += c;
      }
    }
    if (buf.trim().length) args.push(buf);
    const parts = args.map(classify).filter(p => p !== '');
    const merged = parts.join(' ');
    out += content.slice(last, start) + `logger.${method}({ msg: \`${merged}\` })`;
    last = end + 1;
  }
  out += content.slice(last);
  return out;
}

function ensureImport(content, importLine) {
  if (content.includes('logger') && /from ['"]\.\.\/utils\/logger['"]/.test(content)) return content;
  if (content.includes('logger') && /from ['"]\.\/utils\/logger['"]/.test(content)) return content;
  // 在第一个 import 之后插入
  const idx = content.indexOf('\nimport ');
  if (idx === -1) return importLine + '\n' + content;
  const nl = content.indexOf('\n', idx);
  return content.slice(0, nl + 1) + importLine + '\n' + content.slice(nl + 1);
}

for (const rel of FILES) {
  const fp = path.join(__dirname, '..', rel);
  if (!fs.existsSync(fp)) { console.error('SKIP missing', fp); continue; }
  let content = fs.readFileSync(fp, 'utf8');
  // 计算相对路径 import
  const depth = rel.split('/').length - 2; // src/db/sqlite -> ../.. 级
  // db/sqlite.ts -> ../../utils/logger ; routes/auth.ts -> ../utils/logger
  const dots = rel.startsWith('src/db/') ? '../'.repeat(3) : '../'.repeat(2);
  const importLine = `import { logger } from '${dots}utils/logger.js';`;
  content = ensureImport(content, importLine);
  content = transform(content);
  fs.writeFileSync(fp, content);
  console.log('TRANSFORMED', rel);
}

console.log('DONE');
