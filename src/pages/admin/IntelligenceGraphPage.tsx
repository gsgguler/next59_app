import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  GitBranch,
  RefreshCw,
  Search,
  AlertTriangle,
  Activity,
  Database,
  ChevronDown,
  ChevronUp,
  Layers,
  Link2,
  Globe,
  FileText,
  Zap,
  BarChart3,
  Eye,
  Clock,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphHealth {
  total_nodes: number;
  total_edges: number;
  last_updated: string | null;
  nodes_by_type: Record<string, number>;
  edges_by_type: Record<string, number>;
}

interface GraphNode {
  id: string;
  entity_type: string;
  entity_schema: string;
  entity_table: string;
  entity_id: string;
  canonical_match_id: string | null;
  canonical_team_id: string | null;
  model_version: string | null;
  status: string | null;
  confidence_score: number | null;
  risk_level: string | null;
  created_at: string;
  updated_at: string;
}

interface OrphanSummary {
  stories_without_prediction: number;
  predictions_without_feature_snapshot: number;
  publications_without_story: number;
  feature_snapshots_without_elo: number;
  wc_scenarios_without_calibration: number;
  total_orphans: number;
}

interface PublicationTraceRow {
  pub_node_id: string;
  pub_entity_id: string;
  pub_status: string;
  story_node_id: string | null;
  story_status: string | null;
  pred_node_id: string | null;
  pred_confidence: number | null;
  feature_node_id: string | null;
  feature_version: string | null;
}

interface MatchTraceResult {
  nodes: GraphNode[];
  edges: Array<{ from_node_id: string; to_node_id: string; relationship_type: string }>;
  match_id: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<string, string> = {
  elo_rating: 'Elo Derecelendirmesi',
  feature_snapshot: 'Özellik Anlık Görüntüsü',
  prediction_draft: 'Tahmin Taslağı',
  story_draft: 'Hikaye Taslağı',
  publication: 'Yayın',
  backtest_run: 'Geriye Dönük Test',
  calibration_simulation: 'Kalibrasyon Simülasyonu',
  live_state_outcome: 'Canlı Durum Sonucu',
  wc2026_calibration_profile: 'DK2026 Kalibrasyon Profili',
  wc2026_match_scenario: 'DK2026 Maç Senaryosu',
  match_odds: 'Maç Oranları',
  fixture_statistics: 'Fikstür İstatistikleri',
  fixture_events: 'Fikstür Olayları',
  fixture_lineups: 'Fikstür Kadroları',
  player_season_stats: 'Oyuncu Sezon İstatistikleri',
  referee_profile: 'Hakem Profili',
  standing_snapshot: 'Puan Durumu Anlık Görüntüsü',
};

const RISK_COLORS: Record<string, string> = {
  low: 'text-emerald-400 bg-emerald-400/10',
  medium: 'text-amber-400 bg-amber-400/10',
  high: 'text-red-400 bg-red-400/10',
  blocked: 'text-red-600 bg-red-600/10',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function shortId(id: string) {
  return id.slice(0, 8) + '…';
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: number | string; icon: typeof Activity; sub?: string }) {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-navy-400 font-medium">{label}</span>
        <Icon className="w-4 h-4 text-navy-500" />
      </div>
      <p className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString('tr-TR') : value}</p>
      {sub && <p className="text-xs text-navy-400 mt-1">{sub}</p>}
    </div>
  );
}

