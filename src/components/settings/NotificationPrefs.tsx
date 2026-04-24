import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';

interface NotifState {
  emailEnabled: boolean;
  emailNewPredictions: boolean;
  emailMatchReminders: boolean;
  emailDebateResults: boolean;
  emailMaintenance: boolean;
  pushEnabled: boolean;
  pushLiveGoals: boolean;
  pushPredictionResults: boolean;
  smsEnabled: boolean;
  smsCriticalAlerts: boolean;
}

const defaults: NotifState = {
  emailEnabled: true,
  emailNewPredictions: true,
  emailMatchReminders: true,
  emailDebateResults: false,
  emailMaintenance: true,
  pushEnabled: false,
  pushLiveGoals: false,
  pushPredictionResults: false,
  smsEnabled: false,
  smsCriticalAlerts: false,
};

export default function NotificationPrefs() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotifState>(defaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setPrefs((prev) => ({
        ...prev,
        emailEnabled: profile.email_notifications_enabled,
        pushEnabled: profile.push_notifications_enabled,
      }));
    }
  }, [profile]);

  function toggle(key: keyof NotifState) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        email_notifications_enabled: prefs.emailEnabled,
        push_notifications_enabled: prefs.pushEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    setSaving(false);
    if (error) {
      toast('Bildirim tercihleri kaydedilemedi', 'error');
    } else {
      toast('Bildirim tercihleri kaydedildi', 'success');
      await refreshProfile();
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <ToggleGroup
        title="Email Bildirimleri"
        enabled={prefs.emailEnabled}
        onToggleMaster={() => toggle('emailEnabled')}
        items={[
          { label: 'Yeni tahminler', checked: prefs.emailNewPredictions, onChange: () => toggle('emailNewPredictions') },
          { label: 'Mac hatirlaticilari', checked: prefs.emailMatchReminders, onChange: () => toggle('emailMatchReminders') },
          { label: 'Debate sonuclari', checked: prefs.emailDebateResults, onChange: () => toggle('emailDebateResults') },
          { label: 'Sistem bakimi', checked: prefs.emailMaintenance, onChange: () => toggle('emailMaintenance') },
        ]}
      />

      <ToggleGroup
        title="Push Bildirimleri"
        enabled={prefs.pushEnabled}
        onToggleMaster={() => toggle('pushEnabled')}
        items={[
          { label: 'Canli mac golleri', checked: prefs.pushLiveGoals, onChange: () => toggle('pushLiveGoals') },
          { label: 'Tahmin dogrulama sonuclari', checked: prefs.pushPredictionResults, onChange: () => toggle('pushPredictionResults') },
        ]}
      />

      <ToggleGroup
        title="SMS Bildirimleri"
        enabled={prefs.smsEnabled}
        onToggleMaster={() => toggle('smsEnabled')}
        items={[
          { label: 'Kritik sistem uyarilari', checked: prefs.smsCriticalAlerts, onChange: () => toggle('smsCriticalAlerts') },
        ]}
      />

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Kaydet
      </button>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

function ToggleGroup({
  title,
  enabled,
  onToggleMaster,
  items,
}: {
  title: string;
  enabled: boolean;
  onToggleMaster: () => void;
  items: { label: string; checked: boolean; onChange: () => void }[];
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <Toggle checked={enabled} onChange={onToggleMaster} />
      </div>
      <div className={`space-y-3 ${!enabled ? 'opacity-40 pointer-events-none' : ''}`}>
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{item.label}</span>
            <Toggle checked={item.checked && enabled} onChange={item.onChange} />
          </div>
        ))}
      </div>
    </div>
  );
}
