// =======================================================================
//   Unit Sprite Resolver — 2D 棋子切图资源映射字典 (Phase 28-D)
// =======================================================================
// Phase 28-D 升级:
//   - 废弃旧 9 视图 (0-8)，全面切换为新 7 视图 (0-6) 大一统引擎
//   - direction 范围: 0=正面特写, 1-6=六角格六方向
//   - 资产命名: {unitCode}_{0-6}_idle.png
// =======================================================================
// 设计原则:
//   - 严禁在 Canvas 绘制函数中硬编码图片路径
//   - 4 级降级链: 精确匹配 → 朝向idle → 默认idle → 通用降级 → null
//   - 支持 standalone/atlas 双模式
//   - 多帧动画: time-based frame counter, 为未来完整动画预留接口
//
// 文件命名规范 (standalone 模式):
//   单帧: /assets/sprites/units/{unitCode}_{direction}_{actionState}.png
//   多帧: /assets/sprites/units/{unitCode}_{direction}_{actionState}_f{0..N}.png
//   例: KMF-001_0_idle.png, KMF-001_2_attack_f0.png, DEFAULT_0_idle.png
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
 * @property {number} [frameIndex]     - 当前帧索引 (0-based)
 * @property {number} [totalFrames]    - 该动作总帧数
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
  //  Phase 3: 多帧动画配置
  // ================================================================

  /** 各状态帧间隔 (ms) */
  _frameDurations: {
    idle:    150,
    move:    120,
    attack:  100,
    damaged: 200,
    defend:  150,
    wait:    150,
  },

  /** 各状态总帧数 */
  _totalFrames: {
    idle:    1,
    move:    4,
    attack:  3,
    damaged: 2,
    defend:  1,
    wait:    1,
  },

  // ================================================================
  //  公共 API
  // ================================================================

  /**
   * 初始化配置
   * @param {'standalone'|'atlas'} mode
   * @param {Object|null} [atlasMeta=null] - atlas 模式的元数据 JSON
   * @param {{ renderW?: number, renderH?: number, frameDurations?: Object, totalFrames?: Object }} [opts={}]
   */
  init(mode = 'standalone', atlasMeta = null, opts = {}) {
    this._mode = mode
    this._atlasMeta = atlasMeta
    if (opts.renderW) this._defaultRenderW = opts.renderW
    if (opts.renderH) this._defaultRenderH = opts.renderH
    if (opts.frameDurations) Object.assign(this._frameDurations, opts.frameDurations)
    if (opts.totalFrames) Object.assign(this._totalFrames, opts.totalFrames)
  },

  // ================================================================
  //  Phase 3: 多帧动画 — 基于时间的帧计数器
  // ================================================================

  /**
   * 获取某动作状态的当前帧索引 (0-based)
   *
   * 使用公式: floor(now / interval) % totalFrames
   * 所有同动作状态的单位共享同一时间基准，形成同步动画节奏。
   *
   * @param {string} actionState - 动作状态
   * @returns {number} 当前帧索引，0-based
   */
  getFrameIndex(actionState) {
    const total = this._totalFrames[actionState] || 1
    if (total <= 1) return 0
    const interval = this._frameDurations[actionState] || 150
    return Math.floor(Date.now() / interval) % total
  },

  /**
   * 获取指定动作的总帧数
   * @param {string} actionState
   * @returns {number}
   */
  getTotalFrames(actionState) {
    return this._totalFrames[actionState] || 1
  },

  /**
   * 获取单位纹理切片 (Phase 28-D 升级版)
   *
   * 降级优先级链:
   *   1. {unitCode}_{direction}_{actionState}_f{frame}    (精确多帧)
   *   2. {unitCode}_{direction}_{actionState}             (精确单帧)
   *   3. {unitCode}_{direction}_idle                     (该朝向降级为待机)
   *   4. {unitCode}_0_idle                               (降级为正面特写)
   *   5. {fallbackUnitCode}_0_idle                       (降级为通用单位)
   *   6. null                                            (无可用资源)
   *
   * @param {string} unitCode         - 机体代号
   * @param {number} direction        - 朝向 (0-6: 0=正面, 1-6=六方向)
   * @param {string} actionState      - 动作状态
   * @param {string} [fallbackUnitCode='DEFAULT'] - 降级机体代号
   * @returns {SpriteTexture|null} 纹理对象，图片未加载完成返回 null
   */
  getTexture(unitCode, direction = 0, actionState = 'idle', fallbackUnitCode = 'DEFAULT') {
    const frameIndex = this.getFrameIndex(actionState)
    const totalFrames = this.getTotalFrames(actionState)

    // 降级优先级链 (多帧 → 单帧)
    const keys = []
    if (totalFrames > 1) {
      keys.push(`${unitCode}_${direction}_${actionState}_f${frameIndex}`)
    }
    keys.push(
      `${unitCode}_${direction}_${actionState}`,
      `${unitCode}_${direction}_idle`,
      `${unitCode}_0_idle`,
      `${fallbackUnitCode}_0_idle`,
    )

    for (const key of keys) {
      const tex = this._resolve(key)
      if (tex) {
        tex.frameIndex = frameIndex
        tex.totalFrames = totalFrames
        return tex
      }
    }
    return null
  },

  /**
   * 预加载指定单位的所有切片（异步，不阻塞渲染）
   * Phase 3: 增加多帧加载
   * @param {string[]} unitCodes - 机体代码列表
   * @returns {Promise<void>}
   */
  async preload(unitCodes) {
    const directions = [0, 1, 2, 3, 4, 5, 6]  // Phase 28-D: 7 视图 (0-6)
    const actions = ['idle', 'move', 'attack', 'damaged']
    const promises = []

    for (const code of [...unitCodes, 'DEFAULT']) {
      for (const d of directions) {
        for (const a of actions) {
          const totalFrames = this._totalFrames[a] || 1
          if (totalFrames > 1) {
            // 多帧切片
            for (let f = 0; f < totalFrames; f++) {
              const key = `${code}_${d}_${a}_f${f}`
              promises.push(this._loadToCache(key))
            }
          }
          // 单帧降级 (始终加载，作为降级链)
          const key = `${code}_${d}_${a}`
          promises.push(this._loadToCache(key))
        }
      }
    }
    await Promise.all(promises)
  },

  /**
   * 异步加载图片到缓存
   * @param {string} key
   * @returns {Promise<void>}
   */
  _loadToCache(key) {
    if (this._cache[key]) return Promise.resolve()
    const img = new Image()
    const primarySrc = `/assets/sprites/units/${key}.png`
    const fallbackSrc = `/api/hangar/units/sprites/${key}.png`
    img.src = primarySrc
    // 异步 fallback: 主路径失败后尝试 API 路径
    img.onerror = () => {
      if (img.src === primarySrc) {
        img.src = fallbackSrc
      }
    }
    this._cache[key] = img
    return new Promise((resolve) => {
      img.onload = resolve
      // 第二次 onerror 不阻塞
      if (!img._fallbackHandler) {
        img._fallbackHandler = true
        const origError = img.onerror
        img.addEventListener('error', () => resolve(), { once: true })
      }
    })
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
      const primarySrc = `/assets/sprites/units/${key}.png`
      const fallbackSrc = `/api/hangar/units/sprites/${key}.png`
      img.onload = () => {
        // Phase 26: 图片加载完成后派发全局事件，通知 Canvas 进行重绘
        window.dispatchEvent(new CustomEvent('unit-sprite-loaded', { detail: { key } }))
      }
      // Phase 28-D: 主路径失败后自动尝试 API fallback
      img.onerror = () => {
        if (img.src === primarySrc) {
          img.src = fallbackSrc
        } else {
          // 两种路径都失败，触发重绘走 fallback 圆形+字母
          window.dispatchEvent(new CustomEvent('unit-sprite-loaded', { detail: { key, error: true } }))
        }
      }
      img.src = primarySrc
      this._cache[key] = img
    }
    // atlas 模式 — 暂不实现
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
