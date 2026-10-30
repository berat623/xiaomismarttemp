/**
 * scripts/fetch-aladin.js
 * MGM ALADIN Sayısal Hava Tahmin Modeli Canlı Veri Çekici
 * GitHub Actions ve Yerel Komut Satırı ile Otomatik Çalışır.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ENLEM = '40.22641349141202_40.22426402187642';
const BOYLAM = '28.794067381240897_28.868328096577898';

function getModelHourString(offsetHours = 0) {
  const d = new Date(Date.now() - offsetHours * 3600000);
  const pad = n => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  return `${y}-${m}-${day}%20${h}:00`;
}

function fetchStep(step, tarihParam) {
  return new Promise(resolve => {
    const url = `https://modelservis.mgm.gov.tr/web/modeltahmin/lokasyon/light3?enlem=${ENLEM}&boylam=${BOYLAM}&tarih=${tarihParam}&step=${step}&_t=${Date.now()}`;
    const req = https.get(url, {
      headers: {
        'Origin': 'https://www.mgm.gov.tr',
        'Referer': 'https://www.mgm.gov.tr/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (Array.isArray(j) && j.length > 0 && j[0] && j[0].sicaklik !== undefined) {
            resolve(j[0]);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function run() {
  console.log('🚀 MGM ALADIN Veri Çekme Başlatıldı...');
  
  // En güncel aktif modeli bulmak için son saatleri dene (mevcut saat, -1 saat, -2 saat)
  let bestTarih = null;
  for (let offset of [0, 1, 2, 3]) {
    const candidate = getModelHourString(offset);
    const test = await fetchStep(60, candidate);
    if (test) {
      bestTarih = candidate;
      console.log(`✅ Aktif model zamanı bulundu: ${decodeURIComponent(candidate)}`);
      break;
    }
  }

  if (!bestTarih) {
    console.error('❌ MGM sunucusundan aktif model yanıtı alınamadı.');
    process.exit(1);
  }

  const results = [];
  const maxHours = 58;

  for (let h = 1; h <= maxHours; h++) {
    const rec = await fetchStep(h * 60, bestTarih);
    if (rec) {
      results.push(rec);
    }
    // Sunucuya aşırı yük bindirmemek için minik bekleme
    await new Promise(r => setTimeout(r, 60));
  }

  console.log(`📊 Toplam çekilen saatlik tahmin sayısı: ${results.length}`);

  if (results.length > 0) {
    results.sort((a, b) => new Date(a.yolSaati || a.tarih) - new Date(b.yolSaati || b.tarih));

    const outDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const payload = {
      modelRun: decodeURIComponent(bestTarih),
      lastUpdated: new Date().toISOString(),
      count: results.length,
      records: results
    };

    const outPath = path.join(outDir, 'aladin.json');
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`💾 Veriler başarıyla kaydedildi: ${outPath}`);
  } else {
    console.error('❌ Kaydedilecek geçerli tahmin kaydı bulunamadı.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Kritik Hata:', err);
  process.exit(1);
});
