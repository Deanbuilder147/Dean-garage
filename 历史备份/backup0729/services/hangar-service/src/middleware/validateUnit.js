/**
 * 验证棋子数据
 * @param {Object} data - 棋子数据
 * @returns {string[]} 错误列表，空数组表示验证通过
 */
function validateUnit(data) {
  const errors = [];

  // 验证主机体属性点数
  const mainPoints = (data.main_格斗 || 0) + (data.main_射击 || 0) +
                     (data.main_结构 || 0) + (data.main_机动 || 0);
  if (mainPoints !== 40) {
    errors.push(`主机体属性点数必须等于40点，当前: ${mainPoints}点`);
  }

  // 验证左手装备属性点数（仅当类型不是 'none' 时）
  if (data.left_type && data.left_type !== 'none') {
    const leftPoints = (data.left_格斗 || 0) + (data.left_射击 || 0) +
                       (data.left_结构 || 0) + (data.left_机动 || 0);
    if (leftPoints !== 15) {
      errors.push(`左手装备(${data.left_type})点数必须等于15点，当前: ${leftPoints}点`);
    }
  }

  // 验证右手装备属性点数（仅当类型不是 'none' 时）
  if (data.right_type && data.right_type !== 'none') {
    const rightPoints = (data.right_格斗 || 0) + (data.right_射击 || 0) +
                        (data.right_结构 || 0) + (data.right_机动 || 0);
    if (rightPoints !== 15) {
      errors.push(`右手装备(${data.right_type})点数必须等于15点，当前: ${rightPoints}点`);
    }
  }

  // 验证其它装备属性点数（仅当类型不是 'none' 时）
  if (data.extra_type && data.extra_type !== 'none') {
    const extraPoints = (data.extra_格斗 || 0) + (data.extra_射击 || 0) +
                        (data.extra_结构 || 0) + (data.extra_机动 || 0);
    const expectedPoints = data.extra_type === '载具' || data.extra_type === '防具' || data.extra_type === '武器' ? 15 : 10;
    if (extraPoints !== expectedPoints) {
      errors.push(`其它装备(${data.extra_type})点数必须等于${expectedPoints}点，当前: ${extraPoints}点`);
    }
  }

  // 验证跟随(Royroy)
  if (data.has_royroy) {
    const royroyPoints = (data.royroy_格斗 || 0) + (data.royroy_射击 || 0) +
                         (data.royroy_结构 || 0) + (data.royroy_机动 || 0);
    if (royroyPoints !== 25) {
      errors.push(`跟随属性点数必须等于25点，当前: ${royroyPoints}点`);
    }

    // Royroy约束: 任一项>=10
    const hasHighStat = [data.royroy_格斗, data.royroy_射击, data.royroy_结构, data.royroy_机动]
      .some(v => (v || 0) >= 10);
    if (!hasHighStat) {
      errors.push('跟随至少有一项属性必须>=10');
    }
  }

  // 验证载具约束
  if (data.extra_type === '载具' && (data.extra_机动 || 0) < 10) {
    errors.push('载具机动必须>=10才能生效');
  }

  // 验证防具约束
  if (data.extra_type === '防具' && (data.extra_结构 || 0) < 10) {
    errors.push('防具结构必须>=10');
  }

  return errors;
}

export default validateUnit;
