/**
 * Standalone site brand pack loader (root brand.json + relative assets).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  const REQUIRED_FIELDS = [
    'version',
    'brandId',
    'displayName',
    'layout',
    'theme',
    'copy',
    'queue',
    'audio',
    'assets',
  ];
  const KNOWN_LAYOUTS = ['milksha-callboard'];
  const STANDBY_FALLBACKS = ['logo-on-primary'];
  const SITE_BASE = '.';

  /**
   * @param {string} message
   * @param {string} [brandId]
   */
  function BrandLoadError(message, brandId) {
    const error = new Error(message);
    error.name = 'BrandLoadError';
    error.brandId = brandId || null;
    return error;
  }

  /**
   * @param {string} base
   * @param {string | null | undefined} relative
   * @returns {string | null}
   */
  function resolveAssetPath(base, relative) {
    if (!relative || typeof relative !== 'string') {
      return null;
    }
    const trimmed = relative.trim();
    if (!trimmed) {
      return null;
    }
    if (/^(https?:|data:|file:|blob:)/i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.charAt(0) === '/') {
      return trimmed;
    }
    return base.replace(/\/+$/, '') + '/' + trimmed.replace(/^\/+/, '');
  }

  /**
   * @param {unknown} data
   * @param {string} brandId
   */
  function validateBrand(data, brandId) {
    if (!data || typeof data !== 'object') {
      throw BrandLoadError('品牌包內容無效（不是 JSON 物件）', brandId);
    }

    const brand = /** @type {Record<string, unknown>} */ (data);
    for (let i = 0; i < REQUIRED_FIELDS.length; i += 1) {
      const field = REQUIRED_FIELDS[i];
      if (brand[field] === undefined || brand[field] === null) {
        throw BrandLoadError('品牌包缺少必要欄位：' + field, brandId);
      }
    }

    if (typeof brand.brandId !== 'string' || !brand.brandId.trim()) {
      throw BrandLoadError('brandId 無效', brandId);
    }

    if (KNOWN_LAYOUTS.indexOf(String(brand.layout)) === -1) {
      throw BrandLoadError(
        '未知版型 layout=' + String(brand.layout) + '（僅支援 milksha-callboard）',
        brandId,
      );
    }

    const theme = /** @type {Record<string, unknown>} */ (brand.theme);
    if (!theme.primary || !theme.accent) {
      throw BrandLoadError('theme.primary / theme.accent 為必要欄位', brandId);
    }

    const copy = /** @type {Record<string, unknown>} */ (brand.copy);
    if (!copy.pickupHint) {
      throw BrandLoadError('copy.pickupHint 為必要欄位', brandId);
    }

    const standbyFallback = copy.standbyFallback ? String(copy.standbyFallback) : 'logo-on-primary';
    if (STANDBY_FALLBACKS.indexOf(standbyFallback) === -1) {
      throw BrandLoadError('copy.standbyFallback 僅支援 logo-on-primary', brandId);
    }

    return brand;
  }

  /**
   * @param {Record<string, unknown>} brand
   * @param {string} base
   */
  function normalizeBrand(brand, base) {
    const theme = /** @type {Record<string, unknown>} */ (brand.theme || {});
    const copy = /** @type {Record<string, unknown>} */ (brand.copy || {});
    const queue = /** @type {Record<string, unknown>} */ (brand.queue || {});
    const audio = /** @type {Record<string, unknown>} */ (brand.audio || {});
    const assets = /** @type {Record<string, unknown>} */ (brand.assets || {});

    const bannerOpacityMin = Number(theme.bannerOpacityMin);
    const minOpacity = Number.isFinite(bannerOpacityMin) ? bannerOpacityMin : 0.75;
    const bannerOpacityRaw = Number(theme.bannerOpacity);
    const bannerOpacity = Number.isFinite(bannerOpacityRaw) ? bannerOpacityRaw : 0.85;

    const historyOrientation =
      queue.historyOrientation === 'vertical' ? 'vertical' : 'horizontal';
    const intervalRaw = Number(
      queue.historyPageIntervalSec != null
        ? queue.historyPageIntervalSec
        : queue.historyCarouselIntervalSec,
    );
    const historyPageIntervalSec =
      Number.isFinite(intervalRaw) && intervalRaw > 0
        ? Math.max(3, Math.min(30, Math.round(intervalRaw)))
        : 6;

    return {
      version: Number(brand.version) || 1,
      brandId: String(brand.brandId),
      displayName: String(brand.displayName),
      layout: String(brand.layout),
      theme: {
        primary: String(theme.primary),
        accent: String(theme.accent),
        bannerOpacity: Math.max(minOpacity, Math.min(1, bannerOpacity)),
        bannerOpacityMin: minOpacity,
      },
      copy: {
        pickupHint: String(copy.pickupHint),
        standbyFallback: 'logo-on-primary',
      },
      queue: {
        historyOrientation: historyOrientation,
        historyPageIntervalSec: historyPageIntervalSec,
        mainNumberMaxLenForLargeFont:
          Number(queue.mainNumberMaxLenForLargeFont) > 0
            ? Number(queue.mainNumberMaxLenForLargeFont)
            : 4,
      },
      audio: {
        tts: audio.tts !== false,
        dingDong: audio.dingDong !== false,
        mutedDefault: audio.mutedDefault === true,
      },
      assets: {
        logo: resolveAssetPath(base, assets.logo ? String(assets.logo) : null),
        menuImage: resolveAssetPath(base, assets.menuImage ? String(assets.menuImage) : null),
        standbyVideo: resolveAssetPath(
          base,
          assets.standbyVideo ? String(assets.standbyVideo) : null,
        ),
      },
      storeId: brand.storeId == null ? null : String(brand.storeId),
      deviceId: brand.deviceId == null ? null : String(brand.deviceId),
      basePath: base,
    };
  }

  /**
   * @param {{ fetchFn?: typeof fetch }} [options]
   */
  function loadSiteBrand(options) {
    const opts = options || {};
    const url = 'brand.json';
    const fetchFn = opts.fetchFn || root.fetch;

    if (typeof fetchFn !== 'function') {
      return Promise.reject(BrandLoadError('此環境無法讀取品牌設定（缺少 fetch）', 'milksha'));
    }

    return fetchFn(url, { cache: 'no-cache' })
      .then(function (response) {
        if (!response || !response.ok) {
          const status = response ? response.status : 0;
          throw BrandLoadError(
            '找不到品牌設定（' + url + (status ? ', HTTP ' + status : '') + '）。',
            'milksha',
          );
        }
        return response.json();
      })
      .catch(function (error) {
        if (error && error.name === 'BrandLoadError') {
          throw error;
        }
        throw BrandLoadError(
          '無法載入品牌設定：' + (error && error.message ? error.message : String(error)),
          'milksha',
        );
      })
      .then(function (data) {
        const validated = validateBrand(data, 'milksha');
        return normalizeBrand(validated, SITE_BASE);
      });
  }

  QMS.BrandLoadError = BrandLoadError;
  QMS.KNOWN_LAYOUTS = KNOWN_LAYOUTS;
  QMS.resolveAssetPath = resolveAssetPath;
  QMS.validateBrand = validateBrand;
  QMS.normalizeBrand = normalizeBrand;
  QMS.loadSiteBrand = loadSiteBrand;
})(typeof window !== 'undefined' ? window : globalThis);
