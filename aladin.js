/**
 * Xiaomi SmartTemp — MGM ALADIN Sayısal Hava Tahmin Modeli Modülü
 * Canlı ve Güncel ALADIN Model Verisi (Meteocons Hareketli İkonlar & Google Rüzgar Oku)
 * Poppins Font Entegrasyonu ile Modern & Premium Grafikler
 */

// ==========================================
// 1. MGM HADİSE SÖZLÜĞÜ (WEATHER EVENT CODES)
// ==========================================
const MGM_HADİSE_DICT = {
  'A': { code: 'A', name: 'Açık', desc: 'Gökyüzü tamamen açık, bulutsuz veya çok az bulutlu.', type: 'sun' },
  'AB': { code: 'AB', name: 'Az Bulutlu', desc: 'Gökyüzünün 1/8 ile 2/8\'i bulutlarla kaplı.', type: 'few-clouds' },
  'PB': { code: 'PB', name: 'Parçalı Bulutlu', desc: 'Gökyüzünün 3/8 ile 5/8\'i bulutlarla kaplı.', type: 'partly-cloudy' },
  'CB': { code: 'CB', name: 'Çok Bulutlu', desc: 'Gökyüzünün 6/8 veya daha fazlası bulutlarla kaplı.', type: 'cloudy' },
  'Y': { code: 'Y', name: 'Yağışlı', desc: 'Genel yağış, aralıklı yağmur.', type: 'rain' },
  'HY': { code: 'HY', name: 'Hafif Yağmurlu', desc: 'Hafif çiseleyen veya ince taneli yağmur.', type: 'light-rain' },
  'SY': { code: 'SY', name: 'Sağanak Yağışlı', desc: 'Kısa süreli, ani başlayan ve duran sağanak yağış.', type: 'heavy-rain' },
  'KSY': { code: 'KSY', name: 'Kuvvetli Sağanak', desc: 'Şiddetli ve yoğun sağanak yağış.', type: 'storm-rain' },
  'GY': { code: 'GY', name: 'Gökgürültülü Yağmur', desc: 'Şimşek ve gökgürültüsü eşliğinde yağmur.', type: 'thunderstorm' },
  'KGY': { code: 'KGY', name: 'Kuvvetli Gökgürültülü Yağmur', desc: 'Şiddetli gökgürültüsü, yıldırım ve kuvvetli yağış.', type: 'severe-thunderstorm' },
  'MSY': { code: 'MSY', name: 'Mevzi Sağanak', desc: 'Yerel ve bölgesel kısa süreli sağanak yağmur.', type: 'heavy-rain' },
  'K': { code: 'K', name: 'Karlı', desc: 'Kar yağışı etkili.', type: 'snow' },
  'HK': { code: 'HK', name: 'Hafif Karlı', desc: 'Hafif kar serpintisi veya ince taneli kar.', type: 'light-snow' },
  'YK': { code: 'YK', name: 'Yoğun Karlı', desc: 'Tipi ve görüşü kısıtlayan yoğun kar yağışı.', type: 'heavy-snow' },
  'KY': { code: 'KY', name: 'Karla Karışık Yağmurlu', desc: 'Yağmur ve kar taneleri birlikte yağıyor.', type: 'sleet' },
  'HKY': { code: 'HKY', name: 'Hafif Karla Karışık', desc: 'Hafif sulu kar yağışı.', type: 'light-sleet' },
  'YKY': { code: 'YKY', name: 'Yoğun Karla Karışık', desc: 'Kuvvetli sulu sepken ve sulu kar.', type: 'heavy-sleet' },
  'S': { code: 'S', name: 'Sisli', desc: 'Görüş mesafesini 1 km\'nin altına düşüren yoğun sis.', type: 'fog' },
  'P': { code: 'P', name: 'Puslu', desc: 'Görüşü hafif kısıtlayan pus tabakası.', type: 'fog' },
  'D': { code: 'D', name: 'Dumanlı', desc: 'Atmosferde asılı duran duman ve partiküller.', type: 'fog' },
  'R': { code: 'R', name: 'Rüzgarlı', desc: 'Kuvvetli ve hissedilir rüzgar.', type: 'wind' },
  'KF': { code: 'KF', name: 'Kum / Toz Fırtınası', desc: 'Kuvvetli rüzgarla taşınan yoğun toz veya kum fırtınası.', type: 'wind' },
  'G': { code: 'G', name: 'Güneşli', desc: 'Gündüz saatlerinde pırıl pırıl güneşli hava.', type: 'sun' },
  'DY': { code: 'DY', name: 'Dolu Yağışlı', desc: 'Sert buz küreleri şeklinde dolu yağışı.', type: 'hail' },
  'SCK': { code: 'SCK', name: 'Sıcak', desc: 'Mevsim normallerinin üzerinde aşırı sıcak hava.', type: 'sun' },
  'SGK': { code: 'SGK', name: 'Soğuk', desc: 'Mevsim normallerinin altında dondurucu soğuk.', type: 'snow' },
  'YGY': { code: 'YGY', name: 'Yer Yer Gökgürültülü', desc: 'Lokal gökgürültülü sağanak geçişleri.', type: 'thunderstorm' }
};

function getHadiseInfo(rawCode) {
  if (!rawCode) return { code: 'A', name: 'Açık', desc: 'Açık hava', type: 'sun' };
  const upper = String(rawCode).trim().toUpperCase();
  return MGM_HADİSE_DICT[upper] || { code: upper, name: upper, desc: 'Hava Durumu', type: 'cloudy' };
}

