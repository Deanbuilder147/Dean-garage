/**
 * Phase 30-Perm — 等级-功能权限矩阵查询（共享模块）
 *
 * 从 admin.ts 抽离的权限真相源，供各写接口与 requireFeature 中间件复用。
 * 含进程内缓存层，消除「每请求查 SQLite」的 IO 性能隐患（地图/词条编辑频刷场景）。
 */
import { get, run } from '../db/sqlite.js';
import { DEFAULT_FEATURE_PERMISSIONS } from '../routes/admin.js';

// ── 进程内缓存（role -> enabled[]） + 版本号（乐观失效） ──
const _featureCache = new Map<string, string[]>();
const _cacheSeq = new Map<string, number>();

/** 失效缓存：传 role 只清该等级，不传清全部（后台改矩阵后调用） */
export function clearFeatureCache(role?: string): void {
  if (role) {
    _featureCache.delete(role);
    _cacheSeq.delete(role);
  } else {
    _featureCache.clear();
    _cacheSeq.clear();
  }
}

/**
 * 读取某等级当前启用的功能 key 数组（缺表行回退默认并落库，幂等）。
 * 命中缓存则直接返回，避免重复 SQLite SELECT。
 */
export function resolveRoleFeatures(role: string): string[] {
  const cached = _featureCache.get(role);
  if (cached) return cached;

  const row = get('SELECT enabled FROM feature_permissions WHERE role = ?', [role]) as any;
  let enabled: string[] | undefined;
  if (row && row.enabled) {
    try {
      enabled = JSON.parse(row.enabled);
    } catch {
      enabled = undefined; // 落库脏数据 → 回退默认
    }
  }
  if (!Array.isArray(enabled)) {
    enabled = DEFAULT_FEATURE_PERMISSIONS[role] || [];
    run('INSERT OR REPLACE INTO feature_permissions (role, enabled) VALUES (?, ?)', [role, JSON.stringify(enabled)]);
  }
  _featureCache.set(role, enabled);
  return enabled;
}
