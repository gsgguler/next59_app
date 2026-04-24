import { useEffect, useState } from 'react';
import { Plus, Copy, Trash2, Loader2, Key, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface Token {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  ip_allowlist: string[] | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

const scopeBadge: Record<string, string> = {
  read: 'text-blue-700 bg-blue-50 border-blue-200',
  write: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  admin: 'text-red-700 bg-red-50 border-red-200',
};

export default function ApiTokenPanel() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newToken, setNewToken] = useState({ name: '', scopes: ['read'] as string[], ipAllowlist: '', expiryDays: 90 });
  const [creating, setCreating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState('');

  useEffect(() => {
    fetchTokens();
  }, []);

  async function fetchTokens() {
    if (!profile?.personal_organization_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('api_access_tokens')
      .select('id, name, token_prefix, scopes, ip_allowlist, created_at, expires_at, last_used_at, revoked_at')
      .eq('organization_id', profile.personal_organization_id)
      .order('created_at', { ascending: false });
    setTokens((data as Token[]) ?? []);
    setLoading(false);
  }

  function toggleScope(scope: string) {
    setNewToken((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  }

  async function handleCreate() {
    if (!newToken.name || !profile?.personal_organization_id) return;
    setCreating(true);

    const rawToken = 'nt59_' + crypto.randomUUID().replace(/-/g, '');
    const prefix = rawToken.slice(0, 12) + '...';
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawToken));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + newToken.expiryDays);

    const ipList = newToken.ipAllowlist
      ? newToken.ipAllowlist.split(',').map((ip) => ip.trim()).filter(Boolean)
      : null;

    const { error } = await supabase.from('api_access_tokens').insert({
      organization_id: profile.personal_organization_id,
      name: newToken.name,
      token_hash: hashHex,
      token_prefix: prefix,
      scopes: newToken.scopes,
      expires_at: expiresAt.toISOString(),
      ip_allowlist: ipList,
    });

    setCreating(false);
    if (error) {
      toast(error.message, 'error');
    } else {
      setGeneratedToken(rawToken);
      fetchTokens();
    }
  }

  async function revokeToken(id: string) {
    const { error } = await supabase
      .from('api_access_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast('Token iptal edilemedi', 'error');
    } else {
      toast('Token iptal edildi', 'success');
      fetchTokens();
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast('Panoya kopyalandi', 'success');
  }

  function closeCreateModal() {
    setShowCreate(false);
    setGeneratedToken('');
    setNewToken({ name: '', scopes: ['read'], ipAllowlist: '', expiryDays: 90 });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-navy-500 animate-spin" />
      </div>
    );
  }

  if (!profile?.personal_organization_id) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Key className="w-10 h-10 mx-auto mb-3" />
        <p className="text-sm">API tokenlari icin bir organizasyona ihtiyaciniz var</p>
      </div>
    );
  }

  const activeTokens = tokens.filter((t) => !t.revoked_at);
  const revokedTokens = tokens.filter((t) => t.revoked_at);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{activeTokens.length} aktif token</span>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Yeni Token
        </button>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Tokenlar bir kez gosterilir. Kaybetmeyin.
      </div>

      {tokens.length === 0 ? (
        <p className="text-center py-8 text-gray-400 text-sm">Henuz API tokeni olusturulmamidir</p>
      ) : (
        <div className="space-y-2">
          {activeTokens.map((t) => (
            <TokenRow key={t.id} token={t} onRevoke={revokeToken} onCopy={copyToClipboard} />
          ))}
          {revokedTokens.length > 0 && (
            <>
              <p className="text-xs text-gray-400 pt-2">Iptal edilmis</p>
              {revokedTokens.map((t) => (
                <TokenRow key={t.id} token={t} onRevoke={revokeToken} onCopy={copyToClipboard} />
              ))}
            </>
          )}
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={closeCreateModal}
        title={generatedToken ? 'Token Olusturuldu' : 'Yeni API Token'}
        footer={
          generatedToken ? (
            <button onClick={closeCreateModal} className="px-4 py-2 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors">
              Kapat
            </button>
          ) : (
            <>
              <button onClick={closeCreateModal} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                Iptal
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newToken.name}
                className="px-4 py-2 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Olusturuluyor...' : 'Olustur'}
              </button>
            </>
          )
        }
      >
        {generatedToken ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Bu token sadece bir kez gosterilecektir. Simdi kopyalayin.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono break-all select-all">
                {generatedToken}
              </code>
              <button onClick={() => copyToClipboard(generatedToken)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <Copy className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Isim</label>
              <input
                value={newToken.name}
                onChange={(e) => setNewToken({ ...newToken, name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
                placeholder="Token adi"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Yetkiler</label>
              <div className="flex gap-3">
                {['read', 'write', 'admin'].map((scope) => (
                  <label key={scope} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newToken.scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="w-4 h-4 rounded border-gray-300 text-navy-600 focus:ring-navy-500"
                    />
                    <span className="text-sm text-gray-700 capitalize">{scope}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IP Allowlist (opsiyonel)</label>
              <input
                value={newToken.ipAllowlist}
                onChange={(e) => setNewToken({ ...newToken, ipAllowlist: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
                placeholder="192.168.1.1, 10.0.0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sure (gun)</label>
              <input
                type="number"
                value={newToken.expiryDays}
                onChange={(e) => setNewToken({ ...newToken, expiryDays: Number(e.target.value) || 90 })}
                min={1}
                max={365}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TokenRow({ token, onRevoke, onCopy }: { token: Token; onRevoke: (id: string) => void; onCopy: (text: string) => void }) {
  const isRevoked = !!token.revoked_at;
  const isExpired = token.expires_at && new Date(token.expires_at) < new Date();

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-3 ${isRevoked ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-gray-900">{token.name}</p>
            {isRevoked && <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Iptal</span>}
            {isExpired && !isRevoked && <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Suresi Dolmus</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono text-gray-400">{token.token_prefix}</code>
            {token.scopes.map((s) => (
              <span key={s} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize ${scopeBadge[s] ?? scopeBadge.read}`}>
                {s}
              </span>
            ))}
          </div>
        </div>
        {!isRevoked && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onCopy(token.token_prefix)} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={() => onRevoke(token.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400">
        <span>{new Date(token.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
        {token.expires_at && (
          <span>Son: {new Date(token.expires_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
        )}
        {token.last_used_at && (
          <span>Kullanim: {new Date(token.last_used_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
        )}
      </div>
    </div>
  );
}
