# 🌡️ Xiaomi SmartTemp Pro (LYWSD03MMC)

> **Xiaomi Mijia Bluetooth Akıllı Sıcaklık ve Nem Takip İstasyonu (Model: LYWSD03MMC / ASIN: B083Y1D8WB)**  
> Hem tarayıcı üzerinden **Web Bluetooth API** ile sıfır kurulumla çalışan şık (Açık & Koyu Tema, Poppins Font, Mobil Uyumlu) modern gösterge paneli, hem de **Python** ile 7/24 arka planda telemetri toplayan veri istasyonu.

---

## ✨ Öne Çıkan Özellikler

1. **🎨 Beyaz & Siyah Tema (Light / Dark Mode):**
   - Sayfa varsayılan olarak **ferah beyaz (açık) modda** açılır.
   - Sağ üstteki ay/güneş butonuyla tek tıkla **koyu (siyah) moda** geçilebilir.
   - Tercihiniz `localStorage` ile tarayıcıda kalıcı olarak hatırlanır.

2. **🔤 Modern Poppins Tipografisi:**
   - Arayüz genelinde okunabilirliği yüksek, yumuşak hatlara sahip **Google Poppins** yazı tipi kullanılmıştır.
   - Sayısal telemetri ve saat değerleri için mono karakterli **JetBrains Mono** kullanılmıştır.

3. **📱 Telefon ve Tabletlerle Tam Uyum (Responsive & PWA):**
   - Akıllı telefon ekranlarında (iPhone, Samsung, Xiaomi vb.) tek elle kullanıma uygun kart dizilimi.
   - Dokunmatik dostu geniş butonlar, taşmayı önleyen yatay kaydırmalı veri tablosu ve otomatik ölçeklenen grafikler.
   - Android Chrome üzerinden *"Ana Ekrana Ekle"* yapılarak mobil uygulama gibi çalıştırılabilir.

4. **⚡ Gerçek Zamanlı Canlı BLE Telemetrisi:**
   - **Sıcaklık:** 0.1°C hassasiyetle anlık canlı izleme, °C / °F birim geçişi, min/maks kayıtları ve dinamik trend yönü (Yükseliyor / Düşüyor / Dengeli).
   - **Nem:** %1 RH hassasiyetli bağıl nem, dinamik doluluk çubuğu.
   - **Pil ve Voltaj:** Pil yüzdesi (%), donanım voltajı (V) ve pil doluluk durumu.
   - **Çiğ Noktası (Dew Point) & VPD (Buhar Basıncı Açığı):** Fiziksel yoğuşma ve buharlaşma açığı değerleri.

5. **📦 Cihazın Dahili Flaş Hafızasından Geçmiş İndirme:**
   - Xiaomi LYWSD03MMC sensörü, bağlantı olmasa dahi saatlik min/maks verilerini kendi iç çipinde depolar.
   - Arayüzdeki **"Geçmişi İndir"** butonuna basıldığında `EBE0CCBC` GATT karakteristiği üzerinden bu saatlik geçmiş kayıtlar tek tek indirilip zaman çizelgesine eklenir.

6. **📈 Çift Eksenli Zaman Serisi Grafiği (Chart.js):**
   - Sıcaklık ve nemi gradyanlı eğrilerle gösterir.
   - Zaman filtreleri: *1 Saat*, *24 Saat*, *7 Gün*, *Tümü*.
   - Metrik filtreleri: *İkisi*, *Yalnızca Sıcaklık*, *Yalnızca Nem*.
   - Açık/Koyu tema değişiminde eksen ve yazı renkleri otomatik adapte olur.

7. **💾 Çevrimdışı Kalıcılık & Dışa Aktarma (Export):**
   - Ölçümler tarayıcının **IndexedDB** veritabanına kaydedilir, sayfa yenilense de silinmez.
   - **CSV (Excel uyumlu)** ve **JSON** olarak tek tıkla dışa aktarılabilir.

8. **🎮 Simülasyon / Demo Modu:**
   - Cihaz yanınızda değilken arayüzü, grafikleri ve 48 saatlik geriye dönük kayıtları test edebileceğiniz simülasyon modu.

---

## 🚀 1. Web Uygulamasını Kullanma (Web Bluetooth)

1. **Desteklenen Tarayıcılar:** Google Chrome, Microsoft Edge, Opera (Windows, macOS, Android).
2. [index.html](file:///c:/Users/Burak/Documents/Xiaomi/index.html) dosyasını tarayıcınızda açın.
3. **"Bağlan"** butonuna tıklayın.
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

---

## 🌐 GitHub Pages ile Yayınlama

1. GitHub deponuzda **Settings > Pages** sekmesine gidin.
2. Branch olarak `main` seçip **Save** butonuna tıklayın.
3. Web siteniz `https://berat623.github.io/xiaomismarttemp/` adresinden telefonunuzdan veya bilgisayarınızdan anında erişilebilir olacaktır.
