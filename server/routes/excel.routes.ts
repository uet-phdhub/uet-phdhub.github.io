import express, { Router } from 'express';
import { MAX_DOCUMENT_BYTES } from '../config';
import { authenticateToken, isAdminOrStaff, requireRoles } from '../middlewares/auth';
import { recordSecretAccess } from '../services/audit';
import {
  buildPhdTemplateWorkbook,
  buildScientistTemplateWorkbook,
  commitPhdImport,
  commitScientistImport,
  exportPhdListWorkbook,
  exportScientistPaymentWorkbook,
  exportSupervisorQuotaWorkbook,
  previewPhdImport,
  previewScientistImport,
} from '../services/excel';
import { getRegulationConfig } from '../services/settings';
import type { AuthedRequest } from '../types';
import { loadEnrichedPhdList } from './phd.routes';
import { loadEnrichedScientists } from './scientists.routes';

export const excelRouter = Router();

excelRouter.get('/api/excel/templates/phd-students', authenticateToken, requireRoles('admin', 'staff'), (_req, res) => {
  const buf = buildPhdTemplateWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="UET_Mau_Import_NCS.xlsx"');
  res.send(buf);
});

excelRouter.get('/api/excel/templates/scientists', authenticateToken, requireRoles('admin', 'staff'), (_req, res) => {
  const buf = buildScientistTemplateWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="UET_Mau_Import_CanBo.xlsx"');
  res.send(buf);
});

const rawExcelMiddleware = express.raw({
  type: '*/*',
  limit: `${Math.ceil(MAX_DOCUMENT_BYTES / (1024 * 1024)) + 1}mb`,
});

excelRouter.post(
  '/api/excel/import/phd-students/preview',
  authenticateToken,
  requireRoles('admin', 'staff'),
  rawExcelMiddleware,
  async (req: AuthedRequest, res) => {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      if (!buf.length) return res.status(400).json({ error: 'Vui lòng chọn file Excel (.xlsx).' });
      let filename = String(req.headers['x-file-name'] || 'import-ncs.xlsx');
      try {
        filename = decodeURIComponent(filename);
      } catch {}
      const result = await previewPhdImport(buf, filename, req.user!.id);
      res.json(result);
    } catch (err: any) {
      res.status(422).json({ error: err?.message || 'Không đọc được file Excel NCS.' });
    }
  }
);

excelRouter.post(
  '/api/excel/import/phd-students/:previewId/commit',
  authenticateToken,
  requireRoles('admin', 'staff'),
  async (req: AuthedRequest, res) => {
    try {
      const result = await commitPhdImport(String(req.params.previewId), req.user!);
      res.json(result);
    } catch (err: any) {
      res.status(409).json({ error: err?.message || 'Không thể commit bản xem trước.' });
    }
  }
);

excelRouter.post(
  '/api/excel/import/scientists/preview',
  authenticateToken,
  requireRoles('admin', 'staff'),
  rawExcelMiddleware,
  async (req: AuthedRequest, res) => {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      if (!buf.length) return res.status(400).json({ error: 'Vui lòng chọn file Excel (.xlsx).' });
      let filename = String(req.headers['x-file-name'] || 'import-canbo.xlsx');
      try {
        filename = decodeURIComponent(filename);
      } catch {}
      const result = await previewScientistImport(buf, filename, req.user!.id);
      res.json(result);
    } catch (err: any) {
      res.status(422).json({ error: err?.message || 'Không đọc được file Excel Cán bộ.' });
    }
  }
);

excelRouter.post(
  '/api/excel/import/scientists/:previewId/commit',
  authenticateToken,
  requireRoles('admin', 'staff'),
  async (req: AuthedRequest, res) => {
    try {
      const result = await commitScientistImport(String(req.params.previewId), req.user!);
      res.json(result);
    } catch (err: any) {
      res.status(409).json({ error: err?.message || 'Không thể commit bản xem trước Cán bộ.' });
    }
  }
);

excelRouter.get('/api/excel/export/phd-students', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const q = req.query;
  const config = await getRegulationConfig();
  const items = await loadEnrichedPhdList(
    {
      search: typeof q.search === 'string' ? q.search : undefined,
      facultyId: q.facultyId ? Number(q.facultyId) : undefined,
      majorId: q.majorId ? Number(q.majorId) : undefined,
      cohort: typeof q.cohort === 'string' ? q.cohort : undefined,
      studyStatus: typeof q.studyStatus === 'string' ? q.studyStatus : undefined,
      pubStatus: typeof q.pubStatus === 'string' ? q.pubStatus : undefined,
      deadlineAlert: typeof q.deadlineAlert === 'string' ? q.deadlineAlert : undefined,
    },
    req.user!
  );
  const includeConfidential = q.includeConfidential === 'true' && isAdminOrStaff(req.user!);
  if (includeConfidential) {
    await recordSecretAccess(req.user, 'ir_export', 'all', `Xuất Excel danh sách NCS kèm cột PBĐL mật (${items.length} hồ sơ)`, req);
  }
  const buf = exportPhdListWorkbook(items, config, includeConfidential);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="UET_DanhSach_NCS_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

excelRouter.get('/api/excel/export/supervisor-quota', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const items = await loadEnrichedScientists({ listType: 'supervisor' }, req.user!);
  const buf = exportSupervisorQuotaWorkbook(items);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="UET_Quota_GioHuongDan_CBHD_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

excelRouter.get('/api/excel/export/scientists', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const listType = typeof req.query.listType === 'string' ? req.query.listType : 'all';
  const items = await loadEnrichedScientists({ listType }, req.user!);
  const names: Record<string, string> = {
    all: 'TatCa_CanBo',
    supervisor: 'CBHD',
    seminar: 'HD_Seminar',
    independent_reviewer: 'PBDL_Mat',
    defense_council: 'HD_DanhGia_LATS',
  };
  const label = names[listType] || 'CanBo';
  await recordSecretAccess(
    req.user,
    listType === 'independent_reviewer' ? 'ir_export' : 'scientist_financial',
    listType,
    `Xuất Excel bảng kê Cán bộ & CCCD/MST/STK (${items.length} dòng)`,
    req
  );
  const buf = exportScientistPaymentWorkbook(items, label);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="UET_CanBo_ThanhToan_${label}_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});
