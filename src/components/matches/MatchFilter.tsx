import { Search, X } from 'lucide-react';
import type { Filters } from '../../pages/MatchListPage';

interface MatchFilterProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  competitions: { code: string; name: string }[];
}

const statuses = [
  { value: 'all', label: 'Tümü' },
  { value: 'scheduled', label: 'Planlı' },
  { value: 'live', label: 'Canlı' },
  { value: 'finished', label: 'Bitmiş' },
  { value: 'postponed', label: 'Ertelenmiş' },
];

export default function MatchFilter({ filters, onChange, competitions }: MatchFilterProps) {
  const hasActiveFilters = filters.status !== 'all' || filters.competition !== 'all' || filters.search !== '';

  function reset() {
    onChange({ status: 'all', competition: 'all', search: '' });
  }

  return (
    <div className="bg-surface-card-solid rounded-xl border border-readable-soft p-4">
      <div className="flex flex-wrap items-end gap-3">
        {/* Status select */}
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Durum</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-readable-soft bg-navy-800 text-sm text-slate-200 focus:ring-1 focus:ring-navy-400 focus:border-navy-400 transition-colors appearance-none cursor-pointer"
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Competition select */}
        <div className="min-w-[160px] flex-1 max-w-xs">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Lig / Turnuva</label>
          <select
            value={filters.competition}
            onChange={(e) => onChange({ ...filters, competition: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-readable-soft bg-navy-800 text-sm text-slate-200 focus:ring-1 focus:ring-navy-400 focus:border-navy-400 transition-colors appearance-none cursor-pointer"
          >
            <option value="all">Tümü</option>
            {competitions.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="max-w-xs w-full sm:w-auto">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Takım Ara</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Takım adı..."
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-readable-soft bg-navy-800 text-sm text-slate-200 placeholder-slate-500 focus:ring-1 focus:ring-navy-400 focus:border-navy-400 transition-colors"
            />
          </div>
        </div>

        {/* Clear filters button — pinned to right */}
        {hasActiveFilters && (
          <div className="ml-auto self-end pb-0.5">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-navy-800 border border-readable-soft hover:border-readable-hover px-3 py-2.5 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Temizle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
