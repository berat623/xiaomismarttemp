/**
 * Models — Sayısal Hava Tahmin Modelleri İstasyonu
 * 1. ECMWF HRES 9km (Avrupa Merkezi · 15 Gün / 360 Saat)
 * 2. ECMWF AIFS (Avrupa Merkezi Yapay Zeka · 15 Gün / 360 Saat)
 * 3. CHMI ALADIN 2km (Çek Hidrometeoroloji · 3 Gün / 72 Saat)
 * 4. UKMO 10km (İngiltere Met Office · 7 Gün / 168 Saat)
 * 5. GFS 22km (NOAA NCEP · 16 Gün / 384 Saat)
 * 6. GFS AI 25km (NOAA AIGFS Yapay Zeka · 16 Gün / 384 Saat)
 * 7. GEM 15km (Kanada Meteoroloji · 10 Gün / 240 Saat)
 * Canlı & Doğrulanmış Open-Meteo API'leri, GMT+3 Saat Uyumu, Statik Hızlı İkonlar & Sıfır Donma
 */

// ==========================================
// 1. MODEL KONFİGÜRASYONLARI (7 KÜRESEL MODEL)
// ==========================================
const MODEL_CONFIGS = {
  ecmwf: {
    key: 'ecmwf',
    name: 'ECMWF 9km',
    fullName: 'ECMWF IFS HRES 9km Modeli',
    badge: 'Avrupa Merkezi · 9 km · 15 Gün (360 Saat)',
    location: 'Bursa Nilüfer (40.231°K, 28.840°D)',
    provider: 'open-meteo',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.2311&longitude=28.8402&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,runoff,visibility,et0_fao_evapotranspiration,potential_evapotranspiration,sunshine_duration,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,pressure_msl,surface_pressure,weather_code,total_column_integrated_water_vapour,convective_inhibition,cape,wind_gusts_10m,wind_direction_200m,wind_direction_100m,wind_direction_10m,wind_speed_200m,wind_speed_100m,wind_speed_10m,surface_temperature,vapour_pressure_deficit,precipitation_type,wet_bulb_temperature_2m,is_day&models=ecmwf_ifs&timezone=auto&forecast_days=15'
  },
  aifs: {
    key: 'aifs',
    name: 'ECMWF AIFS',
    fullName: 'ECMWF AIFS Yapay Zeka Modeli',
    badge: 'Avrupa Merkezi Yapay Zeka · ~25 km · 15 Gün (360 Saat)',
    location: 'Bursa Nilüfer (40.231°K, 28.840°D)',
    provider: 'open-meteo',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.2311&longitude=28.8402&hourly=temperature_2m,dew_point_2m,relative_humidity_2m,apparent_temperature,precipitation,precipitation_probability,rain,snowfall,showers,runoff,visibility,et0_fao_evapotranspiration,potential_evapotranspiration,sunshine_duration,cloud_cover_high,cloud_cover_low,cloud_cover_mid,cloud_cover,surface_pressure,pressure_msl,weather_code,total_column_integrated_water_vapour,convective_inhibition,wind_gusts_10m,cape,wind_direction_200m,wind_direction_100m,wind_direction_10m,wind_speed_200m,wind_speed_10m,wind_speed_100m,soil_moisture_100_to_255cm,soil_moisture_28_to_100cm,soil_moisture_7_to_28cm,soil_moisture_0_to_7cm,soil_temperature_100_to_255cm,soil_temperature_28_to_100cm,soil_temperature_7_to_28cm,soil_temperature_0_to_7cm,surface_temperature,vapour_pressure_deficit&models=ecmwf_aifs025_single&timezone=auto&forecast_days=15'
  },
  chmi: {
    key: 'chmi',
    name: 'CZ ALADIN 2km',
    fullName: 'CHMI ALADIN 2km Modeli',
    badge: 'Çek Hidrometeoroloji · 2 km · 3 Gün (72 Saat)',
    location: 'Bursa Nilüfer (40.231°K, 28.840°D)',
    provider: 'open-meteo',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.2311&longitude=28.8402&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,snowfall,snow_depth_water_equivalent,visibility,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,wind_gusts_10m,wind_direction_10m,wind_speed_10m,surface_pressure,pressure_msl,weather_code,cape,surface_temperature,vapour_pressure_deficit,et0_fao_evapotranspiration,is_day,wet_bulb_temperature_2m,sunshine_duration,snowfall_water_equivalent&models=chmi_aladin_central_europe_2km&timezone=auto&forecast_days=3'
  },
  ukmo: {
    key: 'ukmo',
    name: 'UKMO 10km',
    fullName: 'UK Met Office Global Deterministic 10km',
    badge: 'İngiltere Meteoroloji · 10 km · 7 Gün (168 Saat)',
    location: 'Bursa Nilüfer (40.231°K, 28.840°D)',
    provider: 'open-meteo',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.2311&longitude=28.8402&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,apparent_temperature,precipitation,rain,showers,surface_pressure,pressure_msl,visibility,weather_code,snow_depth_water_equivalent,hail,snowfall,cloud_cover_2m,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,vapour_pressure_deficit,et0_fao_evapotranspiration,wind_gusts_10m,wind_direction_10m,wind_speed_10m,is_day,wet_bulb_temperature_2m,convective_inhibition,sunshine_duration,freezing_level_height,cape&models=ukmo_global_deterministic_10km&timezone=auto&forecast_days=7'
  },
  gfs: {
    key: 'gfs',
    name: 'GFS 22km',
    fullName: 'NOAA NCEP GFS 22km Modeli',
    badge: 'NOAA NCEP · 22 km · 16 Gün (384 Saat)',
    location: 'Bursa Nilüfer (40.231°K, 28.840°D)',
    provider: 'open-meteo',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.2311&longitude=28.8402&hourly=temperature_2m,snow_depth,snowfall,showers,rain,precipitation,precipitation_probability,apparent_temperature,dew_point_2m,relative_humidity_2m,vapour_pressure_deficit,evapotranspiration,et0_fao_evapotranspiration,visibility,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,surface_pressure,pressure_msl,weather_code,temperature_80m,wind_gusts_10m,wind_direction_80m,wind_direction_10m,wind_speed_80m,wind_speed_10m,surface_temperature,uv_index,is_day,sunshine_duration,wet_bulb_temperature_2m,convective_inhibition,cape&models=ncep_gfs_global&timezone=auto&forecast_days=16'
  },
  aigfs: {
    key: 'aigfs',
    name: 'GFS AI',
    fullName: 'NOAA AIGFS Yapay Zeka Modeli',
    badge: 'NOAA AI-GFS · ~25 km · 16 Gün (384 Saat)',
    location: 'Bursa Nilüfer (40.231°K, 28.840°D)',
    provider: 'open-meteo',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.2311&longitude=28.8402&hourly=temperature_2m,snow_depth,snowfall,showers,rain,precipitation,precipitation_probability,apparent_temperature,dew_point_2m,relative_humidity_2m,vapour_pressure_deficit,evapotranspiration,et0_fao_evapotranspiration,visibility,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,surface_pressure,pressure_msl,weather_code,temperature_80m,wind_gusts_10m,wind_direction_80m,wind_direction_10m,wind_speed_80m,wind_speed_10m,surface_temperature,uv_index,is_day,sunshine_duration,wet_bulb_temperature_2m,convective_inhibition,cape&models=ncep_aigfs025&timezone=auto&forecast_days=16'
  },
  gem: {
    key: 'gem',
    name: 'GEM 15km',
    fullName: 'CMC GEM GDPS Kanada Modeli',
    badge: 'Kanada Meteoroloji · ~15 km · 10 Gün (240 Saat)',
    location: 'Bursa Nilüfer (40.231°K, 28.840°D)',
    provider: 'open-meteo',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.2311&longitude=28.8402&hourly=temperature_2m,snowfall,showers,rain,precipitation,precipitation_probability,apparent_temperature,dew_point_2m,vapour_pressure_deficit,et0_fao_evapotranspiration,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,surface_pressure,pressure_msl,weather_code,relative_humidity_2m,wind_gusts_10m,wind_direction_120m,wind_direction_80m,wind_direction_40m,wind_direction_10m,wind_speed_120m,wind_speed_80m,wind_speed_40m,wind_speed_10m,soil_moisture_0_to_10cm,soil_temperature_0_to_10cm,temperature_120m,temperature_80m,temperature_40m,sunshine_duration,is_day,wet_bulb_temperature_2m,cape&models=cmc_gem_gdps&timezone=auto&forecast_days=10'
  }
};

