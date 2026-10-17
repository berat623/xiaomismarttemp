# 🌡️ Xiaomi SmartTemp Pro (LYWSD03MMC)

> **Xiaomi Mijia Bluetooth Akıllı Sıcaklık ve Nem Takip İstasyonu (Model: LYWSD03MMC / ASIN: B083Y1D8WB)**  
> Hem tarayıcı üzerinden **Web Bluetooth API** ile kurulum gerektirmeden çalışan modern bir gösterge paneli, hem de **Python** ile 7/24 arka planda veri toplayan güçlü bir telemetri istasyonu.

---

## ✨ Öne Çıkan Özellikler

1. **⚡ Gerçek Zamanlı Canlı BLE Telemetrisi:**
   - **Sıcaklık:** 0.1°C hassasiyetle canlı izleme, °C / °F birim değiştirme, min/maks kayıtları ve dinamik trend yönü (Yükseliyor / Düşüyor / Dengeli).
   - **Nem:** %1 RH hassasiyetli bağıl nem, konfor renk çubuğu (Kuru / İdeal / Nemli).
   - **Pil ve Voltaj:** Pil yüzdesi (%), donanım voltajı (V) ve pil sağlığı durumu.

2. **📦 Cihazın Dahili Flaş Hafızasından Geçmiş İndirme:**
   - Xiaomi LYWSD03MMC sensörü telefon veya bilgisayara bağlı olmasa dahi saatlik min/maks sıcaklık ve nem verilerini kendi hafızasında saklar.
   - Uygulama, `EBE0CCBC` GATT karakteristiği üzerinden bu saatlik geçmiş kayıtları tek tuşla indirip arşive ekler.

3. **🧠 Gelişmiş Konfor & Çevre Analizi:**
   - **Çiğ Noktası (Dew Point):** Yoğuşma ve rutubet başlangıç sıcaklığı hesabı.
   - **VPD (Buhar Basıncı Açığı):** Bitki yetiştirme, sera ve solunum sağlığı için kritik kPa göstergesi.
   - **Akıllı Konfor Sınıflandırması:** Bebek odası uygunluğu, ideal oda havası, aşırı kuruluk ve küf risk uyarıları.

4. **📈 Etkileşimli Zaman Serisi Grafikleri:**
   - **Chart.js** ile dinamik çift eksenli (sıcaklık & nem) gradyanlı eğriler.
   - Zaman filtreleri: *1 Saat*, *24 Saat*, *7 Gün*, *Tümü*.
   - Metrik filtreleri: *İkisi*, *Yalnızca Sıcaklık*, *Yalnızca Nem*.

5. **💾 Çevrimdışı Kalıcılık & Dışa Aktarma:**
   - Tarayıcıyı kapatsanız bile veriler **IndexedDB** veritabanında saklanır.
   - **CSV** ve **JSON** formatlarında tek tıkla dışa aktarma (Excel uyumlu noktalı virgül ayracı).

6. **🎮 Demo / Simülasyon Modu:**
   - Cihaz yanınızda değilken veya Bluetooth eşlemesinden önce uygulamayı, grafikleri ve geçmişi test etmek için 48 saatlik gerçekçi simülasyon modu.

---

## 🚀 1. Web Uygulamasını Kullanma (Web Bluetooth)

Herhangi bir kurulum veya Python gerekmez! Doğrudan tarayıcınızdan bağlanabilirsiniz:

1. **Desteklenen Tarayıcılar:** Google Chrome, Microsoft Edge, Opera (Windows, macOS, Linux veya Android).
2. [index.html](file:///c:/Users/Burak/Documents/Xiaomi/index.html) dosyasını çift tıklayarak tarayıcınızda açın veya yerel bir web sunucusunda çalıştırın.
3. Sağ üstteki **"Cihaza Bağlan"** butonuna tıklayın.
4. Çıkan Bluetooth eşleme penceresinde **LYWSD03MMC** cihazınızı seçip **Eşle** deyin.
5. Veriler anında canlı akmaya başlayacaktır!
6. Geçmiş saatlik kayıtları çekmek için **"Geçmişi İndir"** butonuna basmanız yeterlidir.

---

## 🐍 2. Python ile 7/24 Arka Planda Kayıt (Opsiyonel)

Tarayıcıyı açık tutmak istemiyorsanız projedeki Python istemcisi ile SQLite ve CSV formatında sürekli arka plan kaydı yapabilirsiniz:

### Kurulum:
```bash
pip install -r requirements.txt
```

### Kullanım Komutları:
```bash
# 1. Çevredeki Xiaomi sensörlerini tara ve MAC adreslerini listele:
python tracker.py --scan

# 2. Cihazın dahili flaş hafızasındaki geçmiş verileri indir:
python tracker.py --history --mac "A4:C1:38:XX:XX:XX"

# 3. Sürekli canlı dinleme yap ve xiaomi_temp.db veritabanına kaydet:
python tracker.py --live --mac "A4:C1:38:XX:XX:XX"
```

---

## 📡 Bluetooth GATT Teknik Protokol Haritası (LYWSD03MMC)

| UUID | İsim | Format | Açıklama |
| :--- | :--- | :--- | :--- |
| `EBE0CCB0-7A0A-4B0C-8A1A-6FF2997DA3A6` | **Ana Servis** | Custom | Xiaomi Çevre Ölçüm Servisi |
| `EBE0CCC1-7A0A-4B0C-8A1A-6FF2997DA3A6` | **Canlı Telemetri** | `<hBh` (5B) | Sıcaklık (x0.01°C), Nem (%), Voltaj (mV) |
| `EBE0CCC4-7A0A-4B0C-8A1A-6FF2997DA3A6` | **Pil Seviyesi** | `b` (1B) | Pil yüzdesi (%) |
| `EBE0CCBE-7A0A-4B0C-8A1A-6FF2997DA3A6` | **Sıcaklık Birimi** | `b` (1B) | 0x00: Celsius, 0x01: Fahrenheit |
| `EBE0CCB7-7A0A-4B0C-8A1A-6FF2997DA3A6` | **Zaman Senkronizasyonu** | `<I` (4B) | Epoch zaman damgası (saniye) |
| `EBE0CCB9-7A0A-4B0C-8A1A-6FF2997DA3A6` | **Kayıt İndeksleri** | `<II` (8B) | Son hesaplanan ve bir sonraki kayıt indeksi |
| `EBE0CCBB-7A0A-4B0C-8A1A-6FF2997DA3A6` | **Son Saat Özeti** | `<IIhBhB` (14B) | Son 1 saatin min/maks değerleri |
| `EBE0CCBC-7A0A-4B0C-8A1A-6FF2997DA3A6` | **Geçmiş Arşiv Akışı** | `<IIhBhB` (14B) | Cihaz flaş belleğindeki geçmiş saat kayıtları |

---

## 🌐 GitHub Pages ile Yayınlama

Bu projeyi tek tıklamayla internete açıp telefonunuzdan da doğrudan sensöre bağlanabilirsiniz:
1. GitHub reponuzda **Settings > Pages** sekmesine gidin.
2. **Branch** olarak `main` ve folder olarak `/(root)` seçin, **Save** butonuna tıklayın.
3. Web siteniz `https://berat623.github.io/xiaomismarttemp/` adresinde canlıya geçecektir!
