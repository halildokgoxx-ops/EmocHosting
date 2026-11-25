import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { ClockScheduleIcon, TrashIcon, PlusIcon } from '../icons/EmoIcons';

export function TasksTab({ server, onReload }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [action, setAction] = useState('restart');
  const [intervalMinutes, setIntervalMinutes] = useState(120);
  const [payload, setPayload] = useState('');

  async function addTask(e) {
    e.preventDefault();
    try {
      await apiRequest(`/api/servers/${server.id}/tasks`, {
        method: 'POST',
        body: { name: name || action, action, intervalMinutes, payload },
      });
      setName('');
      setPayload('');
      toast.success('Zamanlanmış görev eklendi!');
      onReload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteTask(taskId) {
    try {
      await apiRequest(`/api/servers/${server.id}/tasks/${taskId}`, { method: 'DELETE' });
      toast.info('Görev kaldırıldı');
      onReload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addTask} className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label htmlFor="task-name" className="text-[11px] text-slate-400 block mb-1">Görev Adı</label>
          <input
            id="task-name"
            required
            minLength={2}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Otomatik Yedek"
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white"
          />
        </div>
        <div>
          <label htmlFor="task-action" className="text-[11px] text-slate-400 block mb-1">Eylem</label>
          <select
            id="task-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white"
          >
            <option value="restart">Yeniden Başlat</option>
            <option value="backup">Otomatik .ZIP Yedek</option>
            <option value="command">Konsol Komutu Gönder</option>
          </select>
        </div>
        <div>
          <label htmlFor="task-interval" className="text-[11px] text-slate-400 block mb-1">Aralık (Dakika)</label>
          <input
            id="task-interval"
            type="number"
            min={5}
            max={43200}
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white"
          />
        </div>
        <AnimatedButton type="submit" size="sm">
          <PlusIcon className="w-4 h-4" /> Görev Ekle
        </AnimatedButton>
        {action === 'command' && (
          <div className="sm:col-span-4">
            <label htmlFor="task-command-payload" className="sr-only">Çalıştırılacak konsol komutu</label>
            <input
              id="task-command-payload"
              required
              maxLength={500}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder="Çalıştırılacak konsol komutu (Örn: say Sunucu 5 dakika içinde yeniden başlıyor)"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-cyan-200"
            />
          </div>
        )}
      </form>

      <div className="space-y-2">
        {(server.scheduledTasks || []).map((t) => (
          <div key={t.id} className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <ClockScheduleIcon className="w-4 h-4 text-cyan-300" />
              <div>
                <div className="font-bold text-white">{t.name} ({t.action})</div>
                <div className="text-slate-400">Her {t.intervalMinutes} dakikada bir {t.payload ? `• ${t.payload}` : ''}</div>
              </div>
            </div>
            <button
              type="button"
              aria-label={`${t.name} görevini sil`}
              onClick={() => deleteTask(t.id)}
              className="text-rose-400 hover:text-rose-300"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
