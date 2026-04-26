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
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Durum</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Lig / Turnuva</label>
          <select
            value={filters.competition}
            onChange={(e) => onChange({ ...filters, competition: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
          >
            <option value="all">Tümü</option>
            {competitions.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Takım Ara</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Takım adı..."
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <button
          onClick={reset}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Filtreleri Temizle
        </button>
      )}
    </div>
  );
}
