import { useTranslation } from 'react-i18next';

interface Props {
  className?: string;
  textTone?: 'amber' | 'neutral';
}

export function ManifestoBody({ className = '', textTone = 'neutral' }: Props) {
  const { t } = useTranslation('legal');
  const leadColor = textTone === 'amber' ? 'text-amber-100' : 'text-white';
  const bodyColor = textTone === 'amber' ? 'text-amber-50/85' : 'text-white/70';
  const sigColor = textTone === 'amber' ? 'text-amber-300/70' : 'text-white/50';

  return (
    <div className={`space-y-4 leading-relaxed text-sm ${className}`}>
      <p>
        <strong className={leadColor}>{t('disclaimer.manifesto.p1_lead')}</strong>{' '}
        <span className={bodyColor}>{t('disclaimer.manifesto.p1')}</span>
      </p>
      <p>
        <strong className={leadColor}>{t('disclaimer.manifesto.p2_lead')}</strong>{' '}
        <span className={bodyColor}>{t('disclaimer.manifesto.p2')}</span>
      </p>
      <p className={bodyColor}>{t('disclaimer.manifesto.p3')}</p>
      <p className={bodyColor}>{t('disclaimer.manifesto.p4')}</p>
      <p>
        <strong className={leadColor}>{t('disclaimer.manifesto.p5_lead')}</strong>{' '}
        <span className={bodyColor}>{t('disclaimer.manifesto.p5')}</span>
      </p>
      <p className={`text-right not-italic mt-6 ${sigColor}`}>
        {t('disclaimer.manifesto.signature')}
      </p>
    </div>
  );
}
