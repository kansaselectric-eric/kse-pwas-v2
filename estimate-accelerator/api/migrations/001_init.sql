-- Estimate Accelerator DB (estacc) - INITIAL SCHEMA
-- This migration is intentionally isolated from CRM.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  customer text,
  gc text,
  location text,
  sector text,
  contract_type text,
  bid_posture text,
  target_margin numeric,
  risk_rating text,
  schedule_constraints text,
  default_modifier_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS plan_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_label text NOT NULL DEFAULT 'v1',
  addenda text,
  sheet_index jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS plan_set_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_set_id uuid NOT NULL REFERENCES plan_sets(id) ON DELETE CASCADE,
  sheet_number text,
  title text,
  page_index int,
  sheet_type text,
  classification_confidence numeric,
  revision text,
  revision_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS extraction_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_set_id uuid NOT NULL REFERENCES plan_sets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'created',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extraction_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES extraction_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL, -- page_render | crop | tile | ocr_json | takeoff_json | export_tsv
  page_index int,
  bbox jsonb, -- {x,y,w,h} normalized or pixels
  sha256 text,
  path text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS symbol_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_code text NOT NULL,
  description text,
  trade text NOT NULL DEFAULT 'electrical',
  default_labor_assembly_id uuid,
  version int NOT NULL DEFAULT 1,
  example_artifact_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(symbol_code, version)
);

CREATE TABLE IF NOT EXISTS labor_assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_code text NOT NULL UNIQUE,
  description text NOT NULL,
  hours_per_unit numeric NOT NULL,
  unit_basis text NOT NULL, -- ea | lf | sf | set | ...
  crew_size int,
  jw_ratio numeric,
  source text,
  effective_from date,
  effective_to date,
  version int NOT NULL DEFAULT 1,
  included_tasks text,
  exclusions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE symbol_library
  ADD CONSTRAINT symbol_default_assembly_fk
  FOREIGN KEY (default_labor_assembly_id) REFERENCES labor_assemblies(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS productivity_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_code text NOT NULL UNIQUE,
  description text NOT NULL,
  default_factor numeric NOT NULL,
  factor_type text NOT NULL DEFAULT 'multiplier', -- multiplier | additive
  applicable_contexts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS project_modifier_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  modifier_id uuid NOT NULL REFERENCES productivity_modifiers(id) ON DELETE CASCADE,
  factor numeric NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(project_id, modifier_id)
);

CREATE TABLE IF NOT EXISTS bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bid_version int NOT NULL DEFAULT 1,
  strategy text,
  margin numeric,
  contingency numeric,
  clarifications text,
  exclusions text,
  submission_at timestamptz,
  exported_takeoff_artifact_id uuid,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(project_id, bid_version)
);

ALTER TABLE bids
  ADD CONSTRAINT bids_export_fk
  FOREIGN KEY (exported_takeoff_artifact_id) REFERENCES extraction_artifacts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_code text NOT NULL,
  period_date date NOT NULL,
  granularity text NOT NULL DEFAULT 'weekly',
  labor_hours numeric,
  labor_cost numeric,
  material_cost numeric,
  equipment_cost numeric,
  import_source text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS variance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  variance_type text NOT NULL,
  narrative text,
  impact_hours numeric,
  impact_dollars numeric,
  takeoff_item_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  cost_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS takeoff_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_set_id uuid NOT NULL REFERENCES plan_sets(id) ON DELETE CASCADE,
  category text NOT NULL,
  item text NOT NULL,
  qty numeric NOT NULL,
  unit text NOT NULL,
  area text,
  sheet_id uuid REFERENCES plan_set_sheets(id) ON DELETE SET NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  extraction_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  symbol_id uuid REFERENCES symbol_library(id) ON DELETE SET NULL,
  labor_assembly_id uuid REFERENCES labor_assemblies(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS takeoff_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  takeoff_item_id uuid NOT NULL REFERENCES takeoff_items(id) ON DELETE CASCADE,
  before_json jsonb NOT NULL,
  after_json jsonb NOT NULL,
  reason text,
  user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS takeoff_labor_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  takeoff_item_id uuid NOT NULL REFERENCES takeoff_items(id) ON DELETE CASCADE,
  labor_assembly_id uuid REFERENCES labor_assemblies(id) ON DELETE SET NULL,
  base_hours numeric NOT NULL,
  modifier_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_hours numeric NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assembly_symbol_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES symbol_library(id) ON DELETE CASCADE,
  labor_assembly_id uuid NOT NULL REFERENCES labor_assemblies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(symbol_id, labor_assembly_id, project_id)
);

COMMIT;
