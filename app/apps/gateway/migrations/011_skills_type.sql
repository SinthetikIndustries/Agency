-- Migration 011: Add type and Anthropic capability columns to skills table

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'prompt',
  ADD COLUMN IF NOT EXISTS anthropic_builtin_type TEXT,
  ADD COLUMN IF NOT EXISTS anthropic_beta_header TEXT;
