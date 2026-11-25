import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  updateProfile,
  updatePassword,
  verifyBeforeUpdateEmail,
  sendEmailVerification,
  updateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { apiRequest, downloadAuthenticatedFile, safeExternalUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import {
  CopyIcon,
  ShieldAdminIcon,
  WalletCoinIcon,
  TrophyIcon,
  BellIcon,
  PluginSparkIcon,
  TrashIcon,
  PlusIcon,
} from '../components/icons/EmoIcons';

const PRESET_AVATARS = [
  { label: 'Aslan Amblemi', url: '/assets/lion-emblem.jpg' },
  { label: 'Siber Amblem', url: '/assets/cyber-emblem.jpg' },
  { label: 'Veri Merkezi', url: '/assets/hero-datacenter.jpg' },
];

export function AccountPage() {
  const { firebaseUser, user, profileData, refreshProfile, logout, isAdmin } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('profile');

  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [prefs, setPrefs] = useState({
    serverPowerAlerts: true,
    giveawayAlerts: true,
    walletAlerts: true,
    changelogPopups: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [createdSecret, setCreatedSecret] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName || firebaseUser?.displayName || '');
    setPhotoURL(user?.photoURL || firebaseUser?.photoURL || '');
    setNewEmail(firebaseUser?.email || '');
    if (user?.preferences) {
      setPrefs({
        serverPowerAlerts: user.preferences.serverPowerAlerts !== false,
        giveawayAlerts: user.preferences.giveawayAlerts !== false,
        walletAlerts: user.preferences.walletAlerts !== false,
        changelogPopups: user.preferences.changelogPopups !== false,
      });
    }
  }, [user, firebaseUser]);

  const loadApiKeys = useCallback(async () => {
    try {
      const d = await apiRequest('/api/auth/api-keys');
      setApiKeys(d.keys || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (firebaseUser && tab === 'notifications_api') {
      loadApiKeys();
    }
  }, [firebaseUser, tab, loadApiKeys]);

  const isPasswordProvider = Boolean(
    firebaseUser?.providerData?.some((p) => p.providerId === 'password')
  );

  const xp = Number(user?.xp || 0);
  const level = Math.floor(xp / 100) + 1;
  const levelProgressPct = xp % 100;

  async function handleProfileSave(e) {
    e.preventDefault();
    const cleanName = displayName.trim();
    if (!cleanName) {
      toast.warning('Kullanıcı adı boş olamaz.');
      return;
    }
    setSavingProfile(true);
    try {
      if (auth.currentUser) {
        const updatePayload = { displayName: cleanName };
        if (photoURL.trim().startsWith('http')) {
          updatePayload.photoURL = photoURL.trim();
        }
        await updateProfile(auth.currentUser, updatePayload).catch(() => {});
      }
      await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        body: { displayName: cleanName, photoURL: photoURL.trim() },
      });
      await refreshProfile();
      toast.success('Profil bilgileriniz güncellendi.');
    } catch (err) {
      toast.error(err.message || 'Profil güncellenemedi.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleEmailChange(e) {
    e.preventDefault();
    const targetEmail = newEmail.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      toast.warning('Geçerli bir e-posta adresi girin.');
      return;
    }
    if (targetEmail === (firebaseUser?.email || '').toLowerCase()) {
      toast.info('Yeni e-posta mevcut e-postanız ile aynı.');
      return;
    }
    if (!emailPassword) {
      toast.warning('Güvenlik için mevcut şifrenizi girin.');
      return;
    }

    setSavingEmail(true);
    try {
      const cred = EmailAuthProvider.credential(firebaseUser.email, emailPassword);
      await reauthenticateWithCredential(auth.currentUser, cred);
      try {
        await verifyBeforeUpdateEmail(auth.currentUser, targetEmail);
        toast.success(`Doğrulama bağlantısı ${targetEmail} adresine gönderildi. Onayladığınızda e-postanız değişecektir.`);
      } catch (innerErr) {
        if (innerErr?.code === 'auth/operation-not-allowed') {
          await updateEmail(auth.currentUser, targetEmail);
          await refreshProfile();
          toast.success('E-posta adresiniz güncellendi.');
        } else {
          throw innerErr;
        }
      }
      setEmailPassword('');
    } catch (err) {
      const msg =
        err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
          ? 'Mevcut şifreniz hatalı.'
          : err?.code === 'auth/email-already-in-use'
          ? 'Bu e-posta adresi başka bir hesapta kullanılıyor.'
          : err.message;
      toast.error(msg);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (!currentPassword) {
      toast.warning('Mevcut şifrenizi girin.');
      return;
    }
    if (newPassword.length < 6) {
      toast.warning('Yeni şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warning('Yeni şifreler eşleşmiyor.');
      return;
    }

    setSavingPassword(true);
    try {
      const cred = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Şifreniz başarıyla değiştirildi.');
    } catch (err) {
      const msg =
        err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
          ? 'Mevcut şifreniz hatalı.'
          : err.message;
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  }

  async function savePreferences(nextPrefs) {
    setPrefs(nextPrefs);
    setSavingPrefs(true);
    try {
      await apiRequest('/api/auth/preferences', { method: 'PATCH', body: nextPrefs });
      await refreshProfile();
      toast.success('Bildirim & gizlilik tercihleri kaydedildi.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPrefs(false);
    }
  }

  async function createApiKey(e) {
    e.preventDefault();
    setCreatingKey(true);
    try {
      const res = await apiRequest('/api/auth/api-keys', {
        method: 'POST',
        body: { label: newKeyLabel || 'Otomasyon Anahtarı' },
      });
      setCreatedSecret(res.secret);
      setNewKeyLabel('');
      toast.success('Yeni API anahtarı oluşturuldu!');
      await loadApiKeys();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeApiKey(id) {
    try {
      await apiRequest(`/api/auth/api-keys/${id}`, { method: 'DELETE' });
      toast.info('API anahtarı iptal edildi.');
      await loadApiKeys();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function exportMyKvkkData() {
    try {
      await downloadAuthenticatedFile('/api/auth/export-my-data', 'emochosting-kvkk-verilerim.json');
    } catch (err) {
      toast.error(err.message);
    }
  }

  const tabs = [
    { id: 'profile', label: 'Profil & Görünüm', icon: PluginSparkIcon },
    { id: 'security', label: 'Güvenlik & E-posta', icon: ShieldAdminIcon },
    { id: 'notifications_api', label: 'Bildirimler & API', icon: BellIcon },
    { id: 'wallet_data', label: 'Cüzdan & KVKK', icon: WalletCoinIcon },
  ];

  const transactions = profileData?.transactions || [];

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <SeoHead title="Hesap Ayarları" noIndex />

      {/* Top Account Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel-luminous rounded-2xl p-5 sm:p-7 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            {safeExternalUrl(photoURL, { allowRelativeAssets: true }) ? (
              <img
                src={safeExternalUrl(photoURL, { allowRelativeAssets: true })}
                alt={displayName || 'Avatar'}
                className="w-16 h-16 rounded-2xl object-cover border border-amber-500/45 shrink-0 shadow-lg"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-zinc-950 font-black text-2xl flex items-center justify-center shrink-0">
                {(user?.displayName || firebaseUser?.email || 'E')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl sm:text-2xl font-black text-white truncate">
                  {user?.displayName || firebaseUser?.displayName || 'EmoçÜye'}
                </h1>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/35">
                  Sv. {level}
                </span>
                {isAdmin && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                    Yönetici
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 truncate">{firebaseUser?.email}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <WalletCoinIcon className="w-3.5 h-3.5" />
                  {Number(user?.balance || 0).toFixed(2)} İnvite
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-300">
                  <TrophyIcon className="w-3.5 h-3.5 text-amber-400" />
                  {xp} XP
                </span>
                <span className="text-zinc-500">• {profileData?.serverCount || 0} Sunucu</span>
                {user?.referralCode && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(user.referralCode);
                      toast.success(`Davet kodu kopyalandı: ${user.referralCode}`);
                    }}
                    className="inline-flex items-center gap-1 font-mono text-zinc-400 hover:text-amber-300 transition"
                  >
                    <span>{user.referralCode}</span>
                    <CopyIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <AnimatedButton variant="danger" size="sm" onClick={logout} className="self-start sm:self-center">
            Oturumu Kapat
          </AnimatedButton>
        </div>

        {/* Animated XP Progress Bar */}
        <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
          <div className="flex justify-between text-[11px] font-mono text-zinc-400">
            <span>Seviye {level} İlerlemesi</span>
            <span className="text-amber-300">{levelProgressPct} / 100 XP</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-900 border border-white/[0.06] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${levelProgressPct}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
            />
          </div>
        </div>
      </motion.div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                active
                  ? 'bg-amber-500/15 border-amber-500/45 text-amber-200'
                  : 'bg-zinc-900 border-white/[0.08] text-zinc-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Animated Tab Panels */}
      <AnimatePresence mode="wait">
        {tab === 'profile' && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-5"
          >
            <form onSubmit={handleProfileSave} className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">Profil &amp; Kullanıcı Adı</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Panelde ve liderlik tablosunda görünen adınızı ve avatarınızı seçin.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Kullanıcı Adı (Görünen Ad)</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={40}
                  required
                  placeholder="Örn: EmoçBey"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-300">Hazır EmoçHosting Avatarları</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_AVATARS.map((av) => (
                    <button
                      type="button"
                      key={av.url}
                      onClick={() => setPhotoURL(av.url)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs transition ${
                        photoURL === av.url
                          ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                          : 'border-white/10 bg-zinc-950 text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      <img src={av.url} alt={`${av.label} avatarı`} width={20} height={20} loading="lazy" className="w-5 h-5 rounded-md object-cover" />
                      <span>{av.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Özel Profil Fotoğrafı URL</label>
                <input
                  type="text"
                  value={photoURL}
                  onChange={(e) => setPhotoURL(e.target.value)}
                  placeholder="https://... veya /assets/lion-emblem.jpg"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>

              <AnimatedButton type="submit" variant="primary" loading={savingProfile} className="w-full sm:w-auto">
                Profili Kaydet
              </AnimatedButton>
            </form>

            {/* Badges & Account Showcase */}
            <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-white">Kazanılan Rozetler &amp; İstatistikler</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Platform üzerindeki etkinlik ve davet başarımlarınız.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(user?.badges || ['Üye']).map((badge, i) => (
                  <motion.span
                    key={badge}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-200 text-xs font-bold flex items-center gap-1.5"
                  >
                    <TrophyIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>{badge}</span>
                  </motion.span>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
                <div className="p-3.5 rounded-xl bg-[#09090b] border border-white/[0.06]">
                  <div className="text-zinc-500">Toplam Harcama</div>
                  <div className="font-display text-lg font-black text-white mt-0.5">{Number(user?.totalSpent || 0).toFixed(2)} İnvite</div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#09090b] border border-white/[0.06]">
                  <div className="text-zinc-500">Başarılı Davet</div>
                  <div className="font-display text-lg font-black text-emerald-400 mt-0.5">{user?.referralCount || 0} Üye</div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#09090b] border border-white/[0.06]">
                  <div className="text-zinc-500">Kayıt Tarihi</div>
                  <div className="font-mono text-zinc-200 mt-0.5">
                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('tr-TR') : '-'}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#09090b] border border-white/[0.06]">
                  <div className="text-zinc-500">Davet Kazancı</div>
                  <div className="font-display text-lg font-black text-amber-300 mt-0.5">{user?.referralEarnings || 0} İnvite</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {tab === 'security' && (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-5"
          >
            {/* Email Change */}
            <form onSubmit={handleEmailChange} className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">E-posta Adresini Değiştir</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Yeni e-postaya doğrulama bağlantısı gönderilir; onayladığınızda aktif olur.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Yeni E-posta Adresi</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  placeholder="yeni@eposta.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>

              {isPasswordProvider ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Mevcut Şifreniz (Doğrulama)</label>
                  <input
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:border-amber-500/50 outline-none"
                  />
                </div>
              ) : (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
                  Google ile giriş yaptığınız için e-posta değişikliğini Google hesabınızdan yönetebilirsiniz.
                </div>
              )}

              <AnimatedButton
                type="submit"
                variant="secondary"
                loading={savingEmail}
                disabled={!isPasswordProvider}
                className="w-full sm:w-auto"
              >
                E-postayı Güncelle
              </AnimatedButton>
            </form>

            {/* Password Change */}
            <form onSubmit={handlePasswordChange} className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldAdminIcon className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="font-display text-lg font-bold text-white">Şifre Değiştir</h2>
                  <p className="text-xs text-zinc-400">Güçlü ve benzersiz bir şifre belirleyin (en az 6 karakter).</p>
                </div>
              </div>

              {isPasswordProvider ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Mevcut Şifre</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:border-amber-500/50 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-300">Yeni Şifre</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="En az 6 karakter"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:border-amber-500/50 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-300">Yeni Şifre (Tekrar)</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="Tekrar girin"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:border-amber-500/50 outline-none"
                      />
                    </div>
                  </div>

                  <AnimatedButton type="submit" variant="primary" loading={savingPassword} className="w-full sm:w-auto">
                    Şifreyi Güncelle
                  </AnimatedButton>
                </>
              ) : (
                <div className="text-xs text-zinc-400 bg-zinc-900 border border-white/[0.08] rounded-xl p-3">
                  Bu hesap Google OAuth ile bağlı olduğu için şifre yönetimi Google üzerinden yapılır.
                </div>
              )}
            </form>

            {/* Security Summary */}
            <div className="lg:col-span-2 glass-panel rounded-2xl p-5 sm:p-6 space-y-3">
              <h2 className="font-display text-lg font-bold text-white">Hesap &amp; Güvenlik Özeti</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-white/[0.06] flex justify-between gap-2">
                  <span className="text-zinc-400">Hesap Kimliği</span>
                  <span className="font-mono text-zinc-200 truncate">{firebaseUser?.uid}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-white/[0.06] flex items-center justify-between gap-2">
                  <span className="text-zinc-400">E-posta Durumu</span>
                  <div className="flex items-center gap-2">
                    <span className={firebaseUser?.emailVerified ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                      {firebaseUser?.emailVerified ? 'Doğrulandı' : 'Beklemede'}
                    </span>
                    {!firebaseUser?.emailVerified && firebaseUser && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await sendEmailVerification(firebaseUser);
                            toast.success('Doğrulama e-postası gönderildi! Gelen kutunuzu ve spam klasörünü kontrol edin.');
                          } catch (err) {
                            toast.error(err.message);
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35 hover:bg-amber-500/30 font-semibold"
                      >
                        Doğrula
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-white/[0.06] flex justify-between gap-2">
                  <span className="text-zinc-400">ToS &amp; KVKK</span>
                  <span className={user?.acceptedTermsAt ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}>
                    {user?.acceptedTermsAt ? 'Onaylandı' : 'Kayıtlı'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {tab === 'notifications_api' && (
          <motion.div
            key="notifications_api"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-5"
          >
            {/* Notification Preferences */}
            <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">Bildirim &amp; Görünüm Tercihleri</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Hangi olaylarda anlık bildirim almak istediğinizi seçin.</p>
              </div>

              <div className="space-y-2.5 text-xs">
                {[
                  { key: 'serverPowerAlerts', title: 'Sunucu Açılma / Kapanma Bildirimleri', desc: 'Sunucu güç durumu değiştiğinde anında bildir' },
                  { key: 'giveawayAlerts', title: 'Çekiliş Başlangıç & Kazanç Bildirimleri', desc: 'Yeni çekilişler ve kazanılan ödüller için uyar' },
                  { key: 'walletAlerts', title: 'Bakiye & Finans Hareketleri', desc: 'Hesabınıza bakiye eklendiğinde bildirim al' },
                  { key: 'changelogPopups', title: 'Güncelleme Notları Penceresi', desc: 'Yeni sürüm notları yayınlandığında modal aç' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#09090b] border border-white/[0.06] cursor-pointer hover:border-amber-500/30 transition"
                  >
                    <div>
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="text-zinc-500 mt-0.5">{item.desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(prefs[item.key])}
                      disabled={savingPrefs}
                      onChange={(e) => savePreferences({ ...prefs, [item.key]: e.target.checked })}
                      className="w-4 h-4 accent-amber-500 shrink-0"
                    />
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.07]">
                <AnimatedButton
                  size="xs"
                  variant="secondary"
                  onClick={async () => {
                    if (typeof Notification === 'undefined') return;
                    const p = await Notification.requestPermission();
                    toast.info(`Tarayıcı bildirim izni: ${p}`);
                  }}
                >
                  Tarayıcı Bildirim İzni Kontrol
                </AnimatedButton>
                <AnimatedButton
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    localStorage.removeItem('emoc_push_dismissed');
                    window.dispatchEvent(new Event('emoc:open-cookie-settings'));
                  }}
                >
                  Çerez Tercihlerini Yönet
                </AnimatedButton>
              </div>
            </div>

            {/* Personal API Keys */}
            <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">Kişisel API Anahtarları</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Bot veya scriptlerinizle <code className="text-amber-400">X-API-Key</code> üzerinden sunucularınızı otomatik yönetin.
                </p>
              </div>

              <form onSubmit={createApiKey} className="flex gap-2">
                <label htmlFor="new-api-key-label" className="sr-only">API Anahtar Adı</label>
                <input
                  id="new-api-key-label"
                  required
                  minLength={2}
                  maxLength={50}
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="Anahtar adı (örn: Discord Botum)"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white outline-none focus:border-amber-500/50"
                />
                <AnimatedButton type="submit" size="xs" variant="primary" loading={creatingKey}>
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Oluştur</span>
                </AnimatedButton>
              </form>

              {createdSecret && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35 space-y-2 text-xs">
                  <div className="font-bold text-emerald-300">Yeni Anahtarınız (Güvenlik için yalnızca 1 kez gösterilir):</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/50 text-emerald-200 font-mono truncate">
                      {createdSecret}
                    </code>
                    <AnimatedButton
                      size="xs"
                      variant="emerald"
                      onClick={() => {
                        navigator.clipboard.writeText(createdSecret);
                        toast.success('API anahtarı panoya kopyalandı!');
                      }}
                    >
                      Kopyala
                    </AnimatedButton>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-56 overflow-y-auto text-xs">
                {apiKeys.length === 0 ? (
                  <p className="text-zinc-500 py-4 text-center">Henüz API anahtarınız yok.</p>
                ) : (
                  apiKeys.map((k) => (
                    <div key={k.id} className="p-3 rounded-xl bg-[#09090b] border border-white/[0.06] flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">{k.label}</div>
                        <div className="font-mono text-[11px] text-amber-300">{k.prefix}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => revokeApiKey(k.id)}
                        className="p-1.5 text-rose-400 hover:text-rose-300 shrink-0"
                        title="Anahtarı İptal Et"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}

        {tab === 'wallet_data' && (
          <motion.div
            key="wallet_data"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">KVKK Kişisel Veri Taşınabilirliği</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Hesap profilinizi, sunucularınızı, cüzdan hareketlerinizi ve taleplerinizi JSON olarak indirebilirsiniz.
                </p>
              </div>
              <AnimatedButton size="sm" variant="secondary" onClick={exportMyKvkkData}>
                KVKK Verilerimi İndir (JSON)
              </AnimatedButton>
            </div>

            <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white">Cüzdan &amp; İşlem Geçmişi</h2>
                <span className="font-mono text-sm font-bold text-emerald-400">
                  Bakiye: {Number(user?.balance || 0).toFixed(2)} İnvite
                </span>
              </div>
              {transactions.length === 0 ? (
                <p className="text-xs text-zinc-500 py-8 text-center">Henüz cüzdan hareketi bulunmuyor.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1 text-xs">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="p-3 rounded-xl bg-[#09090b] border border-white/[0.06] flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{tx.note}</div>
                        <div className="text-[10px] font-mono text-zinc-500">
                          {new Date(tx.createdAt).toLocaleString('tr-TR')}
                        </div>
                      </div>
                      <span className={`font-mono font-bold shrink-0 ${tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} İnvite
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