// ==========================================
// 2. METEOCONS (HAREKETLİ SVG HAVA DURUMU İKONLARI)
// ==========================================
const Meteocons = {
  getSvg(type, size = 48, isNight = false) {
    const s = size;
    switch (type) {
      case 'sun':
        if (isNight) {
          return `
            <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
              <path d="M42 38C42 47.94 33.94 56 24 56C19.14 56 14.73 54.07 11.5 50.95C14.07 51.63 16.76 52 19.55 52C31.95 52 42 41.95 42 29.55C42 21.6 37.89 14.6 31.67 10.6C40.06 13.9 42 24.5 42 38Z" fill="#818cf8"/>
              <circle cx="48" cy="18" r="2" fill="#e0e7ff" class="meteo-star"/>
              <circle cx="52" cy="32" r="1.5" fill="#c7d2fe" class="meteo-star" style="animation-delay: 1s"/>
            </svg>
          `;
        }
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <g class="meteo-sun-rays">
              <line x1="32" y1="6" x2="32" y2="14" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="32" y1="50" x2="32" y2="58" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="6" y1="32" x2="14" y2="32" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="50" y1="32" x2="58" y2="32" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="13.6" y1="13.6" x2="19.3" y2="19.3" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="44.7" y1="44.7" x2="50.4" y2="50.4" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="13.6" y1="50.4" x2="19.3" y2="44.7" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="44.7" y1="19.3" x2="50.4" y2="13.6" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
            </g>
            <circle cx="32" cy="32" r="14" fill="#fbbf24"/>
          </svg>
        `;

      case 'few-clouds':
      case 'partly-cloudy':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <circle cx="24" cy="24" r="11" fill="#fbbf24" class="meteo-sun-pulse"/>
            <path d="M46 48H22C16.48 48 12 43.52 12 38C12 32.8 15.98 28.53 21.05 28.05C22.68 21.18 28.84 16 36.2 16C44.8 16 51.85 22.84 52.18 31.4C56.63 32.55 60 36.6 60 41.4C60 45.04 53.76 48 46 48Z" fill="#94a3b8" opacity="0.3"/>
            <path class="meteo-cloud-drift" d="M44 46H20C15.03 46 11 41.97 11 37C11 32.32 14.58 28.48 19.14 28.05C20.61 21.86 26.15 17.2 32.78 17.2C40.52 17.2 46.86 23.36 47.16 31.06C51.17 32.1 54.2 35.74 54.2 40.06C54.2 43.34 49.68 46 44 46Z" fill="#cbd5e1"/>
          </svg>
        `;

      case 'cloudy':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M48 48H18C13.03 48 9 43.97 9 39C9 34.32 12.58 30.48 17.14 30.05C18.61 23.86 24.15 19.2 30.78 19.2C38.52 19.2 44.86 25.36 45.16 33.06C49.17 34.1 52.2 37.74 52.2 42.06C52.2 45.34 50.34 48 48 48Z" fill="#64748b" class="meteo-cloud-drift"/>
            <path d="M42 54H20C15.58 54 12 50.42 12 46C12 41.84 15.18 38.42 19.24 38.04C20.54 32.54 25.47 28.4 31.36 28.4C38.24 28.4 43.88 33.88 44.14 40.72C47.71 41.64 50.4 44.88 50.4 48.72C50.4 51.64 46.72 54 42 54Z" fill="#94a3b8" class="meteo-cloud-drift" style="animation-delay: -1.5s"/>
          </svg>
        `;

      case 'rain':
      case 'light-rain':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M44 38H18C13.58 38 10 34.42 10 30C10 25.84 13.18 22.42 17.24 22.04C18.54 16.54 23.47 12.4 29.36 12.4C36.24 12.4 41.88 17.88 42.14 24.72C45.71 25.64 48.4 28.88 48.4 32.72C48.4 35.64 46.72 38 44 38Z" fill="#64748b"/>
            <line x1="22" y1="44" x2="19" y2="54" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" class="meteo-raindrop-1"/>
            <line x1="32" y1="44" x2="29" y2="54" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" class="meteo-raindrop-2"/>
            <line x1="42" y1="44" x2="39" y2="54" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" class="meteo-raindrop-3"/>
          </svg>
        `;

      case 'heavy-rain':
      case 'storm-rain':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 36H17C12.58 36 9 32.42 9 28C9 23.84 12.18 20.42 16.24 20.04C17.54 14.54 22.47 10.4 28.36 10.4C35.24 10.4 40.88 15.88 41.14 22.72C44.71 23.64 47.4 26.88 47.4 30.72C47.4 33.64 46.3 36 45 36Z" fill="#475569"/>
            <line x1="20" y1="42" x2="15" y2="56" stroke="#0284c7" stroke-width="3.5" stroke-linecap="round" class="meteo-raindrop-1"/>
            <line x1="30" y1="42" x2="25" y2="56" stroke="#0284c7" stroke-width="3.5" stroke-linecap="round" class="meteo-raindrop-2"/>
            <line x1="40" y1="42" x2="35" y2="56" stroke="#0284c7" stroke-width="3.5" stroke-linecap="round" class="meteo-raindrop-3"/>
          </svg>
        `;

      case 'thunderstorm':
      case 'severe-thunderstorm':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 34H17C12.58 34 9 30.42 9 26C9 21.84 12.18 18.42 16.24 18.04C17.54 12.54 22.47 8.4 28.36 8.4C35.24 8.4 40.88 13.88 41.14 20.72C44.71 21.64 47.4 24.88 47.4 28.72C47.4 31.64 46.3 34 45 34Z" fill="#334155"/>
            <path d="M30 34L24 45H32L28 58L40 43H32L36 34H30Z" fill="#facc15" stroke="#ca8a04" stroke-width="1.5" class="meteo-lightning"/>
          </svg>
        `;

      case 'snow':
      case 'light-snow':
      case 'heavy-snow':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M44 36H18C13.58 36 10 32.42 10 28C10 23.84 13.18 20.42 17.24 20.04C18.54 14.54 23.47 10.4 29.36 10.4C36.24 10.4 41.88 15.88 41.14 22.72C44.71 23.64 48.4 26.88 48.4 30.72C48.4 33.64 46.72 36 44 36Z" fill="#94a3b8"/>
            <circle cx="20" cy="46" r="3" fill="#e0f2fe" class="meteo-snowflake-1"/>
            <circle cx="32" cy="50" r="3.5" fill="#e0f2fe" class="meteo-snowflake-2"/>
            <circle cx="44" cy="46" r="3" fill="#e0f2fe" class="meteo-snowflake-1" style="animation-delay: 1.1s"/>
          </svg>
        `;

      case 'sleet':
      case 'light-sleet':
      case 'heavy-sleet':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M44 36H18C13.58 36 10 32.42 10 28C10 23.84 13.18 20.42 17.24 20.04C18.54 14.54 23.47 10.4 29.36 10.4C36.24 10.4 41.88 15.88 41.14 22.72C44.71 23.64 48.4 26.88 48.4 30.72C48.4 33.64 46.72 36 44 36Z" fill="#64748b"/>
            <line x1="20" y1="44" x2="17" y2="52" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" class="meteo-raindrop-1"/>
            <circle cx="32" cy="48" r="3" fill="#e0f2fe" class="meteo-snowflake-1"/>
            <line x1="42" y1="44" x2="39" y2="52" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" class="meteo-raindrop-3"/>
          </svg>
        `;

      case 'fog':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <line x1="16" y1="24" x2="48" y2="24" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" class="meteo-cloud-drift"/>
            <line x1="12" y1="34" x2="52" y2="34" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round" class="meteo-cloud-drift" style="animation-delay: -1s"/>
            <line x1="20" y1="44" x2="44" y2="44" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" class="meteo-cloud-drift" style="animation-delay: -2s"/>
          </svg>
        `;

      case 'wind':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M12 26H38C42 26 45 23 45 19C45 15 41 12 37 12C33 12 30 15 30 18" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
            <path d="M8 36H46C50 36 54 39 54 43C54 47 50 50 46 50C42 50 39 47 39 44" stroke="#0ea5e9" stroke-width="4" stroke-linecap="round"/>
            <line x1="16" y1="46" x2="32" y2="46" stroke="#bae6fd" stroke-width="4" stroke-linecap="round"/>
          </svg>
        `;

      case 'hail':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M44 34H18C13.58 34 10 30.42 10 26C10 21.84 13.18 18.42 17.24 18.04C18.54 12.54 23.47 8.4 29.36 8.4C36.24 8.4 41.88 13.88 41.14 20.72C44.71 21.64 48.4 24.88 48.4 28.72C48.4 31.64 46.72 34 44 34Z" fill="#64748b"/>
            <circle cx="22" cy="46" r="3.5" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" class="meteo-raindrop-1"/>
            <circle cx="33" cy="50" r="4" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" class="meteo-raindrop-2"/>
            <circle cx="43" cy="46" r="3.5" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" class="meteo-raindrop-3"/>
          </svg>
        `;

      default:
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <circle cx="32" cy="32" r="14" fill="#fbbf24"/>
          </svg>
        `;
    }
  }
};

