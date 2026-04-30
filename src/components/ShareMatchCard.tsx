import { useState, useRef, useEffect } from 'react';
import { Share2, X, Link2, Download, MessageCircle } from 'lucide-react';
import { useToast } from './ui/Toast';

interface ShareMatchCardProps {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  probability: string;
  matchDate: string;
  league: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function buildOgImageUrl(props: ShareMatchCardProps): string {
  const params = new URLSearchParams({
    homeTeam: props.homeTeam,
    awayTeam: props.awayTeam,
    prediction: props.prediction,
    probability: props.probability,
    matchDate: props.matchDate,
    league: props.league,
  });
  return `${SUPABASE_URL}/functions/v1/og-match?${params.toString()}`;
}

function buildMatchUrl(matchId: string): string {
  return `https://www.next59.com/mac/${matchId}`;
}

function buildShareText(props: ShareMatchCardProps): string {
  const matchUrl = buildMatchUrl(props.matchId);
  return [
    `\u{1F3C6} ${props.homeTeam} vs ${props.awayTeam} | next59 senaryosu: ${props.prediction} (${props.probability}%)`,
    `\u{1F52E} ${props.matchDate} \u{2014} ${props.league}`,
    `\u{1F449} ${matchUrl}`,
  ].join('\n');
}

const channels = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25D366',
    icon: MessageCircle,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    icon: ({ className }: { className?: string }) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.025 4.388 11.018 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796v8.437C19.612 23.09 24 18.098 24 12.073" />
      </svg>
    ),
  },
  {
    id: 'twitter',
    label: 'X',
    color: '#000000',
    icon: ({ className }: { className?: string }) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'discord',
    label: 'Discord',
    color: '#5865F2',
    icon: ({ className }: { className?: string }) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: '#000000',
    icon: ({ className }: { className?: string }) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
] as const;

export default function ShareMatchCard(props: ShareMatchCardProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const ogImageUrl = buildOgImageUrl(props);
  const matchUrl = buildMatchUrl(props.matchId);
  const shareText = buildShareText(props);

  function handleShare(channelId: string) {
    switch (channelId) {
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener');
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(matchUrl)}`, '_blank', 'noopener');
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener');
        break;
      case 'discord':
        navigator.clipboard.writeText(shareText).then(() => {
          toast('Discord icin kopyalandi!', 'success');
        });
        break;
      case 'tiktok':
        navigator.clipboard.writeText(shareText).then(() => {
          toast('TikTok icin kopyalandi!', 'success');
        });
        break;
    }
    setOpen(false);
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(matchUrl).then(() => {
      toast('Baglanti kopyalandi!', 'success');
    });
    setOpen(false);
  }

  async function handleDownloadImage() {
    try {
      const res = await fetch(ogImageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `next59-${props.homeTeam}-vs-${props.awayTeam}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Gorsel indiriliyor...', 'success');
    } catch {
      toast('Gorsel indirilemedi.', 'error');
    }
    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-3 right-3 z-50"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Toggle button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
          open
            ? 'bg-white/20 text-white rotate-45'
            : 'bg-navy-800/80 text-navy-400 hover:bg-champagne/20 hover:text-champagne'
        }`}
        aria-label="Paylas"
      >
        {open ? <X className="w-4 h-4" /> : <Share2 className="w-3.5 h-3.5" />}
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="absolute bottom-10 right-0 animate-scale-in origin-bottom-right">
          <div className="bg-navy-900 border border-navy-700 rounded-xl shadow-2xl shadow-black/50 p-2 flex flex-col gap-1 min-w-[160px]">
            {channels.map((ch) => {
              const Icon = ch.icon;
              return (
                <button
                  key={ch.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleShare(ch.id);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">{ch.label}</span>
                </button>
              );
            })}

            <div className="h-px bg-navy-700 my-1" />

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCopyLink();
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
            >
              <Link2 className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium">Linki Kopyala</span>
            </button>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDownloadImage();
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium">Gorseli Indir</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
