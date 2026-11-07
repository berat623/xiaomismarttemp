/**
 * Xiaomi SmartTemp — Web Bluetooth BLE & ATC / BTHome Termometre Yöneticisi
 * Desteklenen Protokoller:
 * 1. BTHome V1 & V2 (Şifresiz Yayınlar - 0xFCD2)
 * 2. ATC1441 Custom ROM (0x181A)
 * 3. PVVX Custom ROM (0x181A & 0x1F10)
 * 4. Xiaomi Orijinal / MiBeacon (0xFE95 & ebe0ccb0...)
 * 
 * Özellikler:
 * - Canlı BLE Reklam Taraması (Pasif Broadcast / Eşlemesiz Anlık Telemetri)
 * - GATT Bağlantısı ile Cihaz Hafızasındaki Tüm Kayıtları Çekme
 * - Sıcaklık, Nem ve Batarya Chart.js Çoklu Zaman Serisi Grafiği
 * - Çevrimdışı Örnek / Demo Veri Modu ve CSV/JSON Dışa Aktarımı
 */

class XiaomiBleManager {
  constructor() {
    this.devices = new Map();
    this.activeDeviceKey = null;
    this.isScanning = false;
    this.isConnected = false;
    this.connectedDevice = null;
    this.gattServer = null;
    this.chart = null;
    this.chartRange = '24h'; // '6h', '24h', '7d', 'all'
    this.chartMetric = 'all'; // 'all', 'temp', 'hum', 'bat'
    this.historyData = [];
    this.scanInterval = null;

    this.cacheDom();
    this.initChart();
    this.loadCachedHistory();
    this.bindEvents();
    this.checkBluetoothAvailability();
  }

  cacheDom() {
    this.dom = {
      // Durum ve Göstergeler
      bleStatusBadge: document.getElementById('bleStatusBadge'),
      bleStatusText: document.getElementById('bleStatusText'),
      bleSignalStrength: document.getElementById('bleSignalStrength'),
      bleLastUpdateTime: document.getElementById('bleLastUpdateTime'),
      blePacketCount: document.getElementById('blePacketCount'),
      bleProtocolTag: document.getElementById('bleProtocolTag'),
      bleDeviceName: document.getElementById('bleDeviceName'),
      bleMacAddress: document.getElementById('bleMacAddress'),

      // Hero Canlı Okuma Elemanları
      heroTempLive: document.getElementById('heroTempLive'),
      heroHumLive: document.getElementById('heroHumLive'),
      heroDewPointLive: document.getElementById('heroDewPointLive'),
      heroComfortLive: document.getElementById('heroComfortLive'),
      heroBatteryLive: document.getElementById('heroBatteryLive'),
      heroVoltageLive: document.getElementById('heroVoltageLive'),

      // Butonlar
      btnStartScan: document.getElementById('btnStartScan'),
      btnConnectGatt: document.getElementById('btnConnectGatt'),
      btnDisconnect: document.getElementById('btnDisconnect'),
      btnLoadDemoData: document.getElementById('btnLoadDemoData'),
      btnClearHistory: document.getElementById('btnClearHistory'),
      btnExportCsv: document.getElementById('btnExportCsv'),
      btnExportJson: document.getElementById('btnExportJson'),

      // Çoklu Cihaz Listesi
      deviceListContainer: document.getElementById('deviceListContainer'),
      deviceCardsTrack: document.getElementById('deviceCardsTrack'),

      // Grafik ve İstatistikler
      bleChartCanvas: document.getElementById('bleChartCanvas'),
      chartStatCount: document.getElementById('chartStatCount'),
      chartMinTemp: document.getElementById('chartMinTemp'),
      chartMaxTemp: document.getElementById('chartMaxTemp'),
      chartAvgTemp: document.getElementById('chartAvgTemp'),
      chartMinHum: document.getElementById('chartMinHum'),
      chartMaxHum: document.getElementById('chartMaxHum'),
      chartAvgHum: document.getElementById('chartAvgHum'),
      chartBatStat: document.getElementById('chartBatStat'),

      // Tablo
      historyTableBody: document.getElementById('historyTableBody')
    };
  }

  checkBluetoothAvailability() {
    if (!navigator.bluetooth) {
      if (this.dom.bleStatusText) {
        this.dom.bleStatusText.textContent = 'Web Bluetooth Desteklenmiyor (Chrome / Edge kullanın)';
      }
      if (this.dom.bleStatusBadge) {
        this.dom.bleStatusBadge.className = 'w-2 h-2 rounded-full bg-rose-500';
      }
      if (window.app && window.app.showToast) {
        window.app.showToast('Tarayıcınızda Web Bluetooth kapalı veya desteklenmiyor. Demo modunu test edebilirsiniz.', 'error');
      }
    }
  }