// ==========================================
// 3. RÜZGAR YÖNÜ VE PUSULA DÖNÜŞTÜRÜCÜ
// ==========================================
function getCompassDirection(degrees) {
  const dirs = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
  const idx = Math.round((degrees % 360) / 22.5) % 16;
  return dirs[idx];
}

// ==========================================
// 4. CHART.JS GOOGLE RÜZGAR OKU EKLENTİSİ (WIND ARROWS PLUGIN)
// ==========================================
const googleWindArrowPlugin = {
  id: 'googleWindArrows',
  afterDatasetsDraw(chart) {
    const opts = chart.config.options.plugins?.googleWindArrows;
    if (!opts || !opts.display) return;

    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(opts.datasetIndex ?? 0);
    if (!meta || meta.hidden) return;

    const windData = opts.windData; // Array of { speed, direction }
    if (!windData || windData.length === 0) return;

    const isDark = document.documentElement.classList.contains('dark');
    const step = meta.data.length > 24 ? Math.ceil(meta.data.length / 20) : 1;

    ctx.save();
    ctx.font = '600 10px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    meta.data.forEach((element, index) => {
      if (index % step !== 0 && index !== meta.data.length - 1) return;
      const { x, y } = element;
      const item = windData[index];
      if (!item) return;

      const angleRad = ((item.direction || 0) * Math.PI) / 180;

      // 1. Rüzgar Hızı Metni (km/h)
      ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      ctx.fillText(`${Math.round(item.speed)} km/h`, x, y - 22);

      // 2. Google Stili Dönen Rüzgar Oku (Daire + Ok)
      ctx.save();
      ctx.translate(x, y - 9);

      // Küçük dairesel arkaplan
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, 2 * Math.PI);
      ctx.fillStyle = isDark ? '#1e293b' : '#e2e8f0';
      ctx.fill();

      // Rüzgar yönüne göre dönüş
      ctx.rotate(angleRad);

      ctx.beginPath();
      ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
      ctx.moveTo(0, -5);
      ctx.lineTo(3.5, 4);
      ctx.lineTo(0, 1.5);
      ctx.lineTo(-3.5, 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });

    ctx.restore();
  }
};

if (typeof Chart !== 'undefined' && Chart.register) {
  Chart.register(googleWindArrowPlugin);
}

