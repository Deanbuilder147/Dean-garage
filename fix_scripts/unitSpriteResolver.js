// =======================================================================
//   Unit Sprite Resolver — 2D 棋子切图资源映射字典 (Phase 2)
// =======================================================================
// 设计原则:
//   - 严禁在 Canvas 绘制函数中硬编码图片路径
//   - 4 级降级链: 精确匹配 → 朝向idle → 默认idle → 通用降级 → null
//   - 支持 standalone/atlas 双模式
//
// 文件命名规范 (standalone 模式):
//   /assets/sprites/units/{unitCode}_{direction}_{actionState}.png
//   例: KMF-001_0_idle.png, KMF-001_2_attack.png, DEFAULT_0_idle.png
// =======================================================================

/**
 * 切片纹理查询结果
 * @typedef {Object} SpriteTexture
 * @property {HTMLImageElement} image   - 图片对象
 * @property {number} sx               - Atlas 源X (standalone 模式为 0)
 * @property {number} sy               - Atlas 源Y (standalone 模式为 0)
 * @property {number} sw               - 源宽度
 * @property {number} sh               - 源高度
 * @property {number} renderW          - 渲染目标宽度 (画布上大小)
 * @property {number} renderH          - 渲染目标高度
 * @property {number} anchorX          - 锚点X (脚底中心，通常 = renderW/2)
 * @property {number} anchorY          - 锚点Y (脚底对齐，通常 = renderH)
 */

export const unitSpriteResolver = {
  // === 配置 ===

  /** 资源模式: 'standalone' (独立PNG) | 'atlas' (精灵图集) */
  _mode: 'standalone',

  /** 图片缓存: key → HTMLImageElement */
  _cache: {},

  /** Atlas 元数据 (atlas 模式下使用) */
  _atlasMeta: null,

  /** 渲染时默认棋子大小 (画布像素，不含缩放) */
  _defaultRenderW: 48,
  _defaultRenderH: 56,

  // ================================================================
  //  公共 API
  // ================================================================

  /**
   * 初始化配置
   * @param {'standalone'|'atlas'} mode
   * @param {Object|null} [atlasMeta=null] - atlas 模式的元数据 JSON
   * @param {{ renderW?: number, renderH?: number }} [opts={}]
   */
  init(mode = 'standalone', atlasMeta = null, opts = {}) {
    this._mode = mode
    this._atlasMeta = atlasMeta
    if (opts.renderW) this._defaultRenderW = opts.renderW
    if (opts.renderH) this._defaultRenderH = opts.renderH
  },

  /**
   * 获取单位纹理切片
   *
   * 降级优先级链:
   *   1. {unitCode}_{direction}_{actionState}   (精确匹配)
   *   2. {unitCode}_{direction}_idle            (该朝向降级为待机)
   *   3. {unitCode}_0_idle                      (降级为正北待机)
   *   4. {fallbackUnitCode}_0_idle              (降级为通用单位)
   *   5. null                                   (无可用资源)
   *
   * @param {string} unitCode         - 机体代号
   * @param {number} direction        - 朝向 (0-8)
   * @param {string} actionState      - 动作状态
   * @param {string} [fallbackUnitCode='DEFAULT'] - 降级机体代号
   * @returns {SpriteTexture|null} 纹理对象，图片未加载完成返回 null
   */
  getTexture(unitCode, direction = 0, actionState = 'idle', fallbackUnitCode = 'DEFAULT') {
    // 降级优先级链
    const keys = [
      `${unitCode}_${direction}_${actionState}`,
      `${unitCode}_${direction}_idle`,
      `${unitCode}_0_idle`,
      `${fallbackUnitCode}_0_idle`,
    ]

    for (const key of keys) {
      const tex = this._resolve(key)
      if (tex) return tex
    }
    return null
  },

  /**
   * 预加载指定单位的所有切片（异步，不阻塞渲染）
   * @param {string[]} unitCodes - 机体代码列表
   * @returns {Promise<void>}
   */
  async preload(unitCodes) {
    const directions = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    const actions = ['idle', 'move', 'attack', 'damaged']
    const promises = []

    for (const code of [...unitCodes, 'DEFAULT']) {
      for (const d of directions) {
        for (const a of actions) {
          const key = `${code}_${d}_${a}`
          if (this._cache[key]) continue
          const img = new Image()
          img.src = `/assets/sprites/units/${key}.png`
          this._cache[key] = img
          promises.push(new Promise((resolve) => {
            img.onload = resolve
            img.onerror = resolve // 缺失切片不阻塞
          }))
        }
      }
    }
    await Promise.all(promises)
  },

  /**
   * 检查指定 key 的图片是否已加载完成
   */
  isReady(key) {
    const img = this._cache[key]
    return img && img.complete && img.naturalWidth > 0
  },

  // ================================================================
  //  内部方法
  // ================================================================

  /**
   * 根据 key 解析纹理
   */
  _resolve(key) {
    if (this.isReady(key)) {
      const img = this._cache[key]
      return this._buildTexture(img)
    }

    // 触发异步加载
    if (this._mode === 'standalone' && !this._cache[key]) {
      const img = new Image()
      img.src = `/assets/sprites/units/${key}.png`
      this._cache[key] = img
    }
    // atlas 模式 — Phase 2 暂不实现
    return null
  },

  /**
   * 构建 SpriteTexture 对象
   */
  _buildTexture(img) {
    const sw = img.naturalWidth
    const sh = img.naturalHeight
    // 保持图片原始宽高比，限制最大渲染尺寸
    const aspect = sw / sh
    let rw = this._defaultRenderW
    let rh = this._defaultRenderH
    if (aspect > 1) {
      rh = rw / aspect
    } else {
      rw = rh * aspect
    }
    return {
      image:  img,
      sx:     0,
      sy:     0,
      sw:     sw,
      sh:     sh,
      renderW: rw,
      renderH: rh,
      anchorX: rw / 2,   // 水平居中
      anchorY: rh,       // 脚底对齐
    }
  },
}
