import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest, downloadAuthenticatedFile } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { BackupZipIcon, DownloadIcon, TrashIcon, PlusIcon } from '../icons/EmoIcons';

export function BackupsTab({ serverId }) {
  const toast = useToast();
  const [backups, setBackups] = useState([]);
  const [limit, setLimit] = useState(3);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest(`/api/servers/${serverId}/backups`);
      setBackups(data.backups || []);
      setLimit(data.limit || 3);
    } catch {}
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createBackup() {
    setBusy(true);
    try {
      await apiRequest(`/api/servers/${serverId}/backups`, { method: 'POST', body: { note: 'Kullanıcı Yedeği' } });
      toast.success('Gerçek .zip yedeği disk üzerinde oluşturuldu!');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function restore(filename) {
    if (!window.confirm(`${filename} geri yüklensin mi? Mevcut dosyaların üzerine yazılacaktır.`)) return;
    try {
      await apiRequest(`/api/servers/${serverId}/backups/restore`, { method: 'POST', body: { filename } });
      toast.success('Yedek geri yüklendi!');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove(filename) {
    await apiRequest(`/api/servers/${serverId}/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    toast.info('Yedek silindi');
    load();
  }

  async function download(filename) {
    try {
      await downloadAuthenticatedFile(`/api/servers/${serverId}/backups/${encodeURIComponent(filename)}/download`, filename);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">
          Kullanılan Yedek Slotu: <strong className="text-cyan-300">{backups.length} / {limit}</strong>
        </div>
        <AnimatedButton size="sm" loading={busy} onClick={createBackup}>
          <PlusIcon className="w-4 h-4" /> Yeni .ZIP Yedeği Al
        </AnimatedButton>
      </div>

      <div className="space-y-2.5">
        {backups.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-950/60 border border-white/10 text-center text-xs text-slate-500">
            Henüz yedek alınmamış.
          </div>
        ) : (
          backups.map((b) => (
            <div key={b.filename} className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <BackupZipIcon className="w-5 h-5" />
                <div>
                  <div className="font-mono text-xs font-bold text-white">{b.filename}</div>
                  <div className="text-[11px] text-slate-400">
                    {b.sizeMb} MB • {new Date(b.createdAt).toLocaleString('tr-TR')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AnimatedButton size="xs" variant="secondary" onClick={() => restore(b.filename)}>Geri Yükle</AnimatedButton>
                <AnimatedButton size="xs" variant="ghost" onClick={() => download(b.filename)}>
                  <DownloadIcon className="w-3.5 h-3.5" />
                </AnimatedButton>
                <AnimatedButton size="xs" variant="danger" onClick={() => remove(b.filename)}>
                  <TrashIcon className="w-3.5 h-3.5" />
                </AnimatedButton>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