function OrphanCard({ summary }: { summary: OrphanSummary }) {
  const items = [
    { label: 'Tahmin Bağı Olmayan Hikayeler', value: summary.stories_without_prediction },
    { label: 'Özellik Anlık Görüntüsü Olmayan Tahminler', value: summary.predictions_without_feature_snapshot },
    { label: 'Hikaye Bağı Olmayan Yayınlar', value: summary.publications_without_story },
    { label: 'Elo Bağı Olmayan Özellik Anlık Görüntüleri', value: summary.feature_snapshots_without_elo },
    { label: 'Kalibrasyon Bağı Olmayan DK2026 Senaryoları', value: summary.wc2026_scenarios_without_calibration },
  ];
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-white">Yetim Kayıtlar</h3>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${summary.total_orphans > 0 ? 'bg-amber-400/10 text-amber-400' : 'bg-emerald-400/10 text-emerald-400'}`}>
          {summary.total_orphans} toplam
        </span>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-xs text-navy-300">{item.label}</span>
            <span className={`text-xs font-bold ${item.value > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeTypeBreakdown({ nodesByType }: { nodesByType: Record<string, number> }) {
  const sorted = Object.entries(nodesByType).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-semibold text-white">Düğüm Tipi Dağılımı</h3>
      </div>
      <div className="space-y-2">
        {sorted.map(([type, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={type}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-navy-300">{ENTITY_TYPE_LABELS[type] ?? type}</span>
                <span className="text-navy-400">{count.toLocaleString('tr-TR')}</span>
              </div>
              <div className="h-1.5 bg-navy-700 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NodesTable({ nodes }: { nodes: GraphNode[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-navy-700">
            {['Tip', 'Kaynak Tablo', 'Varlık ID', 'Durum', 'Risk', 'Güncellenme'].map(h => (
              <th key={h} className="text-left py-2 px-3 text-navy-400 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map(n => (
            <tr key={n.id} className="border-b border-navy-800 hover:bg-navy-800/50">
              <td className="py-2 px-3 text-navy-200">{ENTITY_TYPE_LABELS[n.entity_type] ?? n.entity_type}</td>
              <td className="py-2 px-3 text-navy-400 font-mono">{n.entity_schema}.{n.entity_table}</td>
              <td className="py-2 px-3 text-navy-400 font-mono" title={n.entity_id}>{shortId(n.entity_id)}</td>
              <td className="py-2 px-3">
                {n.status ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-navy-700 text-navy-200">{n.status}</span>
                ) : '—'}
              </td>
              <td className="py-2 px-3">
                {n.risk_level ? (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${RISK_COLORS[n.risk_level] ?? ''}`}>{n.risk_level}</span>
                ) : '—'}
              </td>
              <td className="py-2 px-3 text-navy-400">{formatDate(n.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PublicationTraceTable({ rows }: { rows: PublicationTraceRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-navy-700">
            {['Yayın ID', 'Yayın Durumu', 'Hikaye Durumu', 'Tahmin Güveni', 'Özellik Sürümü'].map(h => (
              <th key={h} className="text-left py-2 px-3 text-navy-400 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.pub_node_id} className="border-b border-navy-800 hover:bg-navy-800/50">
              <td className="py-2 px-3 text-navy-400 font-mono" title={r.pub_entity_id}>{shortId(r.pub_entity_id)}</td>
              <td className="py-2 px-3">
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-navy-700 text-navy-200">{r.pub_status}</span>
              </td>
              <td className="py-2 px-3">
                {r.story_status ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-navy-700 text-navy-200">{r.story_status}</span>
                ) : <span className="text-amber-400">—</span>}
              </td>
              <td className="py-2 px-3">
                {r.pred_confidence != null ? (
                  <span className="text-sky-400 font-medium">{(r.pred_confidence * 100).toFixed(1)}%</span>
                ) : <span className="text-amber-400">—</span>}
              </td>
              <td className="py-2 px-3 text-navy-400 font-mono">{r.feature_version ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function IntelligenceGraphPage() {
  const [health, setHealth] = useState<GraphHealth | null>(null);
  const [orphans, setOrphans] = useState<OrphanSummary | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [pubTrace, setPubTrace] = useState<PublicationTraceRow[]>([]);
  const [matchTrace, setMatchTrace] = useState<MatchTraceResult | null>(null);
  const [matchIdInput, setMatchIdInput] = useState('');

  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildScope, setRebuildScope] = useState<'recent' | 'all' | 'wc2026'>('recent');
  const [rebuildResult, setRebuildResult] = useState<string | null>(null);
  const [nodeEntityFilter, setNodeEntityFilter] = useState('');
  const [nodePage, setNodePage] = useState(0);
  const NODE_PAGE_SIZE = 50;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    health: true,
    orphans: true,
    nodes: true,
    pubTrace: false,
    matchTrace: false,
  });

  function toggleSection(k: string) {
    setOpenSections(p => ({ ...p, [k]: !p[k] }));
  }

  const loadHealth = useCallback(async () => {
    const { data } = await supabase.rpc('admin_get_graph_health');
    if (data) setHealth(data as GraphHealth);
  }, []);

  const loadOrphans = useCallback(async () => {
    const { data } = await supabase.rpc('admin_get_orphan_summary');
    if (data) setOrphans(data as OrphanSummary);
  }, []);

  const loadNodes = useCallback(async (filter: string, page: number) => {
    const { data } = await supabase.rpc('admin_get_graph_nodes', {
      p_entity_type: filter || null,
      p_match_id: null,
      p_limit: NODE_PAGE_SIZE,
      p_offset: page * NODE_PAGE_SIZE,
    });
    if (data) setNodes(data as GraphNode[]);
  }, []);

  const loadPubTrace = useCallback(async () => {
    const { data } = await supabase.rpc('admin_get_publication_trace', { p_limit: 50 });
    if (data) setPubTrace(data as PublicationTraceRow[]);
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadHealth(), loadOrphans(), loadNodes('', 0)]);
    setLoading(false);
  }, [loadHealth, loadOrphans, loadNodes]);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    loadNodes(nodeEntityFilter, nodePage);
  }, [nodeEntityFilter, nodePage, loadNodes]);

  useEffect(() => {
    if (openSections.pubTrace && pubTrace.length === 0) loadPubTrace();
  }, [openSections.pubTrace, pubTrace.length, loadPubTrace]);

  async function handleRebuild() {
    setRebuilding(true);
    setRebuildResult(null);
    const { data, error } = await supabase.rpc('admin_rebuild_intelligence_graph', { p_scope: rebuildScope });
    setRebuilding(false);
    if (error) {
      setRebuildResult(`Hata: ${error.message}`);
    } else {
      setRebuildResult(`Yeniden inşa tamamlandı: ${JSON.stringify(data)}`);
      await loadHealth();
      await loadOrphans();
      await loadNodes(nodeEntityFilter, nodePage);
    }
  }

  async function handleMatchTrace() {
    const id = matchIdInput.trim();
    if (!id) return;
    const { data, error } = await supabase.rpc('admin_get_match_intelligence_trace', { p_match_id: id });
    if (error) {
      setMatchTrace(null);
    } else {
      setMatchTrace({ ...(data as Omit<MatchTraceResult, 'match_id'>), match_id: id });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-navy-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-sky-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Zekâ Grafiği</h1>
            <p className="text-xs text-navy-400 mt-0.5">Tüm zekâ katmanlarının iz sürülebilir bağlantı haritası</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={rebuildScope}
            onChange={e => setRebuildScope(e.target.value as typeof rebuildScope)}
            className="text-xs bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-200 focus:outline-none focus:border-sky-500"
          >
            <option value="recent">Son (recent)</option>
            <option value="wc2026">DK 2026 (wc2026)</option>
            <option value="all">Tümü (all)</option>
          </select>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
            {rebuilding ? 'Yeniden İnşa Ediliyor…' : 'Grafiği Yeniden İnşa Et'}
          </button>
        </div>
      </div>

      {rebuildResult && (
        <div className={`px-4 py-3 rounded-lg text-xs ${rebuildResult.startsWith('Hata') ? 'bg-red-900/30 border border-red-700 text-red-300' : 'bg-emerald-900/30 border border-emerald-700 text-emerald-300'}`}>
          {rebuildResult}
        </div>
      )}

      {/* Health Stats */}
      <SectionHeader label="Graf Sağlığı" icon={Activity} open={openSections.health} onToggle={() => toggleSection('health')} />
      {openSections.health && health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Toplam Düğüm" value={health.total_nodes} icon={Database} />
          <StatCard label="Toplam Kenar" value={health.total_edges} icon={Link2} />
          <StatCard label="Düğüm Tipi Sayısı" value={Object.keys(health.nodes_by_type).length} icon={Layers} />
          <StatCard label="Son Güncelleme" value={formatDate(health.last_updated)} icon={Clock} />
          <div className="col-span-2 md:col-span-2">
            <NodeTypeBreakdown nodesByType={health.nodes_by_type} />
          </div>
          <div className="col-span-2 md:col-span-2">
            {orphans && <OrphanCard summary={orphans} />}
          </div>
        </div>
      )}

      {/* Nodes Table */}
      <SectionHeader label="Düğüm Listesi" icon={Database} open={openSections.nodes} onToggle={() => toggleSection('nodes')} />
      {openSections.nodes && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-navy-700">
            <select
              value={nodeEntityFilter}
              onChange={e => { setNodeEntityFilter(e.target.value); setNodePage(0); }}
              className="text-xs bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-navy-200 focus:outline-none focus:border-sky-500"
            >
              <option value="">Tüm Tipler</option>
              {Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <span className="text-xs text-navy-400 ml-auto">
              Sayfa {nodePage + 1} · {NODE_PAGE_SIZE} kayıt
            </span>
            <button onClick={() => setNodePage(p => Math.max(0, p - 1))} disabled={nodePage === 0} className="text-xs px-2 py-1 bg-navy-700 rounded disabled:opacity-40 text-navy-200">← Önceki</button>
            <button onClick={() => setNodePage(p => p + 1)} disabled={nodes.length < NODE_PAGE_SIZE} className="text-xs px-2 py-1 bg-navy-700 rounded disabled:opacity-40 text-navy-200">Sonraki →</button>
          </div>
          {nodes.length === 0 ? (
            <div className="py-8 text-center text-navy-400 text-sm">Kayıt bulunamadı</div>
          ) : (
            <NodesTable nodes={nodes} />
          )}
        </div>
      )}

      {/* Publication Trace */}
      <SectionHeader label="Yayın İz Sürümü" icon={FileText} open={openSections.pubTrace} onToggle={() => toggleSection('pubTrace')} />
      {openSections.pubTrace && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
          {pubTrace.length === 0 ? (
            <div className="py-8 text-center text-navy-400 text-sm">Yayın zinciri verisi bulunamadı</div>
          ) : (
            <PublicationTraceTable rows={pubTrace} />
          )}
        </div>
      )}

      {/* Match Trace Search */}
      <SectionHeader label="Maç İz Sürümü" icon={Search} open={openSections.matchTrace} onToggle={() => toggleSection('matchTrace')} />
      {openSections.matchTrace && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Maç UUID girin…"
              value={matchIdInput}
              onChange={e => setMatchIdInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleMatchTrace()}
              className="flex-1 text-sm bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-white placeholder-navy-500 focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={handleMatchTrace}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              İz Sür
            </button>
          </div>
          {matchTrace && (
            <div className="space-y-3">
              <div className="flex gap-4 text-xs text-navy-400">
                <span><span className="text-white font-medium">{matchTrace.nodes.length}</span> düğüm</span>
                <span><span className="text-white font-medium">{matchTrace.edges.length}</span> kenar</span>
              </div>
              {matchTrace.nodes.length > 0 ? (
                <NodesTable nodes={matchTrace.nodes} />
              ) : (
                <p className="text-sm text-navy-400">Bu maç için grafik düğümü bulunamadı.</p>
              )}
              {matchTrace.edges.length > 0 && (
                <div>
                  <p className="text-xs text-navy-400 font-medium mb-2">Kenarlar</p>
                  <div className="space-y-1">
                    {matchTrace.edges.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-navy-300 font-mono">
                        <span className="text-navy-500">{shortId(e.from_node_id)}</span>
                        <span className="text-sky-500">→ {e.relationship_type} →</span>
                        <span className="text-navy-500">{shortId(e.to_node_id)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="bg-navy-800/50 border border-navy-700/50 rounded-xl p-4">
        <p className="text-xs font-semibold text-navy-400 mb-3">Terimler Sözlüğü</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-navy-400">
          <span><span className="text-navy-200">Zekâ Grafiği</span> — Tüm varlıkların bağlantı haritası</span>
          <span><span className="text-navy-200">Düğüm</span> — Bir varlık kaydı (elo, tahmin, hikaye…)</span>
          <span><span className="text-navy-200">Kenar</span> — İki düğüm arasındaki ilişki</span>
          <span><span className="text-navy-200">Yetim Kayıt</span> — Beklenen bağlantısı eksik varlık</span>
          <span><span className="text-navy-200">İz Sürümü</span> — Bir maç/yayın için tüm bağlantı zinciri</span>
          <span><span className="text-navy-200">Kalibrasyon Bağı</span> — Tahmin ↔ kalibrasyon profili</span>
        </div>
      </div>
    </div>
  );
}

// ── Section Header ─────────────────────────────────────────────────────────

function SectionHeader({ label, icon: Icon, open, onToggle }: { label: string; icon: typeof Activity; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 text-sm font-semibold text-navy-200 hover:text-white transition-colors"
    >
      <Icon className="w-4 h-4 text-sky-400" />
      <span>{label}</span>
      {open ? <ChevronUp className="w-4 h-4 ml-auto text-navy-500" /> : <ChevronDown className="w-4 h-4 ml-auto text-navy-500" />}
    </button>
  );
}
