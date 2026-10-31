/**
 * Models — Sayısal Hava Tahmin Modelleri İstasyonu
 * 1. CHMI ALADIN (CZ - Orta Avrupa 2km Yüksek Çözünürlüklü Model - 72 Saat)
 * 2. MGM ALADIN (TR - Türkiye Sayısal Modeli)
 * Canlı & Güncel Veri, Meteocons Hareketli İkonlar, Google Rüzgar Okları & Poppins Font Grafikler
 */

// ==========================================
// 1. WMO HAVA DURUMU KODLARI SÖZLÜĞÜ (OPEN-METEO / CHMI ALADIN)
// ==========================================
const WMO_WEATHER_DICT = {
  0: { code: 0, name: 'Açık', desc: 'Gökyüzü tamamen açık, bulutsuz ve berrak.', type: 'sun' },
  1: { code: 1, name: 'Çoğunlukla Açık', desc: 'Hafif ve ince bulut geçişleri haricinde gökyüzü açık.', type: 'few-clouds' },
  2: { code: 2, name: 'Parçalı Bulutlu', desc: 'Gökyüzünde parçalı bulut kümeleri mevcut.', type: 'partly-cloudy' },
  3: { code: 3, name: 'Çok Bulutlu / Kapalı', desc: 'Gökyüzünün tamamı veya büyük kısmı gri bulut tabakasıyla kaplı.', type: 'cloudy' },
  45: { code: 45, name: 'Sisli', desc: 'Yatay görüş mesafesini düşüren yoğun sis tabakası.', type: 'fog' },
  48: { code: 48, name: 'Kırağılı Sis', desc: 'Aşırı soğuk zeminlerde kırağı bırakan dondurucu sis.', type: 'fog' },
  51: { code: 51, name: 'Hafif Çiseleme', desc: 'İnce taneli, hafif ve aralıklı serpinti çiseleme.', type: 'light-rain' },
  53: { code: 53, name: 'Orta Çiseleme', desc: 'Sürekli ve belirgin şekilde ıslatan çiseleme yağışı.', type: 'light-rain' },
  55: { code: 55, name: 'Yoğun Çiseleme', desc: 'Görüşü azaltan yoğun ve sürekli çiseleyen yağmur.', type: 'light-rain' },
  56: { code: 56, name: 'Hafif Dondurucu Çiseleme', desc: 'Temas ettiği soğuk zeminlerde gizli buzlanma yapan çiseleme.', type: 'sleet' },
  57: { code: 57, name: 'Yoğun Dondurucu Çiseleme', desc: 'Yollarda ve tellerde tehlikeli buzlanma oluşturan çiseleme.', type: 'sleet' },
  61: { code: 61, name: 'Hafif Yağmur', desc: 'Hafif şiddette aralıklı standart yağmur.', type: 'light-rain' },
  63: { code: 63, name: 'Orta Şiddetli Yağmur', desc: 'Düzenli ve orta kuvvette devam eden yağmur yağışı.', type: 'rain' },
  65: { code: 65, name: 'Kuvvetli Yağmur', desc: 'Yoğun, sürekli ve su birikintisi oluşturan şiddetli yağmur.', type: 'heavy-rain' },
  66: { code: 66, name: 'Hafif Dondurucu Yağmur', desc: 'Yere düştüğü anda ince buz tabakasına dönüşen dondurucu yağmur.', type: 'sleet' },
  67: { code: 67, name: 'Kuvvetli Dondurucu Yağmur', desc: 'Ağır buz yükü oluşturan şiddetli dondurucu yağmur.', type: 'sleet' },
  71: { code: 71, name: 'Hafif Karlı', desc: 'Hafif taneli kar serpintisi veya zayıf kar yağışı.', type: 'light-snow' },
  73: { code: 73, name: 'Orta Şiddetli Kar', desc: 'Zeminde örtü bırakan standart lapa lapa kar yağışı.', type: 'snow' },
  75: { code: 75, name: 'Yoğun Karlı', desc: 'Görüşü kısıtlayan ve kalın kar örtüsü bırakan yoğun kar.', type: 'heavy-snow' },
  77: { code: 77, name: 'Kar Taneleri / Granül', desc: 'Sert buzlu granül kar taneleri yağışı.', type: 'snow' },
  80: { code: 80, name: 'Hafif Sağanak Yağış', desc: 'Kısa süreli ve ani başlayan hafif sağanak geçişi.', type: 'rain' },
  81: { code: 81, name: 'Orta Sağanak Yağış', desc: 'Yer yer kuvvetlenen ve aralıklarla duran sağanak yağış.', type: 'heavy-rain' },
  82: { code: 82, name: 'Şiddetli Sağanak Yağış', desc: 'Su baskını riski taşıyan şiddetli sağanak yağış.', type: 'storm-rain' },
  85: { code: 85, name: 'Hafif Kar Sağanağı', desc: 'Ani başlayan ve kısa süren hafif kar sağanağı.', type: 'light-snow' },
  86: { code: 86, name: 'Kuvvetli Kar Sağanağı', desc: 'Rüzgarla savrulan ve tipi etkisi yapan şiddetli kar sağanağı.', type: 'heavy-snow' },
  95: { code: 95, name: 'Gökgürültülü Fırtına', desc: 'Şimşek ve yıldırım aktivitesi eşliğinde yağmur fırtınası.', type: 'thunderstorm' },
  96: { code: 96, name: 'Hafif Dolulu Fırtına', desc: 'Küçük taneli dolu taneleri içeren gökgürültülü fırtına.', type: 'severe-thunderstorm' },
  99: { code: 99, name: 'Kuvvetli Dolulu Fırtına', desc: 'İri dolu ve yıkıcı fırtına riski barındıran şiddetli hava hadisesi.', type: 'severe-thunderstorm' }
};

function getWmoInfo(code) {
  const c = Number(code);
  return WMO_WEATHER_DICT[c] || { code: c, name: 'Hava Durumu', desc: 'Atmosferik model çıktısı', type: 'cloudy' };
}

