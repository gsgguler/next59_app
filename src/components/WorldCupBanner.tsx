import { Countdown } from './Countdown';
import { WC_2026 } from '../config/events';
import { useTranslation } from 'react-i18next';

export function WorldCupBanner() {
  const { t } = useTranslation();
  const now = Date.now();
  const kickoff = new Date(WC_2026.kickoffUtc).getTime();
  const final = new Date(WC_2026.finalUtc).getTime();

  if (now > final) return null;

  if (now > kickoff) {
    return (
      <div className="bg-gradient-to-r from-[#060f09] via-emerald-950 to-[#060f09] border-y border-emerald-900/30 py-3">
        <p className="text-center text-emerald-400 font-medium text-sm uppercase tracking-wider">
          {t('wc.in_progress')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0a1828] border-y border-white/5 py-12">
      <div className="container mx-auto px-4">
        <Countdown targetUtc={WC_2026.kickoffUtc} label={t('wc.countdown_label')} variant="big" />
      </div>
    </div>
  );
}