// ==========================================
// 5. YEDEK GERÇEK MGM ALADIN MODEL VERİSİ (OFFLINE & INITIAL FALLBACK)
// ==========================================
const INITIAL_MODEL_DATA = [{"tarih":"2026-10-29T15:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":99,"nem":91,"basinc":1014,"ruzgarHizi":9,"ruzgarYonu":323,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-29T15:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-29T16:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0.46,"karYuksekligi":0,"bulutKapaliligi":98,"nem":96,"basinc":1014,"ruzgarHizi":6,"ruzgarYonu":273,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-29T16:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-29T17:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0.64,"karYuksekligi":0,"bulutKapaliligi":99,"nem":96,"basinc":1014,"ruzgarHizi":5,"ruzgarYonu":280,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-29T17:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-29T18:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0.4,"karYuksekligi":0,"bulutKapaliligi":98,"nem":95,"basinc":1015,"ruzgarHizi":9,"ruzgarYonu":312,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-29T18:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-29T19:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":0.25,"karYuksekligi":0,"bulutKapaliligi":99,"nem":96,"basinc":1015,"ruzgarHizi":8,"ruzgarYonu":260,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-29T19:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-29T20:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":0.67,"karYuksekligi":0,"bulutKapaliligi":99,"nem":97,"basinc":1015,"ruzgarHizi":12,"ruzgarYonu":246,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-29T20:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-29T21:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":1.23,"karYuksekligi":0,"bulutKapaliligi":100,"nem":96,"basinc":1015,"ruzgarHizi":14,"ruzgarYonu":242,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-29T21:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-29T22:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":3.15,"karYuksekligi":0,"bulutKapaliligi":100,"nem":95,"basinc":1015,"ruzgarHizi":14,"ruzgarYonu":242,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-29T22:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-29T23:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":5.42,"karYuksekligi":0,"bulutKapaliligi":100,"nem":95,"basinc":1015,"ruzgarHizi":17,"ruzgarYonu":234,"hadise":"KSY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-29T23:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T00:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":3.1,"karYuksekligi":0,"bulutKapaliligi":100,"nem":95,"basinc":1016,"ruzgarHizi":10,"ruzgarYonu":221,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T00:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T01:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":0.97,"karYuksekligi":0,"bulutKapaliligi":98,"nem":98,"basinc":1016,"ruzgarHizi":5,"ruzgarYonu":211,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T01:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T02:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":1.67,"karYuksekligi":0,"bulutKapaliligi":100,"nem":97,"basinc":1016,"ruzgarHizi":3,"ruzgarYonu":213,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T02:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T03:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":2.66,"karYuksekligi":0,"bulutKapaliligi":100,"nem":98,"basinc":1016,"ruzgarHizi":3,"ruzgarYonu":215,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T03:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T04:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":0.61,"karYuksekligi":0,"bulutKapaliligi":99,"nem":98,"basinc":1016,"ruzgarHizi":2,"ruzgarYonu":220,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T04:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T05:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":0.52,"karYuksekligi":0,"bulutKapaliligi":98,"nem":98,"basinc":1016,"ruzgarHizi":2,"ruzgarYonu":232,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T05:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T06:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0.57,"karYuksekligi":0,"bulutKapaliligi":96,"nem":95,"basinc":1017,"ruzgarHizi":7,"ruzgarYonu":3,"hadise":"SY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T06:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T07:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0.25,"karYuksekligi":0,"bulutKapaliligi":94,"nem":93,"basinc":1018,"ruzgarHizi":14,"ruzgarYonu":2,"hadise":"HSY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T07:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T08:00:00.000Z","sicaklik":16,"hissedilenSicaklik":16,"saatlikToplamYagis":0.07,"karYuksekligi":0,"bulutKapaliligi":93,"nem":92,"basinc":1018,"ruzgarHizi":17,"ruzgarYonu":358,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T08:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T09:00:00.000Z","sicaklik":16,"hissedilenSicaklik":16,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":94,"nem":91,"basinc":1018,"ruzgarHizi":17,"ruzgarYonu":353,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T09:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T10:00:00.000Z","sicaklik":16,"hissedilenSicaklik":16,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":93,"nem":89,"basinc":1018,"ruzgarHizi":16,"ruzgarYonu":353,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T10:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T11:00:00.000Z","sicaklik":16,"hissedilenSicaklik":16,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":94,"nem":89,"basinc":1018,"ruzgarHizi":16,"ruzgarYonu":352,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T11:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T12:00:00.000Z","sicaklik":16,"hissedilenSicaklik":16,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":93,"nem":89,"basinc":1018,"ruzgarHizi":16,"ruzgarYonu":355,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T12:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T13:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":94,"nem":88,"basinc":1018,"ruzgarHizi":13,"ruzgarYonu":358,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T13:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T14:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":91,"nem":88,"basinc":1019,"ruzgarHizi":10,"ruzgarYonu":355,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T14:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T15:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":90,"nem":88,"basinc":1019,"ruzgarHizi":7,"ruzgarYonu":348,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T15:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T16:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":99,"nem":89,"basinc":1019,"ruzgarHizi":4,"ruzgarYonu":327,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T16:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T17:00:00.000Z","sicaklik":13,"hissedilenSicaklik":13,"saatlikToplamYagis":0.14,"karYuksekligi":0,"bulutKapaliligi":98,"nem":92,"basinc":1020,"ruzgarHizi":4,"ruzgarYonu":315,"hadise":"HSY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T17:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T18:00:00.000Z","sicaklik":13,"hissedilenSicaklik":13,"saatlikToplamYagis":0.14,"karYuksekligi":0,"bulutKapaliligi":93,"nem":95,"basinc":1020,"ruzgarHizi":5,"ruzgarYonu":339,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T18:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T19:00:00.000Z","sicaklik":13,"hissedilenSicaklik":13,"saatlikToplamYagis":0.06,"karYuksekligi":0,"bulutKapaliligi":91,"nem":96,"basinc":1020,"ruzgarHizi":3,"ruzgarYonu":359,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T19:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T20:00:00.000Z","sicaklik":13,"hissedilenSicaklik":13,"saatlikToplamYagis":0.16,"karYuksekligi":0,"bulutKapaliligi":91,"nem":98,"basinc":1020,"ruzgarHizi":1,"ruzgarYonu":41,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T20:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T21:00:00.000Z","sicaklik":13,"hissedilenSicaklik":13,"saatlikToplamYagis":0.17,"karYuksekligi":0,"bulutKapaliligi":88,"nem":99,"basinc":1020,"ruzgarHizi":1,"ruzgarYonu":115,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T21:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T22:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0.07,"karYuksekligi":0,"bulutKapaliligi":84,"nem":99,"basinc":1020,"ruzgarHizi":1,"ruzgarYonu":167,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T22:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-30T23:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0.02,"karYuksekligi":0,"bulutKapaliligi":86,"nem":99,"basinc":1020,"ruzgarHizi":0,"ruzgarYonu":315,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-30T23:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T00:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":85,"nem":99,"basinc":1020,"ruzgarHizi":1,"ruzgarYonu":316,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T00:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T01:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":84,"nem":99,"basinc":1020,"ruzgarHizi":2,"ruzgarYonu":333,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T01:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T02:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0.01,"karYuksekligi":0,"bulutKapaliligi":88,"nem":99,"basinc":1020,"ruzgarHizi":2,"ruzgarYonu":9,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T02:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T03:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0.01,"karYuksekligi":0,"bulutKapaliligi":79,"nem":100,"basinc":1020,"ruzgarHizi":2,"ruzgarYonu":44,"hadise":"HY","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T03:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T04:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":70,"nem":100,"basinc":1020,"ruzgarHizi":3,"ruzgarYonu":63,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T04:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T05:00:00.000Z","sicaklik":11,"hissedilenSicaklik":11,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":65,"nem":100,"basinc":1020,"ruzgarHizi":3,"ruzgarYonu":70,"hadise":"PB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T05:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T06:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":55,"nem":98,"basinc":1021,"ruzgarHizi":4,"ruzgarYonu":71,"hadise":"PB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T06:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T07:00:00.000Z","sicaklik":13,"hissedilenSicaklik":13,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":45,"nem":92,"basinc":1021,"ruzgarHizi":6,"ruzgarYonu":70,"hadise":"PB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T07:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T08:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":41,"nem":86,"basinc":1021,"ruzgarHizi":7,"ruzgarYonu":65,"hadise":"PB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T08:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T09:00:00.000Z","sicaklik":16,"hissedilenSicaklik":16,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":41,"nem":81,"basinc":1020,"ruzgarHizi":8,"ruzgarYonu":46,"hadise":"PB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T09:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T10:00:00.000Z","sicaklik":16,"hissedilenSicaklik":16,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":30,"nem":78,"basinc":1020,"ruzgarHizi":9,"ruzgarYonu":28,"hadise":"AB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T10:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T11:00:00.000Z","sicaklik":17,"hissedilenSicaklik":17,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":48,"nem":77,"basinc":1019,"ruzgarHizi":10,"ruzgarYonu":22,"hadise":"PB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T11:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T12:00:00.000Z","sicaklik":17,"hissedilenSicaklik":17,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":43,"nem":78,"basinc":1019,"ruzgarHizi":11,"ruzgarYonu":20,"hadise":"PB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T12:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T13:00:00.000Z","sicaklik":17,"hissedilenSicaklik":17,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":48,"nem":80,"basinc":1019,"ruzgarHizi":10,"ruzgarYonu":22,"hadise":"PB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T13:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T14:00:00.000Z","sicaklik":16,"hissedilenSicaklik":16,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":60,"nem":83,"basinc":1019,"ruzgarHizi":10,"ruzgarYonu":31,"hadise":"PB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T14:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T15:00:00.000Z","sicaklik":15,"hissedilenSicaklik":15,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":78,"nem":87,"basinc":1019,"ruzgarHizi":9,"ruzgarYonu":34,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T15:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T16:00:00.000Z","sicaklik":14,"hissedilenSicaklik":14,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":80,"nem":88,"basinc":1019,"ruzgarHizi":9,"ruzgarYonu":39,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T16:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T17:00:00.000Z","sicaklik":13,"hissedilenSicaklik":13,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":23,"nem":91,"basinc":1020,"ruzgarHizi":7,"ruzgarYonu":40,"hadise":"AB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T17:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T18:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":23,"nem":93,"basinc":1019,"ruzgarHizi":7,"ruzgarYonu":62,"hadise":"AB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T18:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T19:00:00.000Z","sicaklik":12,"hissedilenSicaklik":12,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":69,"nem":95,"basinc":1019,"ruzgarHizi":4,"ruzgarYonu":71,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T19:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T20:00:00.000Z","sicaklik":11,"hissedilenSicaklik":11,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":70,"nem":96,"basinc":1019,"ruzgarHizi":3,"ruzgarYonu":71,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T20:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T21:00:00.000Z","sicaklik":11,"hissedilenSicaklik":11,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":81,"nem":97,"basinc":1019,"ruzgarHizi":2,"ruzgarYonu":78,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T21:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T22:00:00.000Z","sicaklik":10,"hissedilenSicaklik":10,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":76,"nem":98,"basinc":1019,"ruzgarHizi":1,"ruzgarYonu":98,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T22:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-10-31T23:00:00.000Z","sicaklik":10,"hissedilenSicaklik":10,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":86,"nem":98,"basinc":1019,"ruzgarHizi":1,"ruzgarYonu":104,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-10-31T23:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898},{"tarih":"2026-11-01T00:00:00.000Z","sicaklik":10,"hissedilenSicaklik":10,"saatlikToplamYagis":0,"karYuksekligi":0,"bulutKapaliligi":88,"nem":99,"basinc":1018,"ruzgarHizi":1,"ruzgarYonu":123,"hadise":"CB","enlem":40.242,"boylam":28.837002,"yolSaati":"2026-11-01T00:00:00.000Z","yolEnlem":40.22426402187642,"yolBoylam":28.868328096577898}];