// ==========================================
// 2. MGM HADİSE SÖZLÜĞÜ (TÜRKİYE MGM KODLARI)
// ==========================================
const MGM_HADİSE_DICT = {
  'A': { code: 'A', name: 'Açık', desc: 'Gökyüzü tamamen açık, bulutsuz veya çok az bulutlu.', type: 'sun' },
  'G': { code: 'G', name: 'Güneşli', desc: 'Gündüz saatlerinde pırıl pırıl güneşli açık hava.', type: 'sun' },
  'AB': { code: 'AB', name: 'Az Bulutlu', desc: 'Gökyüzünün 1/8 ile 2/8\'i bulutlarla kaplı.', type: 'few-clouds' },
  'PB': { code: 'PB', name: 'Parçalı Bulutlu', desc: 'Gökyüzünün 3/8 ile 5/8\'i bulutlarla kaplı.', type: 'partly-cloudy' },
  'CB': { code: 'CB', name: 'Çok Bulutlu', desc: 'Gökyüzünün 6/8 veya daha fazlası bulutlarla kaplı.', type: 'cloudy' },
  'KB': { code: 'KB', name: 'Kapalı', desc: 'Gökyüzünün tamamı (8/8) gri bulut tabakasıyla kaplı.', type: 'cloudy' },
  'B': { code: 'B', name: 'Bulutlu', desc: 'Genel bulutlu gökyüzü tabakası.', type: 'cloudy' },
  'YAB': { code: 'YAB', name: 'Yer Yer Az Bulutlu', desc: 'Bölgesel olarak açık ve az bulutlu geçişler.', type: 'few-clouds' },
  'YPB': { code: 'YPB', name: 'Yer Yer Parçalı Bulutlu', desc: 'Bölgesel olarak değişen parçalı bulutluluk.', type: 'partly-cloudy' },
  'YCB': { code: 'YCB', name: 'Yer Yer Çok Bulutlu', desc: 'Bölgesel olarak yoğunlaşan kapalı bulut kümeleri.', type: 'cloudy' },
  'Y': { code: 'Y', name: 'Yağışlı', desc: 'Genel yağış, aralıklı veya sürekli yağmur.', type: 'rain' },
  'HY': { code: 'HY', name: 'Hafif Yağmurlu', desc: 'Hafif çiseleyen veya ince taneli yağmur.', type: 'light-rain' },
  'ÇIS': { code: 'ÇIS', name: 'Çiseleme', desc: 'Görünmez kadar ince damlacıklı hafif yağış serpintisi.', type: 'light-rain' },
  'SY': { code: 'SY', name: 'Sağanak Yağışlı', desc: 'Kısa süreli, ani başlayan ve duran sağanak yağış.', type: 'heavy-rain' },
  'KSY': { code: 'KSY', name: 'Kuvvetli Sağanak', desc: 'Su baskını riski taşıyan şiddetli ve yoğun sağanak yağış.', type: 'storm-rain' },
  'ÇSY': { code: 'ÇSY', name: 'Çok Şiddetli Sağanak', desc: 'Afet ve sel riski barındıran aşırı sağanak yağış.', type: 'storm-rain' },
  'MSY': { code: 'MSY', name: 'Mevzi Sağanak', desc: 'Yerel ve bölgesel kısa süreli sağanak yağmur geçişleri.', type: 'heavy-rain' },
  'GY': { code: 'GY', name: 'Gökgürültülü Sağanak', desc: 'Şimşek ve gökgürültüsü eşliğinde sağanak yağış.', type: 'thunderstorm' },
  'KGY': { code: 'KGY', name: 'Kuvvetli Gökgürültülü Yağmur', desc: 'Şiddetli gökgürültüsü, yıldırım ve kuvvetli yağış.', type: 'severe-thunderstorm' },
  'ÇKGY': { code: 'ÇKGY', name: 'Çok Kuvvetli Gökgürültülü', desc: 'Yıkıcı yıldırım ve sel riski taşıyan şiddetli fırtına.', type: 'severe-thunderstorm' },
  'YGY': { code: 'YGY', name: 'Yer Yer Gökgürültülü', desc: 'Lokal aralıklarla meydana gelen gökgürültülü yağışlar.', type: 'thunderstorm' },
  'GŞ': { code: 'GŞ', name: 'Gökgürültülü Şimşekli', desc: 'Gökyüzünde yoğun şimşek ve gökgürültüsü aktivitesi.', type: 'thunderstorm' },
  'ŞM': { code: 'ŞM', name: 'Şimşek', desc: 'Yağışsız veya uzakta gerçekleşen elektriksel şimşek deşarjı.', type: 'thunderstorm' },
  'K': { code: 'K', name: 'Karlı', desc: 'Lapa lapa standart kar yağışı.', type: 'snow' },
  'HK': { code: 'HK', name: 'Hafif Karlı', desc: 'Hafif kar serpintisi veya ince taneli kar.', type: 'light-snow' },
  'YK': { code: 'YK', name: 'Yoğun Karlı', desc: 'Görüşü kısıtlayan ve kalın örtü bırakan yoğun kar.', type: 'heavy-snow' },
  'TİPİ': { code: 'TİPİ', name: 'Tipi', desc: 'Kuvvetli fırtına ile savrulan dondurucu kar fırtınası.', type: 'heavy-snow' },
  'SAVK': { code: 'SAVK', name: 'Savrulan Kar', desc: 'Yerdeki kar örtüsünün kuvvetli rüzgarla savrulması.', type: 'light-snow' },
  'KY': { code: 'KY', name: 'Karla Karışık Yağmurlu', desc: 'Yağmur ve kar taneleri birlikte yağıyor (sulusepken).', type: 'sleet' },
  'HKY': { code: 'HKY', name: 'Hafif Karla Karışık', desc: 'Hafif şiddette sulu kar yağışı.', type: 'light-sleet' },
  'YKY': { code: 'YKY', name: 'Yoğun Karla Karışık', desc: 'Zeminde sulu kar birikintisi oluşturan yoğun sulusepken.', type: 'heavy-sleet' },
  'DY': { code: 'DY', name: 'Dolu Yağışlı', desc: 'Sert buz küreleri şeklinde düşen dolu yağışı.', type: 'hail' },
  'KDY': { code: 'KDY', name: 'Kuvvetli Dolu', desc: 'İri taneli, araç ve tarıma zarar verebilecek dolu.', type: 'hail' },
  'S': { code: 'S', name: 'Sisli', desc: 'Yatay görüş mesafesini 1 km\'nin altına düşüren yoğun sis.', type: 'fog' },
  'YS': { code: 'YS', name: 'Yoğun Sis', desc: 'Görüş mesafesini 50 metreye kadar düşüren tehlikeli sis.', type: 'fog' },
  'P': { code: 'P', name: 'Puslu', desc: 'Görüş mesafesini 1-5 km arasına düşüren hafif pus tabakası.', type: 'fog' },
  'D': { code: 'D', name: 'Dumanlı', desc: 'Atmosferde asılı duran sanayi/yangın dumanı ve partiküller.', type: 'fog' },
  'TOZ': { code: 'TOZ', name: 'Toz Taşınımı', desc: 'Atmosferin üst katmanlarından taşınan çöl kökenli mineral toz.', type: 'fog' },
  'KF': { code: 'KF', name: 'Kum / Toz Fırtınası', desc: 'Kuvvetli rüzgarla kalkan yoğun çöl tozu veya kum fırtınası.', type: 'wind' },
  'R': { code: 'R', name: 'Rüzgarlı', desc: 'Belirgin ve hissedilir kuvvette rüzgar akımı.', type: 'wind' },
  'FIR': { code: 'FIR', name: 'Fırtına', desc: 'Bofor 8 ve üzeri (62-74 km/h) kuvvetli fırtına.', type: 'wind' },
  'KFIR': { code: 'KFIR', name: 'Kuvvetli Fırtına', desc: 'Bofor 9-10 (75-102 km/h) çatı uçuran şiddetli fırtına.', type: 'wind' },
  'TFIR': { code: 'TFIR', name: 'Tam Fırtına', desc: 'Bofor 11+ (103 km/h üzeri) afet boyutunda fırtına.', type: 'wind' },
  'HORT': { code: 'HORT', name: 'Hortum', desc: 'Buluttan yere uzanan şiddetli dönen hava hortumu girdabı.', type: 'wind' },
  'DON': { code: 'DON', name: 'Don Hadisesi', desc: 'Hava sıcaklığının 0°C altına inmesiyle oluşan dondurucu soğuk.', type: 'snow' },
  'BDON': { code: 'BDON', name: 'Buzlanma ve Don', desc: 'Yollarda gizli buzlanma ve şiddetli don tehlikesi.', type: 'snow' },
  'KIR': { code: 'KIR', name: 'Kırağı', desc: 'Havadaki su buharının soğuk zeminlerde beyaz kristalleşmesi.', type: 'snow' },
  'KIRÇ': { code: 'KIRÇ', name: 'Kırç', desc: 'Aşırı soğuk sis damlacıklarının tellere ve dallara yapışıp donması.', type: 'snow' },
  'ÇİY': { code: 'ÇİY', name: 'Çiy', desc: 'Gece yüzeylerde yoğuşan berrak su damlacıkları.', type: 'light-rain' },
  'SCK': { code: 'SCK', name: 'Sıcak', desc: 'Mevsim normallerinin üzerinde aşırı sıcak hava.', type: 'sun' },
  'ASCK': { code: 'ASCK', name: 'Aşırı Sıcak', desc: 'Sağlığı tehdit eden 38°C üzeri aşırı sıcak hava dalgası.', type: 'sun' },
  'SGK': { code: 'SGK', name: 'Soğuk', desc: 'Mevsim normallerinin altında dondurucu soğuk hava.', type: 'snow' },
  'ASGK': { code: 'ASGK', name: 'Aşırı Soğuk', desc: 'Sıfırın altında ekstrem kutup kökenli dondurucu hava.', type: 'snow' },
  'ÇIĞ': { code: 'ÇIĞ', name: 'Çığ Tehlikesi', desc: 'Eğimli yamaçlarda biriken kar kütlesinin kayma riski.', type: 'heavy-snow' }
};

