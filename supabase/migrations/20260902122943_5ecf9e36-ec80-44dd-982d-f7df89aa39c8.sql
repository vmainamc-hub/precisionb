-- Durable per-market Sentinel state
CREATE TABLE public.apex_market_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apex_market_state TO authenticated;
GRANT ALL ON public.apex_market_state TO service_role;
ALTER TABLE public.apex_market_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own market state" ON public.apex_market_state
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Aggregate combination learning (shared, inspectable)
CREATE TABLE public.sentinel_combo_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  contract text NOT NULL,
  regime text NOT NULL,
  entry_condition text NOT NULL,
  n integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  weighted_n numeric NOT NULL DEFAULT 0,
  weighted_wins numeric NOT NULL DEFAULT 0,
  expectancy numeric NOT NULL DEFAULT 0,
  weighted_expectancy numeric NOT NULL DEFAULT 0,
  net_pnl numeric NOT NULL DEFAULT 0,
  max_drawdown numeric NOT NULL DEFAULT 0,
  deterioration_pp numeric NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  longest_losing_streak integer NOT NULL DEFAULT 0,
  decay_half_life_ms bigint NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  last_outcome_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, contract, regime, entry_condition)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_combo_stats TO authenticated;
GRANT ALL ON public.sentinel_combo_stats TO service_role;
ALTER TABLE public.sentinel_combo_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "combo stats readable" ON public.sentinel_combo_stats
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "combo stats writable" ON public.sentinel_combo_stats
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "combo stats updatable" ON public.sentinel_combo_stats
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Replayable learned observations
CREATE TABLE public.sentinel_learning_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_learning_state TO authenticated;
GRANT ALL ON public.sentinel_learning_state TO service_role;
ALTER TABLE public.sentinel_learning_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning readable" ON public.sentinel_learning_state
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "learning writable" ON public.sentinel_learning_state
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "learning updatable" ON public.sentinel_learning_state
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Versioned calibration snapshots (append-only history)
CREATE TABLE public.sentinel_calibration_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  taken_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, taken_on, version)
);
GRANT SELECT, INSERT ON public.sentinel_calibration_snapshots TO authenticated;
GRANT ALL ON public.sentinel_calibration_snapshots TO service_role;
ALTER TABLE public.sentinel_calibration_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots readable" ON public.sentinel_calibration_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "snapshots writable" ON public.sentinel_calibration_snapshots
  FOR INSERT TO authenticated WITH CHECK (true);

-- Immutable simulated-trade evidence
CREATE TABLE public.apex_sim_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  contract text NOT NULL,
  entry_condition text,
  entry_at timestamptz NOT NULL,
  entry_digit integer,
  duration_ticks integer,
  resolved_at timestamptz,
  resolution_digit integer,
  outcome text,
  stake numeric,
  payout numeric,
  pnl numeric,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.apex_sim_trades TO authenticated;
GRANT ALL ON public.apex_sim_trades TO service_role;
ALTER TABLE public.apex_sim_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sim trades" ON public.apex_sim_trades
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own sim trades" ON public.apex_sim_trades
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Four-dimension tagged copy used to rebuild learning
CREATE TABLE public.sentinel_sim_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  contract text NOT NULL,
  regime text NOT NULL DEFAULT 'UNKNOWN',
  entry_condition text NOT NULL DEFAULT 'IMMEDIATE',
  entry_at timestamptz NOT NULL,
  resolved_at timestamptz,
  entry_digit integer,
  resolution_digit integer,
  duration_ticks integer,
  result text,
  stake numeric,
  pnl numeric,
  direction_score numeric,
  setup_score numeric,
  danger numeric,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_key)
);
GRANT SELECT, INSERT, UPDATE ON public.sentinel_sim_trades TO authenticated;
GRANT ALL ON public.sentinel_sim_trades TO service_role;
ALTER TABLE public.sentinel_sim_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tagged trades" ON public.sentinel_sim_trades
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own tagged trades" ON public.sentinel_sim_trades
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own tagged trades" ON public.sentinel_sim_trades
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Operator journal
CREATE TABLE public.sentinel_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL,
  symbol text NOT NULL,
  name text,
  contract text NOT NULL,
  contract_label text,
  opportunity numeric,
  confidence numeric,
  edge_pct numeric,
  danger numeric,
  quality numeric,
  entry_digit_index integer,
  outcome text,
  resolved_digit integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_journal TO authenticated;
GRANT ALL ON public.sentinel_journal TO service_role;
ALTER TABLE public.sentinel_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal" ON public.sentinel_journal
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Linked Deriv trading accounts
CREATE TABLE public.deriv_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  loginid text NOT NULL,
  token text NOT NULL,
  currency text,
  is_virtual boolean NOT NULL DEFAULT true,
  balance numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, loginid)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deriv_accounts TO authenticated;
GRANT ALL ON public.deriv_accounts TO service_role;
ALTER TABLE public.deriv_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deriv accounts" ON public.deriv_accounts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

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