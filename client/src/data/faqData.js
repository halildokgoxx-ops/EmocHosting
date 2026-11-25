export const FAQ_CATEGORIES = [
  { id: 'all', label: 'Tümü' },
  { id: 'genel', label: 'Kurulum & Domain' },
  { id: 'minecraft', label: 'Minecraft' },
  { id: 'web_bot', label: 'Web & Discord Bot' },
  { id: 'guvenlik', label: 'Faturalandırma & Güvenlik' },
];

export const FAQ_ITEMS = [
  {
    id: 'kurulum-suresi',
    cat: 'genel',
    q: 'EmoçHosting sunucuları ne kadar sürede aktif olur?',
    a: 'Satın alma işleminin ardından çalışma dizininiz saniyeler içinde otomatik olarak oluşturulur. Özel portunuz ve <isim>.emochost.com alt alan adınız anında atanır; tek tıkla başlatabilirsiniz.',
  },
  {
    id: 'otomatik-domain',
    cat: 'genel',
    q: 'Özel alt alan adı (.emochost.com) nasıl çalışır?',
    a: 'Her sunucu kurulumda benzersiz bir <isim>.emochost.com adresi alır. Minecraft, Website ve Altyapı sunucularınız otomatik olarak bu alt alan adına yönlendirilir ve panelden dilediğiniz zaman değiştirilebilir.',
  },
  {
    id: 'minecraft-cekirdek',
    cat: 'minecraft',
    q: 'Minecraft sunucularında hangi sürümler ve mod/eklenti kaynakları desteklenir?',
    a: 'EmoçCore, Paper, Purpur, Forge, NeoForge, Fabric, Spigot, Bukkit, Velocity, BungeeCord, Folia ve Leaf dahil 17 çekirdek desteklenir. Panel içinden tek tıkla Modrinth ve CurseForge depolarından mod, eklenti ve mod paketi kurabilirsiniz.',
  },
  {
    id: 'minecraft-ai-motd',
    cat: 'minecraft',
    q: 'AI Sunucu Teşhis Asistanı ve MOTD Tasarımcısı ne işe yarar?',
    a: 'AI Teşhis Asistanı latest.log dosyasını, EULA onayını, bellek hatalarını (OOM) ve port çakışmalarını tarayıp tek tıkla optimizasyon uygular. MOTD Tasarımcısı ile canlı Minecraft önizlemesiyle renkli sunucu açıklaması ve 64x64 PNG ikon ekleyebilirsiniz.',
  },
  {
    id: 'web-bot-altyapi',
    cat: 'web_bot',
    q: 'Website, Discord Bot ve Altyapı sunucularında hangi teknolojiler çalışır?',
    a: 'Website Host ile Static HTML/SPA siteler veya Node.js web uygulamaları yayınlayabilir; Basic Auth, IP engelleme ve canlı trafik loglarından faydalanabilirsiniz. Discord Bot ve Altyapı paketleri ise Node.js, Python ve Java çalışma ortamlarını, şifreli .env değişkenlerini ve zamanlanmış görevleri destekler.',
  },
  {
    id: 'sftp-dosya-yonetimi',
    cat: 'web_bot',
    q: 'Sunucuma dosya yüklemek için SFTP veya Web Dosya Yöneticisi var mı?',
    a: 'Evet. Her sunucunun panelinde tarayıcı içi kod editörlü Dosya Yöneticisi, tek tıkla .ZIP sıkıştırma/açma, Yedekleme geri yükleme ve FileZilla/WinSCP ile bağlanabileceğiniz güvenli dosya aktarım (SFTP) erişimi bulunur.',
  },
  {
    id: 'gece-pazari-cekilis',
    cat: 'guvenlik',
    q: 'İnvite bakiyesi, Gece Pazarı ve Çekilişler nasıl çalışır?',
    a: 'Tüm paketlerimiz platform içi İnvite puanıyla çalışır. Arkadaşlarınızı davet ederek +25 İnvite kazanabilir, Fırsatlar sayfasındaki haftalık 3 Gece Pazarı kutusundan %10–%50 indirim elde edebilir ve şeffaf çekilişlerle ücretsiz İnvite veya kupon kazanabilirsiniz.',
  },
  {
    id: 'paket-degisimi',
    cat: 'guvenlik',
    q: 'Paketimi sonradan yükseltebilir veya düşürebilir miyim?',
    a: 'Evet. Aynı kategori içindeki paketler arasında kalan süreniz oranlanarak anlık paket yükseltme veya düşürme yapabilirsiniz. Verileriniz ve mevcut alan adınız korunur.',
  },
  {
    id: 'yetkili-ekleme',
    cat: 'guvenlik',
    q: 'Arkadaşlarımı sunucu panelime alt yetkili olarak ekleyebilir miyim?',
    a: 'Evet. "Yetkililer" sekmesinden kayıtlı bir kullanıcıyı sunucunuza davet edebilir; güç yönetimi, konsol, dosya yöneticisi, yedekler, ayarlar ve SFTP gibi izinleri ayrı ayrı tanımlayabilirsiniz.',
  },
  {
    id: 'kvkk-veri-haklari',
    cat: 'guvenlik',
    q: 'Kişisel verilerim nasıl korunuyor ve KVKK verilerimi indirebilir miyim?',
    a: 'Tüm hesap oturumları çok katmanlı güvenlik doğrulaması ve sıkı sunucu yetkilendirmesi ile korunur. Hesap Ayarları > Cüzdan & KVKK sekmesinden dilediğiniz an tüm profil, sunucu, işlem ve talep verilerinizi JSON formatında indirebilirsiniz.',
  },
];

export function buildFaqJsonLd(items = FAQ_ITEMS) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
}
