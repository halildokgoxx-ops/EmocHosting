import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { EmoLogo } from '../components/icons/EmoLogo';
import { FALLBACK_TOS_TEXT, FALLBACK_KVKK_TEXT } from '../data/legalTexts';

export function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'register' ? 'register' : 'login';
  const refFromUrl = searchParams.get('ref') || '';

  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [referralCode, setReferralCode] = useState(refFromUrl);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedKvkk, setAcceptedKvkk] = useState(false);
  const [legalModal, setLegalModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const { login, register, loginWithGoogle, resetPassword, firebaseUser, bootstrap } = useAuth();
  const cfg = bootstrap?.config || {};
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (refFromUrl) {
      localStorage.setItem('emoc_ref_code', refFromUrl.toUpperCase());
      setTab('register');
    }
  }, [refFromUrl]);

  useEffect(() => {
    if (firebaseUser) navigate('/servers');
  }, [firebaseUser, navigate]);

  useEffect(() => {
    if (!legalModal) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLegalModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [legalModal]);

  function translateError(err) {
    const code = err?.code || '';
    if (code.includes('email-already-in-use')) return 'Bu e-posta adresi zaten kayıtlı.';
    if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'E-posta veya şifre hatalı.';
    if (code.includes('user-not-found')) return 'Bu e-posta ile kayıtlı kullanıcı bulunamadı.';
    if (code.includes('weak-password')) return 'Şifre en az 6 karakter olmalıdır.';
    if (code.includes('user-disabled')) return 'Bu hesap yönetici tarafından devre dışı bırakılmıştır.';
    return err?.message || 'Kimlik doğrulama hatası';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (tab === 'register' && (!acceptedTerms || !acceptedKvkk)) {
      toast.warning('Kayıt olabilmek için Hizmet Kullanım Şartları (ToS) ve KVKK Aydınlatma Metnini onaylamalısınız.');
      return;
    }

    setBusy(true);
    try {
      if (tab === 'login') {
        await login(email, password);
        toast.success('Hoş geldiniz! Oturum açıldı.');
        navigate('/servers');
      } else if (tab === 'register') {
        await register({
          email,
          password,
          displayName,
          referralCode,
          acceptedTerms,
          acceptedKvkk,
        });
        toast.success('Hesabınız EmoçHosting üzerinde oluşturuldu!');
        navigate('/servers');
      } else {
        await resetPassword(email);
        toast.success('Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.');
        setTab('login');
      }
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (tab === 'register' && (!acceptedTerms || !acceptedKvkk)) {
      toast.warning('Kayıt için Hizmet Şartları ve KVKK kutucuklarını işaretlemelisiniz.');
      return;
    }
    setBusy(true);
    try {
      await loginWithGoogle({ acceptedLegal: tab === 'register' || (acceptedTerms && acceptedKvkk) });
      toast.success('Google ile giriş başarılı!');
      navigate('/servers');
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative z-10 min-h-[82vh] flex items-center justify-center px-4 py-12">
      <SeoHead
        title="Giriş & Kayıt Ol"
        description="EmoçHosting hesabınıza güvenle giriş yapın, yeni hesap oluşturun veya şifrenizi sıfırlayın."
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel max-w-md w-full rounded-2xl p-6 sm:p-8 space-y-6"
      >
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <EmoLogo size={42} showText />
          </div>
          <p className="text-xs text-zinc-400">
            EmoçHosting güvenli hesap erişimi
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs font-bold">
          {[
            { id: 'login', label: 'Giriş Yap' },
            { id: 'register', label: 'Kayıt Ol' },
            { id: 'reset', label: 'Şifre Sıfırla' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`py-2 rounded-lg transition ${
                tab === t.id ? 'bg-amber-500 text-zinc-950 shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label htmlFor="auth-display-name" className="block text-xs font-semibold text-zinc-300 mb-1.5">Kullanıcı / Görünen Ad</label>
              <input
                id="auth-display-name"
                type="text"
                required
                minLength={2}
                maxLength={40}
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Örn: AslanOyuncu"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090b] border border-white/10 focus:border-amber-500 outline-none text-sm text-white"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-semibold text-zinc-300 mb-1.5">E-posta Adresi</label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@gmail.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090b] border border-white/10 focus:border-amber-500 outline-none text-sm text-white"
            />
          </div>

          {tab !== 'reset' && (
            <div>
              <label htmlFor="auth-password" className="block text-xs font-semibold text-zinc-300 mb-1.5">Şifre</label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090b] border border-white/10 focus:border-amber-500 outline-none text-sm text-white"
              />
            </div>
          )}

          {tab === 'register' && (
            <>
              <div>
                <label htmlFor="auth-referral-code" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Davet Kodu <span className="text-zinc-400">(İsteğe Bağlı)</span>
                </label>
                <input
                  id="auth-referral-code"
                  type="text"
                  maxLength={24}
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="EMOC-XXXXXX"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090b] border border-white/10 focus:border-amber-500 outline-none text-sm font-mono text-amber-300"
                />
              </div>

              {/* Mandatory ToS & KVKK Acceptance Checkboxes */}
              <div className="space-y-2.5 pt-1 rounded-xl bg-zinc-900/80 border border-white/[0.08] p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-zinc-300 leading-snug">
                  <input
                    type="checkbox"
                    required
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-zinc-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>
                    <button
                      type="button"
                      onClick={() => setLegalModal('tos')}
                      className="text-amber-400 underline hover:text-amber-300 font-semibold"
                    >
                      Hizmet Kullanım Şartlarını (ToS)
                    </button>{' '}
                    okudum ve eksiksiz kabul ediyorum. <span className="text-rose-400">*</span>{' '}
                    <Link to="/kullanim-sartlari" className="text-[11px] text-zinc-400 hover:text-amber-300 underline">(Tam sayfa)</Link>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-zinc-300 leading-snug">
                  <input
                    type="checkbox"
                    required
                    checked={acceptedKvkk}
                    onChange={(e) => setAcceptedKvkk(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-zinc-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>
                    <button
                      type="button"
                      onClick={() => setLegalModal('privacy')}
                      className="text-amber-400 underline hover:text-amber-300 font-semibold"
                    >
                      6698 Sayılı KVKK Aydınlatma Metnini
                    </button>{' '}
                    okudum, verilerimin işlenmesini onaylıyorum. <span className="text-rose-400">*</span>{' '}
                    <Link to="/gizlilik-politikasi" className="text-[11px] text-zinc-400 hover:text-amber-300 underline">(Tam sayfa)</Link>
                  </span>
                </label>
              </div>
            </>
          )}

          <AnimatedButton
            type="submit"
            loading={busy}
            disabled={tab === 'register' && (!acceptedTerms || !acceptedKvkk)}
            className="w-full"
            size="lg"
          >
            {tab === 'login' ? 'Giriş Yap' : tab === 'register' ? 'Sözleşmeleri Onayla ve Kayıt Ol' : 'Sıfırlama Linki Gönder'}
          </AnimatedButton>
        </form>

        <div className="relative py-1 flex items-center">
          <div className="flex-grow border-t border-white/[0.08]" />
          <span className="px-3 text-[11px] text-zinc-500 uppercase">veya</span>
          <div className="flex-grow border-t border-white/[0.08]" />
        </div>

        <AnimatedButton variant="secondary" onClick={handleGoogle} disabled={busy} className="w-full">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-2H12z" />
          </svg>
          <span>Google ile Devam Et</span>
        </AnimatedButton>
      </motion.div>

      {/* Full ToS / KVKK Reader Modal */}
      {legalModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-legal-modal-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLegalModal(null)}
        >
          <div className="glass-panel max-w-2xl w-full rounded-2xl p-6 space-y-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h3 id="auth-legal-modal-title" className="font-display text-lg font-bold text-white shrink-0">
              {legalModal === 'tos' ? 'EmoçHosting Hizmet Kullanım Şartları (ToS)' : '6698 Sayılı KVKK Aydınlatma Metni'}
            </h3>
            <div className="overflow-y-auto pr-2 text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap flex-1">
              {legalModal === 'tos' ? cfg.tosText || FALLBACK_TOS_TEXT : cfg.privacyText || FALLBACK_KVKK_TEXT}
            </div>
            <div className="flex justify-end gap-2 shrink-0 pt-2 border-t border-white/[0.08]">
              <AnimatedButton
                size="sm"
                variant="primary"
                onClick={() => {
                  if (legalModal === 'tos') setAcceptedTerms(true);
                  if (legalModal === 'privacy') setAcceptedKvkk(true);
                  setLegalModal(null);
                }}
              >
                Okudum &amp; Onayla
              </AnimatedButton>
              <AnimatedButton size="sm" variant="ghost" onClick={() => setLegalModal(null)}>
                Kapat
              </AnimatedButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