// ==========================================
// 6. ALADIN MODEL VERİ SERVİSİ (ALADIN SERVICE)
// ==========================================
class AladinService {
  constructor() {
    this.enlem = '40.22641349141202_40.22426402187642';
    this.boylam = '28.794067381240897_28.868328096577898';
    this.records = [];
    this.lastUpdated = null;
    this.isFetching = false;
    this.needsCorsDemo = false;
    this.storageKey = 'mgm_aladin_forecast_v1';
    this.loadCache();
  }

  loadCache() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
          this.records = parsed.records;
          this.lastUpdated = parsed.lastUpdated ? new Date(parsed.lastUpdated) : null;
          return;
        }
      }
    } catch (e) {}

    // İlk açılışta veya önbellek yoksa gömülü gerçek 58 saatlik MGM verisini kullan (ekran boş kalmaz)
    this.records = [...INITIAL_MODEL_DATA];
    this.lastUpdated = new Date();
  }

  saveCache() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        records: this.records,
        lastUpdated: this.lastUpdated ? this.lastUpdated.toISOString() : new Date().toISOString()
      }));
    } catch (e) {}
  }

  getFormattedModelDate(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    return `${y}-${m}-${d}%20${h}:00`;
  }

  async fetchSingleStep(step, tarihParam) {
    const queryParams = `enlem=${this.enlem}&boylam=${this.boylam}&tarih=${tarihParam}&step=${step}`;
    const targetUrl = `https://modelservis.mgm.gov.tr/web/modeltahmin/lokasyon/light3?${queryParams}`;

    // 1. Yerel Node.js Server Proxy (node server.js ile çalıştırılıyorsa)
    try {
      const localUrl = `/api/aladin?${queryParams}`;
      const res = await fetch(localUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0 && json[0].sicaklik !== undefined) {
          this.needsCorsDemo = false;
          return json[0];
        }
      }
    } catch (e) {}

    // 2. CORS Proxy (cors-anywhere with Origin)
    try {
      const proxyUrl = 'https://cors-anywhere.herokuapp.com/' + targetUrl;
      const res = await fetch(proxyUrl, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://www.mgm.gov.tr',
          'Referer': 'https://www.mgm.gov.tr/'
        },
        signal: AbortSignal.timeout(4000)
      });

      if (res.status === 403) {
        this.needsCorsDemo = true;
      }

      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0 && json[0].sicaklik !== undefined) {
          this.needsCorsDemo = false;
          return json[0];
        }
      }
    } catch (e) {}

    return null;
  }

  async fetchFullForecast(onProgress) {
    if (this.isFetching) return this.records;
    this.isFetching = true;

    try {
      const now = new Date();
      const tarihParam = this.getFormattedModelDate(now);

      const maxHours = 72; // ALADIN sayısal model çıktısı (72 saate kadar veri üretir)
      const hours = Array.from({ length: maxHours }, (_, i) => i + 1);
      const results = [];
      const batchSize = 10;

      let emptyConsecutiveCount = 0;

      for (let i = 0; i < hours.length; i += batchSize) {
        if (emptyConsecutiveCount >= 3) break;

        const batch = hours.slice(i, i + batchSize);
        const batchPromises = batch.map(h => this.fetchSingleStep(h * 60, tarihParam));
        const batchResults = await Promise.all(batchPromises);

        for (let b = 0; b < batchResults.length; b++) {
          const item = batchResults[b];
          if (item) {
            results.push(item);
            emptyConsecutiveCount = 0;
          } else {
            emptyConsecutiveCount++;
          }
        }

        if (onProgress) {
          const pct = Math.min(100, Math.round(((i + batch.length) / maxHours) * 100));
          onProgress({ percent: pct, count: results.length });
        }
      }

      if (results.length > 0) {
        results.sort((a, b) => new Date(a.yolSaati || a.tarih) - new Date(b.yolSaati || b.tarih));
        this.records = results;
        this.lastUpdated = new Date();
        this.saveCache();
      }

      return this.records;
    } finally {
      this.isFetching = false;
    }
  }
}

