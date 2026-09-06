/**
 * 六段式 Schema 向后兼容校验：现有 glossary 配置不应被新 Schema 阻断。
 * 运行：node scripts/test-glossary-schema.mjs
 * 说明：Phase A 种子枚举尚不完整，仅断言无结构性 errors；枚举漂移以 warnings
 * 形式输出（预期内，Phase C/D 收口）。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONFIG = resolve(ROOT, 'mecha-universe-engine/services/combat-service/src/config/glossary-skill-config.json');
const CONTRACTS = resolve(ROOT, 'mecha-universe-engine/shared-kernel/dist/contracts/index.cjs');

const require = createRequire(import.meta.url);
const { validateGlossaryConfig } = require(CONTRACTS);

const config = JSON.parse(readFileSync(CONFIG, 'utf-8'));
const res = validateGlossaryConfig(config);
assert.strictEqual(res.valid, true, '六段式 Schema 校验应无结构性 errors: ' + JSON.stringify(res.errors));
console.log(`[glossary-schema] valid=${res.valid}, warnings=${res.warnings.length}`);
if (res.warnings.length) {
  console.log('  枚举漂移 warnings（预期内，Phase C/D 收口）:');
  for (const w of res.warnings) console.log('   - ' + w);
}
console.log('[glossary-schema] OK: 现有 glossary 配置向后兼容六段式 Schema（无阻断）');
