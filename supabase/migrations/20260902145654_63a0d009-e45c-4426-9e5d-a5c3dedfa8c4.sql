CREATE TABLE public.sentinel_journal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL,
  symbol text NOT NULL,
  name text,
  contract text NOT NULL,
  contract_label text,
  opportunity double precision,
  confidence double precision,
  edge_pct double precision,
  danger double precision,
  quality double precision,
  entry_digit_index integer,
  outcome text NOT NULL DEFAULT 'PENDING',
  resolved_digit integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_journal TO authenticated;
GRANT ALL ON public.sentinel_journal TO service_role;
ALTER TABLE public.sentinel_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own journal" ON public.sentinel_journal FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.sentinel_operator_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  item_id text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_operator_feedback TO authenticated;
GRANT ALL ON public.sentinel_operator_feedback TO service_role;
ALTER TABLE public.sentinel_operator_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own feedback" ON public.sentinel_operator_feedback FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.apex_market_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  kind text NOT NULL,
  model_version integer,
  payload jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apex_market_state TO authenticated;
GRANT ALL ON public.apex_market_state TO service_role;
ALTER TABLE public.apex_market_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own market state" ON public.apex_market_state FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.sentinel_learning_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  kind text NOT NULL,
  payload jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_learning_state TO authenticated;
GRANT ALL ON public.sentinel_learning_state TO service_role;
ALTER TABLE public.sentinel_learning_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users manage learning state" ON public.sentinel_learning_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sentinel_calibration_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  taken_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, taken_on, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_calibration_snapshots TO authenticated;
GRANT ALL ON public.sentinel_calibration_snapshots TO service_role;
ALTER TABLE public.sentinel_calibration_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users manage calibration snapshots" ON public.sentinel_calibration_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sentinel_combo_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  contract text NOT NULL,
  regime text NOT NULL,
  entry_condition text NOT NULL,
  n integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  weighted_n double precision NOT NULL DEFAULT 0,
  weighted_wins double precision NOT NULL DEFAULT 0,
  expectancy double precision,
  weighted_expectancy double precision,
  net_pnl double precision,
  max_drawdown double precision,
  deterioration_pp double precision,
  current_streak integer,
  longest_losing_streak integer,
  decay_half_life_ms bigint,
  version integer NOT NULL DEFAULT 1,
  last_outcome_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, contract, regime, entry_condition)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_combo_stats TO authenticated;
GRANT ALL ON public.sentinel_combo_stats TO service_role;
ALTER TABLE public.sentinel_combo_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users manage combo stats" ON public.sentinel_combo_stats FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.apex_sim_trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  contract text NOT NULL,
  entry_condition text,
  entry_at timestamptz,
  entry_digit integer,
  duration_ticks integer,
  resolved_at timestamptz,
  resolution_digit integer,
  outcome text,
  stake double precision,
  payout double precision,
  pnl double precision,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apex_sim_trades TO authenticated;
GRANT ALL ON public.apex_sim_trades TO service_role;
ALTER TABLE public.apex_sim_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own sim trades" ON public.apex_sim_trades FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.sentinel_sim_trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  client_key text,
  symbol text NOT NULL,
  contract text NOT NULL,
  regime text,
  entry_condition text,
  entry_at timestamptz,
  resolved_at timestamptz,
  entry_digit integer,
  resolution_digit integer,
  duration_ticks integer,
  result text,
  stake double precision,
  pnl double precision,
  direction_score double precision,
  setup_score double precision,
  danger double precision,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_sim_trades TO authenticated;
GRANT ALL ON public.sentinel_sim_trades TO service_role;
ALTER TABLE public.sentinel_sim_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own tagged sim trades" ON public.sentinel_sim_trades FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.deriv_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  loginid text NOT NULL,
  token text NOT NULL,
  currency text,
  is_virtual boolean NOT NULL DEFAULT true,
  balance double precision,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deriv_accounts TO authenticated;
GRANT ALL ON public.deriv_accounts TO service_role;
ALTER TABLE public.deriv_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own deriv accounts" ON public.deriv_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.parity_signals (
  id text PRIMARY KEY,
  market text NOT NULL,
  action text NOT NULL,
  confidence integer,
  entry_formula text,
  outcome text NOT NULL DEFAULT 'pending',
  published_at timestamptz,
  expires_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parity_signals TO authenticated;
GRANT ALL ON public.parity_signals TO service_role;
ALTER TABLE public.parity_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users manage parity signals" ON public.parity_signals FOR ALL TO authenticated USING (true) WITH CHECK (true);