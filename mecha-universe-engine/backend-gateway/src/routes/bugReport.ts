/**
 * Phase 33 — Bug 问题收集路由
 *
 * 设计原则（轻量、玩家友好）：
 * - 玩家提交：免登录即可提交，只需填自然语言描述；模块/严重程度为可选按钮。
 * - 管理汇总：仅 dominator 可查看/筛选/改状态/导出 CSV。
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { run, get, all, persistChanges } from '../db/sqlite.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import { UserRole, ErrorCode } from '@mecha/shared-kernel';
import { logger } from '../utils/logger.js';

const router = Router();

// 尝试从请求解析登录用户（可选，失败则视为游客，不影响提交）
function tryAuth(req: any): { userId?: string; username?: string } {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return {};
  try {
    const p = jwt.verify(token, config.jwt.secret) as any;
    return { userId: p.userId, username: p.username };
  } catch {
    return {};
  }
}

// 允许的模块与严重程度（前端按钮用，后端做白名单校验）
const MODULES = ['战斗', '棋盘/地图', '棋子/七视图', '账号/权限', '房间/联机', 'UI/显示', '其他'];
const SEVERITIES = ['崩溃', '严重', '一般', '建议'];
const STATUSES = ['待处理', '处理中', '已修复', '已关闭', '不予处理'];

function sanitize(value: any, allowed: string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

// 玩家提交（免登录）
router.post('/api/bug-report', (req, res) => {
  try {
    const auth = tryAuth(req);
    const body = req.body || {};
    const description = (body.description || '').toString().trim();
    if (!description) {
      res.status(400).json({ error: 'DESCRIPTION_REQUIRED', message: '请填写问题描述' });
      return;
    }
    const id = uuidv4();
    const moduleName = sanitize(body.module, MODULES, '其他');
    const severity = sanitize(body.severity, SEVERITIES, '一般');
    const contact = (body.contact || '').toString().trim().slice(0, 120);
    const title = (body.title || '').toString().trim().slice(0, 120);
    const reporterId = auth.userId || null;
    const reporterName = auth.username || (body.reporterName || '').toString().trim().slice(0, 60) || '匿名玩家';
    // 环境信息：客户端 UA + 时间，便于复现
    const env = JSON.stringify({
      ua: req.headers['user-agent'] || '',
      referer: req.headers['referer'] || '',
    }).slice(0, 500);

    run(
      `INSERT INTO bug_reports (id, reporter_id, reporter_name, contact, module, severity, status, title, description, env)
       VALUES (?, ?, ?, ?, ?, ?, '待处理', ?, ?, ?)`,
      [id, reporterId, reporterName, contact, moduleName, severity, title, description, env],
    );
    persistChanges();

    logger.info({ msg: `[BugReport] 新反馈: ${moduleName}/${severity} from ${reporterName}` });
    res.status(201).json({ success: true, id });
  } catch (err) {
    logger.error({ msg: `[BugReport] 提交失败: ${err}` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '提交失败，请稍后重试' });
  }
});

// 列出全部（管理员 referee / 主宰 dominator）
router.get('/api/bug-report/list', authenticate, requireRole(UserRole.REFEREE, UserRole.DOMINATOR), (req, res) => {
  try {
    const status = (req.query.status || '').toString();
    const moduleName = (req.query.module || '').toString();
    const severity = (req.query.severity || '').toString();
    const q = (req.query.q || '').toString().trim();

    const where: string[] = [];
    const params: any[] = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (moduleName) { where.push('module = ?'); params.push(moduleName); }
    if (severity) { where.push('severity = ?'); params.push(severity); }
    if (q) { where.push('(description LIKE ? OR title LIKE ? OR reporter_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

    const sql = `SELECT id, reporter_id, reporter_name, contact, module, severity, status, title, description, created_at, updated_at
                 FROM bug_reports
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC`;
    const rows = all(sql, params);
    res.json({
      reports: rows,
      summary: {
        total: all('SELECT COUNT(*) AS c FROM bug_reports')[0].c,
        byStatus: STATUSES.reduce((acc: Record<string, number>, s: string) => {
          acc[s] = (all('SELECT COUNT(*) AS c FROM bug_reports WHERE status = ?', [s])[0] || { c: 0 }).c;
          return acc;
        }, {}),
        modules: MODULES,
        severities: SEVERITIES,
        statuses: STATUSES,
      },
    });
  } catch (err) {
    logger.error({ msg: `[BugReport] 列表失败: ${err}` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '读取失败' });
  }
});

// 更新状态（dominator）
router.put('/api/bug-report/:id', authenticate, requireRole(UserRole.REFEREE, UserRole.DOMINATOR), (req, res) => {
  try {
    const id = req.params.id;
    const existing = get('SELECT id FROM bug_reports WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND', message: '记录不存在' });
      return;
    }
    const status = sanitize(req.body?.status, STATUSES, '待处理');
    run('UPDATE bug_reports SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
    persistChanges();
    res.json({ success: true });
  } catch (err) {
    logger.error({ msg: `[BugReport] 更新失败: ${err}` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '更新失败' });
  }
});

// 导出 CSV（dominator）
router.get('/api/bug-report/export', authenticate, requireRole(UserRole.REFEREE, UserRole.DOMINATOR), (req, res) => {
  try {
    const status = (req.query.status || '').toString();
    const params: any[] = [];
    let sql = 'SELECT * FROM bug_reports';
    if (status) { sql += ' WHERE status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const rows = all(sql, params);

    const headers = ['ID', '提交人', '联系方式', '模块', '严重程度', '状态', '标题', '问题描述', '提交时间'];
    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return `"${s.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ')}"`;
    };
    const lines = [headers.join(',')];
    rows.forEach((r: any) => {
      lines.push([
        r.id, r.reporter_name, r.contact, r.module, r.severity, r.status, r.title, r.description, r.created_at,
      ].map(esc).join(','));
    });
    const csv = '﻿' + lines.join('\r\n'); // BOM 保证 Excel 中文不乱码
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bug-reports-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    logger.error({ msg: `[BugReport] 导出失败: ${err}` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '导出失败' });
  }
});

export default router;
