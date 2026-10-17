# 🌡️ Xiaomi SmartTemp Pro (LYWSD03MMC)

> **Xiaomi Mijia Bluetooth Akıllı Sıcaklık, Nem & Atmosferik Analiz İstasyonu (Model: LYWSD03MMC / ASIN: B083Y1D8WB)**  
> Tarayıcı üzerinden **Web Bluetooth API** ile sıfır kurulumla çalışan; hem **Orijinal Xiaomi** hem de **ATC / PVVX Modlu Firmware** yüklü cihazlarla tam uyumlu, canlı **BLE Sinyal Gücü (RSSI)** ve yayın paketlerini yakalayan, sıcaklık ve nem verilerinden **Çiğ Noktası**, **Hissedilen Sıcaklık** ve **Buhar Basıncı / VPD** parametrelerini en doğru bilimsel formüllerle türeten modern takip istasyonu.

---

## ⚡ 1. Donanım & Çift Profil Desteği (ATC Modlu FW & Orijinal Xiaomi)

Cihazınız ister fabrika çıkışı **Orijinal Xiaomi Firmware**, ister modlanmış **ATC / PVVX Custom Firmware** (`ATC_...`) olsun, sistem donanımı otomatik olarak algılar:

1. **Çoklu BLE Cihaz Algılama:**
   - Eşleştirme penceresinde `acceptAllDevices: true` modu kullanılarak çevrenizdeki `ATC_...` dahil **tüm Bluetooth cihazlarının** filtrelere takılmadan eksiksiz görünmesi sağlanır.
2. **Otomatik GATT Profil Ayrıştırma:**
   - Cihazınızda `0x181A` (Environmental Sensing) veya `0x1F10` (ATC Custom) servisi varsa otomatik olarak **ATC Modlu Profil** devreye girer; `0x2A6E` (Sıcaklık), `0x2A6F` (Nem), `0x2A19` (Pil) ve `0x1F1F` kanallarından veri okunur.
   - Orijinal Xiaomi servisi (`ebe0ccb0-...`) mevcutsa orijinal GATT telemetrisi okunur.
3. **📡 Canlı BLE Sinyal Yayın Yakalayıcı (Sniffer):**
   - Cihazınızın yayınladığı BLE Advertising paketleri (ATC1441, PVVX Custom, BTHome, MiBeacon) anlık olarak yakalanır.
   - Üst çubukta ve donanım kartında **anlık Sinyal Gücü (RSSI - dBm)** canlı güncellenir.

---

## ✨ 2. Temel Özellikler & Türetilmiş Parametreler

1. **📊 6 Ayrı Telemetri & Atmosferik Analiz Kartı:**
   - **🌡️ Sıcaklık Kartı:** 0.1°C hassasiyetle anlık canlı izleme, °C / °F birim geçişi, min/maks kayıtları ve dinamik trend analizi (Yükseliyor / Düşüyor / Dengeli).
   - **💧 Bağıl Nem Kartı:** %1 RH hassasiyetli bağıl nem, renk kodlu seviye göstergesi (Kuru / İdeal / Yüksek Nem) ve görsel doluluk çubuğu.
   - **☀️ Hissedilen Sıcaklık Kartı (Türetilmiş):** İnsan vücudunun hissettiği gerçek termal algı, hava sıcaklığıyla aradaki dinamik fark rozeti (`±X.X°C`) ve min/maks değerleri.
   - **🌧️ Çiğ Noktası (Dew Point - Td) Kartı (Türetilmiş):** Havanın neme doyup yoğuşmanın başlayacağı sıcaklık, yüzey yoğuşması / küf riski erken uyarı rozeti.
   - **💨 Buhar Basıncı & VPD Kartı (Türetilmiş):** Havadaki su buharı kısmi basıncı (`hPa`), bitki ve iç ortam hava kuruluğu göstergesi olan Buhar Basıncı Açığı (`VPD, kPa`) ve doygunluk basıncı (`vpSat`).
   - **🔋 Pil & Donanım Kartı:** CR2032 pil yüzdesi (`%`), hassas çalışma voltajı (`V`), **canlı sinyal gücü (RSSI dBm)**, donanım profil rozeti (ATC Modlu FW / Xiaomi Orijinal) ve toplam kayıt sayısı.

