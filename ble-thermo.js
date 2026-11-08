/**
 * Xiaomi SmartTemp — Web Bluetooth BLE & ATC / BTHome Termometre Yöneticisi
 * Referans & Protokol Mimarisi: TelinkMiFlasher & GraphMemo (pvvx / ATC_MiThermometer)
 * 
 * Desteklenen Protokoller:
 * 1. PVVX Telink Custom Firmware (0x1F10 Servisi -> 0x1F1F Karakteristiği)
 *    - 0x33: Canlı Sıcaklık, Bağıl Nem, Pil Voltajı ve Paket Sayacı Akışı
 *    - 0x35: Flash Bellekteki Tüm Geçmiş Ölçüm Kayıtlarını Çekme (Unix Timestamp, Temp, Hum, Vbat)
 *    - 0x55: Cihaz Konfigürasyonu & Sürüm Bilgisi
 * 2. ATC1441 Custom Firmware (0x181A Çevre Algılama & 13-Byte Big-Endian Reklamlar)
 * 3. BTHome V1 & V2 (0xFCD2 Şifresiz Standart Reklam Yayınları)
 * 4. Xiaomi Orijinal / MiBeacon (0xFE95 & Stock ebe0ccb0 / ebe0ccc1 Servisleri)
 * 5. ClearGrass / Qingping (0xFDCD & 0xFFF9)
 */

// ==========================================
// 1. GATT SERIALIZED QUEUE (TelinkMiFlasher Standardı)
// Android & Windows Chrome tek seferde yalnızca tek bir GATT işlemine izin verir.
// Tüm karakteristik okuma/yazma/bildirim çağrılarını sıraya (queue) alarak çakışmaları engeller.
// ==========================================
(function() {
  if (typeof BluetoothRemoteGATTCharacteristic === 'undefined' || window.__gattQueue) return;
  let q = Promise.resolve();
  const wrap = (proto, name) => {
    const orig = proto[name];
    if (!orig) return;
    proto[name] = function(...args) {
      const run = () => orig.apply(this, args);
      const p = q.then(run, run);
      q = p.catch(() => {});
      return p;
    };
  };
  wrap(BluetoothRemoteGATTCharacteristic.prototype, 'readValue');
  wrap(BluetoothRemoteGATTCharacteristic.prototype, 'writeValue');
  wrap(BluetoothRemoteGATTCharacteristic.prototype, 'writeValueWithResponse');
  wrap(BluetoothRemoteGATTCharacteristic.prototype, 'writeValueWithoutResponse');
  wrap(BluetoothRemoteGATTCharacteristic.prototype, 'startNotifications');
  wrap(BluetoothRemoteGATTCharacteristic.prototype, 'stopNotifications');
  window.__gattQueue = true;
})();

// Telink & Xiaomi Standart BLE Servis UUID Listesi
const TELINK_SERVICES = {
  CUSTOM_MAIN: '00001f10-0000-1000-8000-00805f9b34fb',  // 0x1F10: PVVX Custom Main Service
  CUSTOM_DATA: '00001f1f-0000-1000-8000-00805f9b34fb',  // 0x1F1F: PVVX Read/Write/Notify Characteristic
  ENV_SENSING: '0000181a-0000-1000-8000-00805f9b34fb',  // 0x181A: Environmental Sensing
  BATTERY_SRV: '0000180f-0000-1000-8000-00805f9b34fb',  // 0x180F: Battery Service
  BATTERY_LVL: '00002a19-0000-1000-8000-00805f9b34fb',  // 0x2A19: Battery Level Characteristic
  TEMP_CELS:   '00002a1f-0000-1000-8000-00805f9b34fb',  // 0x2A1F: Temperature Celsius (0.1°C)
  TEMP_ENV:    '00002a6e-0000-1000-8000-00805f9b34fb',  // 0x2A6E: Temperature (0.01°C)
  HUMI_ENV:    '00002a6f-0000-1000-8000-00805f9b34fb',  // 0x2A6F: Humidity (0.01%)
  MI_SERVICE:  'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',  // Stock Xiaomi Service
  MI_DATA:     'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6',  // Stock Xiaomi Temp/Hum/Bat
  TELINK_OTA:  '00010203-0405-0607-0809-0a0b0c0d1912',  // Telink OTA Service
  BTHOME:      '0000fcd2-0000-1000-8000-00805f9b34fb',  // BTHome Broadcast UUID
  MIBEACON:    '0000fe95-0000-1000-8000-00805f9b34fb',  // MiBeacon Broadcast UUID
  QINGPING:    '0000fdcd-0000-1000-8000-00805f9b34fb',  // ClearGrass / Qingping
  CGG1_GOOSE:  '0000fff9-0000-1000-8000-00805f9b34fb'   // CGG1
};

const TELINK_OPTIONAL_SERVICES = [
  TELINK_SERVICES.CUSTOM_MAIN,
  TELINK_SERVICES.ENV_SENSING,
  TELINK_SERVICES.BATTERY_SRV,
  TELINK_SERVICES.MI_SERVICE,
  TELINK_SERVICES.TELINK_OTA,
  TELINK_SERVICES.BTHOME,
  TELINK_SERVICES.MIBEACON,
  TELINK_SERVICES.QINGPING,
  TELINK_SERVICES.CGG1_GOOSE,
  0x180a, 0x180f, 0x181a, 0x1f10, 0x1f11, 0xfe95, 0xfff9, 0xfdcd, 0xffe0, 0xfcd2
];

