/*
  # v4.3-W1-D1 Step 3: 14-Brain Schema Structure

  Creates all schema namespaces for the 14-brain orchestration
  architecture. No tables yet — just schema + comments.

  Schemas created:
    Brain layer: brain_prep, brain_news, brain_stats, brain_tactical,
                 brain_referee, brain_context, brain_market, brain_divergence
    Aggregators: agg_quant, agg_narrative
    Simulation/memory: sim, memory
    Live layer: brain_live, brain_reconcile
    Output/audit: main, audit, shared
*/

CREATE SCHEMA IF NOT EXISTS brain_prep;
CREATE SCHEMA IF NOT EXISTS brain_news;
CREATE SCHEMA IF NOT EXISTS brain_stats;
CREATE SCHEMA IF NOT EXISTS brain_tactical;
CREATE SCHEMA IF NOT EXISTS brain_referee;
CREATE SCHEMA IF NOT EXISTS brain_context;
CREATE SCHEMA IF NOT EXISTS brain_market;
CREATE SCHEMA IF NOT EXISTS brain_divergence;

CREATE SCHEMA IF NOT EXISTS agg_quant;
CREATE SCHEMA IF NOT EXISTS agg_narrative;

CREATE SCHEMA IF NOT EXISTS sim;
CREATE SCHEMA IF NOT EXISTS memory;

CREATE SCHEMA IF NOT EXISTS brain_live;
CREATE SCHEMA IF NOT EXISTS brain_reconcile;

CREATE SCHEMA IF NOT EXISTS main;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS shared;

COMMENT ON SCHEMA brain_prep       IS 'B1 Data Prep brain outputs';
COMMENT ON SCHEMA brain_news       IS 'B2 News brain outputs';
COMMENT ON SCHEMA brain_stats      IS 'B3 Statistics brain outputs (Dixon-Coles, Elo, xG)';
COMMENT ON SCHEMA brain_tactical   IS 'B4 Tactical brain outputs (xG, PPDA, momentum)';
COMMENT ON SCHEMA brain_referee    IS 'B5 Referee brain outputs';
COMMENT ON SCHEMA brain_context    IS 'B6 Context brain (weather, travel, rest)';
COMMENT ON SCHEMA brain_market     IS 'B7 Market brain (odds, drift, Kelly)';
COMMENT ON SCHEMA brain_divergence IS 'BD Divergence brain (counter-consensus)';
COMMENT ON SCHEMA agg_quant        IS 'A1 Quantitative aggregator';
COMMENT ON SCHEMA agg_narrative    IS 'A2 Narrative aggregator';
COMMENT ON SCHEMA sim              IS 'Monte Carlo simulation outputs';
COMMENT ON SCHEMA memory           IS 'RAG/pgvector memory layer';
COMMENT ON SCHEMA brain_live       IS 'BL Live data ingestion';
COMMENT ON SCHEMA brain_reconcile  IS 'BR Reconciliation (predicted vs actual)';
COMMENT ON SCHEMA main             IS 'Final outputs: prematch + live predictions';
COMMENT ON SCHEMA audit            IS 'Provider/run/cost audit trail';
COMMENT ON SCHEMA shared           IS 'Shared reference tables across brains';