const HADİSE_ALIASES = {
  'TIPI': 'TİPİ',
  'KIRC': 'KIRÇ',
  'KIRCI': 'KIRÇ',
  'CIG': 'ÇIĞ',
  'CIS': 'ÇIS',
  'CISELEME': 'ÇIS',
  'GSY': 'GY',
  'FIRTINA': 'FIR',
  'ACIK': 'A',
  'GUNESLI': 'G',
  'PARCALI': 'PB',
  'BULUTLU': 'B',
  'KAPALI': 'KB',
  'YAGMUR': 'Y',
  'YAGMURLU': 'Y',
  'SAGANAK': 'SY',
  'KAR': 'K',
  'KARLI': 'K',
  'SIS': 'S',
  'SISLI': 'S',
  'PUS': 'P',
  'PUSLU': 'P',
  'DUMAN': 'D',
  'RUZGAR': 'R',
  'RUZGARLI': 'R',
  'DOLU': 'DY',
  'SICAK': 'SCK',
  'SOGUK': 'SGK'
};

function getHadiseInfo(rawCode) {
  if (!rawCode) return { code: 'A', name: 'Açık', desc: 'Açık hava', type: 'sun' };
  let upper = String(rawCode).trim().toLocaleUpperCase('tr-TR');
  if (HADİSE_ALIASES[upper]) {
    upper = HADİSE_ALIASES[upper];
  }
  return MGM_HADİSE_DICT[upper] || { code: upper, name: upper, desc: 'Hava Hadisesi', type: 'cloudy' };
}

// ==========================================
// 3. METEOCONS (HAREKETLİ SVG HAVA DURUMU İKONLARI)
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
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <circle cx="26" cy="26" r="11" fill="#f59e0b" class="meteo-sun-pulse"/>
            <path class="meteo-cloud-drift" d="M44 46H20C15.03 46 11 41.97 11 37C11 32.32 14.58 28.48 19.14 28.05C20.61 21.86 26.15 17.2 32.78 17.2C40.52 17.2 46.86 23.36 47.16 31.06C51.17 32.1 54.2 35.74 54.2 40.06C54.2 43.34 49.68 46 44 46Z" fill="#cbd5e1"/>
          </svg>
        `;

      case 'partly-cloudy':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <circle cx="24" cy="24" r="10" fill="#f59e0b"/>
            <path d="M48 48H18C13.03 48 9 43.97 9 39C9 34.32 12.58 30.48 17.14 30.05C18.61 23.86 24.15 19.2 30.78 19.2C38.52 19.2 44.86 25.36 45.16 33.06C49.17 34.1 52.2 37.74 52.2 42.06C52.2 45.34 50.34 48 48 48Z" fill="#64748b" class="meteo-cloud-drift"/>
            <path d="M42 54H20C15.58 54 12 50.42 12 46C12 41.84 15.18 38.42 19.24 38.04C20.54 32.54 25.47 28.4 31.36 28.4C38.24 28.4 43.88 33.88 44.14 40.72C47.71 41.64 50.4 44.88 50.4 48.72C50.4 51.64 46.72 54 42 54Z" fill="#94a3b8" class="meteo-cloud-drift" style="animation-delay: -1.5s"/>
          </svg>
        `;

      case 'cloudy':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M44 38H18C13.58 38 10 34.42 10 30C10 25.84 13.18 22.42 17.24 22.04C18.54 16.54 23.47 12.4 29.36 12.4C36.24 12.4 41.88 17.88 42.14 24.72C45.71 25.64 48.4 28.88 48.4 32.72C48.4 35.64 46.72 38 44 38Z" fill="#64748b"/>
            <path d="M48 48H16C11.58 48 8 44.42 8 40C8 35.84 11.18 32.42 15.24 32.04C16.54 26.54 21.47 22.4 27.36 22.4C34.24 22.4 39.88 27.88 40.14 34.72C43.71 35.64 46.4 38.88 46.4 42.72C46.4 45.64 44.72 48 48 48Z" fill="#94a3b8" class="meteo-cloud-drift"/>
          </svg>
        `;

      case 'light-rain':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 36H17C12.58 36 9 32.42 9 28C9 23.84 12.18 20.42 16.24 20.04C17.54 14.54 22.47 10.4 28.36 10.4C35.24 10.4 40.88 15.88 41.14 22.72C44.71 23.64 47.4 26.88 47.4 30.72C47.4 33.64 46.3 36 45 36Z" fill="#64748b"/>
            <line x1="22" y1="42" x2="19" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" class="meteo-rain-drop"/>
            <line x1="32" y1="42" x2="29" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" class="meteo-rain-drop" style="animation-delay: 0.3s"/>
            <line x1="42" y1="42" x2="39" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" class="meteo-rain-drop" style="animation-delay: 0.6s"/>
          </svg>
        `;

      case 'rain':
      case 'heavy-rain':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 34H17C12.58 34 9 30.42 9 26C9 21.84 12.18 18.42 16.24 18.04C17.54 12.54 22.47 8.4 28.36 8.4C35.24 8.4 40.88 13.88 41.14 20.72C44.71 21.64 47.4 24.88 47.4 28.72C47.4 31.64 46.3 34 45 34Z" fill="#475569"/>
            <line x1="20" y1="40" x2="16" y2="52" stroke="#0284c7" stroke-width="3" stroke-linecap="round" class="meteo-rain-drop"/>
            <line x1="30" y1="40" x2="26" y2="52" stroke="#0284c7" stroke-width="3" stroke-linecap="round" class="meteo-rain-drop" style="animation-delay: 0.25s"/>
            <line x1="40" y1="40" x2="36" y2="52" stroke="#0284c7" stroke-width="3" stroke-linecap="round" class="meteo-rain-drop" style="animation-delay: 0.5s"/>
          </svg>
        `;

      case 'thunderstorm':
      case 'storm-rain':
      case 'severe-thunderstorm':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 34H17C12.58 34 9 30.42 9 26C9 21.84 12.18 18.42 16.24 18.04C17.54 12.54 22.47 8.4 28.36 8.4C35.24 8.4 40.88 13.88 41.14 20.72C44.71 21.64 47.4 24.88 47.4 28.72C47.4 31.64 46.3 34 45 34Z" fill="#334155"/>
            <path d="M30 34L24 45H32L28 58L40 43H32L36 34H30Z" fill="#facc15" stroke="#ca8a04" stroke-width="1.5" class="meteo-lightning"/>
          </svg>
        `;

      case 'light-snow':
      case 'snow':
      case 'heavy-snow':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M44 36H18C13.58 36 10 32.42 10 28C10 23.84 13.18 20.42 17.24 20.04C18.54 14.54 23.47 10.4 29.36 10.4C36.24 10.4 41.88 15.88 41.14 22.72C44.71 23.64 48.4 26.88 48.4 30.72C48.4 33.64 46.72 36 44 36Z" fill="#94a3b8"/>
            <circle cx="22" cy="46" r="2.5" fill="#e0e7ff" class="meteo-snow-flake"/>
            <circle cx="32" cy="48" r="3" fill="#e0e7ff" class="meteo-snow-flake" style="animation-delay: 0.4s"/>
            <circle cx="42" cy="46" r="2.5" fill="#e0e7ff" class="meteo-snow-flake" style="animation-delay: 0.8s"/>
          </svg>
        `;

      case 'sleet':
      case 'hail':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M44 36H18C13.58 36 10 32.42 10 28C10 23.84 13.18 20.42 17.24 20.04C18.54 14.54 23.47 10.4 29.36 10.4C36.24 10.4 41.88 15.88 41.14 22.72C44.71 23.64 48.4 26.88 48.4 30.72C48.4 33.64 46.72 36 44 36Z" fill="#64748b"/>
            <line x1="22" y1="42" x2="19" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" class="meteo-rain-drop"/>
            <circle cx="34" cy="48" r="2.5" fill="#cbd5e1" class="meteo-snow-flake"/>
            <line x1="42" y1="42" x2="39" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" class="meteo-rain-drop" style="animation-delay: 0.5s"/>
          </svg>
        `;

      case 'fog':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <line x1="16" y1="26" x2="48" y2="26" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
            <line x1="12" y1="34" x2="52" y2="34" stroke="#64748b" stroke-width="4" stroke-linecap="round" class="meteo-cloud-drift"/>
            <line x1="18" y1="42" x2="46" y2="42" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
            <line x1="22" y1="50" x2="42" y2="50" stroke="#cbd5e1" stroke-width="3.5" stroke-linecap="round"/>
          </svg>
        `;

      case 'wind':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M12 24H38C41.31 24 44 21.31 44 18C44 14.69 41.31 12 38 12C34.69 12 32 14.69 32 18" stroke="#10b981" stroke-width="3.5" stroke-linecap="round" fill="none"/>
            <path d="M8 32H44C47.31 32 50 34.69 50 38C50 41.31 47.31 44 44 44C40.69 44 38 41.31 38 38" stroke="#34d399" stroke-width="3.5" stroke-linecap="round" fill="none"/>
            <path d="M14 40H30C32.21 40 34 41.79 34 44C34 46.21 32.21 48 30 48" stroke="#10b981" stroke-width="3" stroke-linecap="round" fill="none"/>
          </svg>
        `;

      default:
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M44 34H18C13.58 34 10 30.42 10 26C10 21.84 13.18 18.42 17.24 18.04C18.54 12.54 23.47 8.4 29.36 8.4C36.24 8.4 41.88 13.88 41.14 20.72C44.71 21.64 47.4 24.88 47.4 28.72C47.4 31.64 46.72 34 44 34Z" fill="#64748b"/>
          </svg>
        `;
    }
  }
};

// ==========================================
// 4. PUSULA YÖNÜ HESAPLAYICI (16 YÖN TÜRKÇE)
// ==========================================
function getCompassDirection(deg) {
  if (deg == null || isNaN(deg)) return 'K';
  const directions = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
  const index = Math.round(((deg % 360) / 22.5)) % 16;
  return directions[index];
}

// ==========================================
// 5. CHMI ALADIN SERVİSİ (OPEN-METEO 72 SAAT)
// ==========================================
class ChmiAladinService {
  constructor() {
    this.apiUrl = 'https://api.open-meteo.com/v1/forecast?latitude=40.2311&longitude=28.8402&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,snowfall,snow_depth_water_equivalent,visibility,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,wind_gusts_10m,wind_direction_10m,wind_speed_10m,surface_pressure,pressure_msl,weather_code,cape,surface_temperature,vapour_pressure_deficit,et0_fao_evapotranspiration,is_day,wet_bulb_temperature_2m,sunshine_duration,snowfall_water_equivalent&models=chmi_aladin_central_europe_2km&forecast_days=3';
    this.records = [];
    this.lastUpdated = null;
    this.isFetching = false;
    this.loadCache();
  }

  loadCache() {
    try {
      const cached = localStorage.getItem('models_chmi_aladin_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
          this.records = parsed.records;
          this.lastUpdated = parsed.lastUpdated ? new Date(parsed.lastUpdated) : null;
        }
      }
    } catch (e) {
      console.warn('CHMI cache yüklenemedi:', e);
    }
  }

  saveCache() {
    try {
      localStorage.setItem('models_chmi_aladin_v1', JSON.stringify({
        lastUpdated: this.lastUpdated ? this.lastUpdated.toISOString() : new Date().toISOString(),
        records: this.records
      }));
    } catch (e) {}
  }

  async fetchForecast() {
    if (this.isFetching) {
      return { success: false, records: this.records, count: this.records.length, error: 'Sorgulama sürüyor' };
    }
    this.isFetching = true;

    try {
      const res = await fetch(this.apiUrl, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) {
        throw new Error(`Open-Meteo HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data || !data.hourly || !Array.isArray(data.hourly.time)) {
        throw new Error('Geçersiz model verisi alındı');
      }

      const h = data.hourly;
      const count = h.time.length;
      const parsedRecords = [];

      for (let i = 0; i < count; i++) {
        const timeIso = h.time[i];
        const wCode = h.weather_code[i] != null ? h.weather_code[i] : 0;
        const hadise = getWmoInfo(wCode);

        parsedRecords.push({
          time: timeIso,
          tarih: timeIso,
          sicaklik: Number(h.temperature_2m[i] != null ? h.temperature_2m[i] : 0),
          hissedilenSicaklik: Number(h.apparent_temperature[i] != null ? h.apparent_temperature[i] : h.temperature_2m[i]),
          dewPoint: Number(h.dew_point_2m[i] != null ? h.dew_point_2m[i] : 0),
          wetBulb: Number(h.wet_bulb_temperature_2m[i] != null ? h.wet_bulb_temperature_2m[i] : 0),
          surfaceTemp: Number(h.surface_temperature[i] != null ? h.surface_temperature[i] : 0),
          nem: Number(h.relative_humidity_2m[i] != null ? h.relative_humidity_2m[i] : 0),
          saatlikToplamYagis: Number(h.precipitation[i] != null ? h.precipitation[i] : 0),
          rain: Number(h.rain[i] != null ? h.rain[i] : 0),
          snowfall: Number(h.snowfall[i] != null ? h.snowfall[i] : 0),
          precipProb: h.precipitation_probability && h.precipitation_probability[i] != null ? h.precipitation_probability[i] : null,
          ruzgarHizi: Math.round(Number(h.wind_speed_10m[i] != null ? h.wind_speed_10m[i] : 0)),
          windGust: Math.round(Number(h.wind_gusts_10m[i] != null ? h.wind_gusts_10m[i] : 0)),
          ruzgarYonu: Number(h.wind_direction_10m[i] != null ? h.wind_direction_10m[i] : 0),
          basinc: Math.round(Number(h.pressure_msl[i] != null ? h.pressure_msl[i] : 1013)),
          surfacePressure: Math.round(Number(h.surface_pressure[i] != null ? h.surface_pressure[i] : 1000)),
          bulutKapaliligi: Number(h.cloud_cover[i] != null ? h.cloud_cover[i] : 0),
          cloudLow: Number(h.cloud_cover_low[i] != null ? h.cloud_cover_low[i] : 0),
          cloudMid: Number(h.cloud_cover_mid[i] != null ? h.cloud_cover_mid[i] : 0),
          cloudHigh: Number(h.cloud_cover_high[i] != null ? h.cloud_cover_high[i] : 0),
          cape: Math.round(Number(h.cape[i] != null ? h.cape[i] : 0)),
          visibility: Math.round(Number(h.visibility[i] != null ? h.visibility[i] : 10000)),
          vpd: Number(h.vapour_pressure_deficit[i] != null ? h.vapour_pressure_deficit[i] : 0),
          et0: Number(h.et0_fao_evapotranspiration[i] != null ? h.et0_fao_evapotranspiration[i] : 0),
          isDay: h.is_day[i] != null ? Number(h.is_day[i]) : 1,
          weatherCode: wCode,
          hadise: hadise
        });
      }

      this.records = parsedRecords;
      this.lastUpdated = new Date();
      this.saveCache();
      return { success: true, count: parsedRecords.length, records: parsedRecords };
    } catch (err) {
      console.warn('CHMI fetch hatası:', err);
      return { success: false, records: this.records, count: this.records.length, error: err.message };
    } finally {
      this.isFetching = false;
    }
  }
}

