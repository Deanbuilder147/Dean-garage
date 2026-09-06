/**
 * Phase 13-A: 设备交警拦截器
 * 通过 UA + 窗口宽度双因子判断，为路由分流提供设备类型标签。
 *
 * 原则：宁可误判为 PC（让用户在 PC 端用 PC 布局），
 * 也不错判为 Mobile（避免小屏幕被塞进带滑块/3D 透视的复杂 UI）。
 */

export function detectDevice() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const width = (typeof window !== 'undefined' && window.innerWidth) || 1024;

  // 双因子：UA 匹配 OR 窗口宽度 < 768 即视为移动端
  const isMobile = isMobileUA || width < 768;
  const isTablet = !isMobileUA && width >= 768 && width < 1024; // 平板也走 mobile 以确保简洁布局

  return {
    isMobile: isMobile || isTablet,
    isPC: !isMobile && !isTablet,
    type: (isMobile || isTablet) ? 'mobile' : 'pc',
    width,
    isMobileUA
  };
}

/**
 * 纯函数：仅返回设备类型字符串 'pc' | 'mobile'
 */
export function getDeviceType() {
  return detectDevice().type;
}

export default { detectDevice, getDeviceType };
