import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';

export const sessionsRouter = Router();

const startSchema = z.object({
  projectName: z.string().min(1).optional(),
  customer: z.string().optional(),
  fileName: z.string().optional(),
  location: z.string().optional(),
  sector: z.string().optional()
});

sessionsRouter.post('/start', async (req, res) => {
  try {
    const parsed = startSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid payload' });
    }
    const { projectName, customer, fileName, location, sector } = parsed.data;

    const name = projectName || (fileName ? `Estimate: ${fileName}` : 'Estimate Accelerator Project');

    const project = await pool.query(
      `INSERT INTO projects (name, customer, location, sector)
       VALUES ($1, $2, $3, $4)
       RETURNING id;`,
      [name, customer || null, location || null, sector || null]
    );

    const projectId = project.rows[0].id as string;

    const planSet = await pool.query(
      `INSERT INTO plan_sets (project_id, version_label, addenda, sheet_index)
       VALUES ($1, 'v1', NULL, '[]'::jsonb)
       RETURNING id;`,
      [projectId]
    );

    const planSetId = planSet.rows[0].id as string;

    const session = await pool.query(
      `INSERT INTO extraction_sessions (plan_set_id, status, config, metrics)
       VALUES ($1, 'created', '{}'::jsonb, '{}'::jsonb)
       RETURNING id;`,
      [planSetId]
    );

    const sessionId = session.rows[0].id as string;

    return res.json({ ok: true, projectId, planSetId, sessionId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unable to start session';
    return res.status(500).json({ ok: false, error: msg });
  }
});