// ==========================================
// 7. ALADIN GRAFİK YÖNETİCİSİ (POPPINS FONT)
// ==========================================
class AladinChartManager {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.chart = null;
    this.mode = 'temp';
    this.records = [];
    this.initChart();
  }

  initChart() {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');

    Chart.defaults.font.family = "'Poppins', sans-serif";

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          googleWindArrows: {
            display: false,
            windData: [],
            datasetIndex: 0
          },
          tooltip: {
            enabled: true,
            animation: false,
            backgroundColor: isDark ? 'rgba(24, 28, 34, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e6eb',
            borderWidth: 1,
            titleColor: isDark ? '#f0f2f5' : '#1e293b',
            bodyColor: isDark ? '#cbd5e1' : '#475569',
            padding: 10,
            cornerRadius: 12,
            boxPadding: 4,
            usePointStyle: true,
            titleFont: { family: 'Poppins', size: 12, weight: 700 },
            bodyFont: { family: 'Poppins', size: 11, weight: 500 },
            callbacks: {
              title: (items) => {
                if (!items || items.length === 0) return '';
                const idx = items[0].dataIndex;
                const rec = this.records[idx];
                if (rec) {
                  const d = new Date(rec.yolSaati || rec.tarih);
                  const hadise = getHadiseInfo(rec.hadise);
                  return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · ${hadise.name}`;
                }
                return items[0].label || '';
              },
              afterBody: (items) => {
                if (!items || items.length === 0) return '';
                const idx = items[0].dataIndex;
                const rec = this.records[idx];
                if (!rec) return '';
                const dir = getCompassDirection(rec.ruzgarYonu);
                return [
                  `🌬️ Rüzgar: ${rec.ruzgarHizi} km/h (${rec.ruzgarYonu}° ${dir})`,
                  `💧 Nem: %${rec.nem} · Bulut: %${rec.bulutKapaliligi}`,
                  `⏱️ Basınç: ${rec.basinc} hPa · Yağış: ${rec.saatlikToplamYagis} mm`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
              borderDash: [3, 3],
              drawBorder: false
            },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: { family: 'Poppins', size: 10, weight: 600 },
              maxTicksLimit: window.innerWidth < 640 ? 6 : 12
            }
          },
          y: {
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
              borderDash: [3, 3],
              drawBorder: false
            },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: { family: 'Poppins', size: 10, weight: 600 }
            },
            grace: '10%'
          }
        }
      }
    });
  }

  setMode(mode) {
    this.mode = mode;
    this.update();
  }

  update(records = null) {
    if (records) this.records = records;
    if (!this.chart || this.records.length === 0) return;

    // Telefon görünümünde (hidden md:block) grafik gizli olduğu için hesaplama ve render yapma
    if (this.canvas.offsetParent === null) return;

    const isDark = document.documentElement.classList.contains('dark');
    const recs = this.records;

    const labels = recs.map(r => {
      const d = new Date(r.yolSaati || r.tarih);
      return `${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    });

    const tempColor = isDark ? '#f87171' : '#ef4444';
    const feelsColor = isDark ? '#fbbf24' : '#f59e0b';
    const rainColor = isDark ? '#38bdf8' : '#0284c7';
    const snowColor = isDark ? '#a5b4fc' : '#6366f1';
    const windColor = isDark ? '#34d399' : '#10b981';
    const humColor = isDark ? '#2dd4bf' : '#0d9488';
    const cloudColor = isDark ? '#94a3b8' : '#64748b';
    const pressureColor = isDark ? '#c084fc' : '#9333ea';

    // Modern Akıcı Lineer Gradyan Fonksiyonu
    const makeGradient = (rgbStr, topAlpha, midAlpha, botAlpha) => {
      return (context) => {
        const chart = context.chart;
        const { ctx, chartArea } = chart;
        if (!chartArea) return `rgba(${rgbStr}, ${topAlpha})`;
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, `rgba(${rgbStr}, ${topAlpha})`);
        g.addColorStop(0.65, `rgba(${rgbStr}, ${midAlpha})`);
        g.addColorStop(1, `rgba(${rgbStr}, ${botAlpha})`);
        return g;
      };
    };

    let datasets = [];
    let showWindArrows = false;
    let windData = [];

    if (this.mode === 'temp') {
      const tempRgb = isDark ? '248, 113, 113' : '239, 68, 68';
      datasets = [
        {
          label: 'Sıcaklık (°C)',
          data: recs.map(r => r.sicaklik),
          borderColor: tempColor,
          backgroundColor: makeGradient(tempRgb, 0.32, 0.08, 0.0),
          fill: true,
          tension: 0.38,
          borderWidth: 2.75,
          pointRadius: 0,
          pointHoverRadius: 6.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 3,
          pointHoverBorderColor: tempColor
        },
        {
          label: 'Hissedilen (°C)',
          data: recs.map(r => r.hissedilenSicaklik),
          borderColor: feelsColor,
          borderDash: [4, 4],
          fill: false,
          tension: 0.38,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 2.5,
          pointHoverBorderColor: feelsColor
        }
      ];
      this.chart.options.scales.y.ticks.callback = (v) => `${v}°C`;
    } else if (this.mode === 'rain') {
      datasets = [
        {
          label: 'Saatlik Yağış (mm)',
          data: recs.map(r => r.saatlikToplamYagis),
          borderColor: rainColor,
          backgroundColor: isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.28)',
          fill: true,
          type: 'bar',
          borderWidth: 1.5,
          borderRadius: 6
        },
        {
          label: 'Kar Yüksekliği (cm)',
          data: recs.map(r => r.karYuksekligi),
          borderColor: snowColor,
          backgroundColor: isDark ? 'rgba(165, 180, 252, 0.35)' : 'rgba(99, 102, 241, 0.28)',
          fill: true,
          type: 'bar',
          borderWidth: 1.5,
          borderRadius: 6
        }
      ];
      this.chart.options.scales.y.ticks.callback = (v) => `${v} mm`;
    } else if (this.mode === 'wind') {
      showWindArrows = true;
      windData = recs.map(r => ({ speed: r.ruzgarHizi, direction: r.ruzgarYonu }));
      const windRgb = isDark ? '52, 211, 153' : '16, 185, 129';
      datasets = [
        {
          label: 'Rüzgar Hızı (km/h)',
          data: recs.map(r => r.ruzgarHizi),
          borderColor: windColor,
          backgroundColor: makeGradient(windRgb, 0.30, 0.08, 0.0),
          fill: true,
          tension: 0.35,
          borderWidth: 2.75,
          pointRadius: 3,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 3,
          pointHoverBorderColor: windColor
        }
      ];
      this.chart.options.scales.y.ticks.callback = (v) => `${v} km/h`;
    } else if (this.mode === 'hum_cloud') {
      const humRgb = isDark ? '45, 212, 191' : '13, 148, 136';
      datasets = [
        {
          label: 'Bağıl Nem (%)',
          data: recs.map(r => r.nem),
          borderColor: humColor,
          backgroundColor: makeGradient(humRgb, 0.26, 0.06, 0.0),
          fill: true,
          tension: 0.38,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 3,
          pointHoverBorderColor: humColor
        },
        {
          label: 'Bulut Kapalılığı (%)',
          data: recs.map(r => r.bulutKapaliligi),
          borderColor: cloudColor,
          borderDash: [3, 3],
          fill: false,
          tension: 0.38,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5
        }
      ];
      this.chart.options.scales.y.ticks.callback = (v) => `%${v}`;
    } else if (this.mode === 'pressure') {
      const pressRgb = isDark ? '192, 132, 252' : '147, 51, 234';
      datasets = [
        {
          label: 'Hava Basıncı (hPa)',
          data: recs.map(r => r.basinc),
          borderColor: pressureColor,
          backgroundColor: makeGradient(pressRgb, 0.28, 0.07, 0.0),
          fill: true,
          tension: 0.38,
          borderWidth: 2.75,
          pointRadius: 0,
          pointHoverRadius: 6.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 3,
          pointHoverBorderColor: pressureColor
        }
      ];
      this.chart.options.scales.y.ticks.callback = (v) => `${v} hPa`;
    } else {
      // 'all'
      datasets = [
        {
          label: 'Sıcaklık (°C)',
          data: recs.map(r => r.sicaklik),
          borderColor: tempColor,
          borderWidth: 2.25,
          tension: 0.38,
          pointRadius: 0
        },
        {
          label: 'Rüzgar (km/h)',
          data: recs.map(r => r.ruzgarHizi),
          borderColor: windColor,
          borderWidth: 2.25,
          tension: 0.35,
          pointRadius: 0
        },
        {
          label: 'Nem (%)',
          data: recs.map(r => r.nem),
          borderColor: humColor,
          borderWidth: 1.75,
          borderDash: [3, 3],
          tension: 0.38,
          pointRadius: 0
        }
      ];
      this.chart.options.scales.y.ticks.callback = (v) => v;
    }

    this.chart.data.labels = labels;
    this.chart.data.datasets = datasets;

    this.chart.options.plugins.googleWindArrows = {
      display: showWindArrows,
      windData: windData,
      datasetIndex: 0
    };

    this.chart.update('none');
  }
}

// ==========================================
// 8. ALADIN ARAYÜZ KONTROLCÜSÜ (ALADIN UI)
// ==========================================
class AladinUIController {
  constructor() {
    this.service = new AladinService();
    this.chartManager = null;
    this.currentRecordIndex = 0;
    this.dom = {};
    this.init();
  }

  init() {
    this.cacheDom();
    this.chartManager = new AladinChartManager('aladinTelemetryChart');
    this.bindEvents();
    this.render();

    // Arka planda sessizce taze canlı veriyi çekmeyi dene
    this.refreshData(true);
  }

  cacheDom() {
    this.dom = {
      btnRefresh: document.getElementById('btnAladinRefresh'),
      refreshSpinner: document.getElementById('aladinRefreshSpinner'),
      lastUpdateText: document.getElementById('aladinLastUpdateText'),
      corsBanner: document.getElementById('aladinCorsBanner'),
      btnUnlockCors: document.getElementById('btnUnlockCors'),

      // Hero Card
      heroIcon: document.getElementById('aladinHeroIcon'),
      heroTemp: document.getElementById('aladinHeroTemp'),
      heroFeels: document.getElementById('aladinHeroFeels'),
      heroConditionName: document.getElementById('aladinHeroConditionName'),
      heroConditionDesc: document.getElementById('aladinHeroConditionDesc'),
      heroWind: document.getElementById('aladinHeroWind'),
      heroWindArrow: document.getElementById('aladinHeroWindArrow'),
      heroHumidity: document.getElementById('aladinHeroHumidity'),
      heroRain: document.getElementById('aladinHeroRain'),
      heroPressure: document.getElementById('aladinHeroPressure'),
      heroCloud: document.getElementById('aladinHeroCloud'),

      // Timeline / Carousel
      hourlyTrack: document.getElementById('aladinHourlyTrack'),

      // Desktop Table & Mobile List
      tableBody: document.getElementById('aladinTableBody'),
      mobileList: document.getElementById('aladinMobileList'),
      tableSummary: document.getElementById('aladinTableSummary'),

      // Dictionary Modal
      btnOpenDict: document.getElementById('btnOpenAladinDict'),
      btnCloseDict: document.getElementById('btnCloseAladinDict'),
      modalDict: document.getElementById('modalAladinDict'),
      dictList: document.getElementById('aladinDictList')
    };
  }

