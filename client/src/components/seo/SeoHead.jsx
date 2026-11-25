import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { safeExternalUrl } from '../../lib/api';

export function SeoHead({ title, description, keywords, image, type = 'website', noIndex = false, structuredData = null }) {
  const { bootstrap } = useAuth();
  const { pathname } = useLocation();
  const cfg = bootstrap?.config || {};

  useEffect(() => {
    const finalTitle = title
      ? `${title} | EmoçHosting`
      : cfg.seoTitle || 'EmoçHosting — Yeni Nesil Bulut & Oyun Altyapısı';
    const finalDesc =
      description ||
      cfg.seoDescription ||
      'EmoçHosting ile yüksek performanslı Minecraft, Website, Discord Bot ve API sunucusu kurun.';
    const finalKw =
      keywords || cfg.seoKeywords || 'emochosting, minecraft hosting, discord bot hosting, web hosting';
    const origin = window.location.origin;
    const cleanPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';
    const canonicalUrl = `${origin}${cleanPath}`;
    const safeOg = safeExternalUrl(image || cfg.ogImageUrl, { allowRelativeAssets: true });
    const finalImage = safeOg
      ? safeOg.startsWith('/')
        ? `${origin}${safeOg}`
        : safeOg
      : `${origin}/assets/og-banner.jpg`;

    document.title = finalTitle;

    const setMeta = (selector, attr, val) => {
      if (!val) return;
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        if (selector.includes('property=')) {
          el.setAttribute('property', selector.match(/property="([^"]+)"/)?.[1] || '');
        } else if (selector.includes('name=')) {
          el.setAttribute('name', selector.match(/name="([^"]+)"/)?.[1] || '');
        }
        document.head.appendChild(el);
      }
      el.setAttribute(attr, val);
    };

    setMeta('meta[name="description"]', 'content', finalDesc);
    setMeta('meta[name="keywords"]', 'content', finalKw);
    setMeta('meta[name="robots"]', 'content', noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    setMeta('meta[property="og:type"]', 'content', type);
    setMeta('meta[property="og:site_name"]', 'content', 'EmoçHosting');
    setMeta('meta[property="og:locale"]', 'content', 'tr_TR');
    setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    setMeta('meta[property="og:title"]', 'content', finalTitle);
    setMeta('meta[property="og:description"]', 'content', finalDesc);
    setMeta('meta[property="og:image"]', 'content', finalImage);
    setMeta('meta[property="og:image:width"]', 'content', '1200');
    setMeta('meta[property="og:image:height"]', 'content', '630');
    setMeta('meta[property="og:image:alt"]', 'content', finalTitle);
    setMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'content', finalTitle);
    setMeta('meta[name="twitter:description"]', 'content', finalDesc);
    setMeta('meta[name="twitter:image"]', 'content', finalImage);
    setMeta('meta[name="twitter:image:alt"]', 'content', finalTitle);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

    let ld = document.getElementById('emochosting-jsonld');
    if (!ld) {
      ld = document.createElement('script');
      ld.id = 'emochosting-jsonld';
      ld.type = 'application/ld+json';
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: 'EmoçHosting',
          url: origin,
          logo: `${origin}/assets/icon-512.png`,
          description: finalDesc,
          contactPoint: {
            '@type': 'ContactPoint',
            email: cfg.supportEmail || 'destek@emochosting.com',
            contactType: 'customer support',
            availableLanguage: ['Turkish', 'English'],
          },
        },
        {
          '@type': 'WebSite',
          name: 'EmoçHosting',
          url: origin,
          inLanguage: 'tr-TR',
          potentialAction: {
            '@type': 'SearchAction',
            target: `${origin}/packages?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ],
    });

    const extraId = 'emochosting-extra-jsonld';
    let extraLd = document.getElementById(extraId);
    if (structuredData) {
      if (!extraLd) {
        extraLd = document.createElement('script');
        extraLd.id = extraId;
        extraLd.type = 'application/ld+json';
        document.head.appendChild(extraLd);
      }
      extraLd.textContent = JSON.stringify(structuredData);
    } else if (extraLd) {
      extraLd.remove();
    }
  }, [
    pathname,
    title,
    description,
    keywords,
    image,
    type,
    noIndex,
    structuredData,
    cfg.seoTitle,
    cfg.seoDescription,
    cfg.seoKeywords,
    cfg.ogImageUrl,
    cfg.supportEmail,
  ]);

  return null;
}
