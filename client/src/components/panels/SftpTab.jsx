import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { SftpTransferIcon, CopyIcon, RestartIcon } from '../icons/EmoIcons';

export function SftpTab({ serverId }) {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest(`/api/servers/${serverId}/sftp`);
      setInfo(data);
    } catch (err) {
      toast.error(err.message);
    }
  }, [serverId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  function copy(label, val) {
    navigator.clipboard.writeText(val);
    toast.success(`${label} panoya kopyalandı!`);
  }

  async function rotatePass() {
    if (!window.confirm('SFTP şifresi yenilensin mi? Eski şifre artık çalışmayacak.')) return;
    setBusy(true);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/sftp/rotate`, { method: 'POST' });
      setInfo((p) => ({ ...p, password: res.password }));
      setShowPass(true);
      toast.success('Yeni SFTP şifresi oluşturuldu!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSftp() {
    const next = !info.enabled;
    await apiRequest(`/api/servers/${serverId}/sftp/toggle`, { method: 'POST', body: { enabled: next } });
    setInfo((p) => ({ ...p, enabled: next }));
    toast.info(next ? 'SFTP erişimi aktif edildi' : 'SFTP erişimi devre dışı bırakıldı');
  }

  if (!info) return <div className="py-8 text-center text-xs text-slate-400">SFTP bilgileri yükleniyor...</div>;

  const fields = [
    { label: 'Sunucu Adresi (Host)', val: info.host },
    { label: 'SFTP Port', val: String(info.port) },
    { label: 'Kullanıcı Adı', val: info.username },
    { label: 'SFTP Şifresi', val: info.password, secret: true },
    { label: 'Hızlı Bağlantı URI', val: info.uri },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-400/25">
        <div className="flex items-center gap-3">
          <SftpTransferIcon className="w-7 h-7 shrink-0" />
          <div>
            <h4 className="font-bold text-white text-sm">Gerçek SFTP (SSH File Transfer) Sunucusu</h4>
            <p className="text-xs text-slate-300">
              FileZilla, WinSCP, Cyberduck veya mobil Termius/FE File Explorer üzerinden doğrudan dosya transferi yapın.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AnimatedButton size="xs" variant={info.enabled ? 'emerald' : 'warning'} onClick={toggleSftp}>
            {info.enabled ? 'SFTP Aktif' : 'SFTP Kapalı'}
          </AnimatedButton>
          <AnimatedButton size="xs" variant="secondary" loading={busy} onClick={rotatePass}>
            <RestartIcon className="w-3.5 h-3.5" /> Şifreyi Yenile
          </AnimatedButton>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.label} className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 space-y-1.5">
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>{f.label}</span>
              {f.secret && (
                <button onClick={() => setShowPass((v) => !v)} className="text-cyan-300 underline">
                  {showPass ? 'Gizle' : 'Göster'}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono text-xs text-cyan-200 truncate">
                {f.secret && !showPass ? '••••••••••••••••' : f.val}
              </code>
              <button
                onClick={() => copy(f.label, f.val)}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-200 text-xs flex items-center gap-1 shrink-0"
              >
                <CopyIcon className="w-3.5 h-3.5" />
                <span>Kopyala</span>
              </button>
            </div>
          </div>
        ))}

        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 space-y-1.5">
          <div className="text-[11px] text-slate-400">Terminal SFTP Komutu</div>
          <div className="flex items-center justify-between gap-2">
            <code className="font-mono text-xs text-emerald-300 truncate">
              sftp -P {info.port} {info.username}@{info.host}
            </code>
            <button
              onClick={() => copy('Terminal Komutu', `sftp -P ${info.port} ${info.username}@${info.host}`)}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-slate-200 text-xs flex items-center gap-1 shrink-0"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              <span>Kopyala</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live SFTP Logs */}
      <div className="rounded-2xl bg-slate-950/60 border border-white/10 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white">Son SFTP Bağlantı &amp; Transfer Logları</span>
          <button onClick={load} className="text-xs text-cyan-300">Yenile</button>
        </div>
        {info.logs?.length === 0 ? (
          <div className="text-xs text-slate-500 py-3">Henüz SFTP bağlantısı gerçekleşmedi.</div>
        ) : (
          <div className="space-y-1 font-mono text-xs max-h-40 overflow-y-auto">
            {info.logs.map((l) => (
              <div key={l.id} className="text-slate-300">
                <span className="text-slate-500 mr-2">[{l.time}]</span>
                {l.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
