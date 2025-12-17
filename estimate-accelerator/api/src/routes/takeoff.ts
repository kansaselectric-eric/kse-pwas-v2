import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { runVisionTakeoffFromPageArtifacts } from '../services/pipeline.js';
import { computeLabor } from '../services/labor.js';
import { toTsv } from '../services/tsv.js';

export const takeoffRouter = Router();

const runSchema = z.object({
  sessionId: z.string().uuid(),
  maxPages: z.number().int().min(1).max(200).optional()
});

takeoffRouter.post('/takeoff', async (req, res) => {
  try {
    const parsed = runSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'sessionId required' });
    }
    const { sessionId, maxPages } = parsed.data;

    const session = await pool.query(
      `SELECT s.id, s.plan_set_id, ps.project_id
       FROM extraction_sessions s
       JOIN plan_sets ps ON ps.id = s.plan_set_id
       WHERE s.id = $1`,
      [sessionId]
    );
    if (!session.rowCount) return res.status(404).json({ ok: false, error: 'Session not found' });

    const planSetId = session.rows[0].plan_set_id as string;
    const projectId = session.rows[0].project_id as string;

    await pool.query(`UPDATE extraction_sessions SET status='running', updated_at=now() WHERE id=$1`, [sessionId]);

    const pagesRes = await pool.query(
      `SELECT page_index, path, meta
       FROM extraction_artifacts
       WHERE session_id=$1 AND kind='page_render' AND path IS NOT NULL
       ORDER BY page_index ASC`,
      [sessionId]
    );

    const pages = pagesRes.rows.map((r: any) => {
      const meta = (r.meta && typeof r.meta === 'object') ? r.meta : safeJson(r.meta);
      const mimeType = meta?.mimeType || 'image/jpeg';
      return { pageIndex: Number(r.page_index || 0), path: String(r.path), mimeType };
    });

    if (!pages.length) {
      await pool.query(`UPDATE extraction_sessions SET status='failed', updated_at=now() WHERE id=$1`, [sessionId]);
      return res.status(400).json({ ok: false, error: 'No page renders uploaded for this session' });
    }

    const vision = await runVisionTakeoffFromPageArtifacts({ pages, maxPages: maxPages ?? 40 });

    // Minimal modifiers: load project overrides (if any), else none.
    const modsRes = await pool.query(
      `SELECT pm.modifier_code as code, COALESCE(pmo.factor, pm.default_factor) as factor, pm.factor_type as type
       FROM productivity_modifiers pm
       LEFT JOIN project_modifier_overrides pmo
         ON pmo.modifier_id = pm.id AND pmo.project_id = $1 AND pmo.deleted_at IS NULL
       WHERE pm.deleted_at IS NULL`,
      [projectId]
    );
    const modifiers = modsRes.rows.map((r: any) => ({
      code: String(r.code),
      factor: Number(r.factor),
      type: (String(r.type) === 'additive' ? 'additive' : 'multiplier') as any
    }));

    // Default labor assembly fallback
    const assemblyRes = await pool.query(
      `SELECT id, assembly_code, description, hours_per_unit, unit_basis
       FROM labor_assemblies
       WHERE deleted_at IS NULL
       ORDER BY CASE WHEN assembly_code='GEN-ELEC' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1;`
    );
    const defaultAssembly = assemblyRes.rowCount ? assemblyRes.rows[0] : null;

    // Wipe prior takeoff for this planset (soft delete) so reruns are reproducible.
    await pool.query(`UPDATE takeoff_items SET deleted_at=now() WHERE plan_set_id=$1 AND deleted_at IS NULL`, [planSetId]);

    const takeoff = [] as any[];

    for (let i = 0; i < vision.items.length; i += 1) {
      const item = vision.items[i];
      const description = item.description;
      const quantity = Number(item.qty);
      const unit = String(item.unit || 'ea');
      const category = String(item.category || 'general');
      const confidence = Number(item.confidence || 0.5);

      const complexity = confidence >= 0.8 ? 'medium' : 'high';
      const priorityScore = Math.min(100, Math.round(quantity * 2 + confidence * 50));

      const inserted = await pool.query(
        `INSERT INTO takeoff_items (plan_set_id, category, item, qty, unit, area, sheet_id, evidence, confidence, extraction_meta, notes)
         VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6,$7,$8,$9)
         RETURNING id;`,
        [
          planSetId,
          category,
          description,
          quantity,
          unit,
          JSON.stringify(item.evidence || {}),
          confidence,
          JSON.stringify({ source: 'vision', priorityScore }),
          item.notes || null
        ]
      );

      const takeoffItemId = inserted.rows[0].id as string;

      const labor = computeLabor({
        qty: quantity,
        unit,
        assembly: defaultAssembly
          ? {
              id: String(defaultAssembly.id),
              assembly_code: String(defaultAssembly.assembly_code),
              description: String(defaultAssembly.description),
              hours_per_unit: Number(defaultAssembly.hours_per_unit),
              unit_basis: String(defaultAssembly.unit_basis)
            }
          : null,
        modifiers
      });

      await pool.query(
        `INSERT INTO takeoff_labor_lines (takeoff_item_id, labor_assembly_id, base_hours, modifier_breakdown, total_hours, confidence, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          takeoffItemId,
          defaultAssembly ? String(defaultAssembly.id) : null,
          labor.baseHours,
          JSON.stringify(labor.breakdown),
          labor.totalHours,
          labor.confidence,
          null
        ]
      );

      takeoff.push({
        id: `item-${i + 1}`,
        description,
        quantity,
        unit,
        category,
        complexity,
        keywords: [],
        priorityScore,
        qualityScore: confidence,
        qualityGrade: confidence >= 0.75 ? 'High' : confidence >= 0.55 ? 'Medium' : 'Review',
        issues: confidence < 0.55 ? ['Needs review'] : [],
        sourceFile: 'plan-set',
        sourcePage: item.evidence?.pageIndex || null
      });
    }

    const metrics = {
      scopeCoverage: Number((Math.min(1, takeoff.length / 12)).toFixed(2)),
      riskLoad: 0,
      takeoffConfidence: Number((Math.min(0.98, Math.max(0.4, vision.avgConfidence))).toFixed(2))
    };

    await pool.query(
      `UPDATE extraction_sessions SET status='complete', metrics=$2, finished_at=now(), updated_at=now() WHERE id=$1`,
      [sessionId, JSON.stringify({ visionAvgConfidence: vision.avgConfidence, items: takeoff.length })]
    );

    return res.json({
      ok: true,
      scope: [],
      longLead: [],
      risks: [],
      clarifications: [],
      takeoff,
      metrics
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Takeoff failed';
    return res.status(500).json({ ok: false, error: msg });
  }
});

takeoffRouter.get('/takeoff/:sessionId.tsv', async (req, res) => {
  const sessionId = String(req.params.sessionId || '');
  try {
    const sess = await pool.query(
      `SELECT s.id, s.plan_set_id
       FROM extraction_sessions s
       WHERE s.id=$1`,
      [sessionId]
    );
    if (!sess.rowCount) return res.status(404).send('Not found');
    const planSetId = sess.rows[0].plan_set_id as string;

    const rowsRes = await pool.query(
      `SELECT ti.category, ti.item, ti.qty, ti.unit, ti.area, ti.confidence, ti.notes,
              COALESCE(tll.base_hours, 0) as base_hours,
              COALESCE(tll.total_hours, 0) as total_hours,
              COALESCE(tll.modifier_breakdown, '[]'::jsonb) as modifier_breakdown
       FROM takeoff_items ti
       LEFT JOIN takeoff_labor_lines tll ON tll.takeoff_item_id = ti.id
       WHERE ti.plan_set_id=$1 AND ti.deleted_at IS NULL
       ORDER BY ti.created_at ASC`,
      [planSetId]
    );

    const rows = rowsRes.rows.map((r: any) => ({
      category: r.category,
      item: r.item,
      qty: Number(r.qty),
      unit: r.unit,
      sheet: '',
      area: r.area,
      baseHours: Number(r.base_hours),
      modifiers: JSON.stringify(r.modifier_breakdown),
      totalHours: Number(r.total_hours),
      confidence: Number(r.confidence),
      notes: r.notes
    }));

    const tsv = toTsv(rows);
    res.setHeader('Content-Type', 'text/tab-separated-values');
    res.setHeader('Content-Disposition', `attachment; filename="takeoff-${sessionId}.tsv"`);
    return res.send(tsv);
  } catch {
    return res.status(500).send('Error');
  }
});

function safeJson(value: any) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}
