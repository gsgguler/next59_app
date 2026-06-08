import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Loader2, BarChart3, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveTeamName } from '../../lib/teamDisplay';
import SEO from '../../components/seo/SEO';

interface TeamInfo {
  name: string;
  short_name: string | null;
  code: string | null;
  team_display_names?: Array<{ display_name: string; locale: string; is_primary: boolean }>;
}

interface PredictionData {
  id: string;
  match_id: string;
  prediction_type: string;
  predicted_outcome: string | null;
  confidence: number | null;
  odds_fair: number | null;
  explanation_json: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
  match: {
    id: string;
    match_date: string;
    match_time: string | null;
    status_short: string;
    round: string | null;
    home_score_ft: number | null;
    away_score_ft: number | null;
    home_team: TeamInfo | null;
    away_team: TeamInfo | null;
    competition_season: {
      season_code: string;
      competition: { name: string; short_name: string | null; code: string } | null;
    } | null;
  } | null;
}

const TYPE_LABELS: Record<string, string> = {
  match_result: 'Maç Sonucu',
  over_under: 'Gol Üstü/Altı',
  btts: 'KG Var/Yok',
};

const OUTCOME_LABELS: Record<string, string> = {
  home_win: 'Ev Sahibi Kazanır',
  draw: 'Beraberlik',
  away_win: 'Deplasman Kazanır',
  over: 'Üst',
  under: 'Alt',
  yes: 'Var',
  no: 'Yok',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ns:  { label: 'Planlı',      color: 'text-blue-600 bg-blue-50' },
  ft:  { label: 'Bitti',       color: 'text-gray-600 bg-gray-100' },
  '1h':{ label: 'Canlı',       color: 'text-red-600 bg-red-50' },
  '2h':{ label: 'Canlı',       color: 'text-red-600 bg-red-50' },
  ht:  { label: 'Devre Arası', color: 'text-orange-600 bg-orange-50' },
  pst: { label: 'Ertelendi',   color: 'text-orange-600 bg-orange-50' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function teamCode(t: TeamInfo | null): string {
  return t?.code ?? t?.name?.slice(0, 3).toUpperCase() ?? '???';
}

export default function PublicPredictionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pageTitle, setPageTitle] = useState('Yayınlanmış Analiz — Next59');
  const [pageDesc, setPageDesc] = useState("Next59'un yayınlanmış futbol analizlerinden biri. Tahmin sonucu, güven ve model açıklaması.");

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }

    supabase
      .from('predictions')
      .select(`
        id, match_id, prediction_type, predicted_outcome, confidence,
        odds_fair, explanation_json, published_at, created_at,
        match:matches!predictions_match_id_fkey(
          id, match_date, match_time, status_short, round, home_score_ft, away_score_ft,
          home_team:teams!matches_home_team_id_fkey(name, short_name, code, team_display_names(display_name, locale, is_primary)),
          away_team:teams!matches_away_team_id_fkey(name, short_name, code, team_display_names(display_name, locale, is_primary)),
          competition_season:competition_seasons!matches_competition_season_id_fkey(
            season_code,
            competition:competitions(name, short_name, code)
          )
        )
      `)
      .eq('id', id)
      .eq('is_published', true)
      .eq('is_elite_only', false)
      .is('superseded_by', null)
      .not('published_at', 'is', null)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setNotFound(true);
        } else {
          const p = data as unknown as PredictionData;
          setPrediction(p);
          const outcomeLabel = p.predicted_outcome
            ? (OUTCOME_LABELS[p.predicted_outcome] ?? p.predicted_outcome)
            : 'Tahmin';
          setPageTitle(`${outcomeLabel} — Next59`);
          setPageDesc(`Next59'un yayınlanmış futbol analizlerinden biri. Tahmin sonucu, güven ve model açıklaması.`);
        }
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <SEO title={pageTitle} description={pageDesc} canonical={`/tahminler/${id ?? ''}`} />
        <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
      </div>
    );
  }

  if (notFound || !prediction) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-8 flex-wrap">
          <Link to="/" className="hover:text-gray-600 transition-colors">Ana Sayfa</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/tahminler" className="hover:text-gray-600 transition-colors">Tahminler</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-600">Bulunamadı</span>
        </nav>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center mb-5">
            <BarChart3 className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Analiz Bulunamadı</h2>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-6">
            Bu yayınlanmış analiz bulunamadı veya henüz herkese açık değil.
          </p>
          <Link
            to="/tahminler"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
          >
            <TrendingUp className="w-4 h-4" />
            Tüm Tahminlere Dön
          </Link>
        </div>
      </div>
    );
  }

  const match = prediction.match;
  const homeName = resolveTeamName(match?.home_team ?? null, 'Ev Sahibi');
  const awayName = resolveTeamName(match?.away_team ?? null, 'Konuk');
  const compName = match?.competition_season?.competition?.name ?? '';
  const typeLabel = TYPE_LABELS[prediction.prediction_type] ?? prediction.prediction_type;
  const outcomeLabel = prediction.predicted_outcome
    ? (OUTCOME_LABELS[prediction.predicted_outcome] ?? prediction.predicted_outcome)
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <SEO title={pageTitle} description={pageDesc} canonical={`/tahminler/${id ?? ''}`} />
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 flex-wrap">
        <Link to="/" className="hover:text-gray-600 transition-colors">Ana Sayfa</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to="/tahminler" className="hover:text-gray-600 transition-colors">Tahminler</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-600">{homeName} vs {awayName}</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">Analiz</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {outcomeLabel ?? 'Tahmin'}
          </h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            {compName && `${compName} · `}{homeName} vs {awayName}
            {prediction.published_at && (
              <span className="ml-2 text-gray-400">· {formatDate(prediction.published_at)}</span>
            )}
          </p>
        </div>
        <span className="text-sm font-mono text-gold-600 bg-gold-50 border border-gold-200 px-3 py-1.5 rounded-lg self-start">
          {typeLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {match && (
            <MatchPanel
              homeTeam={match.home_team}
              awayTeam={match.away_team}
              matchDate={match.match_date}
              matchTime={match.match_time}
              statusShort={match.status_short}
              round={match.round}
              compName={compName}
              homeGoals={match.home_score_ft}
              awayGoals={match.away_score_ft}
            />
          )}

          <PredictionPanel
            prediction_type={typeLabel}
            predicted_outcome={outcomeLabel}
            confidence={prediction.confidence}
            odds_fair={prediction.odds_fair}
            explanation_json={prediction.explanation_json}
          />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Erişim</h3>
            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              Ücretsiz — Herkese Açık
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchPanel({
  homeTeam, awayTeam, matchDate, matchTime, statusShort,
  round, compName, homeGoals, awayGoals,
}: {
  homeTeam: TeamInfo | null;
  awayTeam: TeamInfo | null;
  matchDate: string;
  matchTime: string | null;
  statusShort: string;
  round: string | null;
  compName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}) {
  const kickoffStr = matchTime
    ? `${matchDate}T${matchTime}:00+03:00`
    : `${matchDate}T00:00:00+03:00`;
  const dateStr = new Date(kickoffStr).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: matchTime ? '2-digit' : undefined,
    minute: matchTime ? '2-digit' : undefined,
  });

  const st = STATUS_LABELS[statusShort.toLowerCase()] ?? STATUS_LABELS.ns;
  const isFinished = ['ft', 'aet', 'pen'].includes(statusShort.toLowerCase());

  return (
    <div className="bg-navy-700 rounded-xl p-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-navy-200 bg-navy-600 px-2.5 py-1 rounded">
          {compName}{round ? ` · ${round}` : ''}
        </span>
        <span className={`text-xs font-medium px-2.5 py-1 rounded ${st.color}`}>
          {st.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 text-center">
          <div className="w-14 h-14 rounded-full bg-navy-600 flex items-center justify-center mx-auto mb-2">
            <span className="text-sm font-bold">{teamCode(homeTeam)}</span>
          </div>
          <p className="font-semibold text-sm">{resolveTeamName(homeTeam, 'Ev Sahibi')}</p>
        </div>

        <div className="text-center px-4">
          {isFinished ? (
            <p className="text-3xl font-bold">{homeGoals ?? 0} - {awayGoals ?? 0}</p>
          ) : (
            <p className="text-lg font-medium text-navy-300">VS</p>
          )}
        </div>

        <div className="flex-1 text-center">
          <div className="w-14 h-14 rounded-full bg-navy-600 flex items-center justify-center mx-auto mb-2">
            <span className="text-sm font-bold">{teamCode(awayTeam)}</span>
          </div>
          <p className="font-semibold text-sm">{resolveTeamName(awayTeam, 'Konuk')}</p>
        </div>
      </div>

      <p className="text-center text-xs text-navy-300 mt-4">{dateStr}</p>
    </div>
  );
}