// ==========================================
// 6. MGM ALADIN SERVİSİ (TÜRKİYE MGM MODELİ)
// ==========================================
class MgmAladinService {
  constructor() {
    this.records = [];
    this.lastUpdated = null;
    this.isFetching = false;
    this.loadCache();
  }

  loadCache() {
    try {
      const cached = localStorage.getItem('models_mgm_aladin_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
          this.records = parsed.records;
          this.lastUpdated = parsed.lastUpdated ? new Date(parsed.lastUpdated) : null;
        }
      }
    } catch (e) {}
  }

  saveCache() {
    try {
      localStorage.setItem('models_mgm_aladin_v1', JSON.stringify({
        lastUpdated: this.lastUpdated ? this.lastUpdated.toISOString() : new Date().toISOString(),
        records: this.records
      }));
    } catch (e) {}
  }

  async fetchForecast() {
    if (this.isFetching) {
      return { success: false, records: this.records, count: this.records.length };
    }
    this.isFetching = true;

    try {
      // 1. Önce yerel sunucu /api/aladin proxy'sini dene
      let fetched = await this.tryLocalProxy();
      if (!fetched || fetched.length === 0) {
        // 2. data/aladin.json dosyasını çek
        fetched = await this.tryStaticJson();
      }

      if (fetched && fetched.length > 0) {
        const mapped = fetched.map(r => {
          const hInfo = getHadiseInfo(r.hadise);
          return {
            time: r.yolSaati || r.tarih,
            tarih: r.yolSaati || r.tarih,
            sicaklik: Number(r.sicaklik != null ? r.sicaklik : 0),
            hissedilenSicaklik: Number(r.hissedilenSicaklik != null ? r.hissedilenSicaklik : r.sicaklik),
            dewPoint: null,
            nem: Number(r.nem != null ? r.nem : 0),
            saatlikToplamYagis: Number(r.saatlikToplamYagis != null ? r.saatlikToplamYagis : 0),
            rain: Number(r.saatlikToplamYagis != null ? r.saatlikToplamYagis : 0),
            snowfall: Number(r.karYuksekligi != null ? r.karYuksekligi : 0),
            ruzgarHizi: Math.round(Number(r.ruzgarHizi != null ? r.ruzgarHizi : 0)),
            windGust: null,
            ruzgarYonu: Number(r.ruzgarYonu != null ? r.ruzgarYonu : 0),
            basinc: Math.round(Number(r.basinc != null ? r.basinc : 1013)),
            surfacePressure: null,
            bulutKapaliligi: Number(r.bulutKapaliligi != null ? r.bulutKapaliligi : 0),
            cape: null,
            visibility: null,
            isDay: null,
            hadise: hInfo
          };
        });

        mapped.sort((a, b) => new Date(a.time) - new Date(b.time));
        this.records = mapped;
        this.lastUpdated = new Date();
        this.saveCache();
        return { success: true, count: mapped.length, records: mapped };
      }

      return { success: false, records: this.records, count: this.records.length, error: 'MGM verisine ulaşılamadı' };
    } catch (e) {
      return { success: false, records: this.records, count: this.records.length, error: e.message };
    } finally {
      this.isFetching = false;
    }
  }

  async tryLocalProxy() {
    try {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:00`;
      const url = `/api/aladin?enlem=40.22641349141202_40.22426402187642&boylam=28.794067381240897_28.868328096577898&tarih=${encodeURIComponent(dateStr)}&step=60`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) return json;
      }
    } catch (e) {}
    return null;
  }

  async tryStaticJson() {
    try {
      const res = await fetch('./data/aladin.json?t=' + Date.now(), { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) return json;
        if (json && Array.isArray(json.records)) return json.records;
      }
    } catch (e) {}
    return null;
  }
}

// ==========================================
// 7. CHART.JS GOOGLE RÜZGAR OKLARI EKLENTİSİ
// ==========================================
const googleWindArrowsPlugin = {
  id: 'googleWindArrows',
  afterDatasetsDraw(chart, args, options) {
    if (!options || !options.display || !options.windData || options.windData.length === 0) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(options.datasetIndex || 0);
    if (!meta || !meta.data) return;

    ctx.save();
    const isDark = document.documentElement.classList.contains('dark');
    const arrowColor = isDark ? '#34d399' : '#10b981';

    meta.data.forEach((element, index) => {
      const item = options.windData[index];
      if (!item || item.speed == null) return;
      const x = element.x;
      const y = element.y - 14;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((item.direction * Math.PI) / 180);

      ctx.fillStyle = arrowColor;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });

    ctx.restore();
  }
};

if (typeof Chart !== 'undefined') {
  Chart.register(googleWindArrowsPlugin);
}

// ==========================================
// 8. MODELS GRAFİK YÖNETİCİSİ (POPPINS FONT)
// ==========================================
class ModelsChartManager {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.chart = null;
    this.mode = 'temp';
    this.records = [];
    this.initChart();
  }

  initChart() {
    if (!this.canvas || typeof Chart === 'undefined') return;
    const ctx = this.canvas.getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');

    Chart.defaults.font.family = "'Poppins', sans-serif";

    this.chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          googleWindArrows: { display: false, windData: [], datasetIndex: 0 },
          tooltip: {
            enabled: true,
            animation: false,
            backgroundColor: isDark ? 'rgba(23, 30, 41, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            borderColor: isDark ? '#283343' : '#cbd5e1',
            borderWidth: 1,
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            padding: 10,
            cornerRadius: 12,
            boxPadding: 4,
            usePointStyle: true,
            titleFont: { family: 'Poppins', size: 12, weight: 700 },
            bodyFont: { family: 'Poppins', size: 11, weight: 600 },
            callbacks: {
              title: (items) => {
                if (!items || items.length === 0) return '';
                const idx = items[0].dataIndex;
                const rec = this.records[idx];
                if (rec) {
                  const d = new Date(rec.time);
                  const hName = rec.hadise ? rec.hadise.name : '';
                  return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · ${hName}`;
                }
                return items[0].label || '';
              },
              afterBody: (items) => {
                if (!items || items.length === 0) return '';
                const idx = items[0].dataIndex;
                const rec = this.records[idx];
                if (!rec) return '';
                const dir = getCompassDirection(rec.ruzgarYonu);
                const list = [
                  `💨 Rüzgar: ${rec.ruzgarHizi} km/h (${dir} ${rec.ruzgarYonu}°)${rec.windGust ? ` · Hamle: ${rec.windGust} km/h` : ''}`,
                  `💧 Nem: %${rec.nem}${rec.dewPoint != null ? ` · Çiy Noktası: ${rec.dewPoint}°C` : ''}`,
                  `🌧️ Yağış: ${rec.saatlikToplamYagis} mm · Basınç: ${rec.basinc} hPa`
                ];
                if (rec.cape != null && rec.cape > 0) {
                  list.push(`⚡ CAPE: ${rec.cape} J/kg`);
                }
                return list;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
              borderDash: [3, 3]
            },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: { family: 'Poppins', size: 10, weight: 600 },
              maxTicksLimit: 12
            }
          },
          y: {
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
              borderDash: [3, 3]
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

  updateTheme() {
    if (!this.chart) return;
    this.update();
  }

  update(records = null) {
    if (records) this.records = records;
    if (!this.chart || this.records.length === 0) return;
    if (this.canvas.offsetParent === null) return;

    const isDark = document.documentElement.classList.contains('dark');
    const recs = this.records;

    const labels = recs.map(r => {
      const d = new Date(r.time);
      return `${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    });

    const tempColor = isDark ? '#f87171' : '#ef4444';
    const feelsColor = isDark ? '#fbbf24' : '#f59e0b';
    const dewColor = isDark ? '#38bdf8' : '#0284c7';
    const rainColor = isDark ? '#38bdf8' : '#0284c7';
    const snowColor = isDark ? '#a5b4fc' : '#6366f1';
    const windColor = isDark ? '#34d399' : '#10b981';
    const gustColor = isDark ? '#facc15' : '#eab308';
    const humColor = isDark ? '#2dd4bf' : '#0d9488';
    const cloudColor = isDark ? '#94a3b8' : '#64748b';
    const pressureColor = isDark ? '#c084fc' : '#9333ea';
    const capeColor = isDark ? '#fb923c' : '#ea580c';

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
      if (recs.some(r => r.dewPoint != null)) {
        datasets.push({
          label: 'Çiy Noktası (°C)',
          data: recs.map(r => r.dewPoint),
          borderColor: dewColor,
          borderDash: [2, 2],
          fill: false,
          tension: 0.38,
          borderWidth: 1.5,
          pointRadius: 0
        });
      }
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
        }
      ];
      if (recs.some(r => r.snowfall > 0)) {
        datasets.push({
          label: 'Kar (cm)',
          data: recs.map(r => r.snowfall),
          borderColor: snowColor,
          backgroundColor: isDark ? 'rgba(165, 180, 252, 0.35)' : 'rgba(99, 102, 241, 0.28)',
          fill: true,
          type: 'bar',
          borderWidth: 1.5,
          borderRadius: 6
        });
      }
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
      if (recs.some(r => r.windGust != null && r.windGust > 0)) {
        datasets.push({
          label: 'Hamle / Gust (km/h)',
          data: recs.map(r => r.windGust),
          borderColor: gustColor,
          borderDash: [3, 3],
          fill: false,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 0
        });
      }
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
          pointRadius: 0
        },
        {
          label: 'Bulut Kapalılığı (%)',
          data: recs.map(r => r.bulutKapaliligi),
          borderColor: cloudColor,
          borderDash: [3, 3],
          fill: false,
          tension: 0.38,
          borderWidth: 2,
          pointRadius: 0
        }
      ];
      this.chart.options.scales.y.ticks.callback = (v) => `%${v}`;
    } else if (this.mode === 'pressure') {
      const pressRgb = isDark ? '192, 132, 252' : '147, 51, 234';
      datasets = [
        {
          label: 'Deniz Seviyesi Basıncı (hPa)',
          data: recs.map(r => r.basinc),
          borderColor: pressureColor,
          backgroundColor: makeGradient(pressRgb, 0.28, 0.07, 0.0),
          fill: true,
          tension: 0.38,
          borderWidth: 2.75,
          pointRadius: 0
        }
      ];
      if (recs.some(r => r.surfacePressure != null)) {
        datasets.push({
          label: 'Yüzey Basıncı (hPa)',
          data: recs.map(r => r.surfacePressure),
          borderColor: isDark ? '#e9d5ff' : '#7e22ce',
          borderDash: [3, 3],
          fill: false,
          tension: 0.38,
          borderWidth: 1.75,
          pointRadius: 0
        });
      }
      this.chart.options.scales.y.ticks.callback = (v) => `${v} hPa`;
    } else if (this.mode === 'cape') {
      const capeRgb = isDark ? '251, 146, 60' : '234, 88, 12';
      datasets = [
        {
          label: 'CAPE (J/kg)',
          data: recs.map(r => r.cape || 0),
          borderColor: capeColor,
          backgroundColor: makeGradient(capeRgb, 0.35, 0.10, 0.0),
          fill: true,
          tension: 0.38,
          borderWidth: 2.5,
          pointRadius: 0
        }
      ];
      this.chart.options.scales.y.ticks.callback = (v) => `${v} J/kg`;
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
// 9. MODELS ARAYÜZ KONTROLCÜSÜ (MODELS UI)
// ==========================================
class ModelsUIController {
  constructor() {
    this.activeModel = localStorage.getItem('models_active_model') || 'chmi';
    this.chmiService = new ChmiAladinService();
    this.mgmService = new MgmAladinService();
    this.chartManager = null;
    this.selectedIndex = 0;
    this.dictTab = 'wmo';
    this.dom = {};
    this.init();
  }

  get activeService() {
    return this.activeModel === 'chmi' ? this.chmiService : this.mgmService;
  }

  init() {
    this.cacheDom();
    if (document.getElementById('modelsChartCanvas')) {
      this.chartManager = new ModelsChartManager('modelsChartCanvas');
    }
    this.bindEvents();
    this.updateModelTabsUI();
    this.render();

    // Otomatik canlı veri çek
    this.refreshCurrentModel(true);
  }

  cacheDom() {
    this.dom = {
      // Header Switchers & Actions
      btnModelChmi: document.getElementById('btnModelChmi'),
      btnModelMgm: document.getElementById('btnModelMgm'),
      btnRefreshModel: document.getElementById('btnRefreshModel'),
      modelRefreshSpinner: document.getElementById('modelRefreshSpinner'),
      btnOpenDict: document.getElementById('btnOpenDict'),

      // Model Header Metadata
      modelTitleText: document.getElementById('modelTitleText'),
      modelBadgeText: document.getElementById('modelBadgeText'),
      modelLocationText: document.getElementById('modelLocationText'),
      modelLastUpdateText: document.getElementById('modelLastUpdateText'),

      // Hero Card
      heroIcon: document.getElementById('heroIcon'),
      heroTemp: document.getElementById('heroTemp'),
      heroFeels: document.getElementById('heroFeels'),
      heroDewPoint: document.getElementById('heroDewPoint'),
      heroConditionName: document.getElementById('heroConditionName'),
      heroConditionDesc: document.getElementById('heroConditionDesc'),

      // Hero 6 Badges
      heroWind: document.getElementById('heroWind'),
      heroWindGust: document.getElementById('heroWindGust'),
      heroWindArrow: document.getElementById('heroWindArrow'),
      heroHumidity: document.getElementById('heroHumidity'),
      heroRain: document.getElementById('heroRain'),
      heroPressure: document.getElementById('heroPressure'),
      heroCloud: document.getElementById('heroCloud'),
      heroCape: document.getElementById('heroCape'),
      heroCapeContainer: document.getElementById('heroCapeContainer'),

      // Desktop Table & Mobile List
      desktopTableBody: document.getElementById('desktopTableBody'),
      mobileListContainer: document.getElementById('mobileListContainer'),

      // Sözlük Modal
      modalDict: document.getElementById('modalDict'),
      btnCloseDict: document.getElementById('btnCloseDict'),
      dictSearch: document.getElementById('dictSearch'),
      dictList: document.getElementById('dictList'),
      btnDictTabWmo: document.getElementById('btnDictTabWmo'),
      btnDictTabMgm: document.getElementById('btnDictTabMgm')
    };
  }

  bindEvents() {
    // Model Değiştirici Tablar
    if (this.dom.btnModelChmi) {
      this.dom.btnModelChmi.addEventListener('click', () => {
        this.switchModel('chmi');
      });
    }
    if (this.dom.btnModelMgm) {
      this.dom.btnModelMgm.addEventListener('click', () => {
        this.switchModel('mgm');
      });
    }

    // Güncelleme Butonu
    if (this.dom.btnRefreshModel) {
      this.dom.btnRefreshModel.addEventListener('click', () => {
        this.refreshCurrentModel(false);
      });
    }

    // Grafik Modu Butonları
    document.querySelectorAll('.models-chart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.models-chart-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const mode = e.currentTarget.dataset.mode || 'temp';
        if (this.chartManager) this.chartManager.setMode(mode);
      });
    });

    // Sözlük Modalı Olayları
    if (this.dom.btnOpenDict && this.dom.modalDict) {
      this.dom.btnOpenDict.addEventListener('click', () => {
        if (this.dom.dictSearch) this.dom.dictSearch.value = '';
        this.renderDictionary();
        this.dom.modalDict.classList.remove('hidden');
      });
    }
    if (this.dom.btnCloseDict && this.dom.modalDict) {
      this.dom.btnCloseDict.addEventListener('click', () => {
        this.dom.modalDict.classList.add('hidden');
      });
      this.dom.modalDict.addEventListener('click', (e) => {
        if (e.target === this.dom.modalDict) {
          this.dom.modalDict.classList.add('hidden');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.dom.modalDict.classList.contains('hidden')) {
          this.dom.modalDict.classList.add('hidden');
        }
      });
    }

    if (this.dom.btnDictTabWmo) {
      this.dom.btnDictTabWmo.addEventListener('click', () => {
        this.dictTab = 'wmo';
        this.dom.btnDictTabWmo.classList.add('active');
        if (this.dom.btnDictTabMgm) this.dom.btnDictTabMgm.classList.remove('active');
        this.renderDictionary(this.dom.dictSearch ? this.dom.dictSearch.value : '');
      });
    }
    if (this.dom.btnDictTabMgm) {
      this.dom.btnDictTabMgm.addEventListener('click', () => {
        this.dictTab = 'mgm';
        this.dom.btnDictTabMgm.classList.add('active');
        if (this.dom.btnDictTabWmo) this.dom.btnDictTabWmo.classList.remove('active');
        this.renderDictionary(this.dom.dictSearch ? this.dom.dictSearch.value : '');
      });
    }

    if (this.dom.dictSearch) {
      this.dom.dictSearch.addEventListener('input', (e) => {
        this.renderDictionary(e.target.value);
      });
    }
  }

  switchModel(modelKey) {
    if (this.activeModel === modelKey) return;
    this.activeModel = modelKey;
    localStorage.setItem('models_active_model', modelKey);
    this.selectedIndex = 0;
    this.updateModelTabsUI();
    this.render();
    this.refreshCurrentModel(true);
  }

  updateModelTabsUI() {
    if (this.activeModel === 'chmi') {
      if (this.dom.btnModelChmi) this.dom.btnModelChmi.classList.add('active');
      if (this.dom.btnModelMgm) this.dom.btnModelMgm.classList.remove('active');
    } else {
      if (this.dom.btnModelMgm) this.dom.btnModelMgm.classList.add('active');
      if (this.dom.btnModelChmi) this.dom.btnModelChmi.classList.remove('active');
    }
  }

  async refreshCurrentModel(isSilent = false) {
    const s = this.activeService;
    if (s.isFetching) return;

    if (this.dom.btnRefreshModel) {
      this.dom.btnRefreshModel.disabled = true;
      this.dom.btnRefreshModel.classList.add('opacity-70', 'cursor-not-allowed');
    }
    if (this.dom.modelRefreshSpinner) {
      this.dom.modelRefreshSpinner.classList.add('animate-spin');
    }

    try {
      const result = await s.fetchForecast();
      if (result && result.success && result.count > 0) {
        this.render();
        if (!isSilent && window.app && window.app.showToast) {
          const modelLabel = this.activeModel === 'chmi' ? 'CHMI ALADIN (CZ)' : 'MGM ALADIN (TR)';
          window.app.showToast(`${modelLabel}: ${result.count} saatlik güncel model verisi başarıyla yüklendi.`, 'success');
        }
      } else {
        if (!isSilent && window.app && window.app.showToast) {
          window.app.showToast('Model sunucusundan yeni veri alınamadı. Önceki veriler korunuyor.', 'error');
        }
      }
    } catch (e) {
      console.warn('Canlı model sorgulama hatası:', e);
      if (!isSilent && window.app && window.app.showToast) {
        window.app.showToast('Bağlantı hatası: Önceki veriler görüntüleniyor.', 'error');
      }
    } finally {
      if (this.dom.modelRefreshSpinner) {
        this.dom.modelRefreshSpinner.classList.remove('animate-spin');
      }
      if (this.dom.btnRefreshModel) {
        this.dom.btnRefreshModel.disabled = false;
        this.dom.btnRefreshModel.classList.remove('opacity-70', 'cursor-not-allowed');
      }
      this.render();
    }
  }

  render() {
    const s = this.activeService;
    const recs = s.records;

    // Model Başlık & Bilgi Barı
    if (this.activeModel === 'chmi') {
      if (this.dom.modelTitleText) this.dom.modelTitleText.textContent = 'CHMI ALADIN Modeli';
      if (this.dom.modelBadgeText) this.dom.modelBadgeText.textContent = 'Orta Avrupa 2km · 72 Saat';
      if (this.dom.modelLocationText) this.dom.modelLocationText.textContent = 'Bursa Nilüfer (40.231°K, 28.840°D)';
      if (this.dom.heroCapeContainer) this.dom.heroCapeContainer.classList.remove('hidden');
    } else {
      if (this.dom.modelTitleText) this.dom.modelTitleText.textContent = 'MGM ALADIN Modeli';
      if (this.dom.modelBadgeText) this.dom.modelBadgeText.textContent = 'Türkiye 4.5km';
      if (this.dom.modelLocationText) this.dom.modelLocationText.textContent = 'Bursa Nilüfer (40.224°K, 28.868°D)';
      if (this.dom.heroCapeContainer) this.dom.heroCapeContainer.classList.add('hidden');
    }

    if (this.dom.modelLastUpdateText) {
      if (s.lastUpdated) {
        const lu = new Date(s.lastUpdated);
        this.dom.modelLastUpdateText.textContent = `Son Güncelleme: ${lu.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      } else {
        this.dom.modelLastUpdateText.textContent = 'Son Güncelleme: Bekleniyor';
      }
    }

    if (!recs || recs.length === 0) {
      if (this.dom.heroConditionName) this.dom.heroConditionName.textContent = 'Model Verisi Yükleniyor...';
      if (this.dom.heroConditionDesc) this.dom.heroConditionDesc.textContent = 'Canlı sayısal tahmin çıktısı taranıyor...';
      return;
    }

    // Hero Card Render (Seçili veya İlk Saat)
    const cur = recs[this.selectedIndex] || recs[0];
    const hadise = cur.hadise || { name: 'Hava Durumu', desc: '', type: 'cloudy' };
    const dateObj = new Date(cur.time);
    const isNight = cur.isDay !== null && cur.isDay !== undefined ? cur.isDay === 0 : (dateObj.getHours() < 6 || dateObj.getHours() >= 20);

    if (this.dom.heroIcon) {
      this.dom.heroIcon.innerHTML = Meteocons.getSvg(hadise.type, 64, isNight);
    }
    if (this.dom.heroTemp) this.dom.heroTemp.textContent = Math.round(cur.sicaklik);
    if (this.dom.heroFeels) this.dom.heroFeels.textContent = `Hissedilen: ${Math.round(cur.hissedilenSicaklik)}°C`;
    if (this.dom.heroDewPoint) {
      if (cur.dewPoint != null) {
        this.dom.heroDewPoint.textContent = `Çiy Noktası: ${Math.round(cur.dewPoint)}°C`;
        this.dom.heroDewPoint.classList.remove('hidden');
      } else {
        this.dom.heroDewPoint.classList.add('hidden');
      }
    }
    if (this.dom.heroConditionName) this.dom.heroConditionName.textContent = hadise.name;
    if (this.dom.heroConditionDesc) this.dom.heroConditionDesc.textContent = hadise.desc;

    // Rüzgar ve Pusula
    const windDir = getCompassDirection(cur.ruzgarYonu);
    if (this.dom.heroWind) this.dom.heroWind.textContent = `${cur.ruzgarHizi} km/h (${windDir} ${cur.ruzgarYonu}°)`;
    if (this.dom.heroWindGust) {
      if (cur.windGust != null && cur.windGust > 0) {
        this.dom.heroWindGust.textContent = `Hamle: ${cur.windGust} km/h`;
        this.dom.heroWindGust.classList.remove('hidden');
      } else {
        this.dom.heroWindGust.classList.add('hidden');
      }
    }
    if (this.dom.heroWindArrow) {
      this.dom.heroWindArrow.style.transform = `rotate(${cur.ruzgarYonu}deg)`;
    }

    if (this.dom.heroHumidity) this.dom.heroHumidity.textContent = `%${cur.nem}`;
    if (this.dom.heroRain) this.dom.heroRain.textContent = `${cur.saatlikToplamYagis} mm`;
    if (this.dom.heroPressure) this.dom.heroPressure.textContent = `${cur.basinc} hPa`;
    if (this.dom.heroCloud) this.dom.heroCloud.textContent = `%${cur.bulutKapaliligi}`;
    if (this.dom.heroCape) {
      this.dom.heroCape.textContent = cur.cape != null ? `${cur.cape} J/kg` : '--';
    }

    // Grafik Güncellemesi
    if (this.chartManager) {
      this.chartManager.update(recs);
    }

    // Tablo ve Mobil Liste Render
    this.renderTable(recs);
    this.renderMobileList(recs);

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  renderTable(recs) {
    if (!this.dom.desktopTableBody) return;

    this.dom.desktopTableBody.innerHTML = recs.map((r, i) => {
      const hInfo = r.hadise || { name: 'Hava Durumu', type: 'cloudy' };
      const d = new Date(r.time);
      const timeStr = `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
      const isNight = r.isDay !== null && r.isDay !== undefined ? r.isDay === 0 : (d.getHours() < 6 || d.getHours() >= 20);
      const windDir = getCompassDirection(r.ruzgarYonu);
      const isSelected = i === this.selectedIndex;

      return `
        <tr class="table-row cursor-pointer select-none border-b border-[#cbd5e1]/70 dark:border-[#283343] transition-colors ${isSelected ? 'bg-[#2563eb]/15 dark:bg-[#60a5fa]/20' : 'hover:bg-[#dae2eb]/60 dark:hover:bg-[#1f2837]/60'}" data-index="${i}">
          <td class="py-2.5 px-3 text-[#0f172a] dark:text-[#f8fafc] font-mono text-[11px] font-bold whitespace-nowrap">${timeStr}</td>
          <td class="py-2.5 px-3 whitespace-nowrap">
            <div class="flex items-center gap-2">
              ${Meteocons.getSvg(hInfo.type, 24, isNight)}
              <span class="font-extrabold text-[#0f172a] dark:text-[#f8fafc]">${hInfo.name}</span>
            </div>
          </td>
          <td class="py-2.5 px-3 font-mono whitespace-nowrap">
            <span class="text-sm font-black text-[#0f172a] dark:text-[#f8fafc]">${Math.round(r.sicaklik)}°</span>
            <span class="text-[10px] text-[#475569] dark:text-[#94a3b8] font-bold">(${Math.round(r.hissedilenSicaklik)}°)</span>
          </td>
          <td class="py-2.5 px-3 font-mono whitespace-nowrap">
            ${r.saatlikToplamYagis > 0
              ? `<span class="font-extrabold text-[#2563eb] dark:text-[#60a5fa]">${r.saatlikToplamYagis} mm</span>`
              : `<span class="text-[#64748b] dark:text-[#94a3b8]">0 mm</span>`
            }
          </td>
          <td class="py-2.5 px-3 whitespace-nowrap">
            <div class="flex items-center gap-1.5 font-mono text-[#15803d] dark:text-[#4ade80] font-extrabold">
              <span class="inline-block transform" style="transform: rotate(${r.ruzgarYonu}deg);">➤</span>
              <span>${r.ruzgarHizi} km/h</span>
              <span class="text-[10px] text-[#475569] dark:text-[#94a3b8]">(${windDir})</span>
              ${r.windGust ? `<span class="text-[10px] text-[#d97706] font-bold">[${r.windGust}]</span>` : ''}
            </div>
          </td>
          <td class="py-2.5 px-3 font-mono text-[#0f766e] dark:text-[#2dd4bf] font-extrabold whitespace-nowrap">
            %${r.nem}
            ${r.dewPoint != null ? `<span class="text-[10px] text-[#475569] dark:text-[#94a3b8] font-bold">(${Math.round(r.dewPoint)}°)</span>` : ''}
          </td>
          <td class="py-2.5 px-3 font-mono text-[#7e22ce] dark:text-[#c084fc] font-extrabold whitespace-nowrap">${r.basinc} hPa</td>
          <td class="py-2.5 px-3 font-mono text-[#475569] dark:text-[#94a3b8] font-extrabold whitespace-nowrap">%${r.bulutKapaliligi}</td>
          ${r.cape != null ? `
            <td class="py-2.5 px-3 font-mono ${r.cape > 300 ? 'text-[#ea580c] font-black' : 'text-[#64748b] dark:text-[#94a3b8] font-bold'} whitespace-nowrap">
              ${r.cape} J/kg
            </td>
          ` : '<td class="py-2.5 px-3 font-mono text-[#64748b] text-[10px]">--</td>'}
        </tr>
      `;
    }).join('');

    this.dom.desktopTableBody.querySelectorAll('.table-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.index);
        this.selectedIndex = idx;
        this.render();
      });
    });
  }

  renderMobileList(recs) {
    if (!this.dom.mobileListContainer) return;

    this.dom.mobileListContainer.innerHTML = recs.map((r, i) => {
      const hInfo = r.hadise || { name: 'Hava Durumu', type: 'cloudy' };
      const d = new Date(r.time);
      const hourStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const dayStr = d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
      const isNight = r.isDay !== null && r.isDay !== undefined ? r.isDay === 0 : (d.getHours() < 6 || d.getHours() >= 20);
      const windDir = getCompassDirection(r.ruzgarYonu);
      const isSelected = i === this.selectedIndex;

      return `
        <div class="p-3 rounded-xl border cursor-pointer select-none transition-colors ${isSelected ? 'bg-[#2563eb]/15 border-[#2563eb] dark:bg-[#60a5fa]/20 dark:border-[#60a5fa]' : 'bg-[#edf2f7] dark:bg-[#171e29] border-[#cbd5e1] dark:border-[#283343] active:bg-[#dae2eb]'}" data-index="${i}">
          <div class="flex items-center justify-between gap-2 border-b border-[#cbd5e1]/60 dark:border-[#283343] pb-2">
            <div class="flex items-center gap-2">
              ${Meteocons.getSvg(hInfo.type, 30, isNight)}
              <div>
                <span class="text-xs font-black text-[#0f172a] dark:text-[#f8fafc]">${hInfo.name}</span>
                <div class="text-[10px] text-[#475569] dark:text-[#94a3b8] font-bold">${dayStr} · ${hourStr}</div>
              </div>
            </div>
            <div class="text-right">
              <span class="text-lg font-black text-[#0f172a] dark:text-[#f8fafc] font-mono">${Math.round(r.sicaklik)}°C</span>
              <div class="text-[10px] text-[#475569] dark:text-[#94a3b8] font-bold">His: ${Math.round(r.hissedilenSicaklik)}°C</div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-1.5 pt-2 text-[11px] font-mono">
            <div class="flex items-center justify-center gap-1 bg-[#e2e8f0] dark:bg-[#1f2837] border border-[#cbd5e1]/60 dark:border-[#283343] px-1 py-1 rounded-lg text-[#15803d] dark:text-[#4ade80] font-extrabold" title="Rüzgar Hızı ve Yönü">
              <span class="inline-block transform" style="transform: rotate(${r.ruzgarYonu}deg);">➤</span>
              <span>${r.ruzgarHizi} km/h</span>
            </div>
            <div class="flex items-center justify-center gap-1 bg-[#e2e8f0] dark:bg-[#1f2837] border border-[#cbd5e1]/60 dark:border-[#283343] px-1 py-1 rounded-lg ${r.saatlikToplamYagis > 0 ? 'text-[#2563eb] dark:text-[#60a5fa] font-black' : 'text-[#64748b] dark:text-[#94a3b8] font-bold'}" title="Yağış">
              <span>💧 ${r.saatlikToplamYagis} mm</span>
            </div>
            <div class="flex items-center justify-center gap-1 bg-[#e2e8f0] dark:bg-[#1f2837] border border-[#cbd5e1]/60 dark:border-[#283343] px-1 py-1 rounded-lg text-[#0f766e] dark:text-[#2dd4bf] font-extrabold" title="Bağıl Nem">
              <span>%${r.nem}</span>
            </div>
          </div>

          ${r.cape != null && r.cape > 0 ? `
            <div class="mt-1.5 flex items-center justify-between text-[10px] font-mono text-[#ea580c] font-bold px-1">
              <span>⚡ Konvektif Enerji (CAPE)</span>
              <span>${r.cape} J/kg</span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    this.dom.mobileListContainer.querySelectorAll('[data-index]').forEach(card => {
      card.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.index);
        this.selectedIndex = idx;
        this.render();
      });
    });
  }

  renderDictionary(query = '') {
    if (!this.dom.dictList) return;
    const q = query.trim().toLocaleLowerCase('tr-TR');

    let items = [];
    if (this.dictTab === 'wmo') {
      items = Object.values(WMO_WEATHER_DICT);
    } else {
      items = Object.values(MGM_HADİSE_DICT);
    }

    if (q) {
      items = items.filter(it =>
        String(it.code).toLocaleLowerCase('tr-TR').includes(q) ||
        it.name.toLocaleLowerCase('tr-TR').includes(q) ||
        it.desc.toLocaleLowerCase('tr-TR').includes(q)
      );
    }

    if (items.length === 0) {
      this.dom.dictList.innerHTML = `
        <div class="p-6 text-center text-xs text-[#475569] dark:text-[#94a3b8] font-bold">
          Aramanızla eşleşen hadise bulunamadı.
        </div>
      `;
      return;
    }

    this.dom.dictList.innerHTML = items.map(it => `
      <div class="p-2.5 rounded-xl bg-[#e2e8f0] dark:bg-[#1f2837] border border-[#cbd5e1] dark:border-[#283343] flex items-center gap-3">
        <div class="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-[#edf2f7] dark:bg-[#171e29] border border-[#cbd5e1]/60 dark:border-[#283343]">
          ${Meteocons.getSvg(it.type, 28, false)}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="px-1.5 py-0.5 rounded-md bg-[#2563eb]/15 text-[#2563eb] dark:text-[#60a5fa] font-mono text-[10px] font-black">${it.code}</span>
            <span class="text-xs font-black text-[#0f172a] dark:text-[#f8fafc]">${it.name}</span>
          </div>
          <p class="text-[11px] text-[#475569] dark:text-[#94a3b8] font-semibold mt-0.5 leading-snug">${it.desc}</p>
        </div>
      </div>
    `).join('');
  }
}

// Global bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.modelsUI = new ModelsUIController();
});
