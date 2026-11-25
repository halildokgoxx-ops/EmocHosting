import fs from 'fs';
import net from 'net';
import path from 'path';
import admin from 'firebase-admin';
import { ENV } from '../config/env.js';
import { DEFAULT_TOS_TEXT, DEFAULT_KVKK_TEXT, DEFAULT_SEO_CONFIG, LEGAL_VERSION } from './legalSeed.js';

let app;
let auth;
let db;
let firebaseStatus = {
  initialized: false,
  mode: ENV.FIREBASE_MODE,
  projectId: ENV.FIREBASE_PROJECT_ID,
  error: null,
};

function resolveServiceAccount() {
  if (ENV.FIREBASE_CLIENT_EMAIL && ENV.FIREBASE_PRIVATE_KEY && ENV.FIREBASE_PROJECT_ID) {
    return {
      projectId: ENV.FIREBASE_PROJECT_ID,
      clientEmail: ENV.FIREBASE_CLIENT_EMAIL,
      privateKey: ENV.FIREBASE_PRIVATE_KEY
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .trim(),
    };
  }

  const candidatePaths = [
    path.resolve(ENV.SERVER_DIR, ENV.FIREBASE_SERVICE_ACCOUNT_PATH),
    path.resolve(ENV.ROOT_DIR, ENV.FIREBASE_SERVICE_ACCOUNT_PATH),
    path.resolve(ENV.ROOT_DIR, 'serviceAccountKey.json'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      return raw;
    }
  }
  return null;
}

export function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    app = admin.app();
    auth = admin.auth();
    db = admin.firestore();
    return { app, auth, db, status: firebaseStatus };
  }

  const serviceAccount = resolveServiceAccount();
  const isCloudMode = ENV.FIREBASE_MODE === 'cloud';

  if (serviceAccount && isCloudMode) {
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    // Wrap cert() in try-catch — Node 24 / OpenSSL 3 may reject PKCS#1 keys.
    // Fall through to no-credential mode if parsing fails.
    let certCredential = null;
    try {
      certCredential = admin.credential.cert(serviceAccount);
    } catch (certErr) {
      console.warn('[Firebase] Service account key parse hatası, no-credential moda düşülüyor:', certErr.message);
    }
    const projectId = serviceAccount.project_id || serviceAccount.projectId || ENV.FIREBASE_PROJECT_ID;
    if (certCredential) {
      app = admin.initializeApp({ credential: certCredential, projectId });
      firebaseStatus = { initialized: true, mode: 'cloud', hasAdminCredentials: true, projectId, error: null };
    } else {
      // Fall through to no-credential cloud mode
      app = admin.initializeApp({ projectId });
      firebaseStatus = { initialized: true, mode: 'cloud-no-sa', hasAdminCredentials: false, projectId,
        error: 'Service account key parse edilemedi; Auth-only mod aktif.' };
    }
  } else if (isCloudMode) {
    // Cloud mode without serviceAccountKey: use applicationDefault if available,
    // otherwise fall back to no-credential init (auth token verify still works via Google public certs).
    // IMPORTANT: Never set emulator env vars in cloud mode — this causes token signature errors.
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;

    let credential;
    try {
      credential = admin.credential.applicationDefault();
    } catch {
      credential = null;
    }

    const initOpts = { projectId: ENV.FIREBASE_PROJECT_ID || 'emochosting' };
    if (credential) initOpts.credential = credential;

    app = admin.initializeApp(initOpts);
    firebaseStatus = {
      initialized: true,
      mode: 'cloud-no-sa',
      hasAdminCredentials: Boolean(credential),
      projectId: ENV.FIREBASE_PROJECT_ID || 'emochosting',
      error: credential ? null : 'serviceAccountKey.json bulunamadı; sadece Auth token doğrulama aktif.',
    };
  } else {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = ENV.FIREBASE_AUTH_EMULATOR_HOST;
    process.env.FIRESTORE_EMULATOR_HOST = ENV.FIRESTORE_EMULATOR_HOST;
    app = admin.initializeApp({
      projectId: ENV.FIREBASE_PROJECT_ID || 'demo-emochosting',
    });
    firebaseStatus = {
      initialized: true,
      mode: 'emulator',
      hasAdminCredentials: false,
      projectId: ENV.FIREBASE_PROJECT_ID || 'demo-emochosting',
      authEmulatorHost: ENV.FIREBASE_AUTH_EMULATOR_HOST,
      firestoreEmulatorHost: ENV.FIRESTORE_EMULATOR_HOST,
      error: null,
    };
  }

  auth = admin.auth();
  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  return { app, auth, db, status: firebaseStatus };
}

