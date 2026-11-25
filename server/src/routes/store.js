import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ENV } from '../config/env.js';
import { db, writeAuditLog, logServerActivity } from '../services/firebase.js';
import { requireAuth, getSystemConfig } from '../middleware/auth.js';
import { allocateFreePort, provisionServerWorkspace } from '../services/processManager.js';
import { generateSftpPassword } from '../services/sftpServer.js';
import { sendDiscordWebhook } from '../services/webhook.js';
import { assertSafeDocId, sanitizeString } from '../utils/security.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

const ALLOWED_BILLING_CYCLES = new Set(['daily', 'weekly', 'monthly']);

const couponLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  keyFn: (req) => req.user?.uid || req.ip,
});

const billingMutationLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 15,
  keyFn: (req) => req.user?.uid || req.ip,
  message: 'Çok sık satın alma / paket değişikliği isteği gönderdiniz. Lütfen bekleyin.',
});

function assertBillingCycle(cycle) {
  const clean = String(cycle || 'monthly').trim().toLowerCase();
  if (!ALLOWED_BILLING_CYCLES.has(clean)) {
    throw new Error('Geçersiz faturalandırma periyodu (daily, weekly veya monthly olmalı)');
  }
  return clean;
}

function getCycleDetails(pkg, cycle) {
  if (cycle === 'daily') {
    return { price: Number(pkg.priceDaily || Math.ceil(pkg.priceMonthly / 20)), days: 1, label: 'Günlük' };
  }
  if (cycle === 'weekly') {
    return { price: Number(pkg.priceWeekly || Math.ceil(pkg.priceMonthly / 3.5)), days: 7, label: 'Haftalık' };
  }
  return { price: Number(pkg.priceMonthly || 100), days: 30, label: 'Aylık' };
}

function calculateFinalPrice(basePrice, sysCfg, couponDoc = null, category = 'all', requesterUid = null) {
  let price = basePrice;
  let flashDiscount = 0;
  let couponDiscount = 0;

  if (sysCfg?.flashSalePercent > 0 && (!sysCfg.flashSaleEndsAt || Date.now() < sysCfg.flashSaleEndsAt)) {
    flashDiscount = Number(((price * Number(sysCfg.flashSalePercent)) / 100).toFixed(2));
    price = Math.max(0, price - flashDiscount);
  }

  if (couponDoc) {
    if (!couponDoc.active) throw new Error('Kupon aktif değil');
    if (couponDoc.expiresAt && Date.now() > couponDoc.expiresAt) throw new Error('Kupon süresi dolmuş');
    if (couponDoc.ownerUid && requesterUid && couponDoc.ownerUid !== requesterUid) {
      throw new Error('Bu kişisel kupon kodu hesabınıza tanımlı değil');
    }
    if (couponDoc.maxUses && (couponDoc.usedCount || 0) >= couponDoc.maxUses) throw new Error('Kupon kullanım limiti dolmuş');
    if (couponDoc.categoryFilter && couponDoc.categoryFilter !== 'all' && couponDoc.categoryFilter !== category) {
      throw new Error(`Bu kupon sadece ${couponDoc.categoryFilter} kategorisinde geçerli`);
    }
    if (couponDoc.minAmount && basePrice < couponDoc.minAmount) {
      throw new Error(`Bu kupon minimum ${couponDoc.minAmount} İnvite tutarda geçerli`);
    }

    if (couponDoc.discountType === 'fixed') {
      couponDiscount = Math.min(price, Number(couponDoc.value || 0));
    } else {
      couponDiscount = Number(((price * Number(couponDoc.value || 0)) / 100).toFixed(2));
    }
    price = Math.max(0, Number((price - couponDiscount).toFixed(2)));
  }

  return { basePrice, flashDiscount, couponDiscount, finalPrice: Number(price.toFixed(2)) };
}