function PredictionPanel({
  prediction_type,
  predicted_outcome,
  confidence,
  odds_fair,
  explanation_json,
}: {
  prediction_type: string;
  predicted_outcome: string | null;
  confidence: number | null;
  odds_fair: number | null;
  explanation_json: Record<string, unknown> | null;
}) {
  const pct = confidence != null ? Math.round(confidence * 100) : null;
  const confidenceColor =
    pct == null ? 'bg-gray-300'
    : pct >= 70 ? 'bg-emerald-500'
    : pct >= 50 ? 'bg-gold-500'
    : 'bg-gray-400';

  const summary = explanation_json?.summary as string | undefined;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{prediction_type}</h2>
        {pct != null && (
          <span className="text-sm font-bold text-gray-900">%{pct} güven</span>
        )}
      </div>

      {predicted_outcome && (
        <p className="text-xl font-bold text-gray-900">{predicted_outcome}</p>
      )}

      {pct != null && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Güven Skoru</span>
            <span className="font-semibold text-gray-700">%{pct}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${confidenceColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {odds_fair != null && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          <span className="text-xs text-gray-500">Adil Oran</span>
          <span className="text-sm font-semibold text-gray-800">{odds_fair.toFixed(2)}</span>
        </div>
      )}

      {summary && (
        <p className="text-sm text-gray-600 leading-relaxed pt-1 border-t border-gray-100">
          {summary}
        </p>
      )}
    </div>
  );
}


export default PublicPredictionDetailPage