import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { CopyIcon } from '../icons/EmoIcons';

export function NetworkPortsTab({ server, onReload }) {
  const toast = useToast();
  const [subdomain, setSubdomain] = useState(server.subdomain || server.slug || '');
  const [saving, setSaving] = useState(false);
  const [pingResult, setPingResult] = useState(null);
  const [pinging, setPinging] = useState(false);

  const currentDomain = server.domainAddress || `${server.subdomain || server.slug}.emochost.com`;

  function copy(label, text) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} kopyalandı!`);
  }

  async function saveSubdomain(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest(`/api/servers/${server.id}/subdomain`, {
        method: 'PATCH',
        body: { subdomain },
      });
      toast.success(`Alan adı güncellendi: ${res.domainAddress}`);
      onReload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function runPingTest() {
    setPinging(true);
    try {
      const res = await apiRequest(`/api/servers/${server.id}/mc/ping`, { method: 'POST' });
      setPingResult(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPinging(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="font-display text-lg font-bold text-white">Ağ, Otomatik Alan Adı &amp; Erişim</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Her sunucu otomatik olarak <strong>{currentDomain}</strong> adresini alır. Özel alan adı ve web bağlantı yönlendirmeleri sunucunuz için otomatik olarak yapılandırılır.
          </p>
        </div>

        <form onSubmit={saveSubdomain} className="space-y-2">
          <label htmlFor="network-subdomain-input" className="text-xs font-semibold text-zinc-300 block">Özel Alt Alan Adı</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex items-center rounded-xl bg-[#09090b] border border-white/10 overflow-hidden focus-within:border-amber-500">
              <input
                id="network-subdomain-input"
                required
                minLength={3}
                maxLength={32}
                pattern="[a-z0-9-]{3,32}"
                title="Sadece küçük harf, rakam ve tire (-) kullanabilirsiniz (3-32 karakter)."
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                placeholder="orn-sunucum"
                className="flex-1 px-3.5 py-2.5 bg-transparent outline-none text-sm font-mono text-white"
              />
              <span className="px-3.5 py-2.5 bg-zinc-900 text-xs font-mono text-amber-400 border-l border-white/10">
                .emochost.com
              </span>
            </div>
            <AnimatedButton type="submit" loading={saving}>
              Alan Adını Kaydet
            </AnimatedButton>
          </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="p-4 rounded-xl bg-[#09090b] border border-white/[0.06] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-500 uppercase font-mono">Birincil Alan Adı</div>
              <div className="text-sm font-mono font-bold text-amber-400 truncate mt-0.5">{currentDomain}</div>
            </div>
            <AnimatedButton size="xs" variant="secondary" onClick={() => copy('Alan adı', currentDomain)}>
              <CopyIcon className="w-3.5 h-3.5" /> Kopyala
            </AnimatedButton>
          </div>

          <div className="p-4 rounded-xl bg-[#09090b] border border-white/[0.06] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-500 uppercase font-mono">Doğrudan Bağlantı &amp; Port</div>
              <div className="text-sm font-mono font-bold text-zinc-200 truncate mt-0.5">
                {typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:{server.port}
              </div>
            </div>
            <AnimatedButton
              size="xs"
              variant="secondary"
              onClick={() => copy('Port adresi', `${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:${server.port}`)}
            >
              <CopyIcon className="w-3.5 h-3.5" /> Kopyala
            </AnimatedButton>
          </div>
        </div>
      </div>

      {/* Live Ping Test (for Minecraft) or Web URL card */}
      {server.category === 'minecraft' ? (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-sm text-white">Canlı Sunucu Erişim &amp; Gecikme Testi</h4>
              <p className="text-xs text-zinc-400">Sunucu çalışırken özel adresiniz üzerinden canlı bağlantı ve yanıt süresini anlık olarak test edin.</p>
            </div>
            <AnimatedButton size="sm" variant="secondary" loading={pinging} onClick={runPingTest}>
              Şimdi Ping Testi Yap
            </AnimatedButton>
          </div>
          {pingResult && (
            <div className="p-3.5 rounded-xl bg-[#09090b] border border-white/[0.08] text-xs font-mono space-y-1">
              <div>Durum: <strong className={pingResult.online ? 'text-emerald-400' : 'text-rose-400'}>{pingResult.online ? 'Çevrimiçi' : 'Yanıt Yok'}</strong></div>
              {pingResult.online && (
                <>
                  <div>Gecikme: {pingResult.latencyMs}ms • Oyuncu: {pingResult.playersOnline}/{pingResult.playersMax}</div>
                  <div>Sürüm: {pingResult.version} • MOTD: {pingResult.motd}</div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-5 space-y-2 text-xs">
          <div className="font-bold text-white text-sm">Özel Alt Alan Adı ile Yerel Test</div>
          <p className="text-zinc-400 leading-relaxed">
            Yerel geliştirme ortamında doğrudan{' '}
            <code className="text-emerald-300">http://{server.subdomain || server.slug}.localhost:3001</code> adresini kullanabilir veya işletim sisteminizin{' '}
            <code className="text-zinc-300">hosts</code> dosyasına şu yönlendirmeyi ekleyerek <code className="text-amber-300">{currentDomain}</code> üzerinden açabilirsiniz:
          </p>
          <pre className="p-3 rounded-xl bg-[#09090b] border border-white/[0.08] font-mono text-amber-300">
            127.0.0.1 {currentDomain}
          </pre>
        </div>
      )}
    </div>
  );
}