router.post('/validate-coupon', requireAuth, couponLimiter, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const packageId = assertSafeDocId(req.body?.packageId, 'paket kimliği');
    const billingCycle = assertBillingCycle(req.body?.billingCycle);

    if (!code || !/^[A-Z0-9_-]{2,40}$/.test(code)) {
      return res.status(400).json({ error: 'Geçerli bir kupon kodu girin' });
    }

    const [pkgSnap, couponSnap, sysCfg] = await Promise.all([
      db.collection('packages').doc(packageId).get(),
      db.collection('coupons').doc(code).get(),
      getSystemConfig(),
    ]);

    if (!pkgSnap.exists) return res.status(404).json({ error: 'Paket bulunamadı' });
    if (!couponSnap.exists) return res.status(404).json({ error: 'Geçersiz kupon kodu' });

    const pkg = pkgSnap.data();
    const { price: basePrice } = getCycleDetails(pkg, billingCycle);
    const calc = calculateFinalPrice(basePrice, sysCfg, couponSnap.data(), pkg.category, req.user.uid);
    const cData = couponSnap.data();

    res.json({
      ok: true,
      code,
      ...calc,
      coupon: {
        code: cData.code || code,
        discountType: cData.discountType,
        value: cData.value,
        categoryFilter: cData.categoryFilter || 'all',
        minAmount: cData.minAmount || 0,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/purchase', requireAuth, billingMutationLimiter, async (req, res) => {
  try {
    const packageId = assertSafeDocId(req.body?.packageId, 'paket kimliği');
    const billingCycle = assertBillingCycle(req.body?.billingCycle);
    const cleanName = sanitizeString(req.body?.serverName, { minLen: 2, maxLen: 36 });
    if (!cleanName) return res.status(400).json({ error: 'Lütfen en az 2 karakterli bir sunucu adı belirleyin' });

    const upperCoupon = String(req.body?.couponCode || '').trim().toUpperCase();
    if (upperCoupon && !/^[A-Z0-9_-]{2,40}$/.test(upperCoupon)) {
      return res.status(400).json({ error: 'Geçersiz kupon kodu formatı' });
    }

    const sysCfg = await getSystemConfig();
    const pkgRef = db.collection('packages').doc(packageId);
    const pkgSnap = await pkgRef.get();
    if (!pkgSnap.exists) return res.status(404).json({ error: 'Seçilen paket bulunamadı' });

    const pkg = { id: pkgSnap.id, ...pkgSnap.data() };
    if (pkg.active === false || pkg.paused === true) {
      return res.status(400).json({ error: 'Bu paket şu anda duraklatılmış veya satışa kapalı' });
    }

    const serverId = uuidv4().slice(0, 12);
    const allocatedPort = await allocateFreePort(pkg.category);
    const cleanBase = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'srv';
    const slug = `${cleanBase}-${serverId.slice(0, 4)}`;
    const subdomain = slug;
    const domainAddress = `${subdomain}.${ENV.DOMAIN_SUFFIX}`;
    const { price: basePrice, days } = getCycleDetails(pkg, billingCycle);

    let createdServer = null;
    let pricingSummary = null;

    await db.runTransaction(async (tx) => {
      const userRef = db.collection('users').doc(req.user.uid);
      const userServersQuery = db.collection('servers').where('ownerUid', '==', req.user.uid);
      const portConflictQuery = db.collection('servers').where('port', '==', allocatedPort).limit(1);

      const [userSnap, userServersSnap, portConflictSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(userServersQuery),
        tx.get(portConflictQuery),
      ]);

      if (!userSnap.exists) throw new Error('Kullanıcı bulunamadı');
      const userData = userSnap.data();

      if (!req.user.isAdmin && userServersSnap.size >= Number(sysCfg.maxServersPerUser || 10)) {
        throw new Error(`Maksimum sunucu limitine (${sysCfg.maxServersPerUser || 10}) ulaştınız`);
      }
      if (!portConflictSnap.empty) {
        throw new Error('Port eşzamanlılık çakışması oluştu, lütfen tekrar deneyin');
      }

      let couponDoc = null;
      let couponRef = null;
      if (upperCoupon) {
        couponRef = db.collection('coupons').doc(upperCoupon);
        const cSnap = await tx.get(couponRef);
        if (!cSnap.exists) throw new Error('Girilen kupon kodu bulunamadı');
        couponDoc = cSnap.data();
      }

      pricingSummary = calculateFinalPrice(basePrice, sysCfg, couponDoc, pkg.category, req.user.uid);
      const currentBalance = Number(userData.balance || 0);
      if (currentBalance < pricingSummary.finalPrice) {
        throw new Error(
          `Yetersiz bakiye! Gerekli: ${pricingSummary.finalPrice} İnvite, Mevcut: ${currentBalance} İnvite. Bakiye davet promosyonu veya çekilişlerle kazanılabilir.`
        );
      }

      const now = Date.now();
      const expiresAt = now + days * 24 * 60 * 60 * 1000;

      createdServer = {
        id: serverId,
        slug,
        subdomain,
        domainAddress,
        name: cleanName,
        ownerUid: req.user.uid,
        ownerEmail: req.user.email,
        category: pkg.category,
        packageId: pkg.id,
        packageName: pkg.name,
        billingCycle,
        pricePaid: pricingSummary.finalPrice,
        couponUsed: upperCoupon || null,
        status: 'stopped',
        port: allocatedPort,
        allocatedRamMb: Number(pkg.ramMb || 1024),
        allocatedCpuPct: Number(pkg.cpuLimitPct || 100),
        allocatedDiskMb: Number(pkg.diskMb || 5120),
        slotsOrPorts: Number(pkg.slotsOrPorts || 20),
        backupsLimit: Number(pkg.backupsLimit || 3),
        config: {
          autoRestart: true,
          runtime: pkg.category === 'discord' ? 'node' : pkg.category === 'altyapi' ? 'node' : pkg.category,
          entryFile: pkg.category === 'discord' ? 'index.js' : 'app.js',
          jvmFlags: ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200'],
        },
        scheduledTasks: [],
        collaborators: [],
        collaboratorUids: [],
        sftp: {
          enabled: true,
          username: `srv_${serverId}`,
          password: generateSftpPassword(),
        },
        expiresAt,
        createdAt: now,
        updatedAt: now,
      };

      tx.update(userRef, {
        balance: Number((currentBalance - pricingSummary.finalPrice).toFixed(2)),
        totalSpent: Number((Number(userData.totalSpent || 0) + pricingSummary.finalPrice).toFixed(2)),
        xp: Number(userData.xp || 0) + Math.max(20, Math.round(pricingSummary.finalPrice)),
      });

      tx.update(pkgRef, {
        salesCount: Number(pkg.salesCount || 0) + 1,
      });

      if (couponRef && couponDoc) {
        tx.update(couponRef, {
          usedCount: Number(couponDoc.usedCount || 0) + 1,
        });
      }

      const { id: _ignored, ...serverPayload } = createdServer;
      tx.set(db.collection('servers').doc(serverId), serverPayload);

      tx.set(db.collection('wallet_transactions').doc(), {
        uid: req.user.uid,
        email: req.user.email,
        type: 'server_purchase',
        amount: -pricingSummary.finalPrice,
        note: `${pkg.name} (${billingCycle}) — ${cleanName}`,
        serverId,
        adminEmail: 'system',
        createdAt: now,
      });
    });

    await provisionServerWorkspace(createdServer);

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'SERVER_PURCHASED',
      targetType: 'server',
      targetId: serverId,
      details: { packageId: pkg.id, billingCycle, finalPrice: pricingSummary.finalPrice, port: allocatedPort },
    });

    sendDiscordWebhook({
      title: 'Yeni Sunucu Kuruldu',
      description: `**${req.user.email}** yeni bir **${pkg.name}** (${billingCycle}) sunucusu oluşturdu: **${cleanName}**`,
      color: 0x10b981,
      fields: [
        { name: 'Kategori', value: pkg.category, inline: true },
        { name: 'Ödenen Tutar', value: `${pricingSummary.finalPrice} İnvite`, inline: true },
        { name: 'Port', value: String(allocatedPort), inline: true },
      ],
    });

    res.status(201).json({ ok: true, server: createdServer, pricing: pricingSummary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/renew/:serverId', requireAuth, billingMutationLimiter, async (req, res) => {
  try {
    const serverId = assertSafeDocId(req.params.serverId, 'sunucu kimliği');
    const billingCycle = assertBillingCycle(req.body?.billingCycle);
    const srvRef = db.collection('servers').doc(serverId);

    let newExpiresAt = Date.now();
    let paidPrice = 0;

    await db.runTransaction(async (tx) => {
      const uRef = db.collection('users').doc(req.user.uid);
      const [srvSnap, uSnap] = await Promise.all([tx.get(srvRef), tx.get(uRef)]);
      if (!srvSnap.exists) throw new Error('Sunucu bulunamadı');
      if (!uSnap.exists) throw new Error('Kullanıcı bulunamadı');

      const srv = srvSnap.data();
      if (srv.ownerUid !== req.user.uid && !req.user.isAdmin) {
        throw new Error('Bu sunucuyu yenileme yetkiniz yok');
      }

      const pkgSnap = await tx.get(db.collection('packages').doc(srv.packageId));
      const pkg = pkgSnap.exists ? pkgSnap.data() : { priceMonthly: 100, priceWeekly: 35, priceDaily: 6 };
      const { price, days } = getCycleDetails(pkg, billingCycle);
      paidPrice = price;

      const balance = Number(uSnap.data()?.balance || 0);
      if (balance < price) {
        throw new Error(`Yetersiz bakiye! Yenileme için ${price} İnvite gerekiyor (Mevcut: ${balance} İnvite).`);
      }
      const baseTime = Math.max(Date.now(), Number(srv.expiresAt || Date.now()));
      newExpiresAt = baseTime + days * 24 * 60 * 60 * 1000;

      tx.update(uRef, {
        balance: Number((balance - price).toFixed(2)),
        totalSpent: Number((Number(uSnap.data()?.totalSpent || 0) + price).toFixed(2)),
      });
      tx.update(srvRef, {
        expiresAt: newExpiresAt,
        billingCycle,
        pricePaid: price,
        status: srv.status === 'suspended' ? 'stopped' : srv.status,
        suspendedReason: null,
        updatedAt: Date.now(),
      });
      tx.set(db.collection('wallet_transactions').doc(), {
        uid: req.user.uid,
        email: req.user.email,
        type: 'server_renew',
        amount: -price,
        note: `Süre Uzatma (+${days} gün) — ${srv.name}`,
        serverId,
        adminEmail: 'system',
        createdAt: Date.now(),
      });
    });

    res.json({ ok: true, expiresAt: newExpiresAt, pricePaid: paidPrice });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/change-package/:serverId', requireAuth, billingMutationLimiter, async (req, res) => {
  try {
    const serverId = assertSafeDocId(req.params.serverId, 'sunucu kimliği');
    const newPackageId = assertSafeDocId(req.body?.newPackageId, 'paket kimliği');
    const srvRef = db.collection('servers').doc(serverId);
    const newPkgRef = db.collection('packages').doc(newPackageId);

    let netDelta = 0;
    let nextBalance = 0;
    let newPkg = null;
    let oldPackageId = '';
    let oldPackageName = '';

    await db.runTransaction(async (tx) => {
      const uRef = db.collection('users').doc(req.user.uid);
      const [srvSnap, newPkgSnap, uSnap] = await Promise.all([
        tx.get(srvRef),
        tx.get(newPkgRef),
        tx.get(uRef),
      ]);

      if (!srvSnap.exists) throw new Error('Sunucu bulunamadı');
      if (!newPkgSnap.exists) throw new Error('Hedef paket bulunamadı');
      if (!uSnap.exists) throw new Error('Kullanıcı bulunamadı');

      const srv = srvSnap.data();
      if (srv.ownerUid !== req.user.uid && !req.user.isAdmin) {
        throw new Error('Bu sunucu için paket değiştirme yetkiniz yok');
      }
      if (srv.status === 'suspended') {
        throw new Error('Askıya alınmış sunucularda paket değişikliği yapılamaz');
      }

      newPkg = { id: newPkgSnap.id, ...newPkgSnap.data() };
      if (newPkg.category !== srv.category) {
        throw new Error('Yalnızca aynı ürün kategorisi içinde paket yükseltme/düşürme yapılabilir');
      }
      if (newPkg.id === srv.packageId) {
        throw new Error('Zaten seçili paketi kullanıyorsunuz');
      }
      if (newPkg.active === false || newPkg.paused === true) {
        throw new Error('Hedef paket şu anda duraklatılmış veya satışa kapalı');
      }

      const now = Date.now();
      const remainingMs = Number(srv.expiresAt || 0) - now;
      if (remainingMs <= 0) {
        throw new Error('Süresi dolmuş sunucularda paket değişikliği yapılamaz; önce süreyi uzatın');
      }

      const oldPkgSnap = await tx.get(db.collection('packages').doc(srv.packageId));
      const oldPkg = oldPkgSnap.exists ? oldPkgSnap.data() : { priceMonthly: srv.pricePaid || 100 };

      const cycle = ALLOWED_BILLING_CYCLES.has(srv.billingCycle) ? srv.billingCycle : 'monthly';
      const { price: oldPrice, days } = getCycleDetails(oldPkg, cycle);
      const { price: newPrice } = getCycleDetails(newPkg, cycle);

      const actualRatio = Math.min(1, Math.max(0, remainingMs / (days * 24 * 60 * 60 * 1000)));
      const effectiveOldPrice = Math.min(oldPrice, Math.max(0, Number(srv.pricePaid ?? oldPrice)));

      if (newPrice >= oldPrice) {
        // Upgrades require minimum 15% prorated charge so expiring servers cannot upgrade nearly free
        const upgradeRatio = Math.max(0.15, actualRatio);
        netDelta = Number(((newPrice - oldPrice) * upgradeRatio).toFixed(2));
      } else {
        // Downgrades calculate strictly against actual remaining time and actual pricePaid (prevents coupon/discount arbitrage)
        const rawRefundDiff = (newPrice - effectiveOldPrice) * actualRatio;
        netDelta = rawRefundDiff < 0 ? Number((rawRefundDiff * 0.5).toFixed(2)) : 0;
        const maxPossibleRefund = Number((Math.max(0, Number(srv.pricePaid ?? 0)) * 0.5).toFixed(2));
        if (netDelta < -maxPossibleRefund) {
          netDelta = -maxPossibleRefund;
        }
      }

      const uData = uSnap.data();
      const bal = Number(uData.balance || 0);

      if (netDelta > 0 && bal < netDelta) {
        throw new Error(`Yükseltme için yetersiz bakiye! Gerekli fark: ${netDelta} İnvite (Mevcut: ${bal} İnvite)`);
      }

      nextBalance = Number((bal - netDelta).toFixed(2));
      oldPackageId = srv.packageId;
      oldPackageName = srv.packageName;

      tx.update(uRef, {
        balance: nextBalance,
        ...(netDelta > 0 ? { totalSpent: Number((Number(uData.totalSpent || 0) + netDelta).toFixed(2)) } : {}),
      });

      const updatedPricePaid = Number(Math.max(0, Math.min(newPrice, effectiveOldPrice + netDelta)).toFixed(2));
      tx.update(srvRef, {
        packageId: newPkg.id,
        packageName: newPkg.name,
        pricePaid: updatedPricePaid,
        allocatedRamMb: Number(newPkg.ramMb || 1024),
        allocatedCpuPct: Number(newPkg.cpuLimitPct || 100),
        allocatedDiskMb: Number(newPkg.diskMb || 5120),
        slotsOrPorts: Number(newPkg.slotsOrPorts || 20),
        backupsLimit: Number(newPkg.backupsLimit || 3),
        updatedAt: now,
      });

      tx.set(db.collection('wallet_transactions').doc(), {
        uid: req.user.uid,
        email: req.user.email,
        type: netDelta >= 0 ? 'plan_upgrade' : 'plan_downgrade_refund',
        amount: -netDelta,
        note: `Paket Değişimi (${oldPackageName} -> ${newPkg.name}) — ${srv.name}`,
        serverId,
        adminEmail: 'system',
        createdAt: now,
      });
    });

    await logServerActivity(serverId, {
      actorEmail: req.user.email,
      action: netDelta >= 0 ? 'PAKET_YUKSELTILDI' : 'PAKET_DUSURULDU',
      category: 'billing',
      details: { from: oldPackageName, to: newPkg.name, netDelta },
    });

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'SERVER_PACKAGE_CHANGED',
      targetType: 'server',
      targetId: serverId,
      details: { from: oldPackageId, to: newPkg.id, netDelta },
    });

    res.json({ ok: true, netDelta, balance: nextBalance, newPackage: newPkg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
