/**
 * glossary-branch-integration.mjs
 * Step 4 联调验证：前端契约模块产出的多分支投骰词条 → 注入 glossary 配置 →
 * 经后端 skillExecutor.executeUniversalSkill 跑出战斗日志，证明前后端 100% 对齐。
 * 运行：node glossary-branch-integration.mjs
 */
import { createRequire } from 'module'
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// 前端契约模块（ESM 镜像后端）
import {
  serializeSkillToContract,
  hydrateSkill,
  normalizeSkill
} from '../../../../../../frontend/src/contracts/skillContract.js'

const CONFIG_PATH = resolve(__dirname, '../../../config/glossary-skill-config.json')
const BACKUP_PATH = CONFIG_PATH + '.bak'

// 后端管道
const SkillExecutor = require('../skillExecutor.cjs')
const { getSkillConfig, saveGlossaryConfig } = require('../configLoader.cjs')

const TEST_KEY = 'test_multibranch'

// ── 编辑器内部形状（前端 v-model 直接绑定的结构）──
const editorShape = {
  key: TEST_KEY,
  name: '测试·多判定投骰',
  category: 'ranged',
  target_scope: 'enemy',
  target_filter: 'enemy',
  cast_range: { min: 1, max: 5 },
  min_cast_range: 1,
  skill_shape: 'single',
  range_type: 'single',
  damage_kind: 'kinetic',
  action_type: 'attack',
  has_dice: true,
  dice_type: 6,
  dice_branches: [
    {
      id: 'b1', label: '判定1',
      points: [
        { kind: 'exact', value: 1 },
        { kind: 'exact', value: 2 },
        { kind: 'exact', value: 3 }
      ],
      effects: [
        { action: 'damage', value: 10, status: null, target: 'enemy' },
        { action: 'apply_status', value: 0, status: 'burn', target: 'enemy' }
      ]
    },
    {
      id: 'b2', label: '判定2',
      points: [
        { kind: 'exact', value: 4 },
        { kind: 'exact', value: 5 },
        { kind: 'exact', value: 6 }
      ],
      effects: [
        { action: 'damage_bonus', value: 5, status: null, target: 'enemy' },
        { action: 'accuracy_mod', value: 2, status: null, target: 'enemy' }
      ]
    }
  ]
}

let failures = 0
function assert(cond, msg) {
  if (cond) {
    console.log('  ✓ ' + msg)
  } else {
    console.error('  ✗ ' + msg)
    failures++
  }
}

try {
  // 0. 备份
  if (existsSync(CONFIG_PATH)) copyFileSync(CONFIG_PATH, BACKUP_PATH)

  // 1. 前端 serializeSkillToContract 产出标准契约 + 旧镜像
  const serialized = serializeSkillToContract(editorShape)
  console.log('[1] 前端序列化契约：')
  assert(serialized.has_dice === true, '序列化含 has_dice = true')
  assert(Array.isArray(serialized.dice_branches) && serialized.dice_branches.length === 2, '序列化含 2 条 dice_branches')
  assert(serialized.dice && serialized.dice.has_dice === true, '序列化含 dice 命名空间（供后端 _getUniversalFields 透传）')
  assert(serialized.target_scope === 'enemy' && serialized.target_filter === 'enemy', 'target_scope 与旧镜像 target_filter 并存')

  // 2. 反序列化回显：hydrateSkill 还原树状表单
  const hydrated = hydrateSkill(serialized)
  console.log('[2] 反序列化回显（hydrateSkill）：')
  assert(hydrated.dice_branches.length === 2, '回显 dice_branches 还原为 2 条')
  assert(hydrated.dice_branches[0].points.length === 3, '《判定1》点数还原 3 个离散点')
  assert(hydrated.dice_branches[0].effects[1].action === 'apply_status', '《判定1》效果2 还原为 apply_status')

  // 3. 注入 glossary 配置（模拟前端保存 POST /api/combat-glossary/config）
  saveGlossaryConfig({ skills: { [TEST_KEY]: serialized } })
  const stored = getSkillConfig(TEST_KEY)
  console.log('[3] 注入后端并读取 getSkillConfig：')
  assert(stored && stored.has_dice === true, '后端 getSkillConfig 识别 has_dice')
  assert(stored.dice_branches && stored.dice_branches.length === 2, '后端识别 dice_branches')

  // 4. 跑 executeUniversalSkill（多分支投骰管道）
  const exec = new SkillExecutor()
  exec._hexDistance = () => 1 // 桩：距离 1，落在 cast_range[1,5] 内
  const attacker = { id: 'A', hp: 100, has_moved: false, stealth: false, z: 0 }
  const target = { id: 'B', hp: 100, z: 0, terrain: null }

  console.log('[4] executeUniversalSkill 多分支投骰（随机 10 次）：')
  let allHit = true
  for (let i = 0; i < 10; i++) {
    const res = exec.executeUniversalSkill(TEST_KEY, attacker, target)
    if (!(res && res.triggered && res.hit && res.roll >= 1 && res.roll <= 6)) {
      allHit = false
      console.error('    第' + (i + 1) + '次异常：' + JSON.stringify(res))
    }
  }
  assert(allHit, '10 次投骰全部命中分支（点数覆盖 1-6，命中率 100%）')

  // 5. 单次详细断言：命中分支 + 战斗日志 + 伤害/效果落地
  const detail = exec.executeUniversalSkill(TEST_KEY, attacker, target)
  console.log('[5] 单次详情：' + JSON.stringify(detail, null, 2))
  assert(Array.isArray(detail.log) && detail.log.length > 0, '产出战斗日志数组（log 非空）')
  assert(/直接伤害|追加伤害|命中判定效果|施加状态/.test(detail.log.join(' | ')), '日志含《判定效果》条目')
  assert((detail.damage ?? 0) > 0 || (detail.bonus_value ?? 0) > 0 || (detail.accuracy_mod ?? 0) > 0,
    '判定效果数值已落地（伤害/追加/命中修正之一生效）')
  assert((detail.status_effects || []).length > 0, 'apply_status 效果已收集到 status_effects')

  // 6. 接线缺口修复确认：_getUniversalFields 透传 dice
  const uf = exec._getUniversalFields(TEST_KEY)
  assert(uf.dice && uf.dice.has_dice === true && uf.dice.dice_branches.length === 2,
    '_getUniversalFields 已透传 dice（分支管道接线修复生效）')
  assert(uf.name === '测试·多判定投骰', '_getUniversalFields 已透传 name')

  console.log('\n===== 集成测试结果 ' + (failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌') + ' =====')
} catch (e) {
  console.error('测试抛出异常:', e)
  failures++
} finally {
  // 还原真实配置
  if (existsSync(BACKUP_PATH)) {
    copyFileSync(BACKUP_PATH, CONFIG_PATH)
    // 不删除 .bak 以免误删；留作安全备份
  }
}

process.exit(failures === 0 ? 0 : 1)