// ==========================================
// 2. WMO HAVA DURUMU KODLARI (OPEN-METEO)
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
// 3. METEOCONS (STATİK, ULTRA-HAFİF SVG İKONLARI)
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
              <circle cx="48" cy="18" r="2" fill="#e0e7ff"/>
              <circle cx="52" cy="32" r="1.5" fill="#c7d2fe"/>
            </svg>
          `;
        }
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <g>
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
            <circle cx="26" cy="26" r="11" fill="#f59e0b"/>
            <path d="M44 46H20C15.03 46 11 41.97 11 37C11 32.32 14.58 28.48 19.14 28.05C20.61 21.86 26.15 17.2 32.78 17.2C40.52 17.2 46.86 23.36 47.16 31.06C51.17 32.1 54.2 35.74 54.2 40.06C54.2 43.34 49.68 46 44 46Z" fill="#cbd5e1"/>
          </svg>
        `;

      case 'partly-cloudy':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <circle cx="24" cy="24" r="10" fill="#f59e0b"/>
            <path d="M48 48H18C13.03 48 9 43.97 9 39C9 34.32 12.58 30.48 17.14 30.05C18.61 23.86 24.15 19.2 30.78 19.2C38.52 19.2 44.86 25.36 45.16 33.06C49.17 34.1 52.2 37.74 52.2 42.06C52.2 45.34 50.34 48 48 48Z" fill="#64748b"/>
            <path d="M42 54H20C15.58 54 12 50.42 12 46C12 41.84 15.18 38.42 19.24 38.04C20.54 32.54 25.47 28.4 31.36 28.4C38.24 28.4 43.88 33.88 44.14 40.72C47.71 41.64 50.4 44.88 50.4 48.72C50.4 51.64 46.72 54 42 54Z" fill="#94a3b8"/>
          </svg>
        `;

      case 'cloudy':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M44 38H18C13.58 38 10 34.42 10 30C10 25.84 13.18 22.42 17.24 22.04C18.54 16.54 23.47 12.4 29.36 12.4C36.24 12.4 41.88 17.88 42.14 24.72C45.71 25.64 48.4 28.88 48.4 32.72C48.4 35.64 46.72 38 44 38Z" fill="#64748b"/>
            <path d="M48 48H16C11.58 48 8 44.42 8 40C8 35.84 11.18 32.42 15.24 32.04C16.54 26.54 21.47 22.4 27.36 22.4C34.24 22.4 39.88 27.88 40.14 34.72C43.71 35.64 46.4 38.88 46.4 42.72C46.4 45.64 44.72 48 48 48Z" fill="#94a3b8"/>
          </svg>
        `;

      case 'light-rain':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 36H17C12.58 36 9 32.42 9 28C9 23.84 12.18 20.42 16.24 20.04C17.54 14.54 22.47 10.4 28.36 10.4C35.24 10.4 40.88 15.88 41.14 22.72C44.71 23.64 47.4 26.88 47.4 30.72C47.4 33.64 46.3 36 45 36Z" fill="#64748b"/>
            <line x1="22" y1="42" x2="19" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="32" y1="42" x2="29" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="42" y1="42" x2="39" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        `;

      case 'rain':
      case 'heavy-rain':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 34H17C12.58 34 9 30.42 9 26C9 21.84 12.18 18.42 16.24 18.04C17.54 12.54 22.47 8.4 28.36 8.4C35.24 8.4 40.88 13.88 41.14 20.72C44.71 21.64 47.4 24.88 47.4 28.72C47.4 31.64 46.3 34 45 34Z" fill="#475569"/>
            <line x1="20" y1="40" x2="16" y2="52" stroke="#0284c7" stroke-width="3" stroke-linecap="round"/>
            <line x1="30" y1="40" x2="26" y2="52" stroke="#0284c7" stroke-width="3" stroke-linecap="round"/>
            <line x1="40" y1="40" x2="36" y2="52" stroke="#0284c7" stroke-width="3" stroke-linecap="round"/>
          </svg>
        `;

      case 'thunderstorm':
      case 'storm-rain':
      case 'severe-thunderstorm':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 34H17C12.58 34 9 30.42 9 26C9 21.84 12.18 18.42 16.24 18.04C17.54 12.54 22.47 8.4 28.36 8.4C35.24 8.4 40.88 13.88 41.14 20.72C44.71 21.64 47.4 24.88 47.4 28.72C47.4 31.64 46.3 34 45 34Z" fill="#334155"/>
            <path d="M30 34L24 45H32L28 58L40 43H32L36 34H30Z" fill="#facc15" stroke="#ca8a04" stroke-width="1.5"/>
          </svg>
        `;

      case 'light-snow':
      case 'snow':
      case 'heavy-snow':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 36H17C12.58 36 9 32.42 9 28C9 23.84 12.18 20.42 16.24 20.04C17.54 14.54 22.47 10.4 28.36 10.4C35.24 10.4 40.88 15.88 41.14 22.72C44.71 23.64 47.4 26.88 47.4 30.72C47.4 33.64 46.3 36 45 36Z" fill="#64748b"/>
            <circle cx="22" cy="46" r="2.5" fill="#cbd5e1"/>
            <circle cx="32" cy="46" r="2.5" fill="#cbd5e1"/>
            <circle cx="42" cy="46" r="2.5" fill="#cbd5e1"/>
          </svg>
        `;

      case 'sleet':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M45 36H17C12.58 36 9 32.42 9 28C9 23.84 12.18 20.42 16.24 20.04C17.54 14.54 22.47 10.4 28.36 10.4C35.24 10.4 40.88 15.88 41.14 22.72C44.71 23.64 47.4 26.88 47.4 30.72C47.4 33.64 46.3 36 45 36Z" fill="#64748b"/>
            <line x1="22" y1="42" x2="19" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="34" cy="48" r="2.5" fill="#cbd5e1"/>
            <line x1="42" y1="42" x2="39" y2="50" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        `;

      case 'fog':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <line x1="16" y1="26" x2="48" y2="26" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
            <line x1="12" y1="34" x2="52" y2="34" stroke="#64748b" stroke-width="4" stroke-linecap="round"/>
            <line x1="18" y1="42" x2="46" y2="42" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
            <line x1="22" y1="50" x2="42" y2="50" stroke="#cbd5e1" stroke-width="3.5" stroke-linecap="round"/>
          </svg>
        `;

      case 'wind':
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <path d="M12 28H42C46.42 28 50 24.42 50 20C50 15.58 46.42 12 42 12C37.58 12 34 15.58 34 20" stroke="#10b981" stroke-width="4" stroke-linecap="round"/>
            <path d="M8 36H48C52.42 36 56 39.58 56 44C56 48.42 52.42 52 48 52C43.58 52 40 48.42 40 44" stroke="#34d399" stroke-width="4" stroke-linecap="round"/>
            <line x1="14" y1="44" x2="34" y2="44" stroke="#6ee7b7" stroke-width="3.5" stroke-linecap="round"/>
          </svg>
        `;

      default:
        return `
          <svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" class="shrink-0">
            <circle cx="32" cy="32" r="16" fill="#cbd5e1"/>
          </svg>
        `;
    }
  }
};

// ==========================================
// 4. PUSULA YÖNÜ VE TÜRKİYE (GMT+3) ZAMAN YARDIMCILARI
// ==========================================
function getCompassDirection(deg) {
  if (deg == null || isNaN(deg)) return 'K';
  const directions = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
  const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return directions[index];
}

function formatTurkeyDate(timeInput, options = {}) {
  const d = typeof timeInput === 'string' ? new Date(timeInput) : timeInput;
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', ...options });
}

function getTurkeyDayKey(timeInput) {
  const d = typeof timeInput === 'string' ? new Date(timeInput) : timeInput;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function getTurkeyTodayKey() {
  return getTurkeyDayKey(new Date());
}

function getTurkeyTomorrowKey() {
  return getTurkeyDayKey(new Date(Date.now() + 86400000));
}

function findCurrentHourIndex(records) {
  if (!records || records.length === 0) return 0;
  const nowMs = Date.now();
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < records.length; i++) {
    const tMs = new Date(records[i].time).getTime();
    const diff = Math.abs(tMs - nowMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}

// ==========================================
// 5. GENEL OPEN-METEO MODEL SERVİSİ (YÜKSEK HIZ & DOĞRULUK)
// ==========================================
class OpenMeteoModelService {
  constructor(config) {
    this.config = config;
    this.records = [];
    this.lastUpdated = null;
    this.isFetching = false;
    this.loadCache();
  }

  loadCache() {
    try {
      const cached = localStorage.getItem(`models_cache_${this.config.key}_v2`);
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
      localStorage.setItem(`models_cache_${this.config.key}_v2`, JSON.stringify({
        lastUpdated: this.lastUpdated ? this.lastUpdated.toISOString() : new Date().toISOString(),
        records: this.records
      }));
    } catch (e) {}
  }

  async fetchForecast(forceFresh = false) {
    if (this.isFetching) {
      return { success: false, records: this.records, count: this.records.length, error: 'Sorgulama sürüyor' };
    }
    this.isFetching = true;

    try {
      const fetchUrl = forceFresh ? `${this.config.url}&_t=${Date.now()}` : this.config.url;
      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(9000) });
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
        const rawTime = h.time[i];
        // Open-Meteo &timezone=auto ile Europe/Istanbul (GMT+3) döndürür.
        const timeIso = (rawTime.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(rawTime))
          ? rawTime
          : rawTime + '+03:00';

        const wCode = h.weather_code && h.weather_code[i] != null ? h.weather_code[i] : 0;
        const hadise = getWmoInfo(wCode);

        // Yağış parametresi (precipitation, rain, showers)
        let precipVal = 0;
        if (h.precipitation && h.precipitation[i] != null) {
          precipVal = Number(h.precipitation[i]);
        } else if (h.rain && h.rain[i] != null) {
          precipVal = Number(h.rain[i]);
        }

        // Görüş mesafesi km cinsine çevrilir (m -> km)
        let visKm = null;
        if (h.visibility && h.visibility[i] != null) {
          visKm = Math.round(Number(h.visibility[i]) / 1000 * 10) / 10;
        }

        // Güneşlenme süresi dakika cinsine çevrilir (sn -> dk)
        let sunshineMins = null;
        if (h.sunshine_duration && h.sunshine_duration[i] != null) {
          sunshineMins = Math.round(Number(h.sunshine_duration[i]) / 60);
        }

        parsedRecords.push({
          time: timeIso,
          tarih: timeIso,
          sicaklik: Number(h.temperature_2m && h.temperature_2m[i] != null ? h.temperature_2m[i] : 0),
          hissedilenSicaklik: Number(h.apparent_temperature && h.apparent_temperature[i] != null ? h.apparent_temperature[i] : (h.temperature_2m ? h.temperature_2m[i] : 0)),
          dewPoint: h.dew_point_2m && h.dew_point_2m[i] != null ? Number(Number(h.dew_point_2m[i]).toFixed(1)) : null,
          wetBulb: h.wet_bulb_temperature_2m && h.wet_bulb_temperature_2m[i] != null ? Number(Number(h.wet_bulb_temperature_2m[i]).toFixed(1)) : null,
          surfaceTemp: h.surface_temperature && h.surface_temperature[i] != null ? Number(Number(h.surface_temperature[i]).toFixed(1)) : null,
          nem: Number(h.relative_humidity_2m && h.relative_humidity_2m[i] != null ? h.relative_humidity_2m[i] : 0),
          saatlikToplamYagis: Number(precipVal.toFixed(2)),
          rain: h.rain && h.rain[i] != null ? Number(h.rain[i]) : 0,
          snowfall: h.snowfall && h.snowfall[i] != null ? Number(h.snowfall[i]) : 0,
          precipProb: h.precipitation_probability && h.precipitation_probability[i] != null ? Number(h.precipitation_probability[i]) : null,
          ruzgarHizi: Math.round(Number(h.wind_speed_10m && h.wind_speed_10m[i] != null ? h.wind_speed_10m[i] : 0)),
          windGust: h.wind_gusts_10m && h.wind_gusts_10m[i] != null ? Math.round(Number(h.wind_gusts_10m[i])) : null,
          ruzgarYonu: Number(h.wind_direction_10m && h.wind_direction_10m[i] != null ? h.wind_direction_10m[i] : 0),
          basinc: Math.round(Number(h.pressure_msl && h.pressure_msl[i] != null ? h.pressure_msl[i] : (h.surface_pressure ? h.surface_pressure[i] : 1013))),
          surfacePressure: h.surface_pressure && h.surface_pressure[i] != null ? Math.round(Number(h.surface_pressure[i])) : null,
          bulutKapaliligi: Number(h.cloud_cover && h.cloud_cover[i] != null ? h.cloud_cover[i] : 0),
          cloudLow: h.cloud_cover_low && h.cloud_cover_low[i] != null ? Number(h.cloud_cover_low[i]) : null,
          cloudMid: h.cloud_cover_mid && h.cloud_cover_mid[i] != null ? Number(h.cloud_cover_mid[i]) : null,
          cloudHigh: h.cloud_cover_high && h.cloud_cover_high[i] != null ? Number(h.cloud_cover_high[i]) : null,
          cape: h.cape && h.cape[i] != null ? Math.round(Number(h.cape[i])) : null,
          cin: h.convective_inhibition && h.convective_inhibition[i] != null ? Math.round(Number(h.convective_inhibition[i])) : null,
          visibility: visKm,
          vpd: h.vapour_pressure_deficit && h.vapour_pressure_deficit[i] != null ? Number(Number(h.vapour_pressure_deficit[i]).toFixed(2)) : null,
          et0: h.et0_fao_evapotranspiration && h.et0_fao_evapotranspiration[i] != null ? Number(Number(h.et0_fao_evapotranspiration[i]).toFixed(2)) : null,
          uvIndex: h.uv_index && h.uv_index[i] != null ? Number(Number(h.uv_index[i]).toFixed(1)) : null,
          sunshine: sunshineMins,
          isDay: h.is_day && h.is_day[i] != null ? Number(h.is_day[i]) : null,
          hadise: hadise
        });
      }

      parsedRecords.sort((a, b) => new Date(a.time) - new Date(b.time));
      this.records = parsedRecords;
      this.lastUpdated = new Date();
      this.saveCache();

      return { success: true, count: parsedRecords.length, records: parsedRecords };
    } catch (err) {
      return { success: false, records: this.records, count: this.records.length, error: err.message };
    } finally {
      this.isFetching = false;
    }
  }
}

// ==========================================
// 6. CHART.JS GOOGLE RÜZGAR OKLARI EKLENTİSİ
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

    const totalCount = options.windData.length;
    const step = totalCount > 100 ? 4 : (totalCount > 48 ? 2 : 1);

    meta.data.forEach((element, index) => {
      if (index % step !== 0) return;
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
// 7. MODELS GRAFİK YÖNETİCİSİ (PARAMETRE İZOLASYONLU)
// ==========================================
class ModelsChartManager {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.statPill = document.getElementById('chartStatPill');
    this.chart = null;
    this.mode = 'temp';
    this.scope = 'all'; // 'all' (Tüm Günler) veya 'day' (Seçili Gün)
    this.allRecords = [];
    this.dayRecords = [];
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
        normalized: true,
        spanGaps: true,
        // Mobil dokunma optimizasyonu: touchmove'u Chart.js yakalamasın, sayfa kayması pürüzsüz aksın
        events: ['mousemove', 'mouseout', 'click', 'touchstart'],
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          googleWindArrows: { display: false, windData: [], datasetIndex: 0 },
          tooltip: {
            enabled: true,
            animation: false,
            backgroundColor: isDark ? 'rgba(23, 30, 41, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            borderColor: isDark ? '#283343' : '#cbd5e1',
            borderWidth: 1.5,
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            padding: { top: 8, bottom: 8, left: 12, right: 12 },
            cornerRadius: 12,
            boxPadding: 5,
            usePointStyle: true,
            titleFont: { family: 'Poppins', size: 12, weight: 700 },
            bodyFont: { family: 'Poppins', size: 11, weight: 600 },
            callbacks: {
              title: (items) => {
                if (!items || items.length === 0) return '';
                const idx = items[0].dataIndex;
                const rec = this.records[idx];
                if (rec) {
                  const dayStr = formatTurkeyDate(rec.time, { day: '2-digit', month: 'short' });
                  const timeStr = formatTurkeyDate(rec.time, { hour: '2-digit', minute: '2-digit' });
                  const hName = rec.hadise ? rec.hadise.name : '';
                  return `${dayStr} ${timeStr} · ${hName}`;
                }
                return items[0].label || '';
              },
              label: (context) => {
                const val = context.parsed.y;
                if (val === null || val === undefined) return '';
                const label = context.dataset.label || '';
                
                // Rüzgar modunda yön bilgisini de ekle
                if (this.mode === 'wind' && label.includes('Rüzgar Hızı')) {
                  const idx = context.dataIndex;
                  const rec = this.records[idx];
                  if (rec && rec.ruzgarYonu != null) {
                    const dir = getCompassDirection(rec.ruzgarYonu);
                    return ` ${label}: ${val} (${dir} ${rec.ruzgarYonu}°)`;
                  }
                }
                return ` ${label}: ${val}`;
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
              maxTicksLimit: 14
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
    this.update(this.allRecords, this.dayRecords);
  }

  setScope(scope) {
    this.scope = scope;
    this.update(this.allRecords, this.dayRecords);
  }

  update(allRecords, dayRecords) {
    this.allRecords = allRecords || [];
    this.dayRecords = dayRecords || [];
    
    // Kapsama göre çizilecek veri setini belirle
    this.records = (this.scope === 'day' && this.dayRecords.length > 0)
      ? this.dayRecords
      : this.allRecords;

    if (!this.chart || !this.records || this.records.length === 0) return;

    const recs = this.records;
    const isDark = document.documentElement.classList.contains('dark');

    // X Ekseni Etiketleri: Çok gün varsa gün adı da eklenir
    const isMultiDay = this.scope === 'all';
    const labels = recs.map(r => {
      const timeStr = formatTurkeyDate(r.time, { hour: '2-digit', minute: '2-digit' });
      if (isMultiDay) {
        const dayStr = formatTurkeyDate(r.time, { weekday: 'narrow', day: 'numeric' });
        return `${dayStr} ${timeStr}`;
      }
      return timeStr;
    });

    // Renk Paleti (Poppins & Apple Flat Tasarım)
    const tempColor = isDark ? '#f87171' : '#ef4444';
    const feelsColor = isDark ? '#fbbf24' : '#f59e0b';
    const rainColor = isDark ? '#38bdf8' : '#0284c7';
    const snowColor = isDark ? '#a5b4fc' : '#6366f1';
    const probColor = isDark ? '#34d399' : '#10b981';
    const windColor = isDark ? '#34d399' : '#10b981';
    const gustColor = isDark ? '#f59e0b' : '#d97706';
    const humColor = isDark ? '#2dd4bf' : '#0d9488';
    const cloudColor = isDark ? '#94a3b8' : '#64748b';
    const cloudLowColor = isDark ? '#64748b' : '#475569';
    const cloudMidColor = isDark ? '#94a3b8' : '#64748b';
    const cloudHighColor = isDark ? '#cbd5e1' : '#94a3b8';
    const pressureColor = isDark ? '#c084fc' : '#9333ea';
    const surfPressColor = isDark ? '#e879f9' : '#c026d3';
    const capeColor = isDark ? '#fb923c' : '#ea580c';
    const cinColor = isDark ? '#a8a29e' : '#78716c';
    const uvColor = isDark ? '#f59e0b' : '#d97706';
    const sunColor = isDark ? '#fbbf24' : '#eab308';
    const visColor = isDark ? '#38bdf8' : '#0284c7';
    const vpdColor = isDark ? '#fb923c' : '#ea580c';

    const ctx = this.chart.ctx;
    const makeGradient = (rgb, a1, a2, a3) => {
      return (context) => {
        const chartArea = context.chart.chartArea;
        if (!chartArea) return `rgba(${rgb}, ${a1})`;
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, `rgba(${rgb}, ${a1})`);
        g.addColorStop(0.5, `rgba(${rgb}, ${a2})`);
        g.addColorStop(1, `rgba(${rgb}, ${a3})`);
        return g;
      };
    };

    let datasets = [];
    let showWindArrows = false;
    let windData = [];
    let statText = '';

    // İkincil y-eksenini varsayılan olarak gizle
    if (this.chart.options.scales.y1) {
      this.chart.options.scales.y1.display = false;
    }

    if (this.mode === 'temp') {
      const tempRgb = isDark ? '248, 113, 113' : '239, 68, 68';
      const temps = recs.map(r => r.sicaklik);
      const minT = Math.min(...temps);
      const maxT = Math.max(...temps);
      const avgT = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
      statText = `Min: ${minT}°C · Maks: ${maxT}°C · Ort: ${avgT}°C`;

      datasets = [
        {
          label: 'Sıcaklık (°C)',
          data: temps,
          borderColor: tempColor,
          backgroundColor: makeGradient(tempRgb, 0.30, 0.06, 0.0),
          fill: true,
          tension: 0.38,
          borderWidth: 2.75,
          pointRadius: recs.length > 100 ? 0 : 2,
          pointHoverRadius: 6.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 2.5,
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
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: feelsColor
        }
      ];

      this.chart.options.scales.y.ticks.callback = (v) => `${v}°C`;

    } else if (this.mode === 'rain') {
      const rains = recs.map(r => r.saatlikToplamYagis);
      const totalRain = rains.reduce((a, b) => a + b, 0).toFixed(1);
      const maxRain = Math.max(...rains);
      statText = `Toplam Yağış: ${totalRain} mm · Maks Saatlik: ${maxRain} mm`;

      datasets = [
        {
          label: 'Saatlik Yağış (mm)',
          data: rains,
          borderColor: rainColor,
          backgroundColor: isDark ? 'rgba(56, 189, 248, 0.40)' : 'rgba(2, 132, 199, 0.35)',
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
          backgroundColor: isDark ? 'rgba(165, 180, 252, 0.40)' : 'rgba(99, 102, 241, 0.35)',
          fill: true,
          type: 'bar',
          borderWidth: 1.5,
          borderRadius: 6
        });
      }

      if (recs.some(r => r.precipProb != null)) {
        datasets.push({
          label: 'Yağış İhtimali (%)',
          data: recs.map(r => r.precipProb),
          borderColor: probColor,
          borderDash: [3, 3],
          fill: false,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y1'
        });

        this.chart.options.scales.y1 = {
          display: true,
          position: 'right',
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: {
            color: isDark ? '#34d399' : '#10b981',
            font: { family: 'Poppins', size: 10, weight: 600 },
            callback: (v) => `%${v}`
          }
        };
      }

      this.chart.options.scales.y.ticks.callback = (v) => `${v} mm`;

    } else if (this.mode === 'wind') {
      showWindArrows = true;
      windData = recs.map(r => ({ speed: r.ruzgarHizi, direction: r.ruzgarYonu }));
      const windRgb = isDark ? '52, 211, 153' : '16, 185, 129';
      const winds = recs.map(r => r.ruzgarHizi);
      const maxW = Math.max(...winds);
      const maxGust = Math.max(...recs.map(r => r.windGust || 0));
      statText = `Maks Rüzgar: ${maxW} km/h${maxGust > 0 ? ` · Maks Hamle: ${maxGust} km/h` : ''}`;

      datasets = [
        {
          label: 'Rüzgar Hızı (km/h)',
          data: winds,
          borderColor: windColor,
          backgroundColor: makeGradient(windRgb, 0.28, 0.06, 0.0),
          fill: true,
          tension: 0.35,
          borderWidth: 2.75,
          pointRadius: recs.length > 100 ? 0 : 2,
          pointHoverRadius: 6.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 2.5,
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
          borderWidth: 1.75,
          pointRadius: 0
        });
      }

      this.chart.options.scales.y.ticks.callback = (v) => `${v} km/h`;

    } else if (this.mode === 'hum_cloud') {
      const humRgb = isDark ? '45, 212, 191' : '13, 148, 136';
      const hums = recs.map(r => r.nem);
      const avgHum = Math.round(hums.reduce((a, b) => a + b, 0) / hums.length);
      const clouds = recs.map(r => r.bulutKapaliligi);
      const avgCloud = Math.round(clouds.reduce((a, b) => a + b, 0) / clouds.length);
      statText = `Ortalama Nem: %${avgHum} · Ortalama Bulut: %${avgCloud}`;

      datasets = [
        {
          label: 'Bağıl Nem (%)',
          data: hums,
          borderColor: humColor,
          backgroundColor: makeGradient(humRgb, 0.25, 0.05, 0.0),
          fill: true,
          tension: 0.38,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 2.5,
          pointHoverBorderColor: humColor
        },
        {
          label: 'Bulut Kapalılığı (%)',
          data: clouds,
          borderColor: cloudColor,
          borderDash: [3, 3],
          fill: false,
          tension: 0.38,
          borderWidth: 2,
          pointRadius: 0
        }
      ];

      if (recs.some(r => r.cloudLow != null)) {
        datasets.push({
          label: 'Alçak Bulut (%)',
          data: recs.map(r => r.cloudLow),
          borderColor: cloudLowColor,
          borderDash: [1, 2],
          fill: false,
          tension: 0.38,
          borderWidth: 1.5,
          pointRadius: 0
        });
      }

      if (recs.some(r => r.cloudMid != null)) {
        datasets.push({
          label: 'Orta Bulut (%)',
          data: recs.map(r => r.cloudMid),
          borderColor: cloudMidColor,
          borderDash: [1, 2],
          fill: false,
          tension: 0.38,
          borderWidth: 1.5,
          pointRadius: 0
        });
      }

      if (recs.some(r => r.cloudHigh != null)) {
        datasets.push({
          label: 'Yüksek Bulut (%)',
          data: recs.map(r => r.cloudHigh),
          borderColor: cloudHighColor,
          borderDash: [1, 2],
          fill: false,
          tension: 0.38,
          borderWidth: 1.5,
          pointRadius: 0
        });
      }

      this.chart.options.scales.y.ticks.callback = (v) => `%${v}`;

    } else if (this.mode === 'pressure') {
      const pressRgb = isDark ? '192, 132, 252' : '147, 51, 234';
      const pressures = recs.map(r => r.basinc);
      const minP = Math.min(...pressures);
      const maxP = Math.max(...pressures);
      statText = `Basınç Aralığı: ${minP} - ${maxP} hPa`;

      datasets = [
        {
          label: 'MSL Basınç (hPa)',
          data: pressures,
          borderColor: pressureColor,
          backgroundColor: makeGradient(pressRgb, 0.28, 0.06, 0.0),
          fill: true,
          tension: 0.38,
          borderWidth: 2.75,
          pointRadius: 0,
          pointHoverRadius: 6.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 2.5,
          pointHoverBorderColor: pressureColor
        }
      ];

      if (recs.some(r => r.surfacePressure != null)) {
        datasets.push({
          label: 'Yüzey Basıncı (hPa)',
          data: recs.map(r => r.surfacePressure),
          borderColor: surfPressColor,
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
      const capes = recs.map(r => r.cape || 0);
      const maxCape = Math.max(...capes);
      statText = `Maksimum CAPE: ${maxCape} J/kg ${maxCape > 1000 ? '(Aşırı Kararsız)' : (maxCape > 300 ? '(Fırtına Riski)' : '(Düşük Risk)')}`;

      datasets = [
        {
          label: 'CAPE (J/kg)',
          data: capes,
          borderColor: capeColor,
          backgroundColor: makeGradient(capeRgb, 0.35, 0.08, 0.0),
          fill: true,
          tension: 0.38,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 2.5,
          pointHoverBorderColor: capeColor
        }
      ];

      if (recs.some(r => r.cin != null)) {
        datasets.push({
          label: 'CIN / Bastırma (J/kg)',
          data: recs.map(r => r.cin),
          borderColor: cinColor,
          borderDash: [3, 3],
          fill: false,
          tension: 0.38,
          borderWidth: 1.75,
          pointRadius: 0
        });
      }

      this.chart.options.scales.y.ticks.callback = (v) => `${v} J/kg`;

    } else if (this.mode === 'solar_uv') {
      const uvRgb = isDark ? '245, 158, 11' : '217, 119, 6';
      const uvs = recs.map(r => r.uvIndex != null ? r.uvIndex : 0);
      const maxUv = Math.max(...uvs);
      const totalSun = recs.reduce((a, b) => a + (b.sunshine || 0), 0);
      statText = `Maks UV: ${maxUv} ${maxUv >= 8 ? '(Çok Yüksek)' : (maxUv >= 6 ? '(Yüksek)' : (maxUv >= 3 ? '(Orta)' : '(Düşük)'))} · Toplam Güneşlenme: ${Math.round(totalSun / 60)} sa`;

      datasets = [
        {
          label: 'UV İndeksi',
          data: uvs,
          borderColor: uvColor,
          backgroundColor: makeGradient(uvRgb, 0.35, 0.08, 0.0),
          fill: true,
          tension: 0.35,
          borderWidth: 2.75,
          pointRadius: recs.length > 100 ? 0 : 2,
          pointHoverRadius: 6.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 2.5,
          pointHoverBorderColor: uvColor
        }
      ];

      if (recs.some(r => r.sunshine != null)) {
        datasets.push({
          label: 'Güneşlenme Süresi (dk/saat)',
          data: recs.map(r => r.sunshine),
          borderColor: sunColor,
          backgroundColor: isDark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(234, 179, 8, 0.30)',
          fill: true,
          type: 'bar',
          borderWidth: 1.5,
          borderRadius: 4,
          yAxisID: 'y1'
        });

        this.chart.options.scales.y1 = {
          display: true,
          position: 'right',
          min: 0,
          max: 60,
          grid: { drawOnChartArea: false },
          ticks: {
            color: isDark ? '#fbbf24' : '#d97706',
            font: { family: 'Poppins', size: 10, weight: 600 },
            callback: (v) => `${v} dk`
          }
        };
      }

      this.chart.options.scales.y.ticks.callback = (v) => `${v}`;

    } else if (this.mode === 'visibility') {
      const visRgb = isDark ? '6, 182, 212' : '8, 145, 178';
      const visibilities = recs.map(r => r.visibility != null ? r.visibility : 10);
      const minVis = Math.min(...visibilities);
      const vpds = recs.map(r => r.vpd != null ? r.vpd : 0);
      const maxVpd = Math.max(...vpds);
      statText = `Min Görüş Mesafesi: ${minVis} km${maxVpd > 0 ? ` · Maks Buhar Açığı (VPD): ${maxVpd} kPa` : ''}`;

      datasets = [
        {
          label: 'Görüş Mesafesi (km)',
          data: visibilities,
          borderColor: visColor,
          backgroundColor: makeGradient(visRgb, 0.28, 0.06, 0.0),
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderWidth: 2.5,
          pointHoverBorderColor: visColor
        }
      ];

      if (recs.some(r => r.vpd != null)) {
        datasets.push({
          label: 'Buhar Açığı / VPD (kPa)',
          data: recs.map(r => r.vpd),
          borderColor: vpdColor,
          borderDash: [3, 3],
          fill: false,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y1'
        });

        this.chart.options.scales.y1 = {
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: isDark ? '#fb923c' : '#ea580c',
            font: { family: 'Poppins', size: 10, weight: 600 },
            callback: (v) => `${v} kPa`
          }
        };
      }

      this.chart.options.scales.y.ticks.callback = (v) => `${v} km`;
    }

    if (this.statPill && statText) {
      this.statPill.textContent = statText;
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
// 8. MODELS ARAYÜZ KONTROLCÜSÜ (MODELS UI CONTROLLER)
// ==========================================
class ModelsUIController {
  constructor() {
    this.activeModelKey = localStorage.getItem('models_active_model') || 'ecmwf';
    // Eğer localStorage'da eski mgm kalmışsa varsayılan ecmwf'e geçir
    if (this.activeModelKey === 'mgm') {
      this.activeModelKey = 'ecmwf';
      localStorage.setItem('models_active_model', 'ecmwf');
    }

    this.selectedDay = null; // null ise otomatik olarak bugünün tarihine ayarlanır
    this.selectedIndex = 0;
    this.chartManager = null;
    this.dom = {};

    // 7 Küresel Model Servis Havuzu
    this.services = {};
    for (const [key, cfg] of Object.entries(MODEL_CONFIGS)) {
      this.services[key] = new OpenMeteoModelService(cfg);
    }

    this.init();
  }

  get activeConfig() {
    return MODEL_CONFIGS[this.activeModelKey] || MODEL_CONFIGS.ecmwf;
  }

  get activeService() {
    return this.services[this.activeModelKey] || this.services.ecmwf;
  }

  init() {
    this.cacheDom();
    if (document.getElementById('modelsChartCanvas')) {
      this.chartManager = new ModelsChartManager('modelsChartCanvas');
    }
    this.bindEvents();
    this.updateModelTabsUI();
    this.render();

    // Seçili modelin canlı verisini çek
    this.refreshCurrentModel(true);

    // Arka Planda Önbellekleme: 1.5 sn sonra diğer popüler modelleri sessizce yükle (anında geçiş)
    setTimeout(() => {
      const keysToPrefetch = Object.keys(this.services).filter(k => k !== this.activeModelKey);
      keysToPrefetch.slice(0, 3).forEach(k => {
        const s = this.services[k];
        if (s && (!s.records || s.records.length === 0)) {
          s.fetchForecast(false);
        }
      });
    }, 1500);
  }

  cacheDom() {
    this.dom = {
      modelTabsContainer: document.getElementById('modelTabsContainer'),
      btnRefreshModel: document.getElementById('btnRefreshModel'),
      modelRefreshSpinner: document.getElementById('modelRefreshSpinner'),

      // Model Başlık Bilgileri
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

      // Günlük Filtreleme Şeridi
      dayFilterTrack: document.getElementById('dayFilterTrack'),

      // Desktop Tablo & Mobil Liste
      desktopTableBody: document.getElementById('desktopTableBody'),
      mobileListContainer: document.getElementById('mobileListContainer')
    };
  }

  bindEvents() {
    // Model Değiştirici Sekmeler
    if (this.dom.modelTabsContainer) {
      this.dom.modelTabsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.model-tab-btn');
        if (!btn) return;
        const modelKey = btn.dataset.model;
        if (modelKey) this.switchModel(modelKey);
      });
    }

    // Güncelleme Butonu
    if (this.dom.btnRefreshModel) {
      this.dom.btnRefreshModel.addEventListener('click', () => {
        this.refreshCurrentModel(false, true);
      });
    }

    // Gün Filtreleme Şeridi
    if (this.dom.dayFilterTrack) {
      this.dom.dayFilterTrack.addEventListener('click', (e) => {
        const btn = e.target.closest('.day-filter-btn');
        if (!btn) return;
        this.selectedDay = btn.dataset.day || 'all';
        this.dom.dayFilterTrack.querySelectorAll('.day-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filtered = this.getFilteredRecords();
        const todayKey = getTurkeyTodayKey();
        this.selectedIndex = (this.selectedDay === todayKey) ? findCurrentHourIndex(filtered) : 0;
        this.render();
      });
    }

    // Mobil Liste Olay Delegasyonu (Tek bir dinleyici ile ultra-hızlı seçim)
    if (this.dom.mobileListContainer) {
      this.dom.mobileListContainer.addEventListener('click', (e) => {
        const row = e.target.closest('.mobile-forecast-row');
        if (!row) return;
        const idx = Number(row.dataset.index);
        if (!isNaN(idx)) {
          this.selectRecord(idx);
        }
      });
    }

    // Grafik Kapsamı Butonları (Tüm Günler vs Seçili Gün)
    document.querySelectorAll('.chart-scope-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.chart-scope-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const scope = e.currentTarget.dataset.scope || 'all';
        if (this.chartManager) this.chartManager.setScope(scope);
      });
    });

    // Grafik Modu Butonları
    document.querySelectorAll('.models-chart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.models-chart-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const mode = e.currentTarget.dataset.mode || 'temp';
        if (this.chartManager) this.chartManager.setMode(mode);
      });
    });
  }

  switchModel(modelKey) {
    if (this.activeModelKey === modelKey) return;
    this.activeModelKey = modelKey;
    localStorage.setItem('models_active_model', modelKey);
    this.selectedDay = null; // Yeni seçilen modelde bugüne otomatik odaklan
    this.selectedIndex = 0;
    this.updateModelTabsUI();
    this.render();
    this.refreshCurrentModel(true, false);
  }

  updateModelTabsUI() {
    if (!this.dom.modelTabsContainer) return;
    this.dom.modelTabsContainer.querySelectorAll('.model-tab-btn').forEach(btn => {
      if (btn.dataset.model === this.activeModelKey) {
        btn.classList.add('active');
        btn.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
      } else {
        btn.classList.remove('active');
      }
    });
  }

  async refreshCurrentModel(isSilent = false, forceFresh = false) {
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
      const result = await s.fetchForecast(forceFresh);
      if (result && result.success && result.count > 0) {
        this.render();
        if (!isSilent && window.app && window.app.showToast) {
          window.app.showToast(`${this.activeConfig.name}: ${result.count} saatlik güncel model verisi başarıyla yüklendi.`, 'success');
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
    }
  }

  getFilteredRecords() {
    const all = this.activeService.records;
    if (!all || all.length === 0) return [];
    if (this.selectedDay === 'all') return all;

    return all.filter(r => getTurkeyDayKey(r.time) === this.selectedDay);
  }

  selectRecord(idx) {
    const filteredRecs = this.getFilteredRecords();
    if (!filteredRecs || filteredRecs.length === 0) return;
    this.selectedIndex = Math.max(0, Math.min(idx, filteredRecs.length - 1));

    // Sadece Hero Card ve satır seçim sınıflarını güncelle (sıfır DOM reflow)
    const cur = filteredRecs[this.selectedIndex];
    if (cur) {
      this.renderHeroCard(cur);
    }

    if (this.dom.mobileListContainer) {
      this.dom.mobileListContainer.querySelectorAll('.mobile-forecast-row').forEach(row => {
        const rIdx = Number(row.dataset.index);
        if (rIdx === this.selectedIndex) {
          row.classList.add('selected');
        } else {
          row.classList.remove('selected');
        }
      });
    }

    if (this.dom.desktopTableBody) {
      this.dom.desktopTableBody.querySelectorAll('.table-row').forEach(row => {
        const rIdx = Number(row.dataset.index);
        if (rIdx === this.selectedIndex) {
          row.classList.add('bg-blue-500/15', 'dark:bg-sky-400/20', 'font-bold');
        } else {
          row.classList.remove('bg-blue-500/15', 'dark:bg-sky-400/20', 'font-bold');
        }
      });
    }
  }

  renderHeroCard(cur) {
    if (!cur) return;
    const hadise = cur.hadise || { name: 'Hava Durumu', desc: '', type: 'cloudy' };
    const hourVal = Number(formatTurkeyDate(cur.time, { hour: 'numeric', hourCycle: 'h23' }));
    const isNight = cur.isDay !== null && cur.isDay !== undefined ? cur.isDay === 0 : (hourVal < 6 || hourVal >= 20);

    if (this.dom.heroIcon) {
      this.dom.heroIcon.innerHTML = Meteocons.getSvg(hadise.type, 56, isNight);
    }
    if (this.dom.heroTemp) this.dom.heroTemp.textContent = Math.round(cur.sicaklik);
    if (this.dom.heroFeels) this.dom.heroFeels.textContent = `Hissedilen: ${Math.round(cur.hissedilenSicaklik)}°C`;
    
    if (this.dom.heroDewPoint) {
      if (cur.dewPoint != null) {
        this.dom.heroDewPoint.textContent = `Çiy: ${Math.round(cur.dewPoint)}°C`;
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
    
    if (this.dom.heroCapeContainer) {
      if (cur.cape != null) {
        this.dom.heroCapeContainer.classList.remove('hidden');
        if (this.dom.heroCape) this.dom.heroCape.textContent = `${cur.cape} J/kg`;
      } else {
        this.dom.heroCapeContainer.classList.add('hidden');
      }
    }
  }

  render() {
    const cfg = this.activeConfig;
    const s = this.activeService;
    const allRecs = s.records;

    // Model Bilgi Başlıkları
    if (this.dom.modelTitleText) this.dom.modelTitleText.textContent = cfg.fullName;
    if (this.dom.modelBadgeText) this.dom.modelBadgeText.textContent = cfg.badge;
    if (this.dom.modelLocationText) this.dom.modelLocationText.textContent = cfg.location;

    if (this.dom.modelLastUpdateText) {
      if (s.lastUpdated) {
        this.dom.modelLastUpdateText.textContent = `Son Güncelleme: ${formatTurkeyDate(s.lastUpdated, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      } else {
        this.dom.modelLastUpdateText.textContent = 'Son Güncelleme: Bekleniyor';
      }
    }

    if (!allRecs || allRecs.length === 0) {
      if (this.dom.heroConditionName) this.dom.heroConditionName.textContent = 'Model Verisi Yükleniyor...';
      if (this.dom.heroConditionDesc) this.dom.heroConditionDesc.textContent = 'Canlı sayısal tahmin çıktısı taranıyor...';
      return;
    }

    // Seçili gün atanmamışsa varsayılan olarak bugünü (yoksa ilk günü) seç
    const todayKey = getTurkeyTodayKey();
    if (!this.selectedDay) {
      const hasToday = allRecs.some(r => getTurkeyDayKey(r.time) === todayKey);
      this.selectedDay = hasToday ? todayKey : (allRecs[0] ? getTurkeyDayKey(allRecs[0].time) : 'all');
    }

    const filteredRecs = this.getFilteredRecords();

    // Modelin desteklediği parametrelere göre grafik butonlarını ayarla
    const hasCape = allRecs.some(r => r.cape != null && r.cape > 0);
    const hasUvOrSun = allRecs.some(r => (r.uvIndex != null && r.uvIndex > 0) || (r.sunshine != null && r.sunshine > 0));
    const hasVisOrVpd = allRecs.some(r => r.visibility != null || (r.vpd != null && r.vpd > 0));

    const capeBtn = document.querySelector('.models-chart-btn[data-mode="cape"]');
    if (capeBtn) capeBtn.style.display = hasCape ? '' : 'none';

    const uvBtn = document.querySelector('.models-chart-btn[data-mode="solar_uv"]');
    if (uvBtn) uvBtn.style.display = hasUvOrSun ? '' : 'none';

    const visBtn = document.querySelector('.models-chart-btn[data-mode="visibility"]');
    if (visBtn) visBtn.style.display = hasVisOrVpd ? '' : 'none';

    // Gün filtreleme şeridini çiz
    this.renderDayFilter(allRecs);

    // Eğer bugün seçiliyse ve seçili indeks 0 ise, canlı saate odaklan
    if (this.selectedDay === todayKey && (this.selectedIndex === 0 || this.selectedIndex >= filteredRecs.length)) {
      this.selectedIndex = findCurrentHourIndex(filteredRecs);
    } else if (this.selectedIndex >= filteredRecs.length) {
      this.selectedIndex = 0;
    }

    // Hero Card Render (Seçili Canlı Saat)
    const cur = filteredRecs[this.selectedIndex] || filteredRecs[0] || allRecs[0];
    this.renderHeroCard(cur);

    // Grafik Güncellemesi: Varsayılan tüm veriyi gösterir, seçili gün istenirse o güne odaklanır
    if (this.chartManager) {
      this.chartManager.update(allRecs, filteredRecs);
    }

    // Tablo ve Mobil Liste Render (Seçili Güne Göre)
    this.renderTable(filteredRecs);
    this.renderMobileList(filteredRecs);

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  renderDayFilter(allRecs) {
    if (!this.dom.dayFilterTrack) return;

    const todayKey = getTurkeyTodayKey();
    const tomorrowKey = getTurkeyTomorrowKey();

    // Benzersiz günleri çıkar
    const daysMap = new Map();
    allRecs.forEach(r => {
      const dKey = getTurkeyDayKey(r.time);
      if (!daysMap.has(dKey)) {
        daysMap.set(dKey, new Date(r.time));
      }
    });

    const isAllActive = this.selectedDay === 'all';
    let html = `
      <button class="day-filter-btn shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer select-none ${isAllActive ? 'bg-[#2563eb] text-white dark:bg-[#38bdf8] dark:text-[#020617] font-extrabold' : 'bg-[#f1f5f9] dark:bg-[#1e293b] text-[#334155] dark:text-[#cbd5e1] border border-[#e2e8f0] dark:border-[#334155]'}" data-day="all">
        Tümü (${allRecs.length}s)
      </button>
    `;

    daysMap.forEach((dateObj, dKey) => {
      const isSelected = this.selectedDay === dKey;
      let label = '';
      const dateNum = formatTurkeyDate(dateObj, { day: 'numeric', month: 'short' });
      if (dKey === todayKey) {
        label = `Bugün (${dateNum})`;
      } else if (dKey === tomorrowKey) {
        label = `Yarın (${dateNum})`;
      } else {
        const dayName = formatTurkeyDate(dateObj, { weekday: 'short' });
        label = `${dayName} ${dateNum}`;
      }

      html += `
        <button class="day-filter-btn shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer select-none ${isSelected ? 'bg-[#2563eb] text-white dark:bg-[#38bdf8] dark:text-[#020617] font-extrabold' : 'bg-[#f1f5f9] dark:bg-[#1e293b] text-[#334155] dark:text-[#cbd5e1] border border-[#e2e8f0] dark:border-[#334155]'}" data-day="${dKey}">
          ${label}
        </button>
      `;
    });

    this.dom.dayFilterTrack.innerHTML = html;
  }

  renderTable(recs) {
    if (!this.dom.desktopTableBody) return;

    // Mobil optimizasyonu: Mobil ekranda gizli olan geniş tablonun DOM'unu oluşturmayı atla
    if (window.innerWidth < 768) {
      this.dom.desktopTableBody.innerHTML = '';
      return;
    }

    if (!recs || recs.length === 0) {
      this.dom.desktopTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="py-6 text-center text-[#475569] dark:text-[#94a3b8] font-bold">
            Bu gün için model tahmini bulunmuyor.
          </td>
        </tr>
      `;
      return;
    }

    this.dom.desktopTableBody.innerHTML = recs.map((r, i) => {
      const hInfo = r.hadise || { name: 'Hava Durumu', type: 'cloudy' };
      const timeStr = `${formatTurkeyDate(r.time, { weekday: 'short', day: '2-digit', month: '2-digit' })} ${formatTurkeyDate(r.time, { hour: '2-digit', minute: '2-digit' })}`;
      const hourVal = Number(formatTurkeyDate(r.time, { hour: 'numeric', hourCycle: 'h23' }));
      const isNight = r.isDay !== null && r.isDay !== undefined ? r.isDay === 0 : (hourVal < 6 || hourVal >= 20);
      const windDir = getCompassDirection(r.ruzgarYonu);
      const isSelected = i === this.selectedIndex;

      return `
        <tr class="table-row cursor-pointer select-none border-b border-black/5 dark:border-white/5 ${isSelected ? 'bg-blue-500/15 dark:bg-sky-400/20 font-bold' : 'hover:bg-black/5 dark:hover:bg-white/5'}" data-index="${i}">
          <td class="py-2 px-3 text-[#0f172a] dark:text-[#f8fafc] font-mono text-[11px] font-bold whitespace-nowrap">${timeStr}</td>
          <td class="py-2 px-3 whitespace-nowrap">
            <div class="flex items-center gap-1.5">
              ${Meteocons.getSvg(hInfo.type, 22, isNight)}
              <span class="font-extrabold text-[#0f172a] dark:text-[#f8fafc]">${hInfo.name}</span>
            </div>
          </td>
          <td class="py-2 px-3 font-mono whitespace-nowrap">
            <span class="text-xs font-black text-[#0f172a] dark:text-[#f8fafc]">${Math.round(r.sicaklik)}°</span>
            <span class="text-[10px] text-[#475569] dark:text-[#94a3b8] font-bold">(${Math.round(r.hissedilenSicaklik)}°)</span>
          </td>
          <td class="py-2 px-3 font-mono whitespace-nowrap">
            ${r.saatlikToplamYagis > 0
              ? `<span class="font-extrabold text-[#2563eb] dark:text-[#60a5fa]">${r.saatlikToplamYagis} mm</span>`
              : `<span class="text-[#64748b] dark:text-[#94a3b8]">0 mm</span>`
            }
          </td>
          <td class="py-2 px-3 whitespace-nowrap">
            <div class="flex items-center gap-1 font-mono text-[#15803d] dark:text-[#4ade80] font-extrabold">
              <span class="inline-block transform" style="transform: rotate(${r.ruzgarYonu}deg);">➤</span>
              <span>${r.ruzgarHizi} km/h</span>
              <span class="text-[10px] text-[#475569] dark:text-[#94a3b8]">(${windDir})</span>
              ${r.windGust ? `<span class="text-[10px] text-[#d97706] font-bold">[${r.windGust}]</span>` : ''}
            </div>
          </td>
          <td class="py-2 px-3 font-mono text-[#0f766e] dark:text-[#2dd4bf] font-extrabold whitespace-nowrap">
            %${r.nem}
            ${r.dewPoint != null ? `<span class="text-[10px] text-[#475569] dark:text-[#94a3b8] font-bold">(${Math.round(r.dewPoint)}°)</span>` : ''}
          </td>
          <td class="py-2 px-3 font-mono text-[#7e22ce] dark:text-[#c084fc] font-extrabold whitespace-nowrap">${r.basinc} hPa</td>
          <td class="py-2 px-3 font-mono text-[#475569] dark:text-[#94a3b8] font-extrabold whitespace-nowrap">%${r.bulutKapaliligi}</td>
          ${r.cape != null ? `
            <td class="py-2 px-3 font-mono ${r.cape > 300 ? 'text-[#ea580c] font-black' : 'text-[#64748b] dark:text-[#94a3b8] font-bold'} whitespace-nowrap">
              ${r.cape} J/kg
            </td>
          ` : '<td class="py-2 px-3 font-mono text-[#64748b] text-[10px]">--</td>'}
        </tr>
      `;
    }).join('');

    this.dom.desktopTableBody.querySelectorAll('.table-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.index);
        this.selectRecord(idx);
      });
    });
  }

  renderMobileList(recs) {
    if (!this.dom.mobileListContainer) return;

    if (!recs || recs.length === 0) {
      this.dom.mobileListContainer.innerHTML = `
        <div class="p-4 text-center text-xs text-[#475569] dark:text-[#94a3b8] font-bold">
          Bu gün için model tahmini bulunmuyor.
        </div>
      `;
      return;
    }

    const html = recs.map((r, i) => {
      const hInfo = r.hadise || { name: 'Hava Durumu', type: 'cloudy' };
      const hourStr = formatTurkeyDate(r.time, { hour: '2-digit', minute: '2-digit' });
      const dayStr = formatTurkeyDate(r.time, { weekday: 'short', day: 'numeric', month: 'short' });
      const hourVal = Number(formatTurkeyDate(r.time, { hour: 'numeric', hourCycle: 'h23' }));
      const isNight = r.isDay !== null && r.isDay !== undefined ? r.isDay === 0 : (hourVal < 6 || hourVal >= 20);
      const isSelected = i === this.selectedIndex;
      const windDir = getCompassDirection(r.ruzgarYonu);

      return `
        <div class="mobile-forecast-row px-2.5 py-2 rounded-xl cursor-pointer select-none flex items-center justify-between gap-1.5 w-full ${isSelected ? 'selected' : ''}" data-index="${i}">
          <!-- Sol: Saat + İkon + Hadise Adı -->
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="text-xs font-mono font-bold text-[#475569] dark:text-[#94a3b8] w-11 shrink-0">${hourStr}</span>
            <div class="shrink-0 w-7 h-7 flex items-center justify-center">
              ${Meteocons.getSvg(hInfo.type, 26, isNight)}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-xs font-bold text-[#0f172a] dark:text-[#f8fafc] truncate leading-tight">${hInfo.name}</div>
              <div class="text-[10px] text-[#64748b] dark:text-[#94a3b8] font-semibold truncate">${dayStr}</div>
            </div>
          </div>

          <!-- Orta: Yağış & Rüzgar -->
          <div class="flex items-center gap-1 shrink-0 text-[11px] font-mono">
            ${r.saatlikToplamYagis > 0 ? `<span class="text-[#2563eb] dark:text-[#38bdf8] font-extrabold whitespace-nowrap bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">💧${r.saatlikToplamYagis}mm</span>` : ''}
            <span class="text-[#15803d] dark:text-[#4ade80] font-extrabold whitespace-nowrap flex items-center gap-0.5">
              <span class="inline-block transform" style="transform: rotate(${r.ruzgarYonu}deg);">➤</span>
              ${r.ruzgarHizi} <span class="text-[9px] font-normal text-[#64748b] dark:text-[#94a3b8]">(${windDir})</span>
            </span>
          </div>

          <!-- Sağ: Sıcaklık & Hissedilen -->
          <div class="text-right shrink-0 min-w-[44px]">
            <span class="text-sm font-black font-mono text-[#0f172a] dark:text-[#f8fafc]">${Math.round(r.sicaklik)}°</span>
            <span class="text-[10px] font-mono text-[#64748b] dark:text-[#94a3b8] font-bold block leading-none">(${Math.round(r.hissedilenSicaklik)}°)</span>
          </div>
        </div>
      `;
    }).join('');

    this.dom.mobileListContainer.innerHTML = html;
  }
}

// Global bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.modelsUI = new ModelsUIController();
});
