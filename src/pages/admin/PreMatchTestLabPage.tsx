import { useState, useEffect, useCallback } from 'react';
import { FlaskConical, Shield, AlertCircle, CheckCircle, RefreshCw, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Competition {
  competition_name: string;
  season: string;
}

interface MatchOption {
  match_id: string;
  match_date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
}

interface PredictionResult {
  match_id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  p_home: number;
  p_draw: number;
  p_away: number;
  confidence: number;
  feature_tier: number | null;
  elo_home: number | null;
  elo_away: number | null;
  elo_diff: number | null;
  home_l5_pts: number | null;
  away_l5_pts: number | null;
  home_form_quality: string | null;
  away_form_quality: string | null;
  warnings: string[];
  elo_version: string;
  feature_version: string;
}

const COMPETITIONS = [
  'English Premier League',
  'English Championship',
  'German Bundesliga',
  'Spanish La Liga',
  'Italian Serie A',
  'French Ligue 1',
  'Turkish Super Lig',
];

export default function PreMatchTestLabPage() {
  const [competitions] = useState<string[]>(COMPETITIONS);
  const [selectedComp, setSelectedComp] = useState<string>('');
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<string>('');
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Pre-Match Test Lab | Admin | Next59';
  }, []);

  const loadSeasons = useCallback(async (comp: string) => {
    setLoadingSeasons(true);
    setSeasons([]);
    setSelectedSeason('');
    setMatches([]);
    setSelectedMatch('');
    setResult(null);

    const { data, error: err } = await supabase
      .from('matches')
      .select('season')
      .eq('competition_name', comp)
      .not('season', 'is', null)
      .order('season', { ascending: false });

    if (!err && data) {
      const unique = [...new Set((data as { season: string }[]).map(d => d.season))];
      setSeasons(unique);
    }
    setLoadingSeasons(false);
  }, []);

  const loadMatches = useCallback(async (comp: string, season: string) => {
    setLoadingMatches(true);
    setMatches([]);
    setSelectedMatch('');
    setResult(null);

    const { data, error: err } = await supabase
      .from('matches')
      .select('match_id, match_date, home_team_id, away_team_id, home_score, away_score')
      .eq('competition_name', comp)
      .eq('season', season)
      .order('match_date', { ascending: false })
      .limit(100);

    if (!err && data) {
      // Join team names
      const matchIds = (data as { match_id: string }[]).map(d => d.match_id);
      const { data: teams } = await supabase
        .from('matches')
        .select(`
          match_id, match_date, home_score, away_score,
          home_team:teams!matches_home_team_id_fkey(name),
          away_team:teams!matches_away_team_id_fkey(name)
        `)
        .in('match_id', matchIds)
        .order('match_date', { ascending: false });

      if (teams) {
        const mapped = (teams as {
          match_id: string;
          match_date: string;
          home_score: number | null;
          away_score: number | null;
          home_team: { name: string } | null;
          away_team: { name: string } | null;
        }[]).map(t => ({
          match_id: t.match_id,
          match_date: t.match_date,
          home_team: t.home_team?.name ?? '?',
          away_team: t.away_team?.name ?? '?',
          home_score: t.home_score,
          away_score: t.away_score,
        }));
        setMatches(mapped);
      }
    }
    setLoadingMatches(false);
  }, []);

  function handleCompChange(comp: string) {
    setSelectedComp(comp);
    setResult(null);
    setError(null);
    if (comp) loadSeasons(comp);
  }

  function handleSeasonChange(season: string) {
    setSelectedSeason(season);
    setResult(null);
    setError(null);
    if (season && selectedComp) loadMatches(selectedComp, season);
  }

  async function generatePrediction() {
    if (!selectedMatch) return;
    setGenerating(true);
    setResult(null);
    setError(null);

    const { data, error: err } = await supabase.rpc('ml_admin_generate_prematch_prediction', {
      p_match_id: selectedMatch,
      p_elo_version: 'elo_v2_ha0_k20_global',
      p_feature_version: 'features_v2_domestic_2026_05',
    });

    if (err) {
      setError(err.message);
    } else {
      setResult(data as PredictionResult);
    }
    setGenerating(false);
  }

  const selectedMatchData = matches.find(m => m.match_id === selectedMatch);

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Admin warning */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Pre-Match Test Lab — Admin Only.</strong> ELO V2 + Feature Matrix V2 kullanarak test amaçlı ön maç tahmini üretir. Public sayfaya yansımaz.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
            <FlaskConical className="w-6 h-6 text-champagne" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Pre-Match Test Lab</h1>
            <p className="text-sm text-readable-muted mt-1">
              Lig seç · Sezon seç · Maç seç · H/D/A tahmini üret
            </p>
          </div>
        </div>

        {/* Selection form */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 mb-6">
          <h2 className="text-xs font-semibold text-readable-muted uppercase tracking-wider mb-4">Maç Seçimi</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Competition */}
            <div>
              <label className="block text-xs text-navy-400 mb-1.5">Lig</label>
              <div className="relative">
                <select
                  value={selectedComp}
                  onChange={e => handleCompChange(e.target.value)}
                  className="w-full appearance-none bg-navy-800 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-champagne/50 pr-8"
                >
                  <option value="">Lig seçin...</option>
                  {competitions.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400 pointer-events-none" />
              </div>
            </div>

            {/* Season */}
            <div>
              <label className="block text-xs text-navy-400 mb-1.5">Sezon</label>
              <div className="relative">
                <select
                  value={selectedSeason}
                  onChange={e => handleSeasonChange(e.target.value)}
                  disabled={!selectedComp || loadingSeasons}
                  className="w-full appearance-none bg-navy-800 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-champagne/50 disabled:opacity-40 pr-8"
                >
                  <option value="">
                    {loadingSeasons ? 'Yükleniyor...' : 'Sezon seçin...'}
                  </option>
                  {seasons.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400 pointer-events-none" />
              </div>
            </div>

            {/* Match */}
            <div>
              <label className="block text-xs text-navy-400 mb-1.5">Maç</label>
              <div className="relative">
                <select
                  value={selectedMatch}
                  onChange={e => { setSelectedMatch(e.target.value); setResult(null); setError(null); }}
                  disabled={!selectedSeason || loadingMatches}
                  className="w-full appearance-none bg-navy-800 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-champagne/50 disabled:opacity-40 pr-8"
                >
                  <option value="">
                    {loadingMatches ? 'Yükleniyor...' : `Maç seçin... (${matches.length})`}
                  </option>
                  {matches.map(m => (
                    <option key={m.match_id} value={m.match_id}>
                      {m.match_date.slice(0, 10)} — {m.home_team} vs {m.away_team}
                      {m.home_score != null ? ` (${m.home_score}-${m.away_score})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {selectedMatchData && (
            <div className="mt-4 px-4 py-3 bg-navy-800/50 rounded-lg flex items-center gap-3">
              <div className="text-sm font-medium text-white">
                {selectedMatchData.home_team}
                <span className="text-navy-400 mx-2">vs</span>
                {selectedMatchData.away_team}
              </div>
              <span className="text-xs text-navy-400">{selectedMatchData.match_date.slice(0, 10)}</span>
              {selectedMatchData.home_score != null && (
                <span className="ml-auto text-xs font-mono text-champagne font-medium">
                  Sonuç: {selectedMatchData.home_score} – {selectedMatchData.away_score}
                </span>
              )}
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={generatePrediction}
              disabled={!selectedMatch || generating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-champagne/15 border border-champagne/30 text-champagne font-semibold text-sm hover:bg-champagne/25 transition-all disabled:opacity-40"
            >
              {generating
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Üretiliyor...</>
                : <><FlaskConical className="w-4 h-4" />Tahmin Üret</>
              }
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-6 text-xs text-red-400 font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {result && <PredictionOutput result={result} actual={selectedMatchData} />}
      </div>
    </div>
  );
}

function PredictionOutput({
  result,
  actual,
}: {
  result: PredictionResult;
  actual: MatchOption | undefined;
}) {
  const outcomes = [
    { label: result.home_team, key: 'p_home' as const, value: result.p_home, color: 'bg-blue-500' },
    { label: 'Beraberlik', key: 'p_draw' as const, value: result.p_draw, color: 'bg-navy-500' },
    { label: result.away_team, key: 'p_away' as const, value: result.p_away, color: 'bg-rose-500' },
  ];

  const maxProb = Math.max(result.p_home, result.p_draw, result.p_away);

  let actualOutcome: 'home' | 'draw' | 'away' | null = null;
  if (actual?.home_score != null && actual?.away_score != null) {
    if (actual.home_score > actual.away_score) actualOutcome = 'home';
    else if (actual.home_score < actual.away_score) actualOutcome = 'away';
    else actualOutcome = 'draw';
  }

  const predictedOutcome = result.p_home === maxProb ? 'home' : result.p_draw === maxProb ? 'draw' : 'away';
  const isCorrect = actualOutcome != null && predictedOutcome === actualOutcome;

  return (
    <div className="space-y-4">
      {/* Main probability output */}
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 mb-5">
          <h2 className="text-xs font-semibold text-readable-muted uppercase tracking-wider">Tahmin Sonucu</h2>
          <div className="flex items-center gap-3">
            {actualOutcome != null && (
              <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                isCorrect
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-red-500/15 text-red-400'
              }`}>
                {isCorrect
                  ? <><CheckCircle className="w-3 h-3" />Doğru</>
                  : <><AlertCircle className="w-3 h-3" />Yanlış</>
                }
              </span>
            )}
            <span className="text-xs text-navy-400 font-mono">
              Güven: <span className="text-white">{(result.confidence * 100).toFixed(1)}%</span>
            </span>
            {result.feature_tier != null && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                result.feature_tier === 1 ? 'bg-emerald-500/15 text-emerald-400' :
                result.feature_tier === 2 ? 'bg-amber-500/15 text-amber-400' :
                'bg-navy-700 text-navy-300'
              }`}>Tier {result.feature_tier}</span>
            )}
          </div>
        </div>

        {/* Probability bars */}
        <div className="space-y-3">
          {outcomes.map(o => {
            const pct = (o.value * 100).toFixed(1);
            const isMax = o.value === maxProb;
            return (
              <div key={o.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${isMax ? 'text-white' : 'text-navy-300'}`}>{o.label}</span>
                  <span className={`text-sm font-bold tabular-nums font-mono ${isMax ? 'text-champagne' : 'text-navy-400'}`}>{pct}%</span>
                </div>
                <div className="h-2.5 bg-navy-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${o.color} ${isMax ? 'opacity-100' : 'opacity-50'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature details */}
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5">
        <h2 className="text-xs font-semibold text-readable-muted uppercase tracking-wider mb-4">Feature Detayları</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <FeatureField label="ELO Ev" value={result.elo_home?.toFixed(0) ?? '–'} />
          <FeatureField label="ELO Deplasman" value={result.elo_away?.toFixed(0) ?? '–'} />
          <FeatureField label="ELO Farkı" value={result.elo_diff != null ? (result.elo_diff > 0 ? `+${result.elo_diff.toFixed(0)}` : result.elo_diff.toFixed(0)) : '–'} />
          <FeatureField label="Tier" value={result.feature_tier?.toString() ?? '–'} />
          <FeatureField label="Ev L5 Puan" value={result.home_l5_pts?.toFixed(1) ?? '–'} />
          <FeatureField label="Dep L5 Puan" value={result.away_l5_pts?.toFixed(1) ?? '–'} />
          <FeatureField label="Ev Form" value={result.home_form_quality ?? '–'} />
          <FeatureField label="Dep Form" value={result.away_form_quality ?? '–'} />
        </div>
        <div className="mt-3 pt-3 border-t border-navy-800 flex flex-wrap gap-x-6 gap-y-1 text-xs text-navy-400">
          <span>ELO: <span className="font-mono text-navy-300">{result.elo_version}</span></span>
          <span>Features: <span className="font-mono text-navy-300">{result.feature_version}</span></span>
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Uyarılar</span>
          </div>
          <ul className="space-y-1">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-300">{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FeatureField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-navy-400">{label}</div>
      <div className="text-sm font-medium text-white mt-0.5">{value}</div>
    </div>
  );
}