2. **📐 Kullanılan Bilimsel Hesaplama Formülleri:**
   - **Çiğ Noktası ($T_d$):** Dünya Meteoroloji Örgütü (WMO) standardı olan **Alduchov & Eskridge (1996) Magnus** yaklaşımı ($a=17.625, b=243.04^\circ\text{C}$).
   - **Buhar Basıncı ($VP_{act}$) & VPD:** **Buck (1981)** doygunluk buhar basıncı formülü üzerinden hesaplanan gerçek kısmi buhar basıncı ($hPa$) ve buhar basıncı açığı ($kPa$).
   - **Hissedilen Sıcaklık ($AT$):** İç ortam koşullarında **Steadman (1984)** biyo-meteorolojik modeli, yüksek sıcaklık ve nem koşullarında ise **NOAA Rothfusz Isı İndeksi (Heat Index)** polinomu.

3. **📈 5 Eğrili İnteraktif Zaman Serisi Grafiği (Chart.js):**
   - **5 Eşzamanlı Eğri:** Sıcaklık (Yeşil), Hissedilen Sıcaklık (Amber Kesikli), Çiğ Noktası (Mor Kesikli), Bağıl Nem (Camgöbeği) ve Buhar Basıncı (Pembe).
   - **Parametre Filtreleme Butonları:** Tek tıkla *Tümü*, *Sıcaklıklar*, *Sıcaklık*, *Hissedilen*, *Çiğ N.*, *Nem* veya *Buhar B.* filtreleri arasında geçiş.
   - **Zaman Aralığı Seçici:** 1 Saat, 24 Saat, 7 Gün ve Tümü.

4. **📱 Kusursuz Telefon Deneyimi (Mobile-First & PWA):**
   - **Özel Mobil Eylem Çubuğu:** Başparmakla kolay basılabilen geniş bağlantı ve geçmiş butonları.
   - **Mobil Kart Beslemesi (Feed View):** Küçük ekranlarda yatay tablo kaydırma zorunluluğu olmadan dikey kartlar halinde tüm parametreleri gösteren mobil akış.
   - **Dokunmatik Optimizasyonu:** `touch-action: manipulation`, safe-area (iPhone çentik/ana ekran çizgisi) uyumu ve 0 gecikmeli dokunma tepkisi.
   - **Ana Ekrana Ekleme (PWA):** Android Chrome veya Safari üzerinden ana ekrana eklendiğinde tam ekran mobil uygulama olarak çalışır (`manifest.webmanifest`).

5. **⏰ Canlı Akan Dijital Saat (Saat:Dakika:Saniye):**
   - Üst başlığın sol tarafında saniye saniye gerçek zamanlı akan dijital saat (`HH:MM:SS`) ve güncel Türkçe takvim tarihi.

6. **🎨 Beyaz & Siyah Tema (Light / Dark Mode):**
   - Sayfa varsayılan olarak **ferah beyaz (açık) modda** açılır.
   - Üst çubuktaki Ay/Güneş butonuyla tek tıkla **koyu (siyah) moda** geçilebilir (`localStorage` ile kalıcı).

7. **💾 Çevrimdışı Kalıcılık & Dışa Aktarma (Export):**
   - Ölçümler tarayıcının **IndexedDB** veritabanına kaydedilir, sayfa yenilense de silinmez.
   - **CSV (Excel uyumlu, tüm türetilmiş parametrelerle)** ve **JSON** olarak tek tıkla dışa aktarılabilir.

---

## 🚀 3. Web Uygulamasını Kullanma (Web Bluetooth)

1. **Desteklenen Tarayıcılar:** Google Chrome, Microsoft Edge, Opera (Android telefonlar, Windows, macOS, Linux).
2. [index.html](file:///c:/Users/Burak/Documents/Xiaomi/index.html) dosyasını tarayıcınızda açın.
3. **"Cihaza Bağlan"** butonuna tıklayın.
4. Açılan Bluetooth listesinde `ATC_...` veya `LYWSD03MMC` cihazınızı görüp seçin ve **Eşle** butonuna basın.
5. Cihazınız ister orijinal ister ATC modlu olsun, yayın sinyalleri ve telemetri otomatik olarak algılanarak kartlara ve grafiğe aktarılacaktır.

---

## 🐍 4. Python ile 7/24 Arka Planda Kayıt & Pasif Dinleme (tracker.py)

```bash
# Bağımlılıkları yükleyin
pip install -r requirements.txt

# Çevredeki tüm Xiaomi / ATC sensörlerini tarayın:
python tracker.py --scan

# 📡 HİÇ BAĞLANMADAN havadaki BLE sinyallerini (Advertisements) canlı dinle ve kaydet:
python tracker.py --listen

# GATT bağlantısı kurarak sürekli canlı dinle:
python tracker.py --live
```