class XiaomiBleManager {
  constructor() {
    this.devices = new Map();
    this.activeDeviceKey = null;
    this.isScanning = false;
    this.isConnected = false;
    this.connectedDevice = null;
    this.gattServer = null;
    this.custom1f1fChar = null;
    this.chart = null;
    this.chartRange = 'all'; // '6h', '24h', '7d', 'all' (varsayılan: tüm kayıtlar)
    this.chartMetric = 'all'; // 'all', 'temp', 'hum', 'bat'
    this.historyData = [];
    this._saveTimer = null;
    this.memoCount = 0;

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
      btnDownloadRecords: document.getElementById('btnDownloadRecords'),
      btnClearHistory: document.getElementById('btnClearHistory'),
      btnExportCsv: document.getElementById('btnExportCsv'),
      btnExportJson: document.getElementById('btnExportJson'),

      // Yeniden Sorgu Butonları (Terminal Konsolu)
      btnRequeryLive: document.getElementById('btnRequeryLive'),
      btnRequeryMemo: document.getElementById('btnRequeryMemo'),
      btnClearLog: document.getElementById('btnClearLog'),
      bleTerminalLog: document.getElementById('bleTerminalLog'),

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

  log(msg, type = 'info') {
    console.log(`[SmartTemp BLE] ${msg}`);
    if (!this.dom.bleTerminalLog) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let colorClass = 'text-emerald-400';
    if (type === 'warn') colorClass = 'text-amber-400';
    if (type === 'error') colorClass = 'text-rose-400';
    if (type === 'live') colorClass = 'text-sky-300 font-bold';

    const row = document.createElement('div');
    row.className = `leading-relaxed ${colorClass}`;
    row.textContent = `[${timeStr}] ${msg}`;
    this.dom.bleTerminalLog.appendChild(row);

    while (this.dom.bleTerminalLog.children.length > 200) {
      this.dom.bleTerminalLog.removeChild(this.dom.bleTerminalLog.children[0]);
    }
    this.dom.bleTerminalLog.scrollTop = this.dom.bleTerminalLog.scrollHeight;
  }

  updateStatus(text, badgeClass = 'bg-slate-400') {
    if (this.dom.bleStatusText) this.dom.bleStatusText.textContent = text;
    if (this.dom.bleStatusBadge) this.dom.bleStatusBadge.className = `w-2 h-2 rounded-full ${badgeClass}`;
  }

  isUserCancellation(err) {
    if (!err) return false;
    const msg = String(err.message || '').toLowerCase();
    const name = String(err.name || '');
    return name === 'NotFoundError' ||
           name === 'AbortError' ||
           (name === 'SecurityError' && msg.includes('gesture')) ||
           msg.includes('canceled') ||
           msg.includes('cancelled') ||
           msg.includes('cancel') ||
           msg.includes('permission denied') ||
           msg.includes('user denied');
  }

  checkBluetoothAvailability() {
    if (!navigator.bluetooth) {
      this.updateStatus('Web Bluetooth Desteklenmiyor (Chrome / Edge kullanın)', 'bg-rose-500');
      this.log('Web Bluetooth API bulunamadı. Lütfen Google Chrome veya Microsoft Edge kullanın.', 'error');
      if (window.app && window.app.showToast) {
        window.app.showToast('Tarayıcınızda Web Bluetooth kapalı veya desteklenmiyor. Lütfen güncel Chrome veya Edge kullanın.', 'error');
      }
    } else {
      this.log('Web Bluetooth API hazır. Cihazınızı bağlamak için "Termometreye Bağlan & Hafızayı Oku" butonuna basınız.');
    }
  }

  bindEvents() {
    // 1. Canlı BLE Tarama / Dinleme Butonu (Havadaki Reklamlar)
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

    // 3.1. Kayıtları İndir Butonu
    if (this.dom.btnDownloadRecords) {
      this.dom.btnDownloadRecords.addEventListener('click', () => {
        this.downloadRecords();
      });
    }

    // 4. Hafızayı Temizle Butonu
    if (this.dom.btnClearHistory) {
      this.dom.btnClearHistory.addEventListener('click', () => {
        if (confirm('Tüm geçmiş ölçüm kayıtları silinsin mi?')) {
          this.clearHistory();
        }
      });
    }

    // 5. Konsol Kontrolleri
    if (this.dom.btnRequeryLive) {
      this.dom.btnRequeryLive.addEventListener('click', () => this.requeryLive());
    }
    if (this.dom.btnRequeryMemo) {
      this.dom.btnRequeryMemo.addEventListener('click', () => this.requeryMemo());
    }
    if (this.dom.btnClearLog) {
      this.dom.btnClearLog.addEventListener('click', () => {
        if (this.dom.bleTerminalLog) {
          this.dom.bleTerminalLog.innerHTML = '<div class="text-slate-400">// Konsol temizlendi.</div>';
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
        this.chartRange = e.currentTarget.dataset.range;
        this.updateChart();
      });
    });

    // 8. Grafik Metrik Butonları (all / temp / hum / bat)
    document.querySelectorAll('.ble-chart-metric-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.ble-chart-metric-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.chartMetric = e.currentTarget.dataset.metric;
        this.updateChart();
      });
    });
  }

  // ==========================================
  // PARSER: Telink / PVVX, ATC1441, BTHome & Xiaomi MiBeacon
  // ==========================================
  parseAdvertisementPacket(serviceDataMap, rawDevice, rssi) {
    if (!serviceDataMap) return null;

    let parsed = null;

    // 1. Telink / PVVX & ATC1441 Custom Firmware (0x181A)
    for (const [uuid, dataView] of serviceDataMap.entries()) {
      const u = uuid.toLowerCase();
      if (u.includes('181a')) {
        parsed = this.parseATC(dataView);
        if (parsed) break;
      }
    }

    // 2. BTHome V1/V2 (0xFCD2)
    if (!parsed) {
      for (const [uuid, dataView] of serviceDataMap.entries()) {
        const u = uuid.toLowerCase();
        if (u.includes('fcd2')) {
          parsed = this.parseBTHome(dataView);
          if (parsed) break;
        }
      }
    }

    // 3. Xiaomi Orijinal MiBeacon (0xFE95)
    if (!parsed) {
      for (const [uuid, dataView] of serviceDataMap.entries()) {
        const u = uuid.toLowerCase();
        if (u.includes('fe95')) {
          parsed = this.parseXiaomiMiBeacon(dataView);
          if (parsed) break;
        }
      }
    }

    // 4. CGG1 "Goose" (0xFFF9)
    if (!parsed) {
      for (const [uuid, dataView] of serviceDataMap.entries()) {
        const u = uuid.toLowerCase();
        if (u.includes('fff9')) {
          parsed = this.parseCgg1(dataView);
          if (parsed) break;
        }
      }
    }

    if (parsed) {
      this.handleIncomingTelemetry(parsed, rawDevice, rssi);
    }

    return parsed;
  }

  // TelinkMiFlasher Exact ATC / PVVX Parser
  parseATC(dataView) {
    const len = dataView.byteLength;
    const buf = new Uint8Array(dataView.buffer);

    // PVVX format: 15-19 bytes Little Endian
    // Örnek: [MAC 6B] [Temp 2B int16 LE / 100] [Hum 2B int16 LE / 100] [Vbat 2B uint16 LE mV] [Bat 1B uint8] [Count 1B] [Flg 1B]
    if (len >= 15) {
      const temp = dataView.getInt16(6, true) / 100.0;
      const hum = dataView.getInt16(8, true) / 100.0;
      const vbat = dataView.getUint16(10, true);
      const bat = dataView.getUint8(12);
      const count = dataView.getUint8(13);
      const mac = [buf[5], buf[4], buf[3], buf[2], buf[1], buf[0]].map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();

      return {
        format: 'PVVX Custom (0x181A)',
        temp: Number(temp.toFixed(2)),
        hum: Number(hum.toFixed(2)),
        bat: bat,
        volt: Number((vbat / 1000.0).toFixed(3)),
        packetId: count,
        mac: mac
      };
    }

    // ATC1441 format: 13 bytes Big Endian
    // Örnek: [MAC 6B] [Temp 2B int16 BE / 10] [Hum 1B uint8] [Bat 1B uint8] [Vbat 2B uint16 BE mV] [Count 1B]
    if (len === 13) {
      const temp = dataView.getInt16(6, false) / 10.0;
      const hum = dataView.getUint8(8);
      const bat = dataView.getUint8(9);
      const vbat = dataView.getUint16(10, false);
      const count = dataView.getUint8(12);
      const mac = [buf[0], buf[1], buf[2], buf[3], buf[4], buf[5]].map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();

      return {
        format: 'ATC1441 Custom (0x181A)',
        temp: Number(temp.toFixed(1)),
        hum: Number(hum.toFixed(1)),
        bat: bat,
        volt: Number((vbat / 1000.0).toFixed(3)),
        packetId: count,
        mac: mac
      };
    }

    return null;
  }

  // BTHome V1 / V2 Unencrypted Parser
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
        // Tanınmayan BTHome ID'leri için güvenli atlama
        break;
      }
    }

    if (temp === null && hum === null) return null;

    return {
      format: 'BTHome V2 Şifresiz',
      temp: temp !== null ? Number(temp.toFixed(2)) : null,
      hum: hum !== null ? Number(hum.toFixed(2)) : null,
      bat: bat,
      volt: volt,
      packetId: packetId
    };
  }

  // TelinkMiFlasher Exact Xiaomi MiBeacon Parser (0xFE95)
  parseXiaomiMiBeacon(dataView) {
    const len = dataView.byteLength;
    if (len < 5) return null;

    const ctrl = dataView.getUint16(0, true);
    let i = 2;

    if ((ctrl & 0xf000) >= 0x2000 && len >= i + 3) {
      const devId = dataView.getUint16(i, true);
      const fnCnt = dataView.getUint8(i + 2);
      i += 3;

      let mac = '';
      if ((ctrl & 0x10) && len >= i + 6) {
        const buf = new Uint8Array(dataView.buffer);
        mac = [buf[i+5], buf[i+4], buf[i+3], buf[i+2], buf[i+1], buf[i]].map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
        i += 6;
      }

      if ((ctrl & 0x20) && len >= i + 1) {
        const cap = dataView.getUint8(i++);
        if ((cap & 0x20) && len >= i + 2) i += 2;
      }

      // Veri şifreli değilse oku (ctrl & 0x40 ve !(ctrl & 0x08))
      if ((ctrl & 0x40) && !(ctrl & 0x08) && len >= i + 4) {
        let temp = null;
        let hum = null;
        let bat = null;
        let volt = null;

        while (i + 3 <= len) {
          const dataId = dataView.getUint16(i, true);
          const dataLen = dataView.getUint8(i + 2);
          i += 3;

          if (i + dataLen <= len) {
            if (dataId === 0x1004 && dataLen === 2) { // Temp
              temp = dataView.getInt16(i, true) / 10.0;
            } else if (dataId === 0x1006 && dataLen === 2) { // Humidity
              hum = dataView.getInt16(i, true) / 10.0;
            } else if (dataId === 0x100d && dataLen === 4) { // Temp + Hum
              temp = dataView.getInt16(i, true) / 10.0;
              hum = dataView.getInt16(i + 2, true) / 10.0;
            } else if (dataId === 0x100a && dataLen >= 1) { // Bat
              bat = dataView.getUint8(i);
              if (dataLen >= 3 && dataView.getUint8(i + 1) === 2) {
                volt = dataView.getUint16(i + 2, true) / 1000.0;
              }
            }
            i += dataLen;
          } else {
            break;
          }
        }

        if (temp !== null || hum !== null) {
          return {
            format: 'Xiaomi MiBeacon (0xFE95)',
            temp: temp !== null ? Number(temp.toFixed(1)) : null,
            hum: hum !== null ? Number(hum.toFixed(1)) : null,
            bat: bat,
            volt: volt,
            mac: mac,
            packetId: fnCnt
          };
        }
      }
    }

    return null;
  }

  // CGG1 Goose Parser (0xFFF9)
  parseCgg1(dataView) {
    const len = dataView.byteLength;
    if (len >= 16 && dataView.getUint16(0, true) === 0x0108) {
      const temp = dataView.getInt16(10, true) / 10.0;
      const hum = dataView.getInt16(12, true) / 10.0;
      const bat = len > 16 ? dataView.getUint8(16) : null;
      return {
        format: 'CGG1 ClearGrass',
        temp: Number(temp.toFixed(1)),
        hum: Number(hum.toFixed(1)),
        bat: bat
      };
    }
    return null;
  }

  // ==========================================
  // CANLI TELEMETRİ GÜNCELLEME VE HESAPLAMALAR
  // ==========================================
  handleIncomingTelemetry(parsed, rawDevice, rssi) {
    if (!parsed) return;

    const devId = (parsed.mac || (rawDevice && rawDevice.id) || 'TERMO_1').toString();
    const devName = (rawDevice && rawDevice.name) || (parsed.mac ? `Termometre (${parsed.mac.slice(-5)})` : 'Xiaomi Termometre');
    const now = new Date();

    let dev = this.devices.get(devId);
    if (!dev) {
      dev = {
        id: devId,
        name: devName,
        format: parsed.format,
        mac: parsed.mac || (rawDevice && rawDevice.id) || '',
        temp: parsed.temp,
        hum: parsed.hum,
        bat: parsed.bat || 100,
        volt: parsed.volt || 3.0,
        rssi: rssi || -60,
        packetCount: 1,
        lastSeen: now
      };
      this.devices.set(devId, dev);
      this.log(`Yeni Cihaz Algılandı: ${devName} [${parsed.format}]`, 'live');
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

    // 3. Çiy Noktası Hesabı (Magnus Formülü)
    if (this.dom.heroDewPointLive && dev.temp !== null && dev.hum !== null) {
      const t = dev.temp;
      const h = dev.hum;
      const dew = t - ((100 - h) / 5);
      this.dom.heroDewPointLive.textContent = `Çiy Noktası: ${dew.toFixed(1)}°C`;
    }

    // 4. Termal Konfor Değerlendirmesi
    if (this.dom.heroComfortLive && dev.temp !== null && dev.hum !== null) {
      let comfort = 'İdeal Konfor';
      let comfortClass = 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40';

      if (dev.hum > 70) {
        comfort = 'Yüksek Nem / Rutubet';
        comfortClass = 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40';
      } else if (dev.hum < 30) {
        comfort = 'Kuru Hava';
        comfortClass = 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/40';
      } else if (dev.temp > 28) {
        comfort = 'Sıcak Ortam';
        comfortClass = 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40';
      } else if (dev.temp < 18) {
        comfort = 'Serin Ortam';
        comfortClass = 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/40';
      }

      this.dom.heroComfortLive.textContent = comfort;
      this.dom.heroComfortLive.className = `text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${comfortClass}`;
    }

    // 5. Batarya ve Voltaj
    if (this.dom.heroBatteryLive) {
      this.dom.heroBatteryLive.textContent = dev.bat ? `%${dev.bat}` : '--%';
    }
    if (this.dom.heroVoltageLive) {
      this.dom.heroVoltageLive.textContent = dev.volt ? `(${dev.volt}V)` : '(--V)';
    }

    // 6. Header Bilgileri
    if (this.dom.bleDeviceName) this.dom.bleDeviceName.textContent = dev.name;
    if (this.dom.bleProtocolTag) this.dom.bleProtocolTag.textContent = dev.format;
    if (this.dom.bleSignalStrength) this.dom.bleSignalStrength.textContent = `${dev.rssi || '--'} dBm`;
    if (this.dom.blePacketCount) this.dom.blePacketCount.textContent = `#${dev.packetCount || 1} Paket`;
    if (this.dom.bleMacAddress) this.dom.bleMacAddress.textContent = dev.mac || 'Bağlı';
    if (this.dom.bleLastUpdateTime) {
      this.dom.bleLastUpdateTime.textContent = `Son Sinyal: ${dev.lastSeen.toLocaleTimeString('tr-TR')}`;
    }
  }

  renderDeviceList() {
    if (!this.dom.deviceCardsTrack) return;
    if (this.dom.deviceListContainer) {
      if (this.devices.size > 1) {
        this.dom.deviceListContainer.classList.remove('hidden');
      } else {
        this.dom.deviceListContainer.classList.add('hidden');
      }
    }
    if (this.devices.size === 0) return;

    let html = '';
    this.devices.forEach((dev, id) => {
      const isActive = id === this.activeDeviceKey;
      html += `
        <div class="hub-card cursor-pointer select-none min-w-[155px] p-2.5 transition-all ${isActive ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500/30' : 'hover:border-slate-300'}" onclick="window.bleManager.selectDevice('${id}')">
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
  // CANLI BLE REKLAM TARAMASI (Havadaki Yayınlar)
  // ==========================================
  async startScan() {
    if (!navigator.bluetooth) {
      this.log('Web Bluetooth bulunamadı.', 'error');
      alert('Tarayıcınızda Web Bluetooth API bulunmuyor. Lütfen Google Chrome veya Microsoft Edge kullanın.');
      return;
    }

    try {
      this.isScanning = true;
      if (this.dom.btnStartScan) {
        this.dom.btnStartScan.innerHTML = `<i data-lucide="square" class="w-3.5 h-3.5 text-white"></i><span>Dinlemeyi Durdur</span>`;
        this.dom.btnStartScan.className = 'px-3.5 sm:px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md shadow-rose-500/20 active:scale-95 transition-all';
      }
      this.updateStatus('BLE Yayınları Dinleniyor (BTHome / ATC / Xiaomi)...', 'bg-amber-500 animate-ping');
      this.log('Kablosuz BLE reklam tarayıcısı başlatılıyor...');
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();

      // 1. Yol: navigator.bluetooth.requestLEScan (Pasif Broadcast)
      if (typeof navigator.bluetooth.requestLEScan === 'function') {
        const scan = await navigator.bluetooth.requestLEScan({
          acceptAllAdvertisements: true,
          keepRepeatedDevices: true
        });

        navigator.bluetooth.addEventListener('advertisementreceived', (event) => {
          this.parseAdvertisementPacket(event.serviceData, event.device, event.rssi);
        });

        this.log('✅ Kablosuz BLE reklam tarayıcısı aktif! Havadaki BTHome ve ATC paketleri dinleniyor.', 'live');
        if (window.app && window.app.showToast) {
          window.app.showToast('Kablosuz BLE reklam tarayıcısı aktif! Havadaki BTHome ve ATC paketleri dinleniyor.', 'success');
        }
      } else {
        // 2. Yol: requestLEScan desteklenmiyorsa doğrudan cihaz seçimine yönlendir
        this.log('Havadaki genel reklam taraması bu tarayıcıda kapalı; doğrudan cihaz seçimi açılıyor...', 'warn');
        if (window.app && window.app.showToast) {
          window.app.showToast('Havadaki reklam tarayıcısı bu tarayıcıda kapalı; doğrudan cihaz seçimi açılıyor...', 'info');
        }
        await this.connectAndDownloadHistory();
      }

      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    } catch (err) {
      console.warn('BLE Tarama hatası veya iptali:', err);
      this.stopScan();

      if (this.isUserCancellation(err)) {
        this.log('Bluetooth tarama izni verilmedi veya pencere kapatıldı.');
        this.updateStatus('Tarama izni verilmedi · Hazır', 'bg-slate-400');
        if (window.app && window.app.showToast) {
          window.app.showToast('Bluetooth tarama izni verilmedi veya kapatıldı. Termometrenize doğrudan bağlanmak için "Termometreye Bağlan & Hafızayı Oku" butonunu kullanabilirsiniz.', 'info');
        }
      } else {
        this.log('Tarama başlatılamadı: ' + err.message, 'error');
        if (window.app && window.app.showToast) {
          window.app.showToast(`Tarama başlatılamadı: ${err.message}`, 'error');
        }
      }
    }
  }

  stopScan() {
    this.isScanning = false;
    if (this.dom.btnStartScan) {
      this.dom.btnStartScan.innerHTML = `<i data-lucide="radio" class="w-4 h-4 text-blue-500"></i><span>Havadaki Yayınları Dinle</span>`;
      this.dom.btnStartScan.className = 'px-3.5 sm:px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center gap-2 cursor-pointer active:scale-95 transition-all';
    }
    if (this.dom.bleStatusText && !this.isConnected) this.updateStatus('Yayın Dinleme Durduruldu · Hazır', 'bg-slate-400');
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    this.log('BLE reklam dinleme duraklatıldı.');
  }

  // ==========================================
  // GATT BAĞLANTISI & HAFIZA İNDİRME (TelinkMiFlasher / GraphMemo)
  // ==========================================
  async connectAndDownloadHistory() {
    if (!navigator.bluetooth) {
      alert('Tarayıcınızda Web Bluetooth desteği bulunamadı. Lütfen Google Chrome veya Microsoft Edge kullanın.');
      return;
    }

    try {
      this.log('Bluetooth cihaz arama penceresi açılıyor...');
      this.updateStatus('Termometre Seçimi Bekleniyor (Açılan listeden cihazınızı seçip Eşle\'ye basın)...', 'bg-blue-500 animate-pulse');

      // TelinkMiFlasher exact connection options
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: TELINK_OPTIONAL_SERVICES
      });

      this.connectedDevice = device;
      this.log(`Cihaz seçildi: "${device.name || 'Termometre'}" (ID: ${device.id.slice(0, 8)}...)`);
      this.updateStatus(`${device.name || 'Termometreye'} bağlanılıyor...`, 'bg-amber-500 animate-ping');

      device.addEventListener('gattserverdisconnected', () => {
        this.onDisconnected();
      });

      // Tarayıcı destekliyorsa seçilen cihazın reklamlarını da arka planda dinle
      if (typeof device.watchAdvertisements === 'function') {
        try {
          await device.watchAdvertisements();
          device.addEventListener('advertisementreceived', (event) => {
            this.parseAdvertisementPacket(event.serviceData, event.device, event.rssi);
          });
          this.log('Cihaz reklam yayınları dinlemeye alındı.');
        } catch (advErr) {}
      }

      this.log('GATT Sunucusuna bağlanılıyor...');
      const server = await device.gatt.connect();
      this.gattServer = server;
      this.isConnected = true;

      if (this.dom.btnConnectGatt) this.dom.btnConnectGatt.classList.add('hidden');
      if (this.dom.btnDisconnect) this.dom.btnDisconnect.classList.remove('hidden');

      this.updateStatus(`Bağlandı: ${device.name || 'Termometre'} · Servisler Taranıyor...`, 'bg-emerald-500 animate-pulse');
      this.log(`✅ ${device.name || 'Termometre'} ile GATT bağlantısı kuruldu. Servisler keşfediliyor...`, 'live');

      if (window.app && window.app.showToast) {
        window.app.showToast(`✅ ${device.name || 'Termometre'} ile bağlantı kuruldu! Servisler başlatılıyor...`, 'success');
      }

      // Servisleri Keşfet
      const services = await server.getPrimaryServices();
      const sUuids = services.map(s => s.uuid.toLowerCase());
      this.log(`Keşfedilen Servisler: ` + sUuids.map(u => u.slice(4, 8) || u.slice(0, 8)).join(', '));

      // ----------------------------------------------------
      // 1. PVVX TELINK CUSTOM FIRMWARE (0x1F10 & 0x1F1F)
      // ----------------------------------------------------
      const pvvxService = services.find(s => s.uuid.toLowerCase().includes('1f10'));
      if (pvvxService) {
        try {
          const char1f1f = await pvvxService.getCharacteristic(TELINK_SERVICES.CUSTOM_DATA);
          if (char1f1f) {
            this.custom1f1fChar = char1f1f;
            this.log('⭐ PVVX Custom Servisi (0x1f10) ve Okuma/Yazma Karakteristiği (0x1f1f) bağlandı.');

            await char1f1f.startNotifications();
            this.log('0x1f1f bildirimleri aktif. Olay dinleyici eklendi.');

            char1f1f.addEventListener('characteristicvaluechanged', (e) => {
              this.handleCustom1f1fNotification(e.target.value);
            });

            // GraphMemo & TelinkMiFlasher Komut Akışı:
            // 0. Saat Senkronizasyonu (0x23)
            setTimeout(async () => {
              const sec = Math.floor(Date.now() / 1000);
              const timeCmd = new Uint8Array([0x23, sec & 0xff, (sec >> 8) & 0xff, (sec >> 16) & 0xff, (sec >> 24) & 0xff]);
              await char1f1f.writeValue(timeCmd).catch(e => console.warn(e));
              this.log(`Termometre saati eşitlendi [0x23]: ${new Date().toLocaleTimeString('tr-TR')}`);
            }, 100);

            // 1. Get Config (0x55)
            setTimeout(async () => {
              this.log('PVVX Cihaz konfigürasyonu isteniyor [0x55]...');
              await char1f1f.writeValue(new Uint8Array([0x55])).catch(e => console.warn(e));
            }, 300);

            // 2. Canlı telemetri akışı başlat (0x33, 0xC8 = 200 ölçüm akışı)
            setTimeout(async () => {
              this.log('PVVX Canlı telemetri akışı başlatılıyor [0x33, 0xC8]...');
              await char1f1f.writeValue(new Uint8Array([0x33, 0xC8])).catch(e => console.warn(e));
            }, 700);

            // 3. Hafızadaki tüm kayıtları çek (0x35, 0xff, 0xff, 0, 0)
            setTimeout(async () => {
              this.log('PVVX Flash hafıza kayıtları isteniyor [0x35, 0xff, 0xff, 0, 0]...');
              this.memoCount = 0;
              await char1f1f.writeValue(new Uint8Array([0x35, 0xff, 0xff, 0, 0])).catch(e => console.warn(e));
            }, 1400);
          }
        } catch (pvvxErr) {
          this.log('PVVX 0x1f10 servisi başlatma uyarısı: ' + pvvxErr.message, 'warn');
        }
      }

      // ----------------------------------------------------
      // 2. ENVIRONMENTAL SENSING SERVICE (0x181A)
      // ----------------------------------------------------
      const envService = services.find(s => s.uuid.toLowerCase().includes('181a'));
      if (envService) {
        try {
          const envChars = await envService.getCharacteristics();
          for (const ch of envChars) {
            const cu = ch.uuid.toLowerCase();
            if (cu.includes('2a6e')) { // Sıcaklık (0.01°C)
              await ch.startNotifications().catch(() => {});
              ch.addEventListener('characteristicvaluechanged', (e) => {
                const temp = e.target.value.getInt16(0, true) / 100.0;
                this.log(`🌡️ 0x181A Sıcaklık Bildirimi: ${temp.toFixed(1)}°C`);
                this.handleIncomingTelemetry({ format: 'ATC / PVVX Canlı', temp, hum: null }, device);
              });
              const v = await ch.readValue().catch(() => null);
              if (v) {
                const temp = v.getInt16(0, true) / 100.0;
                this.handleIncomingTelemetry({ format: 'ATC / PVVX Canlı', temp, hum: null }, device);
              }
            } else if (cu.includes('2a6f')) { // Nem (0.01%)
              await ch.startNotifications().catch(() => {});
              ch.addEventListener('characteristicvaluechanged', (e) => {
                const hum = e.target.value.getUint16(0, true) / 100.0;
                this.log(`💧 0x181A Bağıl Nem Bildirimi: %${hum.toFixed(1)}`);
                this.handleIncomingTelemetry({ format: 'ATC / PVVX Canlı', temp: null, hum }, device);
              });
              const v = await ch.readValue().catch(() => null);
              if (v) {
                const hum = v.getUint16(0, true) / 100.0;
                this.handleIncomingTelemetry({ format: 'ATC / PVVX Canlı', temp: null, hum }, device);
              }
            } else if (cu.includes('2a1f')) { // Sıcaklık Celsius (0.1°C)
              await ch.startNotifications().catch(() => {});
              ch.addEventListener('characteristicvaluechanged', (e) => {
                const temp = e.target.value.getInt16(0, true) / 10.0;
                this.handleIncomingTelemetry({ format: 'ATC Canlı', temp, hum: null }, device);
              });
            }
          }
          this.log('Environmental Sensing (0x181A) servis bildirimleri kuruldu.');
        } catch (e) {
          this.log('0x181A bildirim uyarısı: ' + e.message, 'warn');
        }
      }

      // ----------------------------------------------------
      // 3. BATARYA SERVİSİ (0x180F -> 0x2A19)
      // ----------------------------------------------------
      const batService = services.find(s => s.uuid.toLowerCase().includes('180f'));
      if (batService) {
        try {
          const batChar = await batService.getCharacteristic(TELINK_SERVICES.BATTERY_LVL);
          if (batChar) {
            const bVal = await batChar.readValue().catch(() => null);
            if (bVal) {
              const batPct = bVal.getUint8(0);
              this.log(`🔋 Pil Seviyesi Okundu: %${batPct}`);
              this.handleIncomingTelemetry({ format: 'GATT Batarya', bat: batPct }, device);
            }
            await batChar.startNotifications().catch(() => {});
            batChar.addEventListener('characteristicvaluechanged', (e) => {
              const b = e.target.value.getUint8(0);
              this.handleIncomingTelemetry({ format: 'GATT Batarya', bat: b }, device);
            });
          }
        } catch (bErr) {}
      }

      // ----------------------------------------------------
      // 4. XIAOMI ORİJİNAL FIRMWARE (0xEBE0CCB0 -> 0xEBE0CCC1)
      // ----------------------------------------------------
      const stockService = services.find(s => s.uuid.toLowerCase().includes('ebe0ccb0'));
      if (stockService) {
        try {
          const dataChar = await stockService.getCharacteristic(TELINK_SERVICES.MI_DATA);
          if (dataChar) {
            await dataChar.startNotifications();
            dataChar.addEventListener('characteristicvaluechanged', (e) => {
              const dv = e.target.value;
              const temp = dv.getInt16(0, true) / 100.0;
              const hum = dv.getUint8(2);
              const volt = dv.getUint16(3, true);
              const bat = Math.min(100, Math.max(0, Math.round((volt - 2100) / 9.0)));
              this.log(`📡 Xiaomi Orijinal Bildirimi: ${temp.toFixed(1)}°C, %${hum}, ${volt}mV`);
              this.handleIncomingTelemetry({ format: 'Xiaomi Orijinal', temp, hum, bat, volt: volt / 1000.0 }, device);
            });
            this.log('Xiaomi Orijinal Servisi (0xEBE0CCC1) bildirimleri kuruldu.');
          }
        } catch (stockErr) {
          this.log('Xiaomi Orijinal servis uyarısı: ' + stockErr.message, 'warn');
        }
      }

      setTimeout(() => {
        this.updateStatus(`Canlı Bağlantı Aktif: ${device.name || 'Termometre'}`, 'bg-emerald-500');
        this.updateChart();
      }, 2500);

    } catch (err) {
      console.warn('GATT Bağlantı hatası veya iptali:', err);
      this.onDisconnected();

      if (this.isUserCancellation(err)) {
        this.log('Cihaz seçimi kullanıcı tarafından iptal edildi.');
        this.updateStatus('Cihaz seçimi iptal edildi · Hazır', 'bg-slate-400');
        if (window.app && window.app.showToast) {
          window.app.showToast('Cihaz seçimi iptal edildi.', 'info');
        }
      } else {
        this.log('Cihaza bağlanılamadı: ' + err.message, 'error');
        if (window.app && window.app.showToast) {
          window.app.showToast(`Cihaza bağlanılamadı: ${err.message}`, 'error');
        }
      }
    }
  }

  // Telink / PVVX 0x1F1F Bildirim Ayrıştırıcısı (TelinkMiFlasher / GraphMemo exact spec)
  handleCustom1f1fNotification(dv) {
    const len = dv.byteLength;
    if (len === 0) return;
    const blkid = dv.getUint8(0);

    // 1. Canlı Telemetri Paketi (0x33)
    // Format: [0x33] [Vbat 2B uint16 LE mV] [Temp 2B int16 LE /100] [Hum 2B uint16 LE /100] [Count 2B uint16 LE]
    if (blkid === 0x33 && len >= 8) {
      const vbat = dv.getUint16(1, true);
      const temp = dv.getInt16(3, true) / 100.0;
      const humi = dv.getUint16(5, true) / 100.0;
      const count = dv.getUint16(7, true);
      const bat = Math.min(100, Math.max(0, Math.round((vbat - 2100) / 9.0)));
      const volt = Number((vbat / 1000.0).toFixed(3));

      this.log(`📡 Canlı Ölçüm [0x33]: ${temp.toFixed(1)}°C, %${humi.toFixed(1)}, ${vbat}mV (Pil: %${bat}), Paket #${count}`, 'live');
      this.handleIncomingTelemetry({
        format: 'PVVX Canlı (0x33)',
        temp: temp,
        hum: humi,
        bat: bat,
        volt: volt
      }, this.connectedDevice);
      return;
    }

    // 2. Hafıza / Geçmiş Ölçüm Paketi (0x35)
    // Format: [0x35] [Count 2B uint16 LE] [Timestamp 4B uint32 LE] [Temp 2B int16 LE /100] [Hum 2B uint16 LE /100] [Vbat 2B uint16 LE mV]
    if (blkid === 0x35) {
      if (len >= 13) {
        const cnt = dv.getUint16(1, true);
        const tc = dv.getUint32(3, true); // Unix saniye
        const tm = dv.getInt16(7, true) / 100.0; // Sıcaklık
        const hm = dv.getUint16(9, true) / 100.0; // Nem
        const vb = dv.getUint16(11, true); // mV
        const bat = Math.min(100, Math.max(0, Math.round((vb - 2100) / 9.0)));
        const volt = Number((vb / 1000.0).toFixed(3));

        // Tarih doğrulaması (2021 ile 2040 arası mantıklı Unix damgası)
        // Eğer cihazın RTC saati senkronize edilmeden önce kaydedilmiş ham veri varsa (tc < 1609459200) GraphMemo spec gereği atlanır
        if (tc < 1609459200 || tc > 2200000000) {
          return;
        }
        const date = new Date(tc * 1000);

        this.addMeasurementToHistory({
          timestamp: date.toISOString(),
          temp: tm,
          hum: hm,
          bat: bat,
          volt: volt,
          rssi: -60,
          devId: this.connectedDevice ? this.connectedDevice.id : 'ATC_THERMO'
        });

        this.memoCount = (this.memoCount || 0) + 1;
        if (this.memoCount % 25 === 0 || this.memoCount <= 3) {
          this.log(`💾 Hafıza kaydı aktarıldı: #${cnt} [${date.toLocaleTimeString('tr-TR')}]: ${tm.toFixed(1)}°C, %${hm.toFixed(1)}, ${vb}mV`);
        }
      } else if (len >= 3) {
        // Memo aktarımı bitti sinyali
        this.log(`🎉 Flash hafıza aktarımı tamamlandı! Toplam ${this.memoCount || 0} kayıt grafiklere döküldü.`, 'live');
        this.sortAndDeduplicateHistory();
        this.updateChart();
        this.renderHistoryTable();
      }
      return;
    }

    // 3. Cihaz Konfigürasyonu (0x55)
    if (blkid === 0x55 && len >= 9) {
      const ver = dv.getUint8(1);
      const flg = dv.getUint8(2);
      const tempOffset = dv.getInt8(4);
      const humiOffset = dv.getInt8(5);
      const advInt = dv.getUint8(6);
      const measInt = dv.getUint8(7);
      this.log(`⚙️ Cihaz Bilgisi [0x55]: Yazılım v${ver >> 4}.${ver & 0x0f}, Ölçüm Aralığı: ${measInt}s, Reklam: ${advInt}s`);
      return;
    }
  }

  // Yeniden Canlı Ölçüm İste (0x33 komutu)
  async requeryLive() {
    if (!this.isConnected || !this.custom1f1fChar) {
      alert('Önce "Termometreye Bağlan" butonunu kullanarak termometrenize bağlanın.');
      return;
    }
    try {
      this.log('Anlık telemetri ölçüm paketi isteniyor [0x33, 0xC8]...');
      await this.custom1f1fChar.writeValue(new Uint8Array([0x33, 0xC8]));
    } catch (e) {
      this.log('Canlı telemetri isteme hatası: ' + e.message, 'error');
    }
  }

  // Yeniden Tüm Hafıza Kayıtlarını İste (0x35 komutu)
  async requeryMemo() {
    if (!this.isConnected || !this.custom1f1fChar) {
      alert('Önce "Bağlan" butonunu kullanarak termometrenize bağlanın.');
      return;
    }
    try {
      this.memoCount = 0;
      this.log('Flash bellek kayıtları tekrar isteniyor [0x35, 0xff, 0xff, 0, 0]...');
      await this.custom1f1fChar.writeValue(new Uint8Array([0x35, 0xff, 0xff, 0, 0]));
    } catch (e) {
      this.log('Hafıza isteme hatası: ' + e.message, 'error');
    }
  }

  // Kayıtları İndir Butonu Aksiyonu (Hafıza aktarımı + CSV İndirme)
  async downloadRecords() {
    if (this.isConnected && this.custom1f1fChar) {
      this.log('📥 Kayıtları İndir: Cihaz hafızasındaki kayıtlar çekiliyor [0x35]...');
      if (window.app && window.app.showToast) {
        window.app.showToast('Termometre hafızasındaki tüm kayıtlar çekiliyor...', 'info');
      }
      await this.requeryMemo();
      setTimeout(() => {
        if (this.historyData.length > 0) {
          this.exportCsv();
        }
      }, 2500);
    } else if (this.historyData && this.historyData.length > 0) {
      this.exportCsv();
      if (window.app && window.app.showToast) {
        window.app.showToast('Kayıtlı ölçümler CSV olarak indirildi.', 'success');
      }
    } else {
      if (window.app && window.app.showToast) {
        window.app.showToast('İndirilecek kayıt bulunamadı. Lütfen önce "Bağlan" butonuyla termometrenize bağlanın.', 'info');
      } else {
        alert('İndirilecek kayıt bulunamadı. Lütfen önce "Bağlan" butonuyla termometrenize bağlanın.');
      }
    }
  }

  disconnect() {
    if (this.gattServer && this.gattServer.connected) {
      this.gattServer.disconnect();
    }
    this.onDisconnected();
  }

  onDisconnected() {
    this.isConnected = false;
    this.gattServer = null;
    this.custom1f1fChar = null;
    if (this.dom.btnConnectGatt) this.dom.btnConnectGatt.classList.remove('hidden');
    if (this.dom.btnDisconnect) this.dom.btnDisconnect.classList.add('hidden');
    this.updateStatus('Bağlantı Kesildi · Hazır', 'bg-slate-400');
    this.log('Cihaz bağlantısı sonlandırıldı.');
  }

  // ==========================================
  // HAFIZA YÖNETİMİ & LOCALSTORAGE
  // ==========================================
  addMeasurementToHistory(item) {
    if (!item || item.temp === null || isNaN(item.temp)) return;
    const t = new Date(item.timestamp).getTime();
    if (isNaN(t) || t < 1609459200000 || t > 2200000000000) return;

    // Son kayıt ile çok yakınsa (örneğin 15 saniyeden az) son kaydı güncelle
    const len = this.historyData.length;
    if (len > 0) {
      const last = this.historyData[len - 1];
      const lastT = new Date(last.timestamp).getTime();
      if (Math.abs(t - lastT) < 15000 && last.devId === item.devId) {
        this.historyData[len - 1] = item;
        this.saveHistoryDebounced();
        return;
      }
    }

    this.historyData.push(item);

    // Periyodik olarak 30 kayıtta bir kronolojik sırala ve tekilleştir
    if (this.historyData.length % 30 === 0) {
      this.sortAndDeduplicateHistory();
    } else if (this.historyData.length > 2000) {
      this.historyData = this.historyData.slice(-2000);
    }

    this.saveHistoryDebounced();
  }

  // Kronolojik kesin sıralama (küçükten büyüğe) ve mükerrer kayıt temizliği
  sortAndDeduplicateHistory() {
    if (!this.historyData || this.historyData.length <= 1) return;

    // 1. Zamana göre artan sırala (küçükten büyüğe)
    this.historyData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // 2. 20 saniye içindeki mükerrer ölçümleri tekilleştir
    const deduped = [];
    for (let i = 0; i < this.historyData.length; i++) {
      const curr = this.historyData[i];
      const currTime = new Date(curr.timestamp).getTime();
      if (isNaN(currTime) || currTime < 1609459200000 || currTime > 2200000000000) continue;

      if (deduped.length === 0) {
        deduped.push(curr);
        continue;
      }

      const prev = deduped[deduped.length - 1];
      const prevTime = new Date(prev.timestamp).getTime();

      if (Math.abs(currTime - prevTime) >= 20000 || curr.devId !== prev.devId) {
        deduped.push(curr);
      } else {
        deduped[deduped.length - 1] = curr;
      }
    }

    this.historyData = deduped.slice(-2000);
  }

  saveHistoryDebounced() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        localStorage.setItem('xiaomi_smarttemp_history_v1', JSON.stringify(this.historyData.slice(-2000)));
      } catch (e) {}
    }, 1200);
  }

  loadCachedHistory() {
    try {
      const cached = localStorage.getItem('xiaomi_smarttemp_history_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Varsa eski demo veya geçersiz saat damgalı kayıtları temizle
          const cleanList = parsed.filter(item => {
            if (!item || item.temp === null || isNaN(item.temp)) return false;
            if (String(item.devId || '').startsWith('DEMO_')) return false;
            const t = new Date(item.timestamp).getTime();
            return !isNaN(t) && t >= 1609459200000 && t <= 2200000000000;
          });

          this.historyData = cleanList;
          this.sortAndDeduplicateHistory();

          if (this.historyData.length > 0) {
            const last = this.historyData[this.historyData.length - 1];
            if (last) {
              this.renderHeroDisplay({
                id: last.devId || 'Termometre',
                name: 'Kayıtlı Termometre',
                format: 'Kayıtlı Hafıza',
                mac: '',
                temp: last.temp,
                hum: last.hum,
                bat: last.bat || 100,
                volt: last.volt || 3.0,
                rssi: last.rssi || -60,
                packetCount: this.historyData.length,
                lastSeen: new Date(last.timestamp)
              });
            }
            this.updateChart();
            this.renderHistoryTable();
            this.log(`Kayıtlı yerel hafızadan ${this.historyData.length} ölçüm başarıyla yüklendi.`);
          } else {
            this.historyData = [];
            this.updateChart();
            this.renderHistoryTable();
          }
        }
      }
    } catch (e) {}
  }

  clearHistory() {
    this.historyData = [];
    localStorage.removeItem('xiaomi_smarttemp_history_v1');
    this.updateChart();
    this.renderHistoryTable();
    this.log('Tüm hafıza ve grafik kayıtları sıfırlandı.');
    if (window.app && window.app.showToast) {
      window.app.showToast('Tüm hafıza ve grafik kayıtları sıfırlandı.', 'info');
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
            hidden: true,
            yAxisID: 'yHum'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 8,
              boxHeight: 8,
              padding: 14,
              font: { family: 'Poppins, sans-serif', size: 11, weight: 'bold' },
              color: isDark ? '#cbd5e1' : '#475569'
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
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

    // Her grafik çizimi öncesinde verilerin kronolojik sıralı ve tekil olduğundan emin ol
    this.sortAndDeduplicateHistory();
    const all = this.historyData;

    if (!all || all.length === 0) {
      this.chart.data.labels = [];
      this.chart.data.datasets.forEach(d => d.data = []);
      this.chart.update('none');
      this.renderSummaryStats([]);
      return;
    }

    // 1. Aralık Filtresi (6h, 24h, 7d, all)
    // Referans zaman: en son ölçüm zamanı ile şu an arasından en büyüğü
    const lastRecordTime = new Date(all[all.length - 1].timestamp).getTime();
    const refTime = Math.max(Date.now(), lastRecordTime);
    let filtered = all;

    if (this.chartRange === '6h') {
      filtered = all.filter(d => (refTime - new Date(d.timestamp).getTime()) <= 6 * 3600 * 1000);
    } else if (this.chartRange === '24h') {
      filtered = all.filter(d => (refTime - new Date(d.timestamp).getTime()) <= 24 * 3600 * 1000);
    } else if (this.chartRange === '7d') {
      filtered = all.filter(d => (refTime - new Date(d.timestamp).getTime()) <= 7 * 24 * 3600 * 1000);
    }

    if (filtered.length === 0) filtered = all.slice(-48);

    // KESİN KRONOLOJİK SIRALAMA: Küçükten büyüğe (artan)
    filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Zaman aralığı birden çok günü kapsıyor mu kontrol et
    const firstT = new Date(filtered[0].timestamp).getTime();
    const lastT = new Date(filtered[filtered.length - 1].timestamp).getTime();
    const isMultiDay = (new Date(firstT).toDateString() !== new Date(lastT).toDateString()) || ((lastT - firstT) > 18 * 3600 * 1000);

    // 2. Etiketler ve Veri Dizileri
    const labels = filtered.map(d => {
      const dt = new Date(d.timestamp);
      if (isMultiDay) {
        return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ' +
               dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      }
      return dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    });

    const tempData = filtered.map(d => d.temp);
    const humData = filtered.map(d => d.hum);
    const batData = filtered.map(d => d.bat);

    this.chart.data.labels = labels;

    // Sadece Sıcaklık ve Nem Gösterimi (Batarya varsayılan olarak gizli tutulur)
    this.chart.data.datasets[0].hidden = !(this.chartMetric === 'all' || this.chartMetric === 'temp');
    this.chart.data.datasets[1].hidden = !(this.chartMetric === 'all' || this.chartMetric === 'hum');
    this.chart.data.datasets[2].hidden = true;

    this.chart.data.datasets[0].data = tempData;
    this.chart.data.datasets[1].data = humData;
    this.chart.data.datasets[2].data = batData;

    // Tooltip başlığında net ve detaylı tarih/saat gösterimi (karışıklığı önler)
    this.chart.options.plugins.tooltip.callbacks.title = (items) => {
      if (!items || !items.length) return '';
      const item = filtered[items[0].dataIndex];
      if (!item) return '';
      const d = new Date(item.timestamp);
      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    this.chart.update('none');
    this.renderSummaryStats(filtered);
  }

  renderSummaryStats(filtered) {
    if (!filtered || filtered.length === 0) {
      if (this.dom.chartStatCount) this.dom.chartStatCount.textContent = '0 Ölçüm';
      if (this.dom.chartMinTemp) this.dom.chartMinTemp.textContent = '--°C';
      if (this.dom.chartMaxTemp) this.dom.chartMaxTemp.textContent = '--°C';
      if (this.dom.chartAvgTemp) this.dom.chartAvgTemp.textContent = '--°C';
      if (this.dom.chartMinHum) this.dom.chartMinHum.textContent = '%--';
      if (this.dom.chartMaxHum) this.dom.chartMaxHum.textContent = '%--';
      if (this.dom.chartAvgHum) this.dom.chartAvgHum.textContent = '%--';
      if (this.dom.chartBatStat) this.dom.chartBatStat.textContent = '%--';
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
  // DIŞA AKTARMA (CSV & JSON)
  // ==========================================
  exportCsv() {
    if (this.historyData.length === 0) {
      alert('Dışa aktarılacak kayıtlı ölçüm bulunmuyor.');
      return;
    }

    let csv = 'Timestamp;Tarih;Saat;Sicaklik_C;Bagil_Nem_Pct;Batarya_Pct;Voltaj_V;RSSI_dBm;Cihaz_ID\n';
    this.historyData.forEach(d => {
      const dt = new Date(d.timestamp);
      const dateStr = dt.toLocaleDateString('tr-TR');
      const timeStr = dt.toLocaleTimeString('tr-TR');
      csv += `${d.timestamp};${dateStr};${timeStr};${d.temp};${d.hum};${d.bat};${d.volt};${d.rssi};${d.devId}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SmartTemp_Olcumler_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.log('CSV dosyası dışa aktarıldı.');
  }

  exportJson() {
    if (this.historyData.length === 0) {
      alert('Dışa aktarılacak kayıtlı ölçüm bulunmuyor.');
      return;
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.historyData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `SmartTemp_Olcumler_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    this.log('JSON dosyası dışa aktarıldı.');
  }
}

// Uygulama yüklendiğinde yöneticisini başlat
window.addEventListener('DOMContentLoaded', () => {
  window.bleManager = new XiaomiBleManager();
});