  bindEvents() {
    // 1. Canlı BLE Tarama / Dinleme Butonu
    if (this.dom.btnStartScan) {
      this.dom.btnStartScan.addEventListener('click', () => {
        if (this.isScanning) {
          this.stopScan();
        } else {
          this.startScan();
        }
      });
    }

    // 2. Cihaza Bağlan & Hafızayı Çek Butonu
    if (this.dom.btnConnectGatt) {
      this.dom.btnConnectGatt.addEventListener('click', () => {
        this.connectAndDownloadHistory();
      });
    }

    // 3. Bağlantıyı Kes Butonu
    if (this.dom.btnDisconnect) {
      this.dom.btnDisconnect.addEventListener('click', () => {
        this.disconnect();
      });
    }

    // 4. Demo Veri Yükle Butonu
    if (this.dom.btnLoadDemoData) {
      this.dom.btnLoadDemoData.addEventListener('click', () => {
        this.loadDemoData();
      });
    }

    // 5. Hafızayı Temizle Butonu
    if (this.dom.btnClearHistory) {
      this.dom.btnClearHistory.addEventListener('click', () => {
        if (confirm('Tüm geçmiş ölçüm kayıtları silinsin mi?')) {
          this.clearHistory();
        }
      });
    }

    // 6. Dışa Aktarma Butonları (CSV & JSON)
    if (this.dom.btnExportCsv) {
      this.dom.btnExportCsv.addEventListener('click', () => this.exportCsv());
    }
    if (this.dom.btnExportJson) {
      this.dom.btnExportJson.addEventListener('click', () => this.exportJson());
    }

    // 7. Grafik Aralık Butonları (6h / 24h / 7d / all)
    document.querySelectorAll('.ble-chart-range-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.ble-chart-range-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.chartRange = e.currentTarget.dataset.range || '24h';
        this.updateChart();
      });
    });

    // 8. Grafik Metrik Butonları (Tümü / Sıcaklık / Nem / Pil)
    document.querySelectorAll('.ble-chart-metric-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.ble-chart-metric-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.chartMetric = e.currentTarget.dataset.metric || 'all';
        this.updateChart();
      });
    });
  }

  // ==========================================
  // PARSER: BTHome, ATC1441, PVVX & Xiaomi BLE
  // ==========================================
  parseAdvertisementPacket(serviceDataMap, rawDevice, rssi) {
    if (!serviceDataMap) return null;

    let parsed = null;

    // 1. Kontrol: BTHome V1/V2 (0xFCD2)
    for (const [uuid, dataView] of serviceDataMap.entries()) {
      const u = uuid.toLowerCase();
      if (u.includes('fcd2')) {
        parsed = this.parseBTHome(dataView);
        if (parsed) break;
      }
    }

    // 2. Kontrol: ATC / PVVX Custom Firmware (0x181A)
    if (!parsed) {
      for (const [uuid, dataView] of serviceDataMap.entries()) {
        const u = uuid.toLowerCase();
        if (u.includes('181a')) {
          parsed = this.parseATC(dataView);
          if (parsed) break;
        }
      }
    }

    // 3. Kontrol: Xiaomi MiBeacon Orijinal (0xFE95)
    if (!parsed) {
      for (const [uuid, dataView] of serviceDataMap.entries()) {
        const u = uuid.toLowerCase();
        if (u.includes('fe95')) {
          parsed = this.parseXiaomiMiBeacon(dataView);
          if (parsed) break;
        }
      }
    }

    if (parsed) {
      this.handleIncomingTelemetry(parsed, rawDevice, rssi);
    }

    return parsed;
  }

  parseBTHome(dataView) {
    const len = dataView.byteLength;
    if (len < 3) return null;

    let offset = 0;
    const header = dataView.getUint8(offset++); // 0x40 unencrypted V2
    let temp = null;
    let hum = null;
    let bat = null;
    let volt = null;
    let packetId = null;

    while (offset < len) {
      const objId = dataView.getUint8(offset++);
      if (objId === 0x00) {
        if (offset < len) packetId = dataView.getUint8(offset++);
      } else if (objId === 0x01) {
        if (offset < len) bat = dataView.getUint8(offset++);
      } else if (objId === 0x02) {
        if (offset + 1 < len) {
          temp = dataView.getInt16(offset, true) * 0.01;
          offset += 2;
        }
      } else if (objId === 0x03) {
        if (offset + 1 < len) {
          hum = dataView.getUint16(offset, true) * 0.01;
          offset += 2;
        } else if (offset < len) {
          hum = dataView.getUint8(offset++);
        }
      } else if (objId === 0x0c) {
        if (offset + 1 < len) {
          volt = dataView.getUint16(offset, true) * 0.001;
          offset += 2;
        }
      } else {
        offset++;
      }
    }

    if (temp !== null || hum !== null) {
      return {
        format: 'BTHome V2 (Şifresiz)',
        temp: temp !== null ? Number(temp.toFixed(2)) : null,
        hum: hum !== null ? Number(hum.toFixed(2)) : null,
        bat: bat,
        volt: volt !== null ? Number(volt.toFixed(3)) : null,
        packetId: packetId
      };
    }
    return null;
  }

  parseATC(dataView) {
    const len = dataView.byteLength;
    if (len >= 15) {
      // PVVX Custom Firmware Format (Little-Endian)
      const temp = dataView.getInt16(6, true) / 100.0;
      const hum = dataView.getUint16(8, true) / 100.0;
      const voltMv = dataView.getUint16(10, true);
      const bat = dataView.getUint8(12);
      const count = dataView.getUint8(13);

      return {
        format: 'PVVX Custom ROM',
        temp: Number(temp.toFixed(2)),
        hum: Number(hum.toFixed(2)),
        bat: bat,
        volt: Number((voltMv / 1000.0).toFixed(3)),
        count: count
      };
    } else if (len >= 13) {
      // ATC1441 Custom Firmware Format (Big-Endian)
      const temp = dataView.getInt16(6, false) / 10.0;
      const hum = dataView.getUint8(8);
      const bat = dataView.getUint8(9);
      const voltMv = dataView.getUint16(10, false);
      const count = dataView.getUint8(12);

      return {
        format: 'ATC1441 Custom ROM',
        temp: Number(temp.toFixed(1)),
        hum: Number(hum),
        bat: bat,
        volt: Number((voltMv / 1000.0).toFixed(3)),
        count: count
      };
    }
    return null;
  }

  parseXiaomiMiBeacon(dataView) {
    const len = dataView.byteLength;
    if (len < 12) return null;

    let temp = null;
    let hum = null;
    let bat = null;

    // MiBeacon payload parsing
    for (let i = 10; i < len - 3; i++) {
      const type = dataView.getUint8(i);
      const dataLen = dataView.getUint8(i + 1);
      if (type === 0x04 && dataLen === 2) {
        temp = dataView.getInt16(i + 2, true) / 10.0;
      } else if (type === 0x06 && dataLen === 2) {
        hum = dataView.getUint16(i + 2, true) / 10.0;
      } else if (type === 0x0a && dataLen === 1) {
        bat = dataView.getUint8(i + 2);
      } else if (type === 0x0d && dataLen === 4) {
        temp = dataView.getInt16(i + 2, true) / 10.0;
        hum = dataView.getUint16(i + 4, true) / 10.0;
      }
    }

    if (temp !== null || hum !== null) {
      return {
        format: 'Xiaomi Orijinal (MiBeacon)',
        temp: temp !== null ? Number(temp.toFixed(1)) : null,
        hum: hum !== null ? Number(hum.toFixed(1)) : null,
        bat: bat,
        volt: null
      };
    }
    return null;
  }

  // ==========================================
  // TELEMETRİ İŞLEME & HERO KART GÜNCELLEME
  // ==========================================
  handleIncomingTelemetry(parsed, rawDevice, rssi) {
    const devId = (rawDevice && rawDevice.id) || (rawDevice && rawDevice.address) || 'ble_sensor_1';
    const devName = (rawDevice && rawDevice.name) || 'Xiaomi Termometre';
    const now = new Date();

    let dev = this.devices.get(devId);
    if (!dev) {
      dev = {
        id: devId,
        name: devName,
        format: parsed.format,
        temp: parsed.temp,
        hum: parsed.hum,
        bat: parsed.bat || 100,
        volt: parsed.volt || 3.0,
        rssi: rssi || -65,
        packetCount: 1,
        lastSeen: now
      };
      this.devices.set(devId, dev);
    } else {
      if (parsed.temp !== null) dev.temp = parsed.temp;
      if (parsed.hum !== null) dev.hum = parsed.hum;
      if (parsed.bat !== null && parsed.bat !== undefined) dev.bat = parsed.bat;
      if (parsed.volt !== null && parsed.volt !== undefined) dev.volt = parsed.volt;
      if (rssi !== null && rssi !== undefined) dev.rssi = rssi;
      dev.format = parsed.format;
      dev.packetCount = (dev.packetCount || 0) + 1;
      dev.lastSeen = now;
    }

    if (!this.activeDeviceKey) {
      this.activeDeviceKey = devId;
    }

    // Aktif cihaz ise Hero ekranını anında güncelle
    if (this.activeDeviceKey === devId) {
      this.renderHeroDisplay(dev);
    }

    // Canlı kaydı hafıza dizisine ekle
    const historyItem = {
      timestamp: now.toISOString(),
      temp: dev.temp,
      hum: dev.hum,
      bat: dev.bat,
      volt: dev.volt,
      rssi: dev.rssi,
      devId: devId
    };

    // Hafızaya ekle (aynı dakikadaki veriyi güncelle veya yeni ekle)
    this.addMeasurementToHistory(historyItem);
    this.renderDeviceList();
  }

  renderHeroDisplay(dev) {
    if (!dev) return;

    // 1. Sıcaklık
    if (this.dom.heroTempLive) {
      this.dom.heroTempLive.textContent = dev.temp !== null ? dev.temp.toFixed(1) : '--';
    }

    // 2. Nem
    if (this.dom.heroHumLive) {
      this.dom.heroHumLive.textContent = dev.hum !== null ? dev.hum.toFixed(1) : '--';
    }

    // 3. Çiy Noktası Hesabı (Magnus Formülü Yaklaşımı)
    if (this.dom.heroDewPointLive && dev.temp !== null && dev.hum !== null) {
      const t = dev.temp;
      const h = dev.hum;
      const dew = t - ((100 - h) / 5);
      this.dom.heroDewPointLive.textContent = `Çiy: ${dew.toFixed(1)}°C`;
    }

    // 4. Konfor Değerlendirmesi
    if (this.dom.heroComfortLive && dev.temp !== null && dev.hum !== null) {
      let comfort = 'İdeal Konfor';
      let comfortColor = 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40';
      if (dev.hum > 70) {
        comfort = 'Yüksek Nem / Rutubet';
        comfortColor = 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40';
      } else if (dev.hum < 30) {
        comfort = 'Kuru Hava';
        comfortColor = 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800/40';
      } else if (dev.temp > 28) {
        comfort = 'Sıcak Ortam';
        comfortColor = 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40';
      } else if (dev.temp < 18) {
        comfort = 'Serin / Soğuk';
        comfortColor = 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/40';
      }
      this.dom.heroComfortLive.textContent = comfort;
      this.dom.heroComfortLive.className = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${comfortColor}`;
    }

    // 5. Batarya ve Voltaj
    if (this.dom.heroBatteryLive) {
      this.dom.heroBatteryLive.textContent = dev.bat ? `%${dev.bat}` : '--%';
    }
    if (this.dom.heroVoltageLive) {
      this.dom.heroVoltageLive.textContent = dev.volt ? `${dev.volt.toFixed(2)}V` : '--V';
    }

    // 6. Sinyal RSSI & Paket Sayısı
    if (this.dom.bleSignalStrength) {
      this.dom.bleSignalStrength.textContent = dev.rssi ? `${dev.rssi} dBm` : '-- dBm';
    }
    if (this.dom.blePacketCount) {
      this.dom.blePacketCount.textContent = `#${dev.packetCount || 1}`;
    }

    // 7. Protokol & Cihaz Bilgisi
    if (this.dom.bleProtocolTag) {
      this.dom.bleProtocolTag.textContent = dev.format || 'BLE Yayını';
    }
    if (this.dom.bleDeviceName) {
      this.dom.bleDeviceName.textContent = dev.name || 'Xiaomi Sensör';
    }
    if (this.dom.bleMacAddress) {
      this.dom.bleMacAddress.textContent = dev.id || dev.address || 'BLE-DEVICE';
    }

    // 8. Son Güncelleme Zamanı
    if (this.dom.bleLastUpdateTime) {
      const timeStr = dev.lastSeen ? dev.lastSeen.toLocaleTimeString('tr-TR') : '--:--:--';
      this.dom.bleLastUpdateTime.textContent = `Son Sinyal: ${timeStr}`;
    }
  }

  renderDeviceList() {
    if (!this.dom.deviceCardsTrack) return;
    if (this.devices.size === 0) return;

    let html = '';
    this.devices.forEach((dev, id) => {
      const isActive = id === this.activeDeviceKey;
      html += `
        <div class="hub-card cursor-pointer select-none min-w-[150px] p-2.5 transition-all ${isActive ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30' : 'hover:border-slate-300'}" onclick="window.bleManager.selectDevice('${id}')">
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="font-extrabold text-xs text-[#0f172a] dark:text-[#f8fafc] truncate flex items-center gap-1">
              ${isActive ? '<span class="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>' : ''}
              ${dev.name}
            </span>
            <span class="text-[10px] font-mono font-bold text-slate-400">${dev.rssi || '--'} dBm</span>
          </div>
          <div class="flex items-center justify-between text-xs font-mono font-black">
            <span class="text-rose-600 dark:text-rose-400">${dev.temp !== null ? dev.temp.toFixed(1) + '°C' : '--'}</span>
            <span class="text-blue-600 dark:text-sky-400">${dev.hum !== null ? '%' + Math.round(dev.hum) : '--'}</span>
          </div>
          <div class="text-[9px] text-slate-400 truncate mt-1 flex items-center justify-between">
            <span>${dev.format.split(' ')[0]}</span>
            <span>🔋%${dev.bat || '--'}</span>
          </div>
        </div>
      `;
    });

    this.dom.deviceCardsTrack.innerHTML = html;
  }

  selectDevice(id) {
    if (this.devices.has(id)) {
      this.activeDeviceKey = id;
      this.renderHeroDisplay(this.devices.get(id));
      this.renderDeviceList();
      this.updateChart();
    }
  }

  // ==========================================
  // CANLI BLE REKLAM TARAMASI (PASSIVE SCANNING)
  // ==========================================
  async startScan() {
    if (!navigator.bluetooth) {
      alert('Tarayıcınızda Web Bluetooth API bulunmuyor. Lütfen Google Chrome veya Microsoft Edge kullanın.');
      return;
    }

    try {
      this.isScanning = true;
      if (this.dom.btnStartScan) {
        this.dom.btnStartScan.innerHTML = `<i data-lucide="square" class="w-3.5 h-3.5 text-rose-500"></i><span>Taramayı Durdur</span>`;
        this.dom.btnStartScan.classList.replace('bg-blue-600', 'bg-rose-600');
      }
      if (this.dom.bleStatusText) this.dom.bleStatusText.textContent = 'BLE Yayınları Dinleniyor (BTHome / ATC / Xiaomi)...';
      if (this.dom.bleStatusBadge) this.dom.bleStatusBadge.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';

      // 1. Yol: navigator.bluetooth.requestLEScan (Pasif Broadcast Yakalama)
      if (typeof navigator.bluetooth.requestLEScan === 'function') {
        const scan = await navigator.bluetooth.requestLEScan({
          acceptAllAdvertisements: true,
          keepRepeatedDevices: true
        });

        navigator.bluetooth.addEventListener('advertisementreceived', (event) => {
          this.parseAdvertisementPacket(event.serviceData, event.device, event.rssi);
        });

        if (window.app && window.app.showToast) {
          window.app.showToast('Kablosuz BLE reklam tarayıcısı aktif! Havadaki BTHome ve ATC paketleri gerçek zamanlı yakalanıyor.', 'success');
        }
      } else {
        // 2. Yol: requestLEScan desteklenmiyorsa, doğrudan GATT Cihaz Seçimini başlat
        if (window.app && window.app.showToast) {
          window.app.showToast('Pasif reklam tarayıcı yerine GATT canlı bağlantısı başlatılıyor...', 'info');
        }
        await this.connectAndDownloadHistory();
      }

      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    } catch (err) {
      console.warn('BLE Tarama başlatılamadı:', err);
      this.stopScan();
      if (window.app && window.app.showToast) {
        window.app.showToast(`Tarama başlatılamadı: ${err.message}`, 'error');
      }
    }
  }

  stopScan() {
    this.isScanning = false;
    if (this.dom.btnStartScan) {
      this.dom.btnStartScan.innerHTML = `<i data-lucide="radio" class="w-3.5 h-3.5"></i><span>Canlı BLE Dinle</span>`;
      this.dom.btnStartScan.classList.replace('bg-rose-600', 'bg-blue-600');
    }
    if (this.dom.bleStatusText) this.dom.bleStatusText.textContent = 'Dinleme Duraklatıldı';
    if (this.dom.bleStatusBadge) this.dom.bleStatusBadge.className = 'w-2 h-2 rounded-full bg-slate-400';
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  // ==========================================
  // GATT BAĞLANTISI & HAFIZADAN VERİ ÇEKME
  // ==========================================
  async connectAndDownloadHistory() {
    if (!navigator.bluetooth) {
      alert('Tarayıcınızda Web Bluetooth desteği bulunamadı.');
      return;
    }

    try {
      if (this.dom.bleStatusText) this.dom.bleStatusText.textContent = 'Cihaz Seçimi Bekleniyor...';
      if (this.dom.bleStatusBadge) this.dom.bleStatusBadge.className = 'w-2 h-2 rounded-full bg-blue-500 animate-pulse';

      // Çevredeki tüm termometreleri tara (ATC, PVVX, LYWSD03, BTHome)
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '0000181a-0000-1000-8000-00805f9b34fb', // Environmental Sensing (ATC / PVVX)
          '0000180f-0000-1000-8000-00805f9b34fb', // Battery
          '00001f10-0000-1000-8000-00805f9b34fb', // PVVX Custom Log Service
          'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6'  // Stock Xiaomi Service
        ]
      });

      this.connectedDevice = device;
      if (this.dom.bleStatusText) this.dom.bleStatusText.textContent = `${device.name || 'Termometreye'} bağlanılıyor...`;

      device.addEventListener('gattserverdisconnected', () => {
        this.onDisconnected();
      });

      const server = await device.gatt.connect();
      this.gattServer = server;
      this.isConnected = true;

      if (this.dom.btnConnectGatt) this.dom.btnConnectGatt.classList.add('hidden');
      if (this.dom.btnDisconnect) this.dom.btnDisconnect.classList.remove('hidden');

      if (this.dom.bleStatusText) this.dom.bleStatusText.textContent = `Bağlandı: ${device.name || 'Termometre'} · Hafıza taranıyor...`;
      if (this.dom.bleStatusBadge) this.dom.bleStatusBadge.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';

      if (window.app && window.app.showToast) {
        window.app.showToast(`✅ ${device.name || 'Termometre'} ile GATT bağlantısı kuruldu! Hafıza çekiliyor...`, 'success');
      }

      // Servisleri Keşfet
      const services = await server.getPrimaryServices();
      const serviceUuids = services.map(s => s.uuid.toLowerCase());

      let historyFetchedCount = 0;

      // 1. PVVX / ATC Custom Log Hafızasını Çek (0x1F10 & 0x1F1F)
      const pvvxService = services.find(s => s.uuid.toLowerCase().includes('1f10') || s.uuid.toLowerCase().includes('181a'));
      if (pvvxService) {
        try {
          const chars = await pvvxService.getCharacteristics();
          const logChar = chars.find(c => c.uuid.toLowerCase().includes('1f1f'));
          if (logChar) {
            await logChar.startNotifications();
            logChar.addEventListener('characteristicvaluechanged', (e) => {
              const dv = e.target.value;
              const parsedEntries = this.parsePvvxLogPacket(dv);
              if (parsedEntries && parsedEntries.length > 0) {
                parsedEntries.forEach(item => this.addMeasurementToHistory(item));
                historyFetchedCount += parsedEntries.length;
                if (this.dom.bleStatusText) {
                  this.dom.bleStatusText.textContent = `Hafızadan ${historyFetchedCount} kayıt aktarıldı...`;
                }
              }
            });

            // Hafızayı göndermesi için tetikleyici komut yaz (0xff veya 0x01)
            try {
              await logChar.writeValue(new Uint8Array([0xff]));
            } catch (wErr) {
              // Bazı sürümler doğrudan okumayı bekler
              await logChar.readValue();
            }
          }
        } catch (e) {
          console.log('PVVX log karakteristiği doğrudan okunamadı:', e);
        }
      }

      // 2. Canlı Sıcaklık & Nem Bildirimlerine Abone Ol (0x2A6E & 0x2A6F veya Stock)
      try {
        const envService = services.find(s => s.uuid.toLowerCase().includes('181a'));
        if (envService) {
          const envChars = await envService.getCharacteristics();
          for (const ch of envChars) {
            const cu = ch.uuid.toLowerCase();
            if (cu.includes('2a6e')) { // Sıcaklık
              await ch.startNotifications();
              ch.addEventListener('characteristicvaluechanged', (e) => {
                const temp = e.target.value.getInt16(0, true) / 100.0;
                this.handleIncomingTelemetry({ format: 'ATC / PVVX GATT', temp, hum: null }, device, -55);
              });
            } else if (cu.includes('2a6f')) { // Nem
              await ch.startNotifications();
              ch.addEventListener('characteristicvaluechanged', (e) => {
                const hum = e.target.value.getUint16(0, true) / 100.0;
                this.handleIncomingTelemetry({ format: 'ATC / PVVX GATT', temp: null, hum }, device, -55);
              });
            }
          }
        }
      } catch (liveErr) {
        console.log('Standart GATT canlı telemetri servisi:', liveErr);
      }

      // 3. Batarya Seviyesini Oku (0x180F -> 0x2A19)
      try {
        const batService = services.find(s => s.uuid.toLowerCase().includes('180f'));
        if (batService) {
          const batChar = await batService.getCharacteristic('00002a19-0000-1000-8000-00805f9b34fb');
          const batVal = await batChar.readValue();
          const batLevel = batVal.getUint8(0);
          this.handleIncomingTelemetry({ format: 'GATT Telemetri', temp: null, hum: null, bat: batLevel }, device, -55);
        }
      } catch (batErr) {}

      // 4. Orijinal Xiaomi Stock Firmware Hafızasını Çek (ebe0ccb0...)
      const stockService = services.find(s => s.uuid.toLowerCase().includes('ebe0ccb0'));
      if (stockService) {
        try {
          const liveChar = await stockService.getCharacteristic('ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6');
          await liveChar.startNotifications();
          liveChar.addEventListener('characteristicvaluechanged', (e) => {
            const dv = e.target.value;
            if (dv.byteLength >= 5) {
              const temp = dv.getInt16(0, true) / 100.0;
              const hum = dv.getUint8(2);
              const volt = dv.getUint16(3, true) / 1000.0;
              const bat = Math.min(100, Math.max(0, Math.round((volt - 2.1) / 1.0 * 100)));
              this.handleIncomingTelemetry({ format: 'Xiaomi Orijinal', temp, hum, bat, volt }, device, -55);
            }
          });
        } catch (stockErr) {}
      }

      setTimeout(() => {
        if (this.dom.bleStatusText) {
          this.dom.bleStatusText.textContent = `Canlı Bağlantı Aktif: ${device.name || 'Termometre'}`;
        }
        if (this.dom.bleStatusBadge) {
          this.dom.bleStatusBadge.className = 'w-2 h-2 rounded-full bg-emerald-500';
        }
        this.updateChart();
      }, 3000);

    } catch (err) {
      console.warn('GATT Bağlantı hatası:', err);
      this.onDisconnected();
      if (err.name !== 'NotFoundError') {
        alert('Cihaza bağlanılamadı: ' + err.message);
      }
    }
  }

  parsePvvxLogPacket(dataView) {
    // PVVX flash log entry format:
    // Her kayıt: 4 byte uint32 time + 2 byte int16 temp (/100) + 2 byte uint16 hum (/100) + 2 byte uint16 volt
    const entries = [];
    const len = dataView.byteLength;
    if (len < 8) return entries;

    let offset = 0;
    while (offset + 8 <= len) {
      const ts = dataView.getUint32(offset, true);
      const temp = dataView.getInt16(offset + 4, true) / 100.0;
      const hum = dataView.getUint16(offset + 6, true) / 100.0;
      let volt = 3.0;
      if (offset + 10 <= len) {
        volt = dataView.getUint16(offset + 8, true) / 1000.0;
        offset += 10;
      } else {
        offset += 8;
      }

      // Geçerli bir tarih ise (Unix timestamp)
      const date = (ts > 1500000000 && ts < 2100000000) ? new Date(ts * 1000) : new Date();

      if (temp >= -40 && temp <= 80 && hum >= 0 && hum <= 100) {
        entries.push({
          timestamp: date.toISOString(),
          temp: Number(temp.toFixed(2)),
          hum: Number(hum.toFixed(2)),
          bat: Math.min(100, Math.max(0, Math.round((volt - 2.1) / 1.0 * 100))),
          volt: Number(volt.toFixed(3)),
          rssi: -60
        });
      }
    }
    return entries;
  }

  disconnect() {
    if (this.connectedDevice && this.connectedDevice.gatt.connected) {
      this.connectedDevice.gatt.disconnect();
    }
    this.onDisconnected();
  }

  onDisconnected() {
    this.isConnected = false;
    this.connectedDevice = null;
    this.gattServer = null;

    if (this.dom.btnConnectGatt) this.dom.btnConnectGatt.classList.remove('hidden');
    if (this.dom.btnDisconnect) this.dom.btnDisconnect.classList.add('hidden');
    if (this.dom.bleStatusText) this.dom.bleStatusText.textContent = 'Bağlantı Kesildi / Hazır';
    if (this.dom.bleStatusBadge) this.dom.bleStatusBadge.className = 'w-2 h-2 rounded-full bg-slate-400';

    if (window.app && window.app.showToast) {
      window.app.showToast('Bluetooth GATT bağlantısı sonlandırıldı.', 'info');
    }
  }

  // ==========================================
  // HAFIZA YÖNETİMİ & GRAFİK OLUŞTURMA
  // ==========================================
  addMeasurementToHistory(item) {
    if (!item || item.temp === null || isNaN(item.temp)) return;

    // Son 1 dakika içindeki aynı veriyi mükerrer kaydetme
    const itemTimeMs = new Date(item.timestamp).getTime();
    const lastItem = this.historyData[this.historyData.length - 1];

    if (lastItem) {
      const lastTimeMs = new Date(lastItem.timestamp).getTime();
      if (Math.abs(itemTimeMs - lastTimeMs) < 45000) {
        lastItem.temp = item.temp;
        lastItem.hum = item.hum;
        if (item.bat) lastItem.bat = item.bat;
        this.saveHistoryDebounced();
        this.updateChart();
        return;
      }
    }

    this.historyData.push(item);

    // Maksimum 5000 kayıt sakla (tarayıcı belleği performansı)
    if (this.historyData.length > 5000) {
      this.historyData.shift();
    }

    this.saveHistoryDebounced();
    this.updateChart();
    this.renderHistoryTable();
  }

  saveHistoryDebounced() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        localStorage.setItem('xiaomi_smarttemp_history_v1', JSON.stringify(this.historyData.slice(-1500)));
      } catch (e) {}
    }, 1200);
  }

  loadCachedHistory() {
    try {
      const cached = localStorage.getItem('xiaomi_smarttemp_history_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.historyData = parsed;
          const last = parsed[parsed.length - 1];
          if (last) {
            this.renderHeroDisplay({
              id: last.devId || 'Kayıtlı Cihaz',
              name: 'Xiaomi Termometre',
              format: 'Kayıtlı Hafıza',
              temp: last.temp,
              hum: last.hum,
              bat: last.bat || 88,
              volt: last.volt || 3.01,
              rssi: last.rssi || -60,
              packetCount: parsed.length,
              lastSeen: new Date(last.timestamp)
            });
          }
          this.updateChart();
          this.renderHistoryTable();
        }
      }
    } catch (e) {}
  }

  clearHistory() {
    this.historyData = [];
    localStorage.removeItem('xiaomi_smarttemp_history_v1');
    this.updateChart();
    this.renderHistoryTable();
    if (window.app && window.app.showToast) {
      window.app.showToast('Tüm hafıza ve grafik kayıtları sıfırlandı.', 'info');
    }
  }

  // ==========================================
  // DEMO / ÖRNEK HAFIZA ÜRETECİSİ
  // ==========================================
  loadDemoData() {
    const demoItems = [];
    const now = Date.now();
    const count = 144; // 3 gün, her 30 dakikada bir ölçüm
    const stepMs = 30 * 60 * 1000;

    let currentTemp = 21.5;
    let currentHum = 48.0;
    let currentBat = 96;

    for (let i = count - 1; i >= 0; i--) {
      const tMs = now - (i * stepMs);
      const d = new Date(tMs);
      const hour = d.getHours();

      // Gece daha serin, gündüz daha ılık simülasyonu
      const diurnalCycle = Math.sin((hour - 8) / 24 * Math.PI * 2);
      const noiseT = (Math.random() - 0.5) * 0.4;
      const noiseH = (Math.random() - 0.5) * 1.5;

      const temp = Number((21.0 + (diurnalCycle * 2.8) + noiseT).toFixed(1));
      const hum = Number((50.0 - (diurnalCycle * 8.0) + noiseH).toFixed(1));
      const bat = Math.max(85, Math.round(currentBat - (count - i) * 0.04));

      demoItems.push({
        timestamp: d.toISOString(),
        temp: temp,
        hum: hum,
        bat: bat,
        volt: Number((2.8 + (bat / 100 * 0.35)).toFixed(3)),
        rssi: -58 - Math.floor(Math.random() * 12),
        devId: 'DEMO_ATC_LYWSD03'
      });
    }

    this.historyData = demoItems;
    this.saveHistoryDebounced();

    // Aktif cihaz olarak son kaydı ata
    const last = demoItems[demoItems.length - 1];
    const dev = {
      id: 'DEMO_ATC_A4C138',
      name: 'Oturma Odası (ATC Demo)',
      format: 'PVVX / BTHome (Demo)',
      temp: last.temp,
      hum: last.hum,
      bat: last.bat,
      volt: last.volt,
      rssi: last.rssi,
      packetCount: demoItems.length,
      lastSeen: new Date(last.timestamp)
    };
    this.devices.set(dev.id, dev);
    this.activeDeviceKey = dev.id;

    this.renderHeroDisplay(dev);
    this.renderDeviceList();
    this.updateChart();
    this.renderHistoryTable();

    if (window.app && window.app.showToast) {
      window.app.showToast('✅ 144 adet 3 günlük örnek termometre hafıza kaydı yüklendi!', 'success');
    }
  }

  // ==========================================
  // CHART.JS İNTERAKTİF GRAFİK YÖNETİMİ
  // ==========================================
  initChart() {
    if (!this.dom.bleChartCanvas) return;
    const ctx = this.dom.bleChartCanvas.getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Sıcaklık (°C)',
            data: [],
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: true,
            yAxisID: 'yTemp'
          },
          {
            label: 'Bağıl Nem (%)',
            data: [],
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.08)',
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: true,
            yAxisID: 'yHum'
          },
          {
            label: 'Batarya (%)',
            data: [],
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            borderWidth: 1.8,
            borderDash: [4, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.2,
            yAxisID: 'yHum'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              usePointStyle: true,
              color: isDark ? '#cbd5e1' : '#475569',
              font: { family: 'Poppins, sans-serif', size: 11, weight: 'bold' }
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#e2e8f0' : '#334155',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 12,
            boxPadding: 4,
            callbacks: {
              label: function(ctx) {
                const label = ctx.dataset.label || '';
                const val = ctx.parsed.y;
                if (label.includes('Sıcaklık')) return ` 🌡️ Sıcaklık: ${val.toFixed(1)} °C`;
                if (label.includes('Nem')) return ` 💧 Nem: %${val.toFixed(1)}`;
                if (label.includes('Batarya')) return ` 🔋 Pil: %${val}`;
                return ` ${label}: ${val}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: { family: 'monospace', size: 10, weight: 'bold' },
              maxTicksLimit: 8
            }
          },
          yTemp: {
            type: 'linear',
            position: 'left',
            title: {
              display: true,
              text: 'Sıcaklık (°C)',
              color: '#f97316',
              font: { family: 'Poppins, sans-serif', size: 11, weight: 'bold' }
            },
            grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' },
            ticks: {
              color: '#f97316',
              font: { family: 'monospace', size: 10, weight: 'bold' }
            }
          },
          yHum: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 100,
            title: {
              display: true,
              text: 'Nem & Batarya (%)',
              color: '#0284c7',
              font: { family: 'Poppins, sans-serif', size: 11, weight: 'bold' }
            },
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#0284c7',
              font: { family: 'monospace', size: 10, weight: 'bold' }
            }
          }
        }
      }
    });
  }

  updateChart() {
    if (!this.chart) return;
    const all = this.historyData;

    if (!all || all.length === 0) {
      this.chart.data.labels = [];
      this.chart.data.datasets.forEach(d => d.data = []);
      this.chart.update('none');
      this.renderSummaryStats([]);
      return;
    }

    // 1. Aralık Filtresi (6h, 24h, 7d, all)
    const now = Date.now();
    let filtered = all;

    if (this.chartRange === '6h') {
      filtered = all.filter(d => (now - new Date(d.timestamp).getTime()) <= 6 * 3600 * 1000);
    } else if (this.chartRange === '24h') {
      filtered = all.filter(d => (now - new Date(d.timestamp).getTime()) <= 24 * 3600 * 1000);
    } else if (this.chartRange === '7d') {
      filtered = all.filter(d => (now - new Date(d.timestamp).getTime()) <= 7 * 24 * 3600 * 1000);
    }

    if (filtered.length === 0) filtered = all.slice(-48);

    // 2. Etiketler ve Veri Dizileri
    const labels = filtered.map(d => {
      const dt = new Date(d.timestamp);
      return dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    });

    const tempData = filtered.map(d => d.temp);
    const humData = filtered.map(d => d.hum);
    const batData = filtered.map(d => d.bat);

    this.chart.data.labels = labels;

    // Metrik Görünürlüğü (all, temp, hum, bat)
    this.chart.data.datasets[0].hidden = !(this.chartMetric === 'all' || this.chartMetric === 'temp');
    this.chart.data.datasets[1].hidden = !(this.chartMetric === 'all' || this.chartMetric === 'hum');
    this.chart.data.datasets[2].hidden = !(this.chartMetric === 'all' || this.chartMetric === 'bat');

    this.chart.data.datasets[0].data = tempData;
    this.chart.data.datasets[1].data = humData;
    this.chart.data.datasets[2].data = batData;

    this.chart.update();
    this.renderSummaryStats(filtered);
  }

  renderSummaryStats(filtered) {
    if (!filtered || filtered.length === 0) {
      if (this.dom.chartStatCount) this.dom.chartStatCount.textContent = '0 Kayıt';
      return;
    }

    const temps = filtered.map(d => d.temp).filter(t => t !== null && !isNaN(t));
    const hums = filtered.map(d => d.hum).filter(h => h !== null && !isNaN(h));
    const bats = filtered.map(d => d.bat).filter(b => b !== null && !isNaN(b));

    if (this.dom.chartStatCount) {
      this.dom.chartStatCount.textContent = `${filtered.length} Ölçüm`;
    }

    if (temps.length > 0) {
      const minT = Math.min(...temps);
      const maxT = Math.max(...temps);
      const avgT = temps.reduce((a, b) => a + b, 0) / temps.length;

      if (this.dom.chartMinTemp) this.dom.chartMinTemp.textContent = `${minT.toFixed(1)}°C`;
      if (this.dom.chartMaxTemp) this.dom.chartMaxTemp.textContent = `${maxT.toFixed(1)}°C`;
      if (this.dom.chartAvgTemp) this.dom.chartAvgTemp.textContent = `${avgT.toFixed(1)}°C`;
    }

    if (hums.length > 0) {
      const minH = Math.min(...hums);
      const maxH = Math.max(...hums);
      const avgH = hums.reduce((a, b) => a + b, 0) / hums.length;

      if (this.dom.chartMinHum) this.dom.chartMinHum.textContent = `%${Math.round(minH)}`;
      if (this.dom.chartMaxHum) this.dom.chartMaxHum.textContent = `%${Math.round(maxH)}`;
      if (this.dom.chartAvgHum) this.dom.chartAvgHum.textContent = `%${Math.round(avgH)}`;
    }

    if (bats.length > 0 && this.dom.chartBatStat) {
      this.dom.chartBatStat.textContent = `%${bats[bats.length - 1]}`;
    }
  }

  renderHistoryTable() {
    if (!this.dom.historyTableBody) return;
    const all = this.historyData.slice(-30).reverse(); // Son 30 ölçüm

    if (all.length === 0) {
      this.dom.historyTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="py-6 text-center text-slate-400 font-bold">Henüz kaydedilmiş telemetri verisi bulunmuyor.</td>
        </tr>
      `;
      return;
    }

    let html = '';
    all.forEach(item => {
      const d = new Date(item.timestamp);
      const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      html += `
        <tr class="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
          <td class="py-2 px-3 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
            ${dateStr} ${timeStr}
          </td>
          <td class="py-2 px-3 font-mono text-xs font-black text-rose-600 dark:text-rose-400">
            ${item.temp !== null ? item.temp.toFixed(1) + ' °C' : '--'}
          </td>
          <td class="py-2 px-3 font-mono text-xs font-black text-blue-600 dark:text-sky-400">
            ${item.hum !== null ? '%' + item.hum.toFixed(1) : '--'}
          </td>
          <td class="py-2 px-3 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
            ${item.bat ? '%' + item.bat : '--'} ${item.volt ? `(${item.volt}V)` : ''}
          </td>
          <td class="py-2 px-3 font-mono text-xs text-slate-400">
            ${item.rssi ? item.rssi + ' dBm' : '--'}
          </td>
        </tr>
      `;
    });

    this.dom.historyTableBody.innerHTML = html;
  }

  // ==========================================
  // CSV VE JSON DIŞA AKTARIM
  // ==========================================
  exportCsv() {
    if (this.historyData.length === 0) {
      alert('Dışa aktarılacak ölçüm verisi bulunamadı.');
      return;
    }

    let csv = 'Tarih_Saat;Sicaklik_C;Nem_Yuzde;Pil_Yuzde;Voltaj_V;Sinyal_RSSI\n';
    this.historyData.forEach(r => {
      csv += `${r.timestamp};${r.temp};${r.hum};${r.bat || ''};${r.volt || ''};${r.rssi || ''}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xiaomi_termometre_verileri_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportJson() {
    if (this.historyData.length === 0) {
      alert('Dışa aktarılacak ölçüm verisi bulunamadı.');
      return;
    }

    const blob = new Blob([JSON.stringify(this.historyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xiaomi_termometre_verileri_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Global Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.bleManager = new XiaomiBleManager();
});
