# EmoçHosting — Yeni Nesil Gerçek Zamanlı Hosting Platformu

## Özellikler
- **Bulut Kimlik Doğrulama & Veritabanı Desteği**: Kullanıcı kayıt/giriş, Google OAuth, e-posta doğrulama/sıfırlama, profil yönetimi, **İnvite** bakiye defteri, kuponlar, davet promosyonları, destek talepleri, duyurular, durum olayları ve denetim kayıtları.
- **4 Ayrı Gerçek Sunucu Motoru & Özel Paneller**:
  1. **Minecraft Host**: Java 21 + PaperMC/Purpur/Vanilla/Forge/Fabric/Velocity dahil 17 çekirdek kurucu, EULA onayı, canlı WebSocket konsol, görsel `server.properties`, `ops/whitelist/ban` listeleri, Modrinth & CurseForge 1-tık eklenti/mod kurulumu, MOTD tasarımcısı, AI teşhis asistanı, dosya yöneticisi, `.zip` yedekleme, zamanlanmış görevler ve canlı ping.
  2. **Website Host**: Gerçek HTTP yayını (`/sites/<slug>/`), canlı trafik & erişim logları, kod editörü (`public_html/`), domain/CORS/Basic-Auth/IP erişim denetimi, Node.js Web App modu, hazır şablonlar.
  3. **Discord Bot Host**: Gerçek Node.js / Python bot süreçleri, `.env` ve gizli Token kasası, canlı `npm install` / `pip install`, şablonlar, otomatik yeniden başlatma (Watchdog), dosya yöneticisi ve `.zip` yedekler.
  4. **Altyapı Node**: Yönetilen Node/Python/Java uygulama motoru, HTTP yönlendirme (`/apps/<slug>/`), `kv.json` veri deposu, `.env`, zamanlanmış görevler.
- **Gizli Kurucu & Yönetim Paneli**:
  - Tüm sunucuların toplam ve tek tek canlı CPU / RAM / Disk tüketimi
  - Üye bakiye (İnvite) ekleme/düşme/sabitleme, yasaklama, yetki verme, rozet/XP yönetimi
  - Paket ekleme/kaldırma/duraklatma, Günlük/Haftalık/Aylık **İnvite** fiyat düzenleme
  - Kupon sistemi, davet promosyonu, Gece Pazarı kutuları, çekiliş sistemi, Flash indirim
  - Çerez rızası oranları, sayfalarda ortalama/toplam kalma süresi ve tıklama ilgi analitiği
  - Bakım modu, Discord Webhook bildirimleri, destek masası, IP ban, yedek deposu, denetim kayıtları ve JSON dışa aktarım.

## Kurulum ve Lokal Çalıştırma (Emulator Modu)

1. **Bağımlılıkları Yükleyin:**
   ```bash
   cd emochosting
   npm run install:all
   ```
2. **Ortam Dosyalarını Oluşturun:**
   ```bash
   cp .env.example .env
   cp client/.env.example client/.env
   ```
   Yerel emülatör testi için `.env` içinde `FIREBASE_MODE=emulator`, `FIREBASE_PROJECT_ID=demo-emochosting` ve `client/.env` içinde `VITE_FIREBASE_MODE=emulator` ayarlayın.
3. **Terminal 1 — Emulator Suite (Java 21 gerekir):**
   ```bash
   npm run emulators
   ```
4. **Terminal 2 — Backend + Frontend Geliştirme Sunucusu:**
   ```bash
   npm run dev
   ```
   - Arayüz: `http://localhost:5173`
   - Backend API: `http://localhost:3001`
   - Emulator UI: `http://localhost:4000`
5. **Üretim Derlemesi ve E2E Doğrulama:**
   ```bash
   npm run build
   npm run test:e2e
   ```

## Canlı Bulut Ortamına Geçiş
1. `.env` içinde `FIREBASE_MODE=cloud`, `FIREBASE_PROJECT_ID=<proje-id>` ayarlayın ve hizmet hesabı JSON dosyasını `server/serviceAccountKey.json` konumuna ekleyin.
2. `client/.env` içinde `VITE_FIREBASE_MODE=cloud` yapıp Web App ayarlarını (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`) doldurun.
3. Güvenlik kurallarını ve indeksleri yayınlayın:
   ```bash
   npx -y firebase-tools@latest deploy --only firestore
   ```
