ALTER TABLE public.apex_market_state
  ADD COLUMN IF NOT EXISTS model_version integer NOT NULL DEFAULT 1;

CREATE TABLE public.sentinel_operator_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  item_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_operator_feedback TO authenticated;
GRANT ALL ON public.sentinel_operator_feedback TO service_role;
ALTER TABLE public.sentinel_operator_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own operator feedback" ON public.sentinel_operator_feedback
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);