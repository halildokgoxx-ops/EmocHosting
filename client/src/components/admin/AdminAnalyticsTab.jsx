import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';

const PAGE_LABELS = {
  '/': 'Ana Sayfa',
  '/packages': 'Mağaza & Paketler',
  '/deals': 'Gece Pazarı',
  '/giveaways': 'Çekilişler',
  '/leaderboard': 'Davet & Liderlik',
  '/status': 'Sistem Durumu',
  '/sss': 'Sık Sorulan Sorular',
  '/faq': 'SSS (İng. Rota)',
  '/gizlilik-politikasi': 'Gizlilik & KVKK',
  '/kullanim-sartlari': 'Kullanım Şartları',
  '/cerez-politikasi': 'Çerez Politikası',
  '/auth': 'Giriş & Kayıt',
  '/servers': 'Hizmetlerim',
  '/servers/:id': 'Sunucu Yönetim Paneli',
  '/tickets': 'Destek Talepleri',
  '/account': 'Hesap Ayarları',
};

function labelForPath(p) {
  return PAGE_LABELS[p] || p;
}

export function AdminAnalyticsTab() {
  const toast = useToast();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`${ADMIN_API_PREFIX}/analytics`);
      setReport(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  async function handleReset() {
    if (!window.confirm('Tüm ziyaretçi kalma süresi ve tıklama analitik sayaçları sıfırlansın mı?')) return;
    setResetting(true);
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/analytics/reset`, { method: 'POST' });
      setReport(res.report);
      toast.success('Analitik verileri sıfırlandı.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResetting(false);
    }
  }

  const consent = report?.consentStats || { acceptedAll: 0, essentialOnly: 0, total: 0, acceptRatePct: 0 };
  const devices = report?.deviceStats || { desktop: 0, mobile: 0 };
  const totalDevices = devices.desktop + devices.mobile;
  const mobilePct = totalDevices > 0 ? Math.round((devices.mobile / totalDevices) * 100) : 0;

  const chartData = (report?.topByDwellTime || []).slice(0, 8).map((row) => ({
    name: labelForPath(row.path),
    avgSec: row.avgDwellSec,
    views: row.views,
  }));

  return (
    <div className="space-y-6 tabular-nums">
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Çerez Rızası, Kalma Süresi &amp; Kullanıcı İlgi Analitiği</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Ziyaretçilerin çerez tercihlerini, hangi ekranlarda daha uzun vakit geçirdiklerini ve en çok dikkat çeken buton/paketleri anonim olarak izler.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AnimatedButton size="xs" variant="secondary" loading={loading} onClick={loadReport}>
            Verileri Yenile
          </AnimatedButton>
          <AnimatedButton size="xs" variant="danger" loading={resetting} onClick={handleReset}>
            Sayaçları Sıfırla
          </AnimatedButton>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5">
          <div className="text-xs text-zinc-400">Toplam Ekran Görüntüleme</div>
          <div className="font-display text-3xl font-black text-white mt-1">{report?.totalPageviews ?? 0}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Masaüstü: {devices.desktop} • Mobil: {devices.mobile} (%{mobilePct})
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="text-xs text-zinc-400">Ortalama Ekranda Kalma Süresi</div>
          <div className="font-display text-3xl font-black text-amber-400 mt-1">
            {report?.avgOverallDwellSec ?? 0} <span className="text-sm text-zinc-400 font-normal">sn</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Ölçülen oturum örneği: {report?.totalDwellSamples ?? 0}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="text-xs text-zinc-400">Dikkat Çeken Etkileşim / CTA</div>
          <div className="font-display text-3xl font-black text-emerald-400 mt-1">{report?.totalCtaClicks ?? 0}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Paket seçimi, CTA ve özellik tıklamaları
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="text-xs text-zinc-400">Çerez Analitik Onay Oranı</div>
          <div className="font-display text-3xl font-black text-white mt-1">%{consent.acceptRatePct ?? 0}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Analitik Açık: {consent.acceptedAll} • Sadece Zorunlu: {consent.essentialOnly}
          </div>
        </div>
      </div>

      {/* Average Dwell & Views Chart */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="font-display text-lg font-bold text-white">Ekranlara Göre Ortalama Kalma Süresi (sn) &amp; Görüntüleme</h3>
          <p className="text-xs text-zinc-400">
            Ziyaretçilerin en uzun süre incelediği sayfalar üstte sıralanır (analitik çerezi onaylı ziyaretçilerden hesaplanır)
          </p>
        </div>
        {chartData.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            Henüz yeterli analitik verisi oluşmadı. Ziyaretçiler çerez onayında &quot;Tümünü Kabul Et&quot; seçip gezindikçe grafik burada dolacaktır.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} />
                <YAxis stroke="#a1a1aa" fontSize={11} />
                <Tooltip contentStyle={{ background: '#111216', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12 }} />
                <Bar dataKey="avgSec" name="Ort. Kalma Süresi (sn)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="views" name="Görüntüleme" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Dwell Table + Top Interests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6 space-y-3">
          <h3 className="font-display text-base font-bold text-white">Hangi Ekranda Ne Kadar Kalınıyor?</h3>
          {(report?.topByDwellTime || []).length === 0 ? (
            <p className="text-xs text-zinc-400 py-6 text-center">Henüz ekran kalma süresi kaydı yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-400 uppercase">
                    <th className="py-2 pr-3">Ekran</th>
                    <th className="py-2 px-2">Ziyaret</th>
                    <th className="py-2 px-2">Ort. Süre</th>
                    <th className="py-2 pl-2 text-right">Toplam Süre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {(report?.topByDwellTime || []).map((row) => (
                    <tr key={row.path}>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-white">{labelForPath(row.path)}</div>
                        <div className="font-mono text-[10px] text-zinc-400">{row.path}</div>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-zinc-200">{row.views}</td>
                      <td className="py-2.5 px-2 font-mono font-bold text-amber-300">{row.avgDwellSec} sn</td>
                      <td className="py-2.5 pl-2 font-mono text-right text-emerald-300">{row.totalDwellSec} sn</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6 space-y-3">
          <h3 className="font-display text-base font-bold text-white">En Çok İlgi Çeken Buton, Paket &amp; İşlemler</h3>
          {(report?.topInterests || []).length === 0 ? (
            <p className="text-xs text-zinc-400 py-6 text-center">Henüz etkileşim tıklaması kaydedilmedi.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {(report?.topInterests || []).map((item, idx) => (
                <div
                  key={item.label}
                  className="p-3 rounded-xl bg-[#09090b] border border-white/[0.06] flex items-center justify-between text-xs gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-white truncate">
                      #{idx + 1} {item.label}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      Ekran: {labelForPath(item.lastPath)} ({item.lastPath})
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 font-mono font-bold text-amber-300 shrink-0">
                    {item.clicks} tık
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