initFirebaseAdmin();

export async function verifyFirebaseToken(token) {
  const canCheckRevoked =
    firebaseStatus.mode === 'emulator' || firebaseStatus.hasAdminCredentials === true;
  return auth.verifyIdToken(token, canCheckRevoked);
}

export { admin, app, auth, db, firebaseStatus };

export async function writeAuditLog({ actorEmail, actorUid = 'system', action, targetType, targetId = '', details = {} }) {
  try {
    await db.collection('audit_logs').add({
      actorEmail: actorEmail || 'system',
      actorUid,
      action,
      targetType,
      targetId: String(targetId || ''),
      details,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
}

export async function logServerActivity(serverId, { actorEmail = 'system', action, category = 'system', details = {} }) {
  if (!serverId) return;
  try {
    await db
      .collection('servers')
      .doc(String(serverId))
      .collection('activity_logs')
      .add({
        actorEmail,
        action,
        category,
        details,
        createdAt: Date.now(),
      });
  } catch (err) {
    console.warn('[ActivityLog] Failed:', err.message);
  }
}

export async function seedInitialDataIfNeeded() {
  try {
    if (firebaseStatus.mode === 'emulator' || firebaseStatus.firestoreEmulatorHost) {
      const [h, p] = String(ENV.FIRESTORE_EMULATOR_HOST || 'localhost:8080').split(':');
      const ok = await new Promise((resolve) => {
        const s = net.createConnection({ host: h || '127.0.0.1', port: Number(p || 8080), timeout: 500 });
        s.on('connect', () => { s.destroy(); resolve(true); });
        s.on('error', () => resolve(false));
        s.on('timeout', () => { s.destroy(); resolve(false); });
      });
      if (!ok) {
        console.warn('[Firebase Seed] Firestore Emulator port 8080 henuz acik degil; 5sn icinde yeniden denenecek.');
        setTimeout(() => seedInitialDataIfNeeded(), 5000);
        return;
      }
    }
    const configRef = db.collection('system_config').doc('global');
    const configSnap = await configRef.get();

    if (!configSnap.exists) {
      await configRef.set({
        siteName: 'EmoçHosting',
        siteTagline: 'Minecraft, Discord Bot, Website & Altyapı sunucularını Davet Puanı (İnvite) sistemiyle saniyeler içinde yönetin.',
        maintenanceMode: false,
        maintenanceMessage: 'Sistemlerimiz şu anda performans ve kapasite yükseltmesi için kısa süreli bakımda. Çok yakında yeniden yayındayız.',
        discordInviteUrl: 'https://discord.gg/emochosting',
        supportEmail: 'destek@emochosting.com',
        announcementBanner: 'EmoçHosting Açılışa Özel! EMOC15 kuponu ile tüm paketlerde %15 anında İnvite indirimi!',
        announcementType: 'promo',
        announcementActive: true,
        registrationOpen: true,
        onlyOwnerAdminMode: false,
        defaultStartingBalance: 0,
        inviteRewardInviter: 25,
        inviteRewardInvited: 15,
        invitePromoActive: true,
        flashSalePercent: 0,
        flashSaleTitle: '',
        flashSaleEndsAt: null,
        nightMarketEnabled: true,
        nightMarketCooldownDays: 7,
        nightMarketBoxCount: 3,
        maxServersPerUser: 10,
        maxUploadMb: 100,
        autoSuspendExpired: true,
        autoRestartCrashed: true,
        cpuAlertThresholdPct: 85,
        ramAlertThresholdPct: 90,
        globalMaxRamMb: 65536,
        legalVersion: LEGAL_VERSION,
        tosText: DEFAULT_TOS_TEXT,
        privacyText: DEFAULT_KVKK_TEXT,
        ...DEFAULT_SEO_CONFIG,
        socialLinks: {
          github: 'https://github.com',
          youtube: 'https://youtube.com',
          instagram: 'https://instagram.com',
        },
        updatedAt: Date.now(),
      });
    } else {
      const existing = configSnap.data() || {};
      const upgrades = {};
      if (existing.siteName === 'emoçhosting') upgrades.siteName = 'EmoçHosting';
      if (typeof existing.announcementBanner === 'string' && existing.announcementBanner.includes('emoçhosting')) {
        upgrades.announcementBanner = existing.announcementBanner.replaceAll('emoçhosting', 'EmoçHosting');
      }
      if (!existing.tosText || existing.tosText.length < 300 || Number(existing.legalVersion || 0) < LEGAL_VERSION) {
        upgrades.tosText = DEFAULT_TOS_TEXT;
        upgrades.legalVersion = LEGAL_VERSION;
      }
      if (!existing.privacyText || existing.privacyText.length < 300 || Number(existing.legalVersion || 0) < LEGAL_VERSION) {
        upgrades.privacyText = DEFAULT_KVKK_TEXT;
        upgrades.legalVersion = LEGAL_VERSION;
      }
      if (!existing.supportEmail || existing.supportEmail === 'halildokgoxx@gmail.com') {
        upgrades.supportEmail = 'destek@emochosting.com';
      }
      if (!existing.seoTitle || Number(existing.legalVersion || 0) < LEGAL_VERSION) {
        upgrades.seoTitle = DEFAULT_SEO_CONFIG.seoTitle;
        upgrades.seoDescription = DEFAULT_SEO_CONFIG.seoDescription;
        upgrades.seoKeywords = DEFAULT_SEO_CONFIG.seoKeywords;
      }
      if (!existing.ogImageUrl) upgrades.ogImageUrl = DEFAULT_SEO_CONFIG.ogImageUrl;
      if (existing.nightMarketEnabled === undefined) upgrades.nightMarketEnabled = true;
      if (existing.nightMarketCooldownDays === undefined) upgrades.nightMarketCooldownDays = 7;
      if (existing.nightMarketBoxCount === undefined) upgrades.nightMarketBoxCount = 3;
      if (Object.keys(upgrades).length > 0) {
        await configRef.update({ ...upgrades, updatedAt: Date.now() });
      }
    }

    const pkgSnap = await db.collection('packages').limit(1).get();
    if (pkgSnap.empty) {
      const defaultPackages = [
        // Minecraft Host
        {
          id: 'mc-starter',
          category: 'minecraft',
          name: 'MC Demir Çekirdek',
          description: 'Arkadaş grubu ve vanilla/PaperMC SMP sunucuları için ultra düşük gecikmeli başlangıç paketi.',
          priceDaily: 8,
          priceWeekly: 45,
          priceMonthly: 149,
          ramMb: 2048,
          cpuCores: 2,
          cpuLimitPct: 200,
          diskMb: 10240,
          slotsOrPorts: 20,
          bandwidthGb: 1000,
          backupsLimit: 3,
          badge: 'Başlangıç',
          featured: false,
          active: true,
          paused: false,
          sortOrder: 1,
          salesCount: 0,
          createdAt: Date.now(),
        },
        {
          id: 'mc-pro',
          category: 'minecraft',
          name: 'MC Elmas Ultra',
          description: 'Yüksek eklentili Towny, Skyblock veya Modlu sunucular için Ryzen 9 sınıfı tam güç.',
          priceDaily: 16,
          priceWeekly: 89,
          priceMonthly: 299,
          ramMb: 6144,
          cpuCores: 4,
          cpuLimitPct: 400,
          diskMb: 30720,
          slotsOrPorts: 100,
          bandwidthGb: 5000,
          backupsLimit: 8,
          badge: 'En Popüler',
          featured: true,
          active: true,
          paused: false,
          sortOrder: 2,
          salesCount: 0,
          createdAt: Date.now(),
        },
        {
          id: 'mc-titan',
          category: 'minecraft',
          name: 'MC Netherite Network',
          description: 'Büyük topluluk ağları ve Velocity/BungeeCord hub altyapıları için devasa RAM ve NVMe.',
          priceDaily: 29,
          priceWeekly: 165,
          priceMonthly: 549,
          ramMb: 12288,
          cpuCores: 6,
          cpuLimitPct: 600,
          diskMb: 61440,
          slotsOrPorts: 500,
          bandwidthGb: 10000,
          backupsLimit: 15,
          badge: 'Pro Ağ',
          featured: false,
          active: true,
          paused: false,
          sortOrder: 3,
          salesCount: 0,
          createdAt: Date.now(),
        },
        // Website Host
        {
          id: 'web-flash',
          category: 'web',
          name: 'Web NVMe Başlangıç',
          description: 'Kişisel portföy, landing page ve statik/SPA web projeleri için anında yayın.',
          priceDaily: 4,
          priceWeekly: 22,
          priceMonthly: 69,
          ramMb: 512,
          cpuCores: 1,
          cpuLimitPct: 100,
          diskMb: 5120,
          slotsOrPorts: 1,
          bandwidthGb: 500,
          backupsLimit: 3,
          badge: 'Ekonomik',
          featured: false,
          active: true,
          paused: false,
          sortOrder: 4,
          salesCount: 0,
          createdAt: Date.now(),
        },
        {
          id: 'web-cloud',
          category: 'web',
          name: 'Web Cloud Turbo',
          description: 'Yüksek trafikli kurumsal siteler, Node.js web uygulamaları ve özel SSL/CORS yönetimi.',
          priceDaily: 9,
          priceWeekly: 49,
          priceMonthly: 159,
          ramMb: 2048,
          cpuCores: 2,
          cpuLimitPct: 200,
          diskMb: 20480,
          slotsOrPorts: 5,
          bandwidthGb: 3000,
          backupsLimit: 10,
          badge: 'Hızlı Yayın',
          featured: true,
          active: true,
          paused: false,
          sortOrder: 5,
          salesCount: 0,
          createdAt: Date.now(),
        },
        // Discord Bot Host
        {
          id: 'bot-spark',
          category: 'discord',
          name: 'Discord Bot Spark',
          description: 'Discord.js v14 ve discord.py botlarınız için 7/24 kesintisiz canlı konsol ve .env kasa.',
          priceDaily: 3,
          priceWeekly: 18,
          priceMonthly: 49,
          ramMb: 512,
          cpuCores: 1,
          cpuLimitPct: 100,
          diskMb: 2048,
          slotsOrPorts: 1,
          bandwidthGb: 500,
          backupsLimit: 3,
          badge: '7/24 Aktif',
          featured: false,
          active: true,
          paused: false,
          sortOrder: 6,
          salesCount: 0,
          createdAt: Date.now(),
        },
        {
          id: 'bot-hyper',
          category: 'discord',
          name: 'Discord Bot Hyper Sharding',
          description: 'Müzik, AI ses, moderasyon ve çoklu sunucu botları için yüksek bellekli profesyonel motor.',
          priceDaily: 7,
          priceWeekly: 39,
          priceMonthly: 119,
          ramMb: 2048,
          cpuCores: 2,
          cpuLimitPct: 200,
          diskMb: 8192,
          slotsOrPorts: 3,
          bandwidthGb: 2000,
          backupsLimit: 7,
          badge: 'En Çok Seçilen',
          featured: true,
          active: true,
          paused: false,
          sortOrder: 7,
          salesCount: 0,
          createdAt: Date.now(),
        },
        // Altyapı Host
        {
          id: 'infra-core',
          category: 'altyapi',
          name: 'Altyapı Node/Python Core',
          description: 'API servisleri, otomasyon işleri, cron motorları ve özel backend projeleri için tam kontrol.',
          priceDaily: 12,
          priceWeekly: 65,
          priceMonthly: 219,
          ramMb: 4096,
          cpuCores: 3,
          cpuLimitPct: 300,
          diskMb: 25600,
          slotsOrPorts: 3,
          bandwidthGb: 5000,
          backupsLimit: 10,
          badge: 'Geliştirici',
          featured: true,
          active: true,
          paused: false,
          sortOrder: 8,
          salesCount: 0,
          createdAt: Date.now(),
        },
        {
          id: 'infra-enterprise',
          category: 'altyapi',
          name: 'Altyapı Dedicated Cluster',
          description: 'Yüksek eşzamanlı API, oyun backendi ve yoğun veri işleme servisleri için üst seviye node.',
          priceDaily: 24,
          priceWeekly: 135,
          priceMonthly: 449,
          ramMb: 8192,
          cpuCores: 6,
          cpuLimitPct: 600,
          diskMb: 51200,
          slotsOrPorts: 10,
          bandwidthGb: 10000,
          backupsLimit: 20,
          badge: 'Kurumsal',
          featured: false,
          active: true,
          paused: false,
          sortOrder: 9,
          salesCount: 0,
          createdAt: Date.now(),
        },
      ];

      const batch = db.batch();
      for (const pkg of defaultPackages) {
        const { id, ...data } = pkg;
        batch.set(db.collection('packages').doc(id), data);
      }
      await batch.commit();
    }

    const couponSnap = await db.collection('coupons').limit(1).get();
    if (couponSnap.empty) {
      await db.collection('coupons').doc('EMOC15').set({
        code: 'EMOC15',
        discountType: 'percent',
        value: 15,
        minAmount: 0,
        maxUses: 500,
        usedCount: 0,
        categoryFilter: 'all',
        active: true,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 90,
        createdBy: ENV.OWNER_ADMIN_EMAIL,
        createdAt: Date.now(),
      });
    }

    const templateSnap = await db.collection('starter_templates').limit(1).get();
    if (templateSnap.empty) {
      const templates = [
        {
          id: 'web-neon-portfolio',
          category: 'web',
          name: 'Cyber Neon Portföy',
          description: 'Modern animasyonlu karanlık tema tanıtım sayfası',
          active: true,
        },
        {
          id: 'web-coming-soon',
          category: 'web',
          name: 'Yakında Yayındayız',
          description: 'Geri sayımlı şık açılış ekranı',
          active: true,
        },
        {
          id: 'bot-discordjs-v14',
          category: 'discord',
          name: 'Discord.js v14 Başlangıç Botu',
          description: 'Ping ve durum komutlu hazır Node.js botu',
          active: true,
        },
        {
          id: 'bot-python-py',
          category: 'discord',
          name: 'Discord.py Python Botu',
          description: 'Python async bot iskeleti',
          active: true,
        },
      ];
      const batch = db.batch();
      for (const t of templates) {
        const { id, ...data } = t;
        batch.set(db.collection('starter_templates').doc(id), data);
      }
      await batch.commit();
    }

    const incidentSnap = await db.collection('incidents').limit(1).get();
    if (incidentSnap.empty) {
      await db.collection('incidents').add({
        title: 'Tüm İstanbul & Avrupa Düğüm Noktaları Çevrimiçi',
        message: 'NVMe kümesi, Java 21 oyun düğümleri ve Discord Bot süreç motorları sorunsuz hizmet veriyor.',
        severity: 'operational',
        status: 'resolved',
        createdBy: ENV.OWNER_ADMIN_EMAIL,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  } catch (err) {
    console.warn('[Firebase Seed] Emulator/Firebase henuz erisilebilir degilse daha sonra tekrar denenecek:', err.message);
  }
}