  bindEvents() {
    if (this.dom.btnRefresh) {
      this.dom.btnRefresh.addEventListener('click', () => {
        this.refreshData(false);
      });
    }

    if (this.dom.btnUnlockCors) {
      this.dom.btnUnlockCors.addEventListener('click', () => {
        window.open('https://cors-anywhere.herokuapp.com/corsdemo', '_blank');
      });
    }

    document.querySelectorAll('.aladin-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.aladin-mode-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const mode = e.currentTarget.dataset.aladinMode || 'temp';
        if (this.chartManager) this.chartManager.setMode(mode);
      });
    });

    if (this.dom.btnOpenDict && this.dom.modalDict) {
      this.dom.btnOpenDict.addEventListener('click', () => {
        this.renderDictionary();
        this.dom.modalDict.classList.remove('hidden');
      });
    }
    if (this.dom.btnCloseDict && this.dom.modalDict) {
      this.dom.btnCloseDict.addEventListener('click', () => {
        this.dom.modalDict.classList.add('hidden');
      });
    }
  }

  async refreshData(isSilent = false) {
    if (this.service.isFetching) return;
    if (this.dom.refreshSpinner) this.dom.refreshSpinner.classList.remove('hidden');

    try {
      const records = await this.service.fetchFullForecast();

      if (records && records.length > 0) {
        this.render();
        if (!isSilent && window.app && window.app.showToast) {
          window.app.showToast(`MGM ALADIN: ${records.length} saatlik tahmin güncellendi.`, 'success');
        }
      }
    } catch (e) {
      console.warn('ALADIN canlı güncelleme denemesi:', e);
    } finally {
      if (this.dom.refreshSpinner) this.dom.refreshSpinner.classList.add('hidden');
      this.render();
    }
  }

  render() {
    const recs = this.service.records;
    if (!recs || recs.length === 0) return;

    // CORS Uyarı Banner'ı Göster/Gizle
    if (this.dom.corsBanner) {
      if (this.service.needsCorsDemo) {
        this.dom.corsBanner.classList.remove('hidden');
      } else {
        this.dom.corsBanner.classList.add('hidden');
      }
    }

    // Son Güncelleme Metni
    if (this.dom.lastUpdateText) {
      const lu = this.service.lastUpdated || new Date();
      this.dom.lastUpdateText.textContent = `Son Güncelleme: ${lu.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Hero Card Render (İlk / Güncel Saat)
    const cur = recs[this.currentRecordIndex] || recs[0];
    const hadise = getHadiseInfo(cur.hadise);
    const dateObj = new Date(cur.yolSaati || cur.tarih);
    const isNight = dateObj.getHours() < 6 || dateObj.getHours() >= 20;

    if (this.dom.heroIcon) {
      this.dom.heroIcon.innerHTML = Meteocons.getSvg(hadise.type, 56, isNight);
    }
    if (this.dom.heroTemp) this.dom.heroTemp.textContent = Math.round(cur.sicaklik);
    if (this.dom.heroFeels) this.dom.heroFeels.textContent = `Hissedilen: ${Math.round(cur.hissedilenSicaklik)}°C`;
    if (this.dom.heroConditionName) this.dom.heroConditionName.textContent = hadise.name;
    if (this.dom.heroConditionDesc) this.dom.heroConditionDesc.textContent = hadise.desc;

    // Rüzgar ve Pusula
    const windDir = getCompassDirection(cur.ruzgarYonu);
    if (this.dom.heroWind) this.dom.heroWind.textContent = `${cur.ruzgarHizi} km/h (${windDir})`;
    if (this.dom.heroWindArrow) {
      this.dom.heroWindArrow.style.transform = `rotate(${cur.ruzgarYonu}deg)`;
    }

    if (this.dom.heroHumidity) this.dom.heroHumidity.textContent = `%${cur.nem}`;
    if (this.dom.heroRain) this.dom.heroRain.textContent = `${cur.saatlikToplamYagis} mm`;
    if (this.dom.heroPressure) this.dom.heroPressure.textContent = `${cur.basinc} hPa`;
    if (this.dom.heroCloud) this.dom.heroCloud.textContent = `%${cur.bulutKapaliligi}`;

    // Timeline / Carousel Strip
    this.renderHourlyTrack();

    // Chart.js Güncellemesi
    if (this.chartManager) {
      this.chartManager.update(recs);
    }

    // Tablo Güncellemesi
    this.renderTable();

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  renderHourlyTrack() {
    if (!this.dom.hourlyTrack) return;
    const recs = this.service.records;

    this.dom.hourlyTrack.innerHTML = recs.map((r, i) => {
      const hInfo = getHadiseInfo(r.hadise);
      const d = new Date(r.yolSaati || r.tarih);
      const hourStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const dayStr = d.toLocaleDateString('tr-TR', { weekday: 'short' });
      const isNight = d.getHours() < 6 || d.getHours() >= 20;
      const isSelected = i === this.currentRecordIndex;
      const windDir = getCompassDirection(r.ruzgarYonu);

      return `
        <div class="hourly-chip flex-shrink-0 flex flex-col items-center justify-between p-2 sm:p-2.5 rounded-xl border cursor-pointer select-none transition-none ${isSelected ? 'bg-[#546e7a]/15 border-[#546e7a] dark:bg-[#38bdf8]/15 dark:border-[#38bdf8]' : 'bg-[#ffffff] dark:bg-[#181c22] border-[#eceeef] dark:border-[#222831] hover:bg-[#f6f8fa] dark:hover:bg-[#20252e]'}" data-index="${i}" style="min-width: 82px;">
          <div class="text-[10px] text-[#7a828e] dark:text-[#8f96a3] font-medium">${dayStr} ${hourStr}</div>
          <div class="my-1.5 flex items-center justify-center">
            ${Meteocons.getSvg(hInfo.type, 36, isNight)}
          </div>
          <div class="text-sm font-bold text-[#1e293b] dark:text-[#f1f5f9] font-mono">${Math.round(r.sicaklik)}°</div>
          <div class="text-[10px] font-medium text-[#7a828e] dark:text-[#8f96a3] truncate max-w-[70px]">${hInfo.name}</div>
          <div class="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[#546e7a] dark:text-[#38bdf8]">
            <span class="inline-block transform" style="transform: rotate(${r.ruzgarYonu}deg);">➤</span>
            <span>${r.ruzgarHizi}k</span>
          </div>
          ${r.saatlikToplamYagis > 0 ? `<div class="mt-0.5 text-[9px] font-bold text-[#0284c7] dark:text-[#38bdf8]">${r.saatlikToplamYagis}mm</div>` : ''}
        </div>
      `;
    }).join('');

    this.dom.hourlyTrack.querySelectorAll('.hourly-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.index);
        this.currentRecordIndex = idx;
        this.render();
      });
    });
  }

  renderTable() {
    const recs = this.service.records;
    if (!recs || recs.length === 0) return;

    if (this.dom.tableSummary) {
      this.dom.tableSummary.textContent = `${recs.length} saatlik tahmin`;
    }

    // 1. BİLGİSAYAR GÖRÜNÜMÜ: 9 Sütunlu Tam Tablo
    if (this.dom.tableBody) {
      this.dom.tableBody.innerHTML = recs.map(r => {
        const hInfo = getHadiseInfo(r.hadise);
        const d = new Date(r.yolSaati || r.tarih);
        const timeStr = `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
        const isNight = d.getHours() < 6 || d.getHours() >= 20;
        const windDir = getCompassDirection(r.ruzgarYonu);

        return `
          <tr class="hover:bg-[#f6f8fa]/70 dark:hover:bg-[#1e232c]/60 transition-colors">
            <td class="py-2.5 px-3 text-[#525a66] dark:text-[#a1abb8] font-mono text-[11px] whitespace-nowrap">${timeStr}</td>
            <td class="py-2.5 px-3 whitespace-nowrap">
              <div class="flex items-center gap-1.5">
                ${Meteocons.getSvg(hInfo.type, 22, isNight)}
                <span class="font-medium text-[#2d3139] dark:text-[#e4e7eb]">${hInfo.name}</span>
              </div>
            </td>
            <td class="py-2.5 px-3 font-bold text-[#ef4444] dark:text-[#f87171] font-mono">${Math.round(r.sicaklik)}°C</td>
            <td class="py-2.5 px-3 text-[#f59e0b] dark:text-[#fbbf24] font-mono">${Math.round(r.hissedilenSicaklik)}°C</td>
            <td class="py-2.5 px-3 font-semibold ${r.saatlikToplamYagis > 0 ? 'text-[#0284c7] dark:text-[#38bdf8]' : 'text-[#7a828e]'} font-mono">${r.saatlikToplamYagis} mm</td>
            <td class="py-2.5 px-3 whitespace-nowrap">
              <div class="flex items-center gap-1.5 font-mono text-[#10b981] dark:text-[#34d399] font-semibold">
                <span class="inline-block transform text-xs" style="transform: rotate(${r.ruzgarYonu}deg);">➤</span>
                <span>${r.ruzgarHizi} km/h (${windDir})</span>
              </div>
            </td>
            <td class="py-2.5 px-3 text-[#0d9488] dark:text-[#2dd4bf] font-mono">%${r.nem}</td>
            <td class="py-2.5 px-3 text-[#9333ea] dark:text-[#c084fc] font-mono">${r.basinc} hPa</td>
            <td class="py-2.5 px-3 text-[#64748b] dark:text-[#94a3b8] font-mono">%${r.bulutKapaliligi}</td>
          </tr>
        `;
      }).join('');
    }

    // 2. TELEFON GÖRÜNÜMÜ: Telefonlara Tam Uyumlu & Hızlı Kart Listesi
    if (this.dom.mobileList) {
      this.dom.mobileList.innerHTML = recs.map(r => {
        const hInfo = getHadiseInfo(r.hadise);
        const d = new Date(r.yolSaati || r.tarih);
        const dayStr = d.toLocaleDateString('tr-TR', { weekday: 'short' });
        const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
        const isNight = d.getHours() < 6 || d.getHours() >= 20;

        return `
          <div class="p-2.5 rounded-xl bg-[#ffffff] dark:bg-[#181c22] border border-[#eceeef] dark:border-[#222831] space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 flex items-center justify-center shrink-0">
                  ${Meteocons.getSvg(hInfo.type, 28, isNight)}
                </div>
                <div>
                  <div class="text-xs font-bold text-[#0f172a] dark:text-[#f8fafc] font-mono">
                    ${timeStr} <span class="text-[10px] font-sans font-medium text-[#64748b] dark:text-[#94a3b8]">· ${dayStr} ${dateStr}</span>
                  </div>
                  <div class="text-[11px] font-medium text-[#546e7a] dark:text-[#38bdf8]">${hInfo.name}</div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-base font-extrabold text-[#ef4444] dark:text-[#f87171] font-mono leading-none">${Math.round(r.sicaklik)}°C</div>
                <div class="text-[10px] text-[#f59e0b] dark:text-[#fbbf24] font-mono mt-0.5">His: ${Math.round(r.hissedilenSicaklik)}°C</div>
              </div>
            </div>

            <div class="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-[#f1f3f5] dark:border-[#222831] text-[10px] font-mono text-center">
              <div class="flex items-center justify-center gap-1 bg-[#f8fafc] dark:bg-[#1e232c] px-1.5 py-1 rounded-lg text-[#10b981] dark:text-[#34d399] font-semibold" title="Rüzgar Hızı ve Yönü">
                <span class="inline-block transform text-[9px]" style="transform: rotate(${r.ruzgarYonu}deg);">➤</span>
                <span>${r.ruzgarHizi}k</span>
              </div>
              <div class="flex items-center justify-center gap-0.5 bg-[#f8fafc] dark:bg-[#1e232c] px-1.5 py-1 rounded-lg ${r.saatlikToplamYagis > 0 ? 'text-[#0284c7] dark:text-[#38bdf8] font-bold' : 'text-[#64748b] dark:text-[#94a3b8]'}" title="Yağış Miktarı">
                <span>💧${r.saatlikToplamYagis}</span>
              </div>
              <div class="flex items-center justify-center gap-0.5 bg-[#f8fafc] dark:bg-[#1e232c] px-1.5 py-1 rounded-lg text-[#0d9488] dark:text-[#2dd4bf]" title="Bağıl Nem">
                <span>%${r.nem}</span>
              </div>
              <div class="flex items-center justify-center gap-0.5 bg-[#f8fafc] dark:bg-[#1e232c] px-1.5 py-1 rounded-lg text-[#9333ea] dark:text-[#c084fc]" title="Hava Basıncı">
                <span>${r.basinc}h</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  renderDictionary() {
    if (!this.dom.dictList) return;
    const entries = Object.values(MGM_HADİSE_DICT);
    this.dom.dictList.innerHTML = entries.map(item => `
      <div class="p-2.5 rounded-xl border border-[#eceeef] dark:border-[#222831] bg-[#f8fafc] dark:bg-[#1b2027] flex items-center gap-3">
        <div class="w-10 h-10 flex-shrink-0 flex items-center justify-center">
          ${Meteocons.getSvg(item.type, 32, false)}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="font-bold text-xs text-[#0f172a] dark:text-[#f8fafc] font-mono">${item.code}</span>
            <span class="text-xs font-semibold text-[#546e7a] dark:text-[#38bdf8] truncate">· ${item.name}</span>
          </div>
          <p class="text-[11px] text-[#64748b] dark:text-[#94a3b8] leading-tight mt-0.5 line-clamp-2">${item.desc}</p>
        </div>
      </div>
    `).join('');
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.aladinUI = new AladinUIController();
});
