# 🌡️ Xiaomi SmartTemp Pro (LYWSD03MMC)

> **Xiaomi Mijia Bluetooth Akıllı Sıcaklık ve Nem Takip İstasyonu (Model: LYWSD03MMC / ASIN: B083Y1D8WB)**  
> Tarayıcı üzerinden **Web Bluetooth API** ile sıfır kurulumla çalışan, akıllı telefonlar için kusursuz mobil arayüze (PWA, Canlı Saat, Poppins Tipografi, Açık & Koyu Tema) sahip modern takip istasyonu.

---

## ✨ Mobil & Masaüstü Özellikleri

1. **📱 Kusursuz Telefon Deneyimi (Mobile-First & PWA):**
   - **Özel Mobil Eylem Çubuğu:** Telefonlarda üst çubuğa sıkışmayan, başparmakla kolay basılabilen geniş bağlantı ve geçmiş butonları.
   - **Mobil Kart Akışı (Feed View):** Küçük ekranlarda yatay tablo kaydırma zorunluluğu olmadan, ölçümleri dikey modern kartlar halinde gösteren yerel mobil deneyim.
   - **Dokunmatik Optimizasyonu:** `touch-action: manipulation`, safe-area (iPhone çentik/ana ekran çizgisi) uyumu ve 0 gecikmeli dokunma tepkisi.
   - **Ana Ekrana Ekleme (PWA):** Android Chrome veya Safari üzerinden ana ekrana eklendiğinde adres çubuğu olmadan tam ekran mobil uygulama olarak çalışır (`manifest.webmanifest`).

2. **⏰ Canlı Akan Dijital Saat (Saat:Dakika:Saniye):**
   - Üst başlığın sol tarafında gerçek zamanlı akan dijital saat (`HH:MM:SS`) ve güncel Türkçe takvim tarihi.
   - Saniyeleri canlı yanıp sönen dinamik durum göstergesi.

3. **🎨 Beyaz & Siyah Tema (Light / Dark Mode):**
   - Sayfa varsayılan olarak **ferah beyaz (açık) modda** açılır.
   - Üst çubuktaki Ay/Güneş butonuyla tek tıkla **koyu (siyah) moda** geçilebilir.
   - Tercihiniz `localStorage` ile tarayıcıda kalıcı olarak hatırlanır.

4. **🔤 Modern Poppins Tipografisi:**
   - Arayüz genelinde okunabilirliği yüksek, yumuşak hatlara sahip **Google Poppins** yazı tipi.
   - Sayısal sensör ölçümleri ve saat değerleri için mono karakterli **JetBrains Mono**.

5. **⚡ Gerçek Zamanlı Canlı BLE Telemetrisi:**
   - **Sıcaklık:** 0.1°C hassasiyetle anlık canlı izleme, °C / °F birim geçişi, min/maks kayıtları ve dinamik trend yönü (Yükseliyor / Düşüyor / Dengeli).
   - **Nem:** %1 RH hassasiyetli bağıl nem, dinamik doluluk çubuğu.
   - **Pil ve Voltaj:** Pil yüzdesi (%), donanım voltajı (V) ve pil doluluk durumu.
   - **Çiğ Noktası (Dew Point) & VPD (Buhar Basıncı Açığı):** Fiziksel yoğuşma ve buharlaşma açığı değerleri.

6. **📦 Cihazın Dahili Flaş Hafızasından Geçmiş İndirme:**
   - Xiaomi LYWSD03MMC sensörü, bağlantı olmasa dahi saatlik min/maks verilerini kendi iç çipinde depolar.
   - Arayüzdeki **"Geçmişi İndir"** butonuna basıldığında `EBE0CCBC` GATT karakteristiği üzerinden bu saatlik geçmiş kayıtlar tek tek indirilip zaman çizelgesine eklenir.

7. **📈 Çift Eksenli Zaman Serisi Grafiği (Chart.js):**
   - Sıcaklık ve nemi gradyanlı eğrilerle gösterir.
   - Mobilde kısa etiketler (`1S`, `24S`, `7G`), masaüstünde geniş etiketler.
   - Açık/Koyu tema değişiminde eksen ve yazı renkleri otomatik adapte olur.

8. **💾 Çevrimdışı Kalıcılık & Dışa Aktarma (Export):**
   - Ölçümler tarayıcının **IndexedDB** veritabanına kaydedilir, sayfa yenilense de silinmez.
   - **CSV (Excel uyumlu)** ve **JSON** olarak tek tıkla dışa aktarılabilir.

---

## 🚀 1. Web Uygulamasını Kullanma (Web Bluetooth)

1. **Desteklenen Tarayıcılar:** Google Chrome, Microsoft Edge, Opera (Android telefonlar, Windows, macOS, Linux).
2. [index.html](file:///c:/Users/Burak/Documents/Xiaomi/index.html) dosyasını tarayıcınızda açın.
3. **"Cihaza Bağlan"** butonuna tıklayın.
4. Açılan Bluetooth listesinden **LYWSD03MMC** cihazınızı seçip **Eşle** butonuna basın.
5. Canlı ölçümler akmaya başlayacaktır. Geçmiş kayıtlar için **"Geçmişi İndir"** butonuna tıklayabilirsiniz.

---

## 🐍 2. Python ile 7/24 Arka Planda Kayıt (Opsiyonel)

```bash
# Bağımlılıkları yükleyin
pip install -r requirements.txt

# Çevredeki sensörleri tarayın:
python tracker.py --scan

# Cihazın hafızasındaki geçmişi indirin:
python tracker.py --history

# 7/24 canlı dinleme ve SQLite'a kaydetme:
python tracker.py --live
```
