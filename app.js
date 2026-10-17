/**
 * Xiaomi SmartTemp Pro — Parkinsans Typography & Material Blue Theme
 * Device: Xiaomi Mijia LYWSD03MMC (Stock & ATC / PVVX Modded Firmware Support)
 * Auto-Connect to ATC_597941 with Persistent History & Telemetry KPIs
 * Full BLE Advertisement Signal Sniffer (RSSI, Packet Counter, Broadcast Decoding)
 * Multi-Profile GATT Connection & Atmospheric Metrics (Dew Point, Apparent Temp, VPD)
 */

// ==========================================
// 1. CONSTANTS & ALL GATT SERVICE UUIDs
// ==========================================
const BLE_PROFILES = {
  // 1. Xiaomi Stock Firmware Service
  XIAOMI_SERVICE: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
  CHAR_LIVE_DATA: 'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6',       // 5 bytes: [temp (int16), hum (uint8), volt (int16)]
  CHAR_BATTERY: 'ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6',         // 1 byte %
  CHAR_UNIT: 'ebe0ccbe-7a0a-4b0c-8a1a-6ff2997da3a6',            // 0x00=C, 0x01=F
  CHAR_TIMESTAMP: 'ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6',       // 4 bytes uint32 epoch sec
  CHAR_LAST_CALC_IDX: 'ebe0ccb9-7a0a-4b0c-8a1a-6ff2997da3a6',   // 8 bytes: [last_calc_idx, last_rec_idx]
  CHAR_HISTORY_STREAM: 'ebe0ccbc-7a0a-4b0c-8a1a-6ff2997da3a6',  // 14 bytes: [idx, ts, tMax, hMax, tMin, hMin]
  CHAR_LAST_HOUR_DATA: 'ebe0ccbb-7a0a-4b0c-8a1a-6ff2997da3a6',  // 14 bytes: latest 1-hour record

  // 2. Standard Environmental Sensing Service (ATC / PVVX Custom Firmware)
  ENV_SENSING_SERVICE: '0000181a-0000-1000-8000-00805f9b34fb',
  CHAR_TEMP_HIGH_RES: '00002a6e-0000-1000-8000-00805f9b34fb',  // int16, 0.01 °C
  CHAR_TEMP_STD: '00002a1f-0000-1000-8000-00805f9b34fb',       // int16, 0.1 °C
  CHAR_HUMIDITY: '00002a6f-0000-1000-8000-00805f9b34fb',       // uint16, 0.01 % or uint8

  // 3. Battery Service (Standard)
  BATTERY_SERVICE: '0000180f-0000-1000-8000-00805f9b34fb',
  CHAR_BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',   // uint8 %

  // 4. ATC / PVVX Custom Control & Telemetry Service
  ATC_CUSTOM_SERVICE: '00001f10-0000-1000-8000-00805f9b34fb',
  CHAR_ATC_CUSTOM: '00001f1f-0000-1000-8000-00805f9b34fb',

  // 5. Xiaomi MiBeacon & BTHome UUIDs for Advertisements
  UUID_MIBEACON: '0000fe95-0000-1000-8000-00805f9b34fb',
  UUID_BTHOME_V2: '0000fcd2-0000-1000-8000-00805f9b34fb',
  UUID_BTHOME_V1: '0000181c-0000-1000-8000-00805f9b34fb'
};

// ==========================================
// 2. SCIENTIFIC ATMOSPHERIC METRICS CALCULATOR
// ==========================================
class AtmosphericMetrics {
  /**
   * Çiğ Noktası (Dew Point - Td)
   * Formül: Alduchov & Eskridge (1996) Magnus yaklaşımı (WMO Standardı)
   */
  static calculateDewPoint(temperature, humidity) {
    if (humidity <= 0) return temperature;
    const a = 17.625;
    const b = 243.04;
    const alpha = ((a * temperature) / (b + temperature)) + Math.log(humidity / 100.0);
    const dewPoint = (b * alpha) / (a - alpha);
    return Number(dewPoint.toFixed(1));
  }

  /**
   * Buhar Basıncı (Vapor Pressure & VPD)
   * Formül: Buck (1981) denklemi
   */
  static calculateVaporPressure(temperature, humidity) {
    const vpSat = 6.1121 * Math.exp((17.502 * temperature) / (240.97 + temperature));
    const vpAct = vpSat * (Math.max(0, Math.min(100, humidity)) / 100.0);
    const vpd = (vpSat - vpAct) / 10.0; // kPa cinsine çevrim
    return {
      vpSat: Number(vpSat.toFixed(1)),
      vpAct: Number(vpAct.toFixed(1)),
      vpd: Number(vpd.toFixed(2))
    };
  }

  /**
   * Hissedilen Sıcaklık (Apparent Temperature - AT)
   * Formül: Steadman (1984) iç ortam modeli + Yüksek sıcaklıklarda NOAA Rothfusz Heat Index
   */
  static calculateApparentTemp(temperature, humidity) {
    const e = (humidity / 100.0) * 6.105 * Math.exp((17.27 * temperature) / (237.7 + temperature));

    if (temperature >= 26.7 && humidity >= 40) {
      const tf = (temperature * 1.8) + 32.0;
      const hi = -42.379 +
        (2.04901523 * tf) +
        (10.14333127 * humidity) -
        (0.22475541 * tf * humidity) -
        (0.00683783 * tf * tf) -
        (0.05481717 * humidity * humidity) +
        (0.00122874 * tf * tf * humidity) +
        (0.00085282 * tf * humidity * humidity) -
        (0.00000199 * tf * tf * humidity * humidity);

      const tc = (hi - 32.0) / 1.8;
      return Number(tc.toFixed(1));
    }

    const at = temperature + (0.33 * e) - 4.0;
    return Number(at.toFixed(1));
  }

  static enrich(record) {
    const t = record.temperature;
    const h = record.humidity;

    const dewPoint = this.calculateDewPoint(t, h);
    const vp = this.calculateVaporPressure(t, h);
    const apparentTemp = this.calculateApparentTemp(t, h);

    return {
      ...record,
      dewPoint,
      apparentTemp,
      vaporPressure: vp.vpAct,
      vpSat: vp.vpSat,
      vpd: vp.vpd
    };
  }
}

// ==========================================
// 3. STORAGE MANAGER (IndexedDB + Memory)
// ==========================================
class TelemetryStorage {
  constructor() {
    this.dbName = 'XiaomiSmartTempDB';
    this.storeName = 'telemetry_records';
    this.db = null;
    this.records = [];
    this.initPromise = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = async (e) => {
        this.db = e.target.result;
        await this.loadAllRecords();
        resolve(this.db);
      };
      request.onerror = (e) => {
        console.error('IndexedDB hatası:', e);
        reject(e);
      };
    });
  }

  async loadAllRecords() {
    return new Promise((resolve) => {
      if (!this.db) {
        this.records = [];
        return resolve([]);
      }
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => {
        const raw = req.result || [];
        this.records = raw.map(r => AtmosphericMetrics.enrich(r));
        this.records.sort((a, b) => a.timestamp - b.timestamp);
        resolve(this.records);
      };
      req.onerror = () => resolve([]);
    });
  }

  async addRecord(record) {
    const enriched = AtmosphericMetrics.enrich(record);
    this.records.push(enriched);
    this.records.sort((a, b) => a.timestamp - b.timestamp);

    if (this.db) {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).add(enriched);
    }
    return enriched;
  }

  async addBatch(recordsList) {
    if (!recordsList || recordsList.length === 0) return;
    for (const r of recordsList) {
      const enriched = AtmosphericMetrics.enrich(r);
      const exists = this.records.some(ex => Math.abs(ex.timestamp - enriched.timestamp) < 5000 && ex.type === enriched.type);
      if (!exists) {
        this.records.push(enriched);
        if (this.db) {
          const tx = this.db.transaction(this.storeName, 'readwrite');
          tx.objectStore(this.storeName).add(enriched);
        }
      }
    }
    this.records.sort((a, b) => a.timestamp - b.timestamp);
  }

  async clearAll() {
    this.records = [];
    if (this.db) {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).clear();
    }
  }

  exportCSV() {
    if (this.records.length === 0) return null;
    const headers = [
      'ID',
      'Tarih',
      'Saat',
      'Tur',
      'Sicaklik_C',
      'Hissedilen_Sicaklik_C',
      'Nem_Yuzde',
      'Cig_Noktasi_C',
      'Buhar_Basinci_hPa',
      'Doygunluk_Basinci_hPa',
      'VPD_kPa',
      'Pil_Yuzde',
      'Voltaj_V',
      'Sinyal_RSSI'
    ];
    const rows = this.records.map((r, i) => {
      const d = new Date(r.timestamp);
      return [
        i + 1,
        d.toLocaleDateString('tr-TR'),
        d.toLocaleTimeString('tr-TR'),
        r.type === 'history_hour' ? 'Cihaz Geçmişi' : (r.source === 'ble_adv' ? 'BLE Sinyal Yayını' : 'GATT Canlı'),
        r.temperature.toFixed(2),
        r.apparentTemp != null ? r.apparentTemp.toFixed(1) : '',
        r.humidity,
        r.dewPoint != null ? r.dewPoint.toFixed(1) : '',
        r.vaporPressure != null ? r.vaporPressure.toFixed(1) : '',
        r.vpSat != null ? r.vpSat.toFixed(1) : '',
        r.vpd != null ? r.vpd.toFixed(2) : '',
        r.battery != null ? r.battery : '',
        r.voltage != null ? r.voltage.toFixed(2) : '',
        r.rssi != null ? `${r.rssi} dBm` : ''
      ].join(';');
    });
    return [headers.join(';'), ...rows].join('\r\n');
  }

  exportJSON() {
    return JSON.stringify(this.records, null, 2);
  }
}

// ==========================================
// 4. MULTI-PROTOCOL BLE & SIGNAL MANAGER
// ==========================================
class UniversalBleManager {
  constructor(onDataCallback, onStatusCallback, onHistoryProgressCallback, onSignalCallback) {
    this.onData = onDataCallback;
    this.onStatus = onStatusCallback;
    this.onHistoryProgress = onHistoryProgressCallback;
    this.onSignal = onSignalCallback;

    this.device = null;
    this.server = null;
    this.isConnected = false;
    this.isFetchingHistory = false;
    this.isWatchingAdvertisements = false;
    this.deviceProfile = 'atc'; // 'atc' | 'stock_xiaomi' | 'generic'
    this.lastRssi = null;
    this.packetCount = 0;
    this.autoReconnectTimer = null;
    this.atcChar = null; // 0x1F1F kontrol ve konfigürasyon karakteristiği
    this.onDevPacket = null; // Geliştirici paket dinleyicisi

    // Cache of partial readings from distinct characteristics
    this.cachedTemp = null;
    this.cachedHum = null;
    this.cachedBat = 100;
    this.cachedVolt = 3.0;

    // Throttle for live incoming data
    this.lastEmitTime = 0;
  }

  // Sayfa açıldığında veya yenilendiğinde doğrudan ATC_597941'e otomatik bağlanma
  async tryAutoConnect() {
    if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;
    try {
      const devices = await navigator.bluetooth.getDevices();
      if (devices && devices.length > 0) {
        const target = devices.find(d => d.name === 'ATC_597941') ||
                       devices.find(d => d.name && d.name.startsWith('ATC_')) ||
                       devices[0];
        if (target) {
          console.log(`⚡ ${target.name} cihazı hafızada bulundu, doğrudan otomatik bağlanılıyor...`);
          return await this.connectToDevice(target);
        }
      }
    } catch (e) {
      console.warn('Otomatik bağlanma denenirken hata:', e);
    }
    return false;
  }

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Tarayıcınız Web Bluetooth API desteği sağlamıyor. Lütfen Google Chrome veya Microsoft Edge kullanın.');
    }

    this.onStatus('scanning', 'ATC_597941 aranıyor...');

    // Tam liste: Hem orijinal Xiaomi hem ATC / PVVX / BTHome servisleri
    const optionalServices = [
      BLE_PROFILES.XIAOMI_SERVICE,
      BLE_PROFILES.ENV_SENSING_SERVICE,
      0x181a,
      BLE_PROFILES.BATTERY_SERVICE,
      0x180f,
      BLE_PROFILES.ATC_CUSTOM_SERVICE,
      0x1f10,
      '00001f11-0000-1000-8000-00805f9b34fb',
      0x1f11,
      '0000180a-0000-1000-8000-00805f9b34fb',
      0x180a,
      BLE_PROFILES.UUID_MIBEACON,
      0xfe95,
      BLE_PROFILES.UUID_BTHOME_V2,
      0xfcd2,
      BLE_PROFILES.UUID_BTHOME_V1,
      0x181c,
      '0000181e-0000-1000-8000-00805f9b34fb',
      0x181e,
      '22210000-554a-4546-5542-46534450464d',
      '0000fff9-0000-1000-8000-00805f9b34fb',
      0xfff9,
      '0000fdcd-0000-1000-8000-00805f9b34fb',
      0xfdcd,
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      0xffe0
    ];

    try {
      // 1. Önce doğrudan ATC_597941 ve ATC_ filtreleriyle ara (hemen en üstte çıksın)
      try {
        this.device = await navigator.bluetooth.requestDevice({
          filters: [
            { name: 'ATC_597941' },
            { namePrefix: 'ATC_' }
          ],
          optionalServices: optionalServices
        });
      } catch (filterErr) {
        if (filterErr.name === 'NotFoundError') {
          throw filterErr;
        }
        // İptal edilmediyse genel arama ile dene
        this.device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: optionalServices
        });
      }
    } catch (err) {
      this.isConnected = false;
      if (err.name === 'NotFoundError') {
        this.onStatus('disconnected', 'Cihaz seçimi iptal edildi.');
        return false;
      }
      this.onStatus('disconnected', 'Bluetooth cihaz listesi açılamadı.');
      throw err;
    }

    return await this.connectToDevice(this.device);
  }

  async connectToDevice(device) {
    this.device = device;
    const devName = this.device.name || 'ATC_597941';
    this.onStatus('connecting', `${devName} bağlanıyor...`);

    // Kopma olayını temizleyip yeniden dinle
    this.device.removeEventListener?.('gattserverdisconnected', this._boundDisconnect);
    this._boundDisconnect = () => this.handleDisconnect();
    this.device.addEventListener('gattserverdisconnected', this._boundDisconnect);

    // 1. ADVERTISMENT WATCHER (BLE Sinyalleri & Paket Yakalayıcı)
    this.startAdvertisementWatcher();

    // 2. GATT BAĞLANTISI
    try {
      this.server = await this.device.gatt.connect();
    } catch (connErr) {
      console.warn('GATT bağlantısı kurulamadı, ancak BLE sinyal yayınları izleniyor:', connErr);
      if (this.isWatchingAdvertisements) {
        this.isConnected = true;
        this.onStatus('connected', `${devName} (BLE Sinyal Yayını Aktif)`);
        return true;
      }
      throw connErr;
    }

    // 3. ÇOKLU PROFİL OTOMATİK ALGILAMA (Stock Xiaomi vs. ATC Custom)
    await this.setupGattProfiles();

    this.isConnected = true;
    const fwBadge = this.deviceProfile === 'atc' ? 'ATC Modlu FW' : 'Xiaomi Orijinal FW';
    this.onStatus('connected', `${devName} (${fwBadge})`);
    return true;
  }

  // BLE Reklam / Sinyal Yayınlarını Canlı Yakalama (watchAdvertisements)
  startAdvertisementWatcher() {
    if (!this.device || !this.device.watchAdvertisements) {
      console.log('Tarayıcınızda device.watchAdvertisements desteği henüz etkinleştirilmemiş.');
      return;
    }

    try {
      this.device.addEventListener('advertisementreceived', (event) => {
        this.handleAdvertisementPacket(event);
      });
      this.device.watchAdvertisements().then(() => {
        this.isWatchingAdvertisements = true;
        console.log('📡 BLE Yayın / Reklam Sinyali dinleyicisi başarıyla başlatıldı.');
      }).catch(e => {
        console.warn('watchAdvertisements hatası:', e);
      });
    } catch (e) {
      console.warn('Sinyal dinleyicisi başlatılamadı:', e);
    }
  }

  // Gelen BLE Sinyal Yayın Paketini Çözümleme (ATC1441, PVVX, BTHome, MiBeacon)
  handleAdvertisementPacket(event) {
    this.packetCount++;
    this.lastRssi = event.rssi;

    if (this.onSignal) {
      this.onSignal({
        rssi: event.rssi,
        packetCount: this.packetCount,
        deviceName: event.device ? event.device.name : (this.device ? this.device.name : 'ATC Cihazı'),
        profile: this.deviceProfile
      });
    }

    if (!event.serviceData) return;

    for (const [key, dataView] of event.serviceData.entries()) {
      const lowerKey = key.toLowerCase();
      const b = dataView;
      const len = b.byteLength;

      // 1. Environmental Sensing Service (0x181A) — ATC / PVVX Custom Firmware
      if (lowerKey.includes('181a')) {
        this.deviceProfile = 'atc';
        if (len >= 15) {
          // PVVX Custom Format (Little Endian, 0.01 hassasiyet)
          // 6-7: temp (int16), 8-9: humi (int16), 10-11: vbat (uint16 mV), 12: bat (uint8 %)
          const temp = b.getInt16(6, true) / 100.0;
          const hum = b.getInt16(8, true) / 100.0;
          const vbat = b.getUint16(10, true) / 1000.0;
          const bat = b.getUint8(12);

          this.emitTelemetry(temp, Math.round(hum), vbat, bat, 'ble_adv', 'atc');
          return;
        } else if (len >= 13) {
          // ATC1441 Format (Big Endian, 0.1 hassasiyet)
          // 6-7: temp (int16 Big Endian), 8: humi (uint8), 9: bat (uint8), 10-11: vbat (uint16 Big Endian mV)
          const temp = b.getInt16(6, false) / 10.0;
          const hum = b.getUint8(8);
          const bat = b.getUint8(9);
          const vbat = b.getUint16(10, false) / 1000.0;

          this.emitTelemetry(temp, hum, vbat, bat, 'ble_adv', 'atc');
          return;
        }
      }

      // 2. BTHome v2 (0xFCD2) Format
      if (lowerKey.includes('fcd2') && len > 1) {
        this.deviceProfile = 'atc';
        let ptr = 1;
        let t = null, h = null, v = 3.0, bPct = 100;
        while (ptr < len) {
          const id = b.getUint8(ptr);
          if (id === 0x02 && ptr + 2 < len) {
            t = b.getInt16(ptr + 1, true) * 0.01;
            ptr += 3;
          } else if (id === 0x03 && ptr + 2 < len) {
            h = b.getUint16(ptr + 1, true) * 0.01;
            ptr += 3;
          } else if (id === 0x01 && ptr + 1 < len) {
            bPct = b.getUint8(ptr + 1);
            ptr += 2;
          } else if (id === 0x0c && ptr + 2 < len) {
            v = b.getUint16(ptr + 1, true) / 1000.0;
            ptr += 3;
          } else {
            ptr++;
          }
        }
        if (t !== null && h !== null) {
          this.emitTelemetry(t, Math.round(h), v, bPct, 'ble_adv', 'atc');
          return;
        }
      }

      // 3. Xiaomi MiBeacon (0xFE95) Format
      if (lowerKey.includes('fe95') && len >= 14) {
        this.deviceProfile = 'stock_xiaomi';
        for (let p = 11; p < len - 3; p++) {
          const objId = b.getUint16(p, true);
          const objLen = b.getUint8(p + 2);
          if (objId === 0x100d && objLen === 4 && p + 7 <= len) {
            const temp = b.getInt16(p + 3, true) / 10.0;
            const hum = b.getInt16(p + 5, true) / 10.0;
            this.emitTelemetry(temp, Math.round(hum), 3.0, 95, 'ble_adv', 'stock_xiaomi');
            return;
          }
        }
      }
    }
  }

  // GATT Servislerini Keşfet ve Abone Ol
  async setupGattProfiles() {
    let bound = false;

    // 1. Önce ATC / Standart Environmental Sensing (0x181A) Servisini Dene
    try {
      const envService = await this.server.getPrimaryService(BLE_PROFILES.ENV_SENSING_SERVICE)
        .catch(() => this.server.getPrimaryService(0x181a));

      if (envService) {
        this.deviceProfile = 'atc';
        await this.bindAtcEnvService(envService);
        bound = true;
        console.log('✅ ATC Environmental Sensing (0x181A) servisine başarıyla abone olundu.');
      }
    } catch (e) {
      console.log('0x181A servisi yok, diğer servisler deneniyor...');
    }

    // 2. ATC Custom Control & Telemetry Servisini (0x1F10) Dene
    try {
      const atcService = await this.server.getPrimaryService(BLE_PROFILES.ATC_CUSTOM_SERVICE)
        .catch(() => this.server.getPrimaryService(0x1f10));

      if (atcService) {
        this.deviceProfile = 'atc';
        const atcChar = await atcService.getCharacteristic(BLE_PROFILES.CHAR_ATC_CUSTOM)
          .catch(() => atcService.getCharacteristic(0x1f1f));

        if (atcChar) {
          this.atcChar = atcChar;
          atcChar.addEventListener('characteristicvaluechanged', (e) => {
            this.handleAtcNotification(e.target.value);
          });
          await atcChar.startNotifications().catch(() => {});
          // 0x33 komutunu göndererek telemetri akışını tetikle
          await this.sendAtcCommand(new Uint8Array([0x33])).catch(() => {});
          bound = true;
          console.log('✅ ATC Custom (0x1F10 / 0x1F1F) telemetri ve geliştirici kontrol hattı aktif.');
        }
      }
    } catch (e) {
      console.log('0x1F10 servisi yok.');
    }

    // 3. Pil Servisini (0x180F) Dene
    try {
      const batService = await this.server.getPrimaryService(BLE_PROFILES.BATTERY_SERVICE)
        .catch(() => this.server.getPrimaryService(0x180f));

      if (batService) {
        const batChar = await batService.getCharacteristic(BLE_PROFILES.CHAR_BATTERY_LEVEL)
          .catch(() => batService.getCharacteristic(0x2a19));

        if (batChar) {
          const val = await batChar.readValue().catch(() => null);
          if (val && val.byteLength >= 1) {
            this.cachedBat = val.getUint8(0);
          }
          batChar.addEventListener('characteristicvaluechanged', (e) => {
            this.cachedBat = e.target.value.getUint8(0);
            this.emitCachedTelemetry();
          });
          await batChar.startNotifications().catch(() => {});
        }
      }
    } catch (e) {
      console.log('0x180F pil servisi yok veya atlandı.');
    }

    // 4. Orijinal Xiaomi Servisini Dene (ebe0ccb0-...)
    try {
      const xiaomiService = await this.server.getPrimaryService(BLE_PROFILES.XIAOMI_SERVICE);
      if (xiaomiService) {
        this.deviceProfile = 'stock_xiaomi';
        this.primaryService = xiaomiService;
        await this.bindStockXiaomiService(xiaomiService);
        bound = true;
        console.log('✅ Orijinal Xiaomi GATT servisine bağlanıldı.');
      }
    } catch (e) {
      console.log('Orijinal Xiaomi servisi yok (Cihaz ATC modlu firmware kullanıyor).');
    }

    if (!bound) {
      console.warn('GATT servislerine doğrudan abone olunamadı, ancak BLE sinyal yayınları (Advertisements) canlı dinleniyor.');
    }
  }

  // ATC Environmental Sensing (0x181A) Karakteristiklerini Dinle
  async bindAtcEnvService(envService) {
    // 1. Sıcaklık Karakteristiği (0x2A6E = 0.01°C, 0x2A1F = 0.1°C)
    try {
      const tempChar = await envService.getCharacteristic(BLE_PROFILES.CHAR_TEMP_HIGH_RES)
        .catch(() => envService.getCharacteristic(BLE_PROFILES.CHAR_TEMP_STD))
        .catch(() => envService.getCharacteristic(0x2a6e))
        .catch(() => envService.getCharacteristic(0x2a1f));

      if (tempChar) {
        const val = await tempChar.readValue().catch(() => null);
        if (val && val.byteLength >= 2) {
          this.cachedTemp = val.getInt16(0, true) / 100.0;
        }
        tempChar.addEventListener('characteristicvaluechanged', (e) => {
          const v = e.target.value;
          this.cachedTemp = v.byteLength >= 2 ? v.getInt16(0, true) / 100.0 : v.getInt16(0, true) / 10.0;
          this.emitCachedTelemetry();
        });
        await tempChar.startNotifications().catch(() => {});
      }
    } catch (err) {
      console.warn('ATC Sıcaklık karakteristiği açılamadı:', err);
    }

    // 2. Nem Karakteristiği (0x2A6F)
    try {
      const humChar = await envService.getCharacteristic(BLE_PROFILES.CHAR_HUMIDITY)
        .catch(() => envService.getCharacteristic(0x2a6f));

      if (humChar) {
        const val = await humChar.readValue().catch(() => null);
        if (val && val.byteLength >= 2) {
          this.cachedHum = Math.round(val.getUint16(0, true) / 100.0);
        } else if (val && val.byteLength === 1) {
          this.cachedHum = val.getUint8(0);
        }
        humChar.addEventListener('characteristicvaluechanged', (e) => {
          const v = e.target.value;
          this.cachedHum = v.byteLength >= 2 ? Math.round(v.getUint16(0, true) / 100.0) : v.getUint8(0);
          this.emitCachedTelemetry();
        });
        await humChar.startNotifications().catch(() => {});
      }
    } catch (err) {
      console.warn('ATC Nem karakteristiği açılamadı:', err);
    }

    this.emitCachedTelemetry();
  }

  // Orijinal Xiaomi Servisini Dinle (ebe0ccc1)
  async bindStockXiaomiService(xiaomiService) {
    try {
      const liveChar = await xiaomiService.getCharacteristic(BLE_PROFILES.CHAR_LIVE_DATA);
      liveChar.addEventListener('characteristicvaluechanged', (e) => {
        const val = e.target.value;
        if (!val || val.byteLength < 5) return;
        const temp = val.getInt16(0, true) / 100.0;
        const hum = val.getUint8(2);
        const volt = val.getInt16(3, true) / 1000.0;
        let bat = Math.round(((volt - 2.1) / 1.0) * 100);
        bat = Math.max(0, Math.min(100, bat));

        this.emitTelemetry(temp, hum, volt, bat, 'gatt_xiaomi', 'stock_xiaomi');
      });
      await liveChar.startNotifications();
      const initialVal = await liveChar.readValue().catch(() => null);
      if (initialVal && initialVal.byteLength >= 5) {
        const temp = initialVal.getInt16(0, true) / 100.0;
        const hum = initialVal.getUint8(2);
        const volt = initialVal.getInt16(3, true) / 1000.0;
        let bat = Math.round(((volt - 2.1) / 1.0) * 100);
        bat = Math.max(0, Math.min(100, bat));
        this.emitTelemetry(temp, hum, volt, bat, 'gatt_xiaomi', 'stock_xiaomi');
      }
    } catch (err) {
      console.warn('Orijinal Xiaomi canlı bildirimleri açılamadı:', err);
    }
  }

  // ATC / PVVX GATT Komutu Gönderme (0x1F1F)
  async sendAtcCommand(data) {
    if (!this.atcChar) {
      throw new Error('Cihaz bağlı değil veya 0x1F1F kontrol karakteristiği bulunamadı.');
    }
    let uint8;
    if (typeof data === 'string') {
      const clean = data.replace(/[^0-9a-fA-F]/g, '');
      const bytes = [];
      for (let i = 0; i < clean.length; i += 2) {
        bytes.push(parseInt(clean.substr(i, 2), 16));
      }
      uint8 = new Uint8Array(bytes);
    } else if (data instanceof Uint8Array) {
      uint8 = data;
    } else if (Array.isArray(data)) {
      uint8 = new Uint8Array(data);
    } else {
      throw new Error('Geçersiz veri biçimi');
    }

    try {
      if (this.atcChar.properties && this.atcChar.properties.writeWithoutResponse) {
        await this.atcChar.writeValueWithoutResponse(uint8);
      } else {
        await this.atcChar.writeValue(uint8);
      }
    } catch (e) {
      await this.atcChar.writeValue(uint8);
    }
    return uint8;
  }

  // ATC / PVVX Bildirim Yönlendirici (0x1F1F)
  handleAtcNotification(value) {
    if (!value || value.byteLength < 1) return;
    const cmdId = value.getUint8(0);

    // Canlı telemetri akışı (0x33 veya standart telemetri baytları)
    if (cmdId === 0x33 || (value.byteLength >= 5 && cmdId !== 0x55 && cmdId !== 0x20 && cmdId !== 0x25 && cmdId !== 0x44 && cmdId !== 0x01 && cmdId !== 0x10 && cmdId !== 0x24 && cmdId !== 0x22)) {
      this.parseAtc1f1fPacket(value);
    }

    // Geliştirici konsolu ve seçenekleri için gelen paket
    if (this.onDevPacket) {
      this.onDevPacket(cmdId, value);
    }
  }

  // ATC Custom 0x1F1F Canlı Telemetri Paket Çözümleme
  parseAtc1f1fPacket(value) {
    if (!value || value.byteLength < 5) return;
    const b = value;
    let offset = 0;
    if (b.getUint8(0) === 0x33) {
      offset = 1;
    }
    if (b.byteLength >= offset + 4) {
      const temp = b.getInt16(offset, true) / 100.0;
      const hum = Math.round(b.getUint16(offset + 2, true) / 100.0);
      let vbat = 3.0;
      let bat = 100;
      if (b.byteLength >= offset + 6) {
        vbat = b.getUint16(offset + 4, true) / 1000.0;
      }
      if (b.byteLength >= offset + 7) {
        bat = b.getUint8(offset + 6);
      }
      this.emitTelemetry(temp, hum, vbat, bat, 'gatt_atc_custom', 'atc');
    }
  }

  emitCachedTelemetry() {
    if (this.cachedTemp !== null && this.cachedHum !== null) {
      this.emitTelemetry(
        this.cachedTemp,
        this.cachedHum,
        this.cachedVolt,
        this.cachedBat,
        'gatt_atc_env',
        'atc'
      );
    }
  }

  emitTelemetry(temp, hum, volt, bat, source, profile) {
    // 500ms throttling to avoid rapid DOM repaints
    const now = Date.now();
    if (now - this.lastEmitTime < 400 && source === 'ble_adv') {
      return;
    }
    this.lastEmitTime = now;

    this.onData({
      temperature: Number(temp.toFixed(2)),
      humidity: Math.round(hum),
      voltage: Number(volt.toFixed(2)),
      battery: Math.max(0, Math.min(100, bat)),
      rssi: this.lastRssi,
      source: source,
      profile: profile || this.deviceProfile,
      timestamp: now,
      type: 'live'
    });
  }

  async fetchDeviceHistory() {
    if (!this.isConnected) {
      throw new Error('Geçmiş kayıtları çekmek için önce cihaza bağlı olmalısınız.');
    }

    if (this.isFetchingHistory) {
      throw new Error('Geçmiş indirme işlemi zaten devam ediyor.');
    }

    this.isFetchingHistory = true;
    this.onHistoryProgress({ active: true, percent: 10, message: 'Cihaz hafıza modu denetleniyor...' });

    try {
      // 1. Stock Xiaomi cihazında ebe0ccbc stream'i kontrol et
      if (this.primaryService) {
        try {
          const historyChar = await this.primaryService.getCharacteristic(BLE_PROFILES.CHAR_HISTORY_STREAM);
          if (historyChar) {
            this.onHistoryProgress({ active: true, percent: 30, message: 'Dahili flaş hafıza kayıtları akıtılıyor...' });
            await historyChar.startNotifications();

            const fetchedRecords = [];
            await new Promise((resolve) => {
              let timeout = null;
              const handler = (event) => {
                const chunk = event.target.value;
                const item = this.parseHistoryChunk(chunk);
                if (item) {
                  fetchedRecords.push(item);
                  const count = fetchedRecords.length;
                  const pct = Math.min(95, 30 + (count * 3));
                  this.onHistoryProgress({
                    active: true,
                    percent: pct,
                    message: `${count} geçmiş kayıt alındı...`
                  });
                }
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                  historyChar.removeEventListener('characteristicvaluechanged', handler);
                  resolve();
                }, 3000);
              };

              historyChar.addEventListener('characteristicvaluechanged', handler);
              timeout = setTimeout(() => {
                historyChar.removeEventListener('characteristicvaluechanged', handler);
                resolve();
              }, 6000);
            });

            await historyChar.stopNotifications().catch(() => {});
            this.onHistoryProgress({ active: false, percent: 100, message: 'Tamamlandı' });
            this.isFetchingHistory = false;
            return fetchedRecords;
          }
        } catch (e) {
          console.log('Orijinal Xiaomi geçmiş akışı açılamadı:', e);
        }
      }

      // 2. ATC / Modlu Firmware: Canlı akış verileri zaten kalıcı IndexedDB'ye kaydedilmiştir
      this.onHistoryProgress({ active: false, percent: 100, message: 'ATC Canlı Yayın Arşivi Güncel' });
      this.isFetchingHistory = false;
      return [];
    } catch (err) {
      this.isFetchingHistory = false;
      this.onHistoryProgress({ active: false, percent: 0, message: 'Hata' });
      throw err;
    }
  }

  parseHistoryChunk(value) {
    if (!value || value.byteLength < 14) return null;

    const idxNum = value.getUint32(0, true);
    const timestampSec = value.getUint32(4, true);
    const tempRawMax = value.getInt16(8, true);
    const humMax = value.getUint8(10);
    const tempRawMin = value.getInt16(11, true);
    const humMin = value.getUint8(13);

    const tempMax = tempRawMax / 10.0;
    const tempMin = tempRawMin / 10.0;
    const avgTemp = Number(((tempMax + tempMin) / 2).toFixed(1));
    const avgHum = Math.round((humMax + humMin) / 2);

    const validTs = timestampSec > 1600000000 ? timestampSec * 1000 : Date.now() - (idxNum * 3600 * 1000);

    const baseRecord = {
      id_idx: idxNum,
      timestamp: validTs,
      temperature: avgTemp,
      humidity: avgHum,
      tempMax,
      tempMin,
      humMax,
      humMin,
      type: 'history_hour'
    };

    return AtmosphericMetrics.enrich(baseRecord);
  }

  async disconnect() {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.atcChar = null;
    this.isConnected = false;
    this.onStatus('disconnected', 'Bağlantı kesildi.');
  }

  handleDisconnect() {
    this.atcChar = null;
    this.isConnected = false;
    const devName = this.device ? (this.device.name || 'ATC_597941') : 'ATC_597941';
    this.onStatus('disconnected', `${devName} koptu. Otomatik yeniden bağlanılıyor...`);

    // Sinyal kesilirse otomatik olarak tekrar bağlanmayı dene
    if (this.autoReconnectTimer) clearTimeout(this.autoReconnectTimer);
    this.autoReconnectTimer = setTimeout(async () => {
      if (!this.isConnected && this.device) {
        console.log(`🔄 ${devName} cihazına otomatik yeniden bağlanılıyor...`);
        try {
          await this.connectToDevice(this.device);
        } catch (e) {
          console.warn('Otomatik yeniden bağlanma bekleniyor:', e.message);
        }
      }
    }, 2500);
  }
}

// ==========================================
// 5. APPLICATION UI CONTROLLER
// ==========================================
class AppController {
  constructor() {
    this.storage = new TelemetryStorage();
    this.ble = new UniversalBleManager(
      (data) => this.handleNewData(data),
      (state, text) => this.handleBleStatus(state, text),
      (prog) => this.handleHistoryProgress(prog),
      (signal) => this.handleSignalUpdate(signal)
    );

    // State
    this.currentUnit = 'C';
    this.currentTheme = localStorage.getItem('smarttemp_theme') || 'light';
    this.latestTelemetry = null;
    this.chartRange = 'all'; // Tüm kayıtlar varsayılan olarak açık (asla boş kalmaz)
    this.chartMode = 'temps';
    this.currentPage = 1;
    this.pageSize = 15;

    this.chart = null;

    // Cache DOM Elements
    this.dom = {
      btnThemeToggle: document.getElementById('btnThemeToggle'),
      themeIcon: document.getElementById('themeIcon'),
      themeLabel: document.getElementById('themeLabel'),
      metaThemeColor: document.getElementById('metaThemeColor'),

      // Desktop & Mobile Connect buttons
      btnConnect: document.getElementById('btnConnect'),
      btnConnectMobile: document.getElementById('btnConnectMobile'),

      connectionDot: document.getElementById('connectionDot'),
      connectionDotMobile: document.getElementById('connectionDotMobile'),
      connectionStatusText: document.getElementById('connectionStatusText'),
      lastUpdatedAgo: document.getElementById('lastUpdatedAgo'),

      // Live Signal (RSSI) Elements
      signalPill: document.getElementById('signalPill'),
      signalRssiText: document.getElementById('signalRssiText'),
      signalPillMobile: document.getElementById('signalPillMobile'),
      signalRssiTextMobile: document.getElementById('signalRssiTextMobile'),
      valRssi: document.getElementById('valRssi'),

      // Signal Bar Meters
      signalBarsHeader: document.getElementById('signalBarsHeader'),
      signalBarsMobile: document.getElementById('signalBarsMobile'),
      signalBarsCard: document.getElementById('signalBarsCard'),

      // Material 3 Live KPI Cards
      chartKpiCurrent: document.getElementById('chartKpiCurrent'),
      chartKpiCurrentUnit: document.getElementById('chartKpiCurrentUnit'),
      chartKpiMin: document.getElementById('chartKpiMin'),
      chartKpiMinTime: document.getElementById('chartKpiMinTime'),
      chartKpiMax: document.getElementById('chartKpiMax'),
      chartKpiMaxTime: document.getElementById('chartKpiMaxTime'),
      chartKpiAvg: document.getElementById('chartKpiAvg'),
      chartKpiCount: document.getElementById('chartKpiCount'),
      chartEmptyOverlay: document.getElementById('chartEmptyOverlay'),

      // Card 1: Sıcaklık
      valTemp: document.getElementById('valTemp'),
      lblTempUnit: document.getElementById('lblTempUnit'),
      btnToggleUnit: document.getElementById('btnToggleUnit'),
      tempMinMax: document.getElementById('tempMinMax'),
      tempTrendBadge: document.getElementById('tempTrendBadge'),

      // Card 2: Bağıl Nem
      valHum: document.getElementById('valHum'),
      humProgressBar: document.getElementById('humProgressBar'),
      humMinMax: document.getElementById('humMinMax'),
      humidityStatusBadge: document.getElementById('humidityStatusBadge'),

      // Card 3: Hissedilen Sıcaklık (Türetilmiş)
      valApparentTemp: document.getElementById('valApparentTemp'),
      lblApparentUnit: document.getElementById('lblApparentUnit'),
      apparentDiffBadge: document.getElementById('apparentDiffBadge'),
      apparentMinMax: document.getElementById('apparentMinMax'),

      // Card 4: Çiğ Noktası (Türetilmiş)
      valDewPointCard: document.getElementById('valDewPointCard'),
      lblDewPointUnit: document.getElementById('lblDewPointUnit'),
      dewPointRiskBadge: document.getElementById('dewPointRiskBadge'),
      dewPointMinMax: document.getElementById('dewPointMinMax'),

      // Card 5: Buhar Basıncı & VPD (Türetilmiş)
      valVaporPressure: document.getElementById('valVaporPressure'),
      vpdBadge: document.getElementById('vpdBadge'),
      valVpSat: document.getElementById('valVpSat'),

      // Card 6: Pil & Donanım
      valBattery: document.getElementById('valBattery'),
      valVoltage: document.getElementById('valVoltage'),
      batteryProgressBar: document.getElementById('batteryProgressBar'),
      totalPointsCount: document.getElementById('totalPointsCount'),

      // Sync Progress
      syncProgressBanner: document.getElementById('syncProgressBanner'),
      syncProgressLabel: document.getElementById('syncProgressLabel'),
      syncProgressPercent: document.getElementById('syncProgressPercent'),
      syncProgressBar: document.getElementById('syncProgressBar'),

      // Dual History Views (Mobile Feed + Desktop Table)
      mobileHistoryFeed: document.getElementById('mobileHistoryFeed'),
      historyTableBody: document.getElementById('historyTableBody'),
      tableSummaryText: document.getElementById('tableSummaryText'),
      pageIndicator: document.getElementById('pageIndicator'),
      btnPrevPage: document.getElementById('btnPrevPage'),
      btnNextPage: document.getElementById('btnNextPage'),

      // Data Actions
      btnExportCsv: document.getElementById('btnExportCsv'),
      btnExportJson: document.getElementById('btnExportJson'),
      btnClearData: document.getElementById('btnClearData'),
      toastContainer: document.getElementById('toastContainer'),

      // Offline Badges
      offlineBadge: document.getElementById('offlineBadge'),
      offlineBadgeMobile: document.getElementById('offlineBadgeMobile'),

      // Developer Options Modal & Controls
      btnOpenDevOptions: document.getElementById('btnOpenDevOptions'),
      btnOpenDevOptionsMobile: document.getElementById('btnOpenDevOptionsMobile'),
      devOptionsModal: document.getElementById('devOptionsModal'),
      btnCloseDevModal: document.getElementById('btnCloseDevModal'),
      btnCloseDevModalBottom: document.getElementById('btnCloseDevModalBottom'),
      devBleStatusBadge: document.getElementById('devBleStatusBadge'),
      devCmdTerminal: document.getElementById('devCmdTerminal')
    };

    this.init();
  }

  async init() {
    this.initServiceWorker();
    this.initNetworkStatus();
    this.initLiveClock();
    this.applyTheme(this.currentTheme);
    lucide.createIcons();
    this.setupEventListeners();
    this.initDeveloperOptions();
    this.initChart();

    await this.storage.initPromise;
    this.updateStatsAndTable();

    if (this.storage.records.length > 0) {
      const last = this.storage.records[this.storage.records.length - 1];
      this.renderTelemetryCards(last);
      this.updateChart();
    }

    // Site açıldığında veya yenilendiğinde doğrudan ATC_597941 cihazına otomatik bağlan!
    this.ble.tryAutoConnect().catch(() => {});

    window.addEventListener('resize', () => {
      if (this.chart) {
        this.chart.options.scales.x.ticks.maxTicksLimit = window.innerWidth < 640 ? 4 : 7;
        this.chart.resize();
      }
    });
  }

  initServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker aktif:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker kaydı başarısız:', err);
          });
      });
    }
  }

  initNetworkStatus() {
    const updateStatus = () => {
      const isOnline = navigator.onLine;
      if (this.dom.offlineBadge) {
        if (!isOnline) {
          this.dom.offlineBadge.classList.remove('hidden');
          this.dom.offlineBadge.classList.add('flex');
        } else {
          this.dom.offlineBadge.classList.add('hidden');
          this.dom.offlineBadge.classList.remove('flex');
        }
      }
      if (this.dom.offlineBadgeMobile) {
        if (!isOnline) {
          this.dom.offlineBadgeMobile.classList.remove('hidden');
          this.dom.offlineBadgeMobile.classList.add('flex');
        } else {
          this.dom.offlineBadgeMobile.classList.add('hidden');
          this.dom.offlineBadgeMobile.classList.remove('flex');
        }
      }
    };

    window.addEventListener('online', () => {
      updateStatus();
      this.showToast('İnternet bağlantısı sağlandı.', 'info');
    });

    window.addEventListener('offline', () => {
      updateStatus();
      this.showToast('Çevrimdışı moddasınız. Bluetooth ölçümleri kesintisiz çalışıyor.', 'info');
    });

    updateStatus();
  }

  initLiveClock() {
    const timeEl = document.getElementById('liveClockTime');
    const dateEl = document.getElementById('liveClockDate');
    if (!timeEl) return;

    const updateClock = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      timeEl.textContent = `${h}:${m}:${s}`;

      if (dateEl) {
        const options = { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' };
        dateEl.textContent = now.toLocaleDateString('tr-TR', options);
      }
    };

    updateClock();
    setInterval(updateClock, 1000);
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('smarttemp_theme', theme);

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      if (this.dom.themeIcon) this.dom.themeIcon.setAttribute('data-lucide', 'sun');
      if (this.dom.themeLabel) this.dom.themeLabel.textContent = 'Açık';
      if (this.dom.metaThemeColor) this.dom.metaThemeColor.setAttribute('content', '#081220');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      if (this.dom.themeIcon) this.dom.themeIcon.setAttribute('data-lucide', 'moon');
      if (this.dom.themeLabel) this.dom.themeLabel.textContent = 'Koyu';
      if (this.dom.metaThemeColor) this.dom.metaThemeColor.setAttribute('content', '#dbe8fc');
    }

    lucide.createIcons();

    if (this.chart) {
      this.adaptChartTheme();
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    this.showToast(`${nextTheme === 'dark' ? 'Koyu' : 'Açık'} tema aktif edildi.`, 'info');
  }

  async triggerConnect() {
    if (this.ble.isConnected) {
      await this.ble.disconnect();
    } else {
      try {
        this.showToast('ATC_597941 aranıyor ve bağlanılıyor...', 'info');
        const success = await this.ble.connect();
        if (success) {
          const devName = this.ble.device ? (this.ble.device.name || 'ATC_597941') : 'ATC_597941';
          const fw = this.ble.deviceProfile === 'atc' ? 'ATC Modlu Firmware' : 'Xiaomi Orijinal';
          this.showToast(`Bağlandı: ${devName} (${fw})`, 'success');
        }
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          this.showToast('Bağlantı hatası: ' + err.message, 'error');
        }
      }
    }
  }

  setupEventListeners() {
    this.dom.btnThemeToggle.addEventListener('click', () => this.toggleTheme());

    if (this.dom.btnConnect) {
      this.dom.btnConnect.addEventListener('click', () => this.triggerConnect());
    }
    if (this.dom.btnConnectMobile) {
      this.dom.btnConnectMobile.addEventListener('click', () => this.triggerConnect());
    }

    this.dom.btnToggleUnit.addEventListener('click', () => {
      this.currentUnit = this.currentUnit === 'C' ? 'F' : 'C';
      this.dom.lblTempUnit.textContent = `°${this.currentUnit}`;
      if (this.dom.lblApparentUnit) this.dom.lblApparentUnit.textContent = `°${this.currentUnit}`;
      if (this.dom.lblDewPointUnit) this.dom.lblDewPointUnit.textContent = `°${this.currentUnit}`;

      if (this.latestTelemetry) {
        this.renderTelemetryCards(this.latestTelemetry);
      }
      this.updateStatsAndTable();
      this.updateChart();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const target = e.currentTarget;
        target.classList.add('active');
        this.chartRange = target.dataset.range;
        this.updateChart();
      });
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        const target = e.currentTarget;
        target.classList.add('active');
        this.chartMode = target.dataset.mode;
        this.updateChart();
      });
    });

    this.dom.btnExportCsv.addEventListener('click', () => {
      const csv = this.storage.exportCSV();
      if (!csv) return this.showToast('Dışa aktarılacak veri bulunmuyor.', 'info');
      this.downloadFile('xiaomi_atc_atmosferik_veriler.csv', csv, 'text/csv;charset=utf-8;');
      this.showToast('CSV dosyası başarıyla indirildi.', 'success');
    });

    this.dom.btnExportJson.addEventListener('click', () => {
      const json = this.storage.exportJSON();
      if (!json || json === '[]') return this.showToast('Dışa aktarılacak veri bulunmuyor.', 'info');
      this.downloadFile('xiaomi_atc_telemetri.json', json, 'application/json');
      this.showToast('JSON dosyası başarıyla indirildi.', 'success');
    });

    this.dom.btnClearData.addEventListener('click', async () => {
      if (confirm('Tüm kayıtlı sıcaklık, nem ve türetilmiş parametre verilerini silmek istediğinize emin misiniz?')) {
        await this.storage.clearAll();
        this.updateStatsAndTable();
        this.updateChart();
        this.showToast('Veritabanı temizlendi.', 'info');
      }
    });

    this.dom.btnPrevPage.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderTable();
      }
    });

    this.dom.btnNextPage.addEventListener('click', () => {
      const maxPage = Math.ceil(this.storage.records.length / this.pageSize) || 1;
      if (this.currentPage < maxPage) {
        this.currentPage++;
        this.renderTable();
      }
    });
  }

  handleBleStatus(status, text) {
    if (this.dom.connectionStatusText) this.dom.connectionStatusText.textContent = text;

    // Geliştirici Seçenekleri Modal Durum Rozeti
    if (this.dom.devBleStatusBadge) {
      if (status === 'connected') {
        this.dom.devBleStatusBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
        this.dom.devBleStatusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>GATT Aktif (0x1F1F)</span>';
        this.logDevTerminal('GATT bağlantısı kuruldu. Geliştirici kontrol hattı (0x1F1F) aktif.', 'info');
        setTimeout(() => {
          this.devReadConfigFromDevice();
        }, 600);
      } else if (status === 'connecting' || status === 'scanning') {
        this.dom.devBleStatusBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
        this.dom.devBleStatusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span><span>Bağlanılıyor...</span>';
      } else {
        this.dom.devBleStatusBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
        this.dom.devBleStatusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span><span>Cihaz Bekleniyor</span>';
      }
    }

    const updateDot = (el) => {
      if (!el) return;
      el.className = 'w-2.5 h-2.5 rounded-full inline-block flex-shrink-0';
      if (status === 'connected') {
        el.classList.add('bg-[#0b57d0]', 'dot-live');
      } else if (status === 'connecting' || status === 'scanning') {
        el.classList.add('bg-amber-500', 'animate-ping');
      } else {
        el.classList.add('bg-slate-400', 'dark:bg-slate-500');
      }
    };
    updateDot(this.dom.connectionDot);
    updateDot(this.dom.connectionDotMobile);

    const updateBtn = (btn, isMobile = false) => {
      if (!btn) return;
      if (status === 'connected') {
        btn.innerHTML = `<i data-lucide="power" class="w-4 h-4"></i><span>Bağlantıyı Kes</span>`;
        btn.className = `${isMobile ? 'flex-1' : ''} py-2.5 px-4 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 bg-[#ba1a1a] hover:bg-[#93000a] text-white shadow-sm transition-all active:scale-95`;
      } else {
        btn.innerHTML = `<i data-lucide="bluetooth" class="w-4 h-4"></i><span>Cihaza Bağlan</span>`;
        btn.className = `${isMobile ? 'flex-1' : ''} py-2.5 px-4 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-sm transition-all active:scale-95`;
      }
    };
    updateBtn(this.dom.btnConnect, false);
    updateBtn(this.dom.btnConnectMobile, true);

    const isConnected = status === 'connected';
    if (this.dom.lastUpdatedAgo) this.dom.lastUpdatedAgo.classList.toggle('hidden', !isConnected);

    lucide.createIcons();
  }

  handleSignalUpdate({ rssi, packetCount, deviceName, profile }) {
    if (rssi != null) {
      const rssiStr = `${rssi} dBm`;
      if (this.dom.signalRssiText) this.dom.signalRssiText.textContent = rssiStr;
      if (this.dom.signalRssiTextMobile) this.dom.signalRssiTextMobile.textContent = rssiStr;
      if (this.dom.valRssi) this.dom.valRssi.textContent = rssiStr;

      if (this.dom.signalPill) this.dom.signalPill.classList.remove('hidden');
      if (this.dom.signalPillMobile) this.dom.signalPillMobile.classList.remove('hidden');
      if (this.dom.signalPillMobile) this.dom.signalPillMobile.classList.add('flex');

      this.updateSignalBars(rssi);
    }
  }

  updateSignalBars(rssi) {
    if (rssi == null) return;
    let activeBars = 1;
    if (rssi >= -65) {
      activeBars = 4;
    } else if (rssi >= -75) {
      activeBars = 3;
    } else if (rssi >= -85) {
      activeBars = 2;
    } else {
      activeBars = 1;
    }

    const setBars = (container) => {
      if (!container) return;
      const bars = container.querySelectorAll('.signal-bar');
      bars.forEach((bar, idx) => {
        if (idx < activeBars) {
          bar.classList.add('active');
        } else {
          bar.classList.remove('active');
        }
      });
    };

    setBars(this.dom.signalBarsHeader);
    setBars(this.dom.signalBarsMobile);
    setBars(this.dom.signalBarsCard);
  }

  handleHistoryProgress({ active, percent, message }) {
    if (active) {
      this.dom.syncProgressBanner.classList.remove('hidden');
      this.dom.syncProgressLabel.textContent = message;
      this.dom.syncProgressPercent.textContent = `${percent}%`;
      this.dom.syncProgressBar.style.width = `${percent}%`;
    } else {
      setTimeout(() => {
        this.dom.syncProgressBanner.classList.add('hidden');
      }, 1500);
    }
  }

  async handleNewData(data) {
    const enriched = await this.storage.addRecord(data);
    this.latestTelemetry = enriched;

    this.renderTelemetryCards(enriched);
    this.updateStatsAndTable();
    this.updateChart();
  }

  renderTelemetryCards(data) {
    // Value flash animation trigger on newly updated value fields
    const triggerFlash = (el) => {
      if (!el) return;
      el.classList.remove('value-flash');
      void el.offsetWidth;
      el.classList.add('value-flash');
    };
    triggerFlash(this.dom.valTemp);
    triggerFlash(this.dom.valHum);
    triggerFlash(this.dom.valApparentTemp);
    triggerFlash(this.dom.valDewPointCard);
    triggerFlash(this.dom.valVaporPressure);

    // 1. Sıcaklık Kartı
    let displayTemp = data.temperature;
    if (this.currentUnit === 'F') {
      displayTemp = (data.temperature * 9 / 5) + 32;
    }
    this.dom.valTemp.textContent = displayTemp.toFixed(1);
    this.dom.lblTempUnit.textContent = `°${this.currentUnit}`;

    // Grafik KPI Son Okunan Değerini de anında canlı güncelle (Asla --.- kalmaz)
    if (this.dom.chartKpiCurrent) {
      if (this.chartMode === 'hum') {
        this.dom.chartKpiCurrent.textContent = `%${data.humidity}`;
        if (this.dom.chartKpiCurrentUnit) this.dom.chartKpiCurrentUnit.textContent = '%';
      } else if (this.chartMode === 'press') {
        const vp = data.vaporPressure != null ? data.vaporPressure : AtmosphericMetrics.calculateVaporPressure(data.temperature, data.humidity).vpAct;
        this.dom.chartKpiCurrent.textContent = vp.toFixed(1);
        if (this.dom.chartKpiCurrentUnit) this.dom.chartKpiCurrentUnit.textContent = 'hPa';
      } else {
        this.dom.chartKpiCurrent.textContent = displayTemp.toFixed(1);
        if (this.dom.chartKpiCurrentUnit) this.dom.chartKpiCurrentUnit.textContent = `°${this.currentUnit}`;
      }
    }

    // 2. Bağıl Nem Kartı
    this.dom.valHum.textContent = data.humidity;
    this.dom.humProgressBar.style.width = `${Math.min(100, Math.max(0, data.humidity))}%`;

    if (data.humidity < 30) {
      this.dom.humidityStatusBadge.textContent = 'Kuru';
      this.dom.humidityStatusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium';
    } else if (data.humidity > 60) {
      this.dom.humidityStatusBadge.textContent = 'Yüksek Nem';
      this.dom.humidityStatusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] border border-[#0b57d0]/20 font-medium';
    } else {
      this.dom.humidityStatusBadge.textContent = 'İdeal';
      this.dom.humidityStatusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] border border-[#0b57d0]/20 font-medium';
    }

    // 3. TÜRETİLMİŞ PARAMETRE: Hissedilen Sıcaklık Kartı
    if (data.apparentTemp != null) {
      let displayApparent = data.apparentTemp;
      if (this.currentUnit === 'F') {
        displayApparent = (data.apparentTemp * 9 / 5) + 32;
      }
      this.dom.valApparentTemp.textContent = displayApparent.toFixed(1);
      this.dom.lblApparentUnit.textContent = `°${this.currentUnit}`;

      const diff = data.apparentTemp - data.temperature;
      const sign = diff >= 0 ? '+' : '';
      this.dom.apparentDiffBadge.textContent = `Fark: ${sign}${diff.toFixed(1)}°C`;
      if (Math.abs(diff) < 0.5) {
        this.dom.apparentDiffBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-mono font-semibold';
      } else if (diff > 0) {
        this.dom.apparentDiffBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-mono font-semibold';
      } else {
        this.dom.apparentDiffBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] border border-[#0b57d0]/20 font-mono font-semibold';
      }
    }

    // 4. TÜRETİLMİŞ PARAMETRE: Çiğ Noktası (Dew Point) Kartı
    if (data.dewPoint != null) {
      let displayDew = data.dewPoint;
      if (this.currentUnit === 'F') {
        displayDew = (data.dewPoint * 9 / 5) + 32;
      }
      this.dom.valDewPointCard.textContent = displayDew.toFixed(1);
      this.dom.lblDewPointUnit.textContent = `°${this.currentUnit}`;

      const spread = data.temperature - data.dewPoint;
      if (spread <= 2.5) {
        this.dom.dewPointRiskBadge.textContent = 'Yoğuşma Riski!';
        this.dom.dewPointRiskBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-bold';
      } else if (data.dewPoint >= 21) {
        this.dom.dewPointRiskBadge.textContent = 'Baskıcı Nem';
        this.dom.dewPointRiskBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium';
      } else if (data.dewPoint >= 10 && data.dewPoint < 16) {
        this.dom.dewPointRiskBadge.textContent = 'Konforlu';
        this.dom.dewPointRiskBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] border border-[#0b57d0]/20 font-medium';
      } else if (data.dewPoint < 10) {
        this.dom.dewPointRiskBadge.textContent = 'Kuru Hava';
        this.dom.dewPointRiskBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20 font-medium';
      } else {
        this.dom.dewPointRiskBadge.textContent = 'Normal';
        this.dom.dewPointRiskBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 font-medium';
      }
    }

    // 5. TÜRETİLMİŞ PARAMETRE: Buhar Basıncı & VPD Kartı
    if (data.vaporPressure != null) {
      this.dom.valVaporPressure.textContent = data.vaporPressure.toFixed(1);
      this.dom.vpdBadge.textContent = `VPD: ${data.vpd != null ? data.vpd.toFixed(2) : '--'} kPa`;
      this.dom.valVpSat.textContent = `${data.vpSat != null ? data.vpSat.toFixed(1) : '--'} hPa`;
    }

    // 6. Pil & Donanım Kartı
    if (data.battery != null) {
      this.dom.valBattery.textContent = data.battery;
      this.dom.batteryProgressBar.style.width = `${Math.min(100, Math.max(0, data.battery))}%`;
      if (data.battery < 20) {
        this.dom.batteryProgressBar.className = 'h-full bg-rose-500 rounded-full transition-all duration-500';
      } else if (data.battery < 50) {
        this.dom.batteryProgressBar.className = 'h-full bg-amber-500 rounded-full transition-all duration-500';
      } else {
        this.dom.batteryProgressBar.className = 'h-full bg-[#0b57d0] dark:bg-[#a8c7fa] rounded-full transition-all duration-500';
      }
    }
    if (data.voltage != null) {
      this.dom.valVoltage.textContent = `${data.voltage.toFixed(2)} V`;
    }
    if (data.rssi != null) {
      if (this.dom.valRssi) this.dom.valRssi.textContent = `${data.rssi} dBm`;
      if (this.dom.signalRssiText) this.dom.signalRssiText.textContent = `${data.rssi} dBm`;
      if (this.dom.signalRssiTextMobile) this.dom.signalRssiTextMobile.textContent = `${data.rssi} dBm`;
      this.updateSignalBars(data.rssi);
    }

    if (this.dom.lastUpdatedAgo) {
      this.dom.lastUpdatedAgo.textContent = `• ${new Date().toLocaleTimeString('tr-TR')}`;
    }
  }

  updateStatsAndTable() {
    const list = this.storage.records;
    this.dom.totalPointsCount.textContent = list.length;

    if (list.length > 0) {
      const conv = (t) => this.currentUnit === 'F' ? (t * 9 / 5 + 32).toFixed(1) : t.toFixed(1);

      const temps = list.map(r => r.temperature);
      this.dom.tempMinMax.textContent = `${conv(Math.min(...temps))} / ${conv(Math.max(...temps))}`;

      const hums = list.map(r => r.humidity);
      this.dom.humMinMax.textContent = `%${Math.min(...hums)} / %${Math.max(...hums)}`;

      const apps = list.map(r => r.apparentTemp != null ? r.apparentTemp : r.temperature);
      this.dom.apparentMinMax.textContent = `${conv(Math.min(...apps))} / ${conv(Math.max(...apps))}`;

      const dews = list.map(r => r.dewPoint != null ? r.dewPoint : AtmosphericMetrics.calculateDewPoint(r.temperature, r.humidity));
      this.dom.dewPointMinMax.textContent = `${conv(Math.min(...dews))} / ${conv(Math.max(...dews))}`;

      if (list.length >= 3) {
        const last3 = list.slice(-3);
        const diff = last3[2].temperature - last3[0].temperature;
        if (diff > 0.2) {
          this.dom.tempTrendBadge.innerHTML = `<i data-lucide="trending-up" class="w-3 h-3 text-rose-500"></i><span class="text-rose-600 dark:text-rose-400">Yükseliyor</span>`;
        } else if (diff < -0.2) {
          this.dom.tempTrendBadge.innerHTML = `<i data-lucide="trending-down" class="w-3 h-3 text-cyan-500"></i><span class="text-cyan-600 dark:text-cyan-400">Düşüyor</span>`;
        } else {
          this.dom.tempTrendBadge.innerHTML = `<i data-lucide="minus" class="w-3 h-3 text-slate-400"></i><span>Dengeli</span>`;
        }
        lucide.createIcons();
      }
    }

    this.renderTable();
  }

  renderTable() {
    const list = this.storage.records;
    const total = list.length;
    this.dom.tableSummaryText.textContent = `${total} kayıt`;

    if (total === 0) {
      const emptyHtml = `
        <div class="py-8 text-center text-xs text-slate-400 dark:text-slate-500 font-sans">
          Henüz kayıt bulunmuyor. Cihazınıza bağlanarak ölçüm alabilirsiniz.
        </div>
      `;
      if (this.dom.mobileHistoryFeed) this.dom.mobileHistoryFeed.innerHTML = emptyHtml;
      if (this.dom.historyTableBody) {
        this.dom.historyTableBody.innerHTML = `
          <tr>
            <td colspan="8" class="py-8 text-center text-slate-400 dark:text-slate-500 font-sans">
              Henüz kayıt bulunmuyor. Cihazınıza bağlanarak ölçüm alabilirsiniz.
            </td>
          </tr>
        `;
      }
      this.dom.pageIndicator.textContent = '1 / 1';
      this.dom.btnPrevPage.disabled = true;
      this.dom.btnNextPage.disabled = true;
      return;
    }

    const maxPage = Math.ceil(total / this.pageSize) || 1;
    this.currentPage = Math.min(this.currentPage, maxPage);
    this.dom.pageIndicator.textContent = `${this.currentPage} / ${maxPage}`;
    this.dom.btnPrevPage.disabled = this.currentPage <= 1;
    this.dom.btnNextPage.disabled = this.currentPage >= maxPage;

    const reversed = [...list].reverse();
    const start = (this.currentPage - 1) * this.pageSize;
    const pageItems = reversed.slice(start, start + this.pageSize);

    // 1. Akıllı Telefonlar İçin Mobil Kart Beslemesi (Mobile Feed)
    if (this.dom.mobileHistoryFeed) {
      this.dom.mobileHistoryFeed.innerHTML = pageItems.map(item => {
        const d = new Date(item.timestamp);
        const timeStr = `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
        const typeBadge = item.type === 'history_hour'
          ? '<span class="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 text-[10px] font-sans font-medium">Hafıza</span>'
          : (item.source === 'ble_adv'
            ? '<span class="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20 text-[10px] font-sans font-medium">BLE Sinyal</span>'
            : '<span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-sans font-medium">GATT Canlı</span>');

        let t = item.temperature;
        let at = item.apparentTemp != null ? item.apparentTemp : t;
        let dp = item.dewPoint != null ? item.dewPoint : AtmosphericMetrics.calculateDewPoint(t, item.humidity);
        if (this.currentUnit === 'F') {
          t = (t * 9 / 5) + 32;
          at = (at * 9 / 5) + 32;
          dp = (dp * 9 / 5) + 32;
        }

        const vp = item.vaporPressure != null ? item.vaporPressure : AtmosphericMetrics.calculateVaporPressure(item.temperature, item.humidity).vpAct;

        return `
          <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-2.5 transition-all">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-slate-500 dark:text-slate-400">${timeStr}</span>
              ${typeBadge}
            </div>

            <!-- Parametre Satırı 1: Sıcaklık & Hissedilen -->
            <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/50">
              <div>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-sans">Sıcaklık</span>
                <div class="flex items-baseline gap-1">
                  <span class="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">${t.toFixed(1)}</span>
                  <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">°${this.currentUnit}</span>
                </div>
              </div>
              <div>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-sans">Hissedilen</span>
                <div class="flex items-baseline gap-1">
                  <span class="text-xl font-extrabold font-mono text-amber-500 dark:text-amber-400">${at.toFixed(1)}</span>
                  <span class="text-xs font-bold text-amber-500 dark:text-amber-400">°${this.currentUnit}</span>
                </div>
              </div>
            </div>

            <!-- Parametre Satırı 2: Bağıl Nem & Buhar Basıncı -->
            <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/50">
              <div>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-sans">Bağıl Nem</span>
                <div class="flex items-baseline gap-1">
                  <span class="text-xl font-extrabold font-mono text-cyan-600 dark:text-cyan-400">%${item.humidity}</span>
                </div>
              </div>
              <div>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-sans">Buhar Basıncı</span>
                <div class="flex items-baseline gap-1">
                  <span class="text-xl font-extrabold font-mono text-indigo-600 dark:text-indigo-400">${vp.toFixed(1)}</span>
                  <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400">hPa</span>
                </div>
              </div>
            </div>

            <!-- Alt Detay Çubuğu: Çiğ Noktası ve Pil -->
            <div class="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-200/80 dark:border-slate-700/60 text-slate-500 dark:text-slate-400">
              <span>Çiğ Noktası: <strong class="text-purple-600 dark:text-purple-400 font-mono">${dp.toFixed(1)} °${this.currentUnit}</strong></span>
              <span>Pil: <strong class="text-slate-700 dark:text-slate-300 font-mono">${item.battery != null ? `%${item.battery}` : (item.voltage ? `${item.voltage}V` : '--')}</strong></span>
            </div>
          </div>
        `;
      }).join('');
    }

    // 2. Masaüstü Tablosu (Desktop Table View - 8 Sütunlu)
    if (this.dom.historyTableBody) {
      this.dom.historyTableBody.innerHTML = pageItems.map(item => {
        const d = new Date(item.timestamp);
        const timeStr = `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        const typeBadge = item.type === 'history_hour'
          ? '<span class="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 text-[10px] font-sans font-medium">Hafıza</span>'
          : (item.source === 'ble_adv'
            ? '<span class="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20 text-[10px] font-sans font-medium">BLE Sinyal</span>'
            : '<span class="px-2.5 py-0.5 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] border border-[#0b57d0]/20 text-[10px] font-sans font-medium">GATT Canlı</span>');

        let t = item.temperature;
        let at = item.apparentTemp != null ? item.apparentTemp : t;
        let dp = item.dewPoint != null ? item.dewPoint : AtmosphericMetrics.calculateDewPoint(t, item.humidity);
        if (this.currentUnit === 'F') {
          t = (t * 9 / 5) + 32;
          at = (at * 9 / 5) + 32;
          dp = (dp * 9 / 5) + 32;
        }

        const vp = item.vaporPressure != null ? item.vaporPressure : AtmosphericMetrics.calculateVaporPressure(item.temperature, item.humidity).vpAct;

        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
            <td class="py-2.5 sm:py-3 px-3 text-slate-600 dark:text-slate-300 font-sans font-medium">${timeStr}</td>
            <td class="py-2.5 sm:py-3 px-3">${typeBadge}</td>
            <td class="py-2.5 sm:py-3 px-3 font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
              ${t.toFixed(1)} °${this.currentUnit}
            </td>
            <td class="py-2.5 sm:py-3 px-3 font-semibold text-amber-500 dark:text-amber-400">
              ${at.toFixed(1)} °${this.currentUnit}
            </td>
            <td class="py-2.5 sm:py-3 px-3 text-cyan-600 dark:text-cyan-400 font-semibold">%${item.humidity}</td>
            <td class="py-2.5 sm:py-3 px-3 text-purple-600 dark:text-purple-400 font-medium">
              ${dp.toFixed(1)} °${this.currentUnit}
            </td>
            <td class="py-2.5 sm:py-3 px-3 text-indigo-600 dark:text-indigo-400 font-medium">
              ${vp.toFixed(1)} hPa
            </td>
            <td class="py-2.5 sm:py-3 px-3 text-slate-500 dark:text-slate-400">
              ${item.battery != null ? `%${item.battery}` : (item.voltage ? `${item.voltage}V` : '--')}
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  initChart() {
    const ctx = document.getElementById('telemetryChart').getContext('2d');
    const isDark = this.currentTheme === 'dark';
    const isMobile = window.innerWidth < 640;

    // Google Material 3 Blue Gradient for Temperature
    const tempGradient = ctx.createLinearGradient(0, 0, 0, 320);
    tempGradient.addColorStop(0, isDark ? 'rgba(11, 87, 208, 0.35)' : 'rgba(11, 87, 208, 0.16)');
    tempGradient.addColorStop(1, 'rgba(11, 87, 208, 0.0)');

    // Soft Cyan Gradient for Humidity
    const humGradient = ctx.createLinearGradient(0, 0, 0, 320);
    humGradient.addColorStop(0, isDark ? 'rgba(2, 132, 199, 0.28)' : 'rgba(2, 132, 199, 0.14)');
    humGradient.addColorStop(1, 'rgba(2, 132, 199, 0.0)');

    // Deep Indigo Gradient for Vapor Pressure
    const pressGradient = ctx.createLinearGradient(0, 0, 0, 320);
    pressGradient.addColorStop(0, isDark ? 'rgba(30, 64, 175, 0.25)' : 'rgba(30, 64, 175, 0.12)');
    pressGradient.addColorStop(1, 'rgba(30, 64, 175, 0.0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            // 0: Ortam Sıcaklığı (°C) - Google Material 3 Blue Primary
            label: 'Ortam Sıcaklığı',
            data: [],
            borderColor: '#0b57d0',
            backgroundColor: tempGradient,
            borderWidth: isMobile ? 2.2 : 2.8,
            fill: true,
            tension: 0.38,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#0b57d0',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2,
            yAxisID: 'yTemp'
          },
          {
            // 1: Hissedilen Sıcaklık (°C) - M3 Amber/Orange (Dashed)
            label: 'Hissedilen Sıcaklık',
            data: [],
            borderColor: '#ea580c',
            backgroundColor: 'transparent',
            borderWidth: isMobile ? 1.8 : 2.2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.38,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#ea580c',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2,
            yAxisID: 'yTemp'
          },
          {
            // 2: Çiğ Noktası (°C) - M3 Purple/Violet (Dotted)
            label: 'Çiğ Noktası',
            data: [],
            borderColor: '#7c3aed',
            backgroundColor: 'transparent',
            borderWidth: isMobile ? 1.8 : 2.2,
            borderDash: [2, 3],
            fill: false,
            tension: 0.38,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#7c3aed',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2,
            yAxisID: 'yTemp'
          },
          {
            // 3: Bağıl Nem (%) - Sky Cyan Blue
            label: 'Bağıl Nem',
            data: [],
            borderColor: '#0284c7',
            backgroundColor: humGradient,
            borderWidth: isMobile ? 2.2 : 2.8,
            fill: true,
            tension: 0.38,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#0284c7',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2,
            yAxisID: 'yHum'
          },
          {
            // 4: Buhar Basıncı (hPa) - M3 Deep Indigo Blue
            label: 'Buhar Basıncı',
            data: [],
            borderColor: '#1e40af',
            backgroundColor: pressGradient,
            borderWidth: isMobile ? 2.0 : 2.4,
            fill: true,
            tension: 0.38,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#1e40af',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2,
            yAxisID: 'yPress'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 350,
          easing: 'easeOutQuart'
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: isDark ? '#94a3b8' : '#475569',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 7,
              boxHeight: 7,
              padding: isMobile ? 8 : 14
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: isDark ? 'rgba(12, 19, 28, 0.95)' : 'rgba(255, 255, 255, 0.97)',
            borderColor: isDark ? 'rgba(168, 199, 250, 0.25)' : 'rgba(11, 87, 208, 0.2)',
            borderWidth: 1.5,
            titleColor: isDark ? '#f8fafd' : '#041e49',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            footerColor: isDark ? '#a8c7fa' : '#0b57d0',
            padding: 12,
            boxPadding: 5,
            cornerRadius: 16,
            bodyFont: { family: 'Parkinsans', size: 11, weight: 500 },
            titleFont: { family: 'Parkinsans', size: 12, weight: '700' },
            footerFont: { family: 'Parkinsans', size: 11, weight: '600' },
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (val == null) return null;
                const unit = context.dataset.yAxisID === 'yTemp'
                  ? `°${this.currentUnit}`
                  : (context.dataset.yAxisID === 'yHum' ? '%' : ' hPa');
                return ` ${label}: ${Number(val).toFixed(1)} ${unit}`;
              },
              footer: (items) => {
                if (!items || items.length === 0) return '';
                const tempItem = items.find(i => i.datasetIndex === 0 && !i.dataset.hidden);
                const dewItem = items.find(i => i.datasetIndex === 2 && !i.dataset.hidden);
                const appItem = items.find(i => i.datasetIndex === 1 && !i.dataset.hidden);
                const notes = [];
                if (tempItem && dewItem) {
                  const spread = tempItem.parsed.y - dewItem.parsed.y;
                  if (spread <= 2.5) {
                    notes.push('⚠️ Yoğuşma / Rutubet Riski!');
                  } else if (spread >= 8) {
                    notes.push('💧 Düşük Yoğuşma Riski');
                  }
                }
                if (tempItem && appItem) {
                  const diff = appItem.parsed.y - tempItem.parsed.y;
                  if (Math.abs(diff) >= 1.0) {
                    notes.push(`🌡️ Hissedilen Farkı: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}°${this.currentUnit}`);
                  }
                }
                return notes.join(' | ');
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
              drawBorder: false
            },
            ticks: {
              color: isDark ? '#64748b' : '#94a3b8',
              font: { family: 'Parkinsans', size: isMobile ? 9 : 10, weight: 500 },
              maxTicksLimit: isMobile ? 4 : 7
            }
          },
          yTemp: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: !isMobile,
              text: `Sıcaklık Grubu (°${this.currentUnit})`,
              color: '#0b57d0',
              font: { family: 'Parkinsans', size: 11, weight: 600 }
            },
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
              drawBorder: false
            },
            ticks: {
              color: isDark ? '#a8c7fa' : '#0b57d0',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              callback: (v) => `${v.toFixed(1)}°`
            }
          },
          yHum: {
            type: 'linear',
            display: false,
            position: 'right',
            title: {
              display: !isMobile,
              text: 'Bağıl Nem (%)',
              color: '#0284c7',
              font: { family: 'Parkinsans', size: 11, weight: 600 }
            },
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#0284c7',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              callback: (v) => `%${v}`
            },
            min: 0,
            max: 100
          },
          yPress: {
            type: 'linear',
            display: false,
            position: 'right',
            title: {
              display: !isMobile,
              text: 'Buhar Basıncı (hPa)',
              color: '#1e40af',
              font: { family: 'Parkinsans', size: 11, weight: 600 }
            },
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#1e40af',
              font: { family: 'Parkinsans', size: isMobile ? 9 : 10, weight: 600 },
              callback: (v) => `${v.toFixed(1)} hPa`
            }
          }
        }
      }
    });
  }

  adaptChartTheme() {
    if (!this.chart) return;
    const isDark = this.currentTheme === 'dark';

    this.chart.options.plugins.legend.labels.color = isDark ? '#94a3b8' : '#475569';
    this.chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(12, 19, 28, 0.95)' : 'rgba(255, 255, 255, 0.97)';
    this.chart.options.plugins.tooltip.borderColor = isDark ? 'rgba(168, 199, 250, 0.25)' : 'rgba(11, 87, 208, 0.2)';
    this.chart.options.plugins.tooltip.titleColor = isDark ? '#f8fafd' : '#041e49';
    this.chart.options.plugins.tooltip.bodyColor = isDark ? '#cbd5e1' : '#334155';
    this.chart.options.plugins.tooltip.footerColor = isDark ? '#a8c7fa' : '#0b57d0';

    this.chart.options.scales.x.grid.color = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)';
    this.chart.options.scales.yTemp.grid.color = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    this.chart.update('none');
  }

  updateChart() {
    if (!this.chart) return;

    let records = [...this.storage.records];
    const now = Date.now();

    if (this.chartRange === '1h') {
      records = records.filter(r => (now - r.timestamp) <= 3600 * 1000);
    } else if (this.chartRange === '24h') {
      records = records.filter(r => (now - r.timestamp) <= 24 * 3600 * 1000);
    } else if (this.chartRange === '7d') {
      records = records.filter(r => (now - r.timestamp) <= 7 * 24 * 3600 * 1000);
    }

    // Akıllı Yedekleme 1: Filtrelenen aralıkta kayıt kalmadıysa ama veritabanında geçmiş veri varsa tümünü kullan
    if (records.length === 0 && this.storage.records.length > 0) {
      records = [...this.storage.records];
    }

    // Akıllı Yedekleme 2: Veritabanında henüz kayıt yoksa ama canlı telemetri okunduysa onu tek nokta olarak kullan
    if (records.length === 0 && this.latestTelemetry) {
      records = [this.latestTelemetry];
    }

    // Toggle Empty State Overlay
    if (this.dom.chartEmptyOverlay) {
      if (records.length === 0) {
        this.dom.chartEmptyOverlay.classList.remove('hidden');
        this.dom.chartEmptyOverlay.classList.add('flex');
      } else {
        this.dom.chartEmptyOverlay.classList.add('hidden');
        this.dom.chartEmptyOverlay.classList.remove('flex');
      }
    }

    if (records.length === 0) {
      if (this.dom.chartKpiCurrent) this.dom.chartKpiCurrent.textContent = '--.-';
      if (this.dom.chartKpiCurrentUnit) this.dom.chartKpiCurrentUnit.textContent = `°${this.currentUnit}`;
      if (this.dom.chartKpiMin) this.dom.chartKpiMin.textContent = '--.-';
      if (this.dom.chartKpiMinTime) this.dom.chartKpiMinTime.textContent = '--:--';
      if (this.dom.chartKpiMax) this.dom.chartKpiMax.textContent = '--.-';
      if (this.dom.chartKpiMaxTime) this.dom.chartKpiMaxTime.textContent = '--:--';
      if (this.dom.chartKpiAvg) this.dom.chartKpiAvg.textContent = '--.-';
      if (this.dom.chartKpiCount) this.dom.chartKpiCount.textContent = '0 nokta';

      this.chart.data.labels = [];
      this.chart.data.datasets.forEach(ds => { ds.data = []; });
      this.chart.update('none');
      return;
    }

    // Nokta sayısı azken (<= 4) tek noktaların grafikte görünür olması için pointRadius'u dinamik ayarla
    const pRadius = records.length <= 4 ? 4.5 : 0;
    this.chart.data.datasets.forEach(ds => {
      ds.pointRadius = pRadius;
    });

    if (records.length > 300) {
      const step = Math.ceil(records.length / 300);
      records = records.filter((_, idx) => idx % step === 0 || idx === records.length - 1);
    }

    const isMobile = window.innerWidth < 640;
    const labels = records.map(r => {
      const d = new Date(r.timestamp);
      return (this.chartRange === '1h' || records.length <= 5)
        ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: isMobile ? 'numeric' : 'short' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    });

    const tempData = records.map(r => {
      return this.currentUnit === 'F' ? (r.temperature * 9 / 5) + 32 : r.temperature;
    });

    const apparentData = records.map(r => {
      const at = r.apparentTemp != null ? r.apparentTemp : AtmosphericMetrics.calculateApparentTemp(r.temperature, r.humidity);
      return this.currentUnit === 'F' ? (at * 9 / 5) + 32 : at;
    });

    const dewData = records.map(r => {
      const dp = r.dewPoint != null ? r.dewPoint : AtmosphericMetrics.calculateDewPoint(r.temperature, r.humidity);
      return this.currentUnit === 'F' ? (dp * 9 / 5) + 32 : dp;
    });

    const humData = records.map(r => r.humidity);

    const pressData = records.map(r => {
      return r.vaporPressure != null ? r.vaporPressure : AtmosphericMetrics.calculateVaporPressure(r.temperature, r.humidity).vpAct;
    });

    this.chart.data.labels = labels;

    this.chart.data.datasets[0].label = `Ortam Sıcaklığı (°${this.currentUnit})`;
    this.chart.data.datasets[0].data = tempData;

    this.chart.data.datasets[1].label = `Hissedilen (°${this.currentUnit})`;
    this.chart.data.datasets[1].data = apparentData;

    this.chart.data.datasets[2].label = `Çiğ Noktası (°${this.currentUnit})`;
    this.chart.data.datasets[2].data = dewData;

    this.chart.data.datasets[3].label = `Bağıl Nem (%)`;
    this.chart.data.datasets[3].data = humData;

    this.chart.data.datasets[4].label = `Buhar Basıncı (hPa)`;
    this.chart.data.datasets[4].data = pressData;

    const ds = this.chart.data.datasets;
    const scales = this.chart.options.scales;

    const formatClock = (ts) => {
      const d = new Date(ts);
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    };

    // Helper to populate the 4 Material 3 Live KPI Cards
    const setKpiCards = (arr, unit, isPercentage = false) => {
      if (!arr || arr.length === 0) return;
      const current = arr[arr.length - 1];
      const minVal = Math.min(...arr);
      const minIdx = arr.indexOf(minVal);
      const minTime = formatClock(records[minIdx] ? records[minIdx].timestamp : Date.now());

      const maxVal = Math.max(...arr);
      const maxIdx = arr.lastIndexOf(maxVal);
      const maxTime = formatClock(records[maxIdx] ? records[maxIdx].timestamp : Date.now());

      const sum = arr.reduce((a, b) => a + b, 0);
      const avg = isPercentage ? Math.round(sum / arr.length) : (sum / arr.length).toFixed(1);

      if (this.dom.chartKpiCurrent) this.dom.chartKpiCurrent.textContent = isPercentage ? current : Number(current).toFixed(1);
      if (this.dom.chartKpiCurrentUnit) this.dom.chartKpiCurrentUnit.textContent = unit;

      if (this.dom.chartKpiMin) this.dom.chartKpiMin.textContent = isPercentage ? minVal : Number(minVal).toFixed(1);
      if (this.dom.chartKpiMinTime) this.dom.chartKpiMinTime.textContent = minTime;

      if (this.dom.chartKpiMax) this.dom.chartKpiMax.textContent = isPercentage ? maxVal : Number(maxVal).toFixed(1);
      if (this.dom.chartKpiMaxTime) this.dom.chartKpiMaxTime.textContent = maxTime;

      if (this.dom.chartKpiAvg) this.dom.chartKpiAvg.textContent = avg;
      if (this.dom.chartKpiCount) this.dom.chartKpiCount.textContent = `${records.length} nokta`;
    };

    // Mode-Specific Dataset & Scale Visibility + Auto-scaling
    if (this.chartMode === 'temps') {
      // Sıcaklık Grubu: Ortam, Hissedilen ve Çiğ Noktası aynı °C ekseninde
      ds[0].hidden = false;
      ds[1].hidden = false;
      ds[2].hidden = false;
      ds[3].hidden = true;
      ds[4].hidden = true;

      scales.yTemp.display = true;
      scales.yHum.display = false;
      scales.yPress.display = false;

      const allTemps = [...tempData, ...apparentData, ...dewData];
      const minT = Math.min(...allTemps);
      const maxT = Math.max(...allTemps);
      const pad = Math.max(0.8, (maxT - minT) * 0.12);
      scales.yTemp.min = Math.floor((minT - pad) * 2) / 2;
      scales.yTemp.max = Math.ceil((maxT + pad) * 2) / 2;

      setKpiCards(tempData, `°${this.currentUnit}`);
    } else if (this.chartMode === 'hum') {
      // Bağıl Nem %
      ds[0].hidden = true;
      ds[1].hidden = true;
      ds[2].hidden = true;
      ds[3].hidden = false;
      ds[4].hidden = true;

      scales.yTemp.display = false;
      scales.yHum.display = true;
      scales.yPress.display = false;

      const minH = Math.min(...humData);
      const maxH = Math.max(...humData);
      scales.yHum.min = Math.max(0, Math.floor((minH - 5) / 5) * 5);
      scales.yHum.max = Math.min(100, Math.ceil((maxH + 5) / 5) * 5);

      setKpiCards(humData, '%', true);
    } else if (this.chartMode === 'press') {
      // Buhar Basıncı hPa
      ds[0].hidden = true;
      ds[1].hidden = true;
      ds[2].hidden = true;
      ds[3].hidden = true;
      ds[4].hidden = false;

      scales.yTemp.display = false;
      scales.yHum.display = false;
      scales.yPress.display = true;

      const minP = Math.min(...pressData);
      const maxP = Math.max(...pressData);
      const padP = Math.max(0.5, (maxP - minP) * 0.15);
      scales.yPress.min = Math.max(0, Math.floor((minP - padP) * 2) / 2);
      scales.yPress.max = Math.ceil((maxP + padP) * 2) / 2;

      setKpiCards(pressData, 'hPa');
    } else {
      // Tüm Parametreler
      ds[0].hidden = false;
      ds[1].hidden = false;
      ds[2].hidden = false;
      ds[3].hidden = false;
      ds[4].hidden = false;

      scales.yTemp.display = true;
      scales.yHum.display = true;
      scales.yPress.display = false;

      const minT = Math.min(...tempData);
      const maxT = Math.max(...tempData);
      const pad = Math.max(0.8, (maxT - minT) * 0.12);
      scales.yTemp.min = Math.floor((minT - pad) * 2) / 2;
      scales.yTemp.max = Math.ceil((maxT + pad) * 2) / 2;
      scales.yHum.min = 0;
      scales.yHum.max = 100;

      setKpiCards(tempData, `°${this.currentUnit}`);
    }

    scales.yTemp.title.text = `Sıcaklık Grubu (°${this.currentUnit})`;

    this.chart.update('none');
  }

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = {
      success: 'bg-[#0b57d0] text-white dark:bg-[#1b2b48] dark:border-[#a8c7fa]/30 dark:text-[#d3e3fd] border border-[#0b57d0]/20 shadow-[#0b57d0]/20',
      error: 'bg-[#ba1a1a] text-white dark:bg-[#410002] dark:border-[#ffb4ab]/30 dark:text-[#ffdad6] border border-[#ba1a1a]/20 shadow-rose-500/20',
      info: 'bg-[#041e49] text-white dark:bg-[#141d2b] dark:border-slate-700/60 dark:text-[#d3e3fd] border border-[#0b57d0]/20 shadow-blue-500/20'
    };
    toast.className = `px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2.5 text-xs sm:text-sm font-semibold toast-animate ${colors[type] || colors.info}`;
    toast.innerHTML = `
      <span class="w-2 h-2 rounded-full ${type === 'success' ? 'bg-[#a8c7fa]' : type === 'error' ? 'bg-[#ffb4ab]' : 'bg-[#a8c7fa]'} flex-shrink-0"></span>
      <span>${message}</span>
    `;
    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
  // ==========================================
  // GELİŞTİRİCİ SEÇENEKLERİ (DEVELOPER OPTIONS)
  // ATC / PVVX TELINK FIRMWARE GATT CONTROLLER
  // ==========================================

  initDeveloperOptions() {
    // 1. Modal Açma / Kapatma Olayları
    if (this.dom.btnOpenDevOptions) {
      this.dom.btnOpenDevOptions.addEventListener('click', () => this.openDevModal());
    }
    if (this.dom.btnOpenDevOptionsMobile) {
      this.dom.btnOpenDevOptionsMobile.addEventListener('click', () => this.openDevModal());
    }
    if (this.dom.btnCloseDevModal) {
      this.dom.btnCloseDevModal.addEventListener('click', () => this.closeDevModal());
    }
    if (this.dom.btnCloseDevModalBottom) {
      this.dom.btnCloseDevModalBottom.addEventListener('click', () => this.closeDevModal());
    }

    if (this.dom.devOptionsModal) {
      this.dom.devOptionsModal.addEventListener('click', (e) => {
        if (e.target === this.dom.devOptionsModal) {
          this.closeDevModal();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.dom.devOptionsModal.classList.contains('hidden')) {
          this.closeDevModal();
        }
      });
    }

    // 2. BLE ATC Yanıt Dinleyicisi
    this.ble.onDevPacket = (dataView) => {
      this.handleIncomingDevPacket(dataView);
    };

    // 3. Hafızadan Kayıtlı Ayarları Yükle
    this.loadDevSettingsFromStorage();

    // 4. Otomatik Devreye Alma (Auto-Apply) Olaylarını Bağla
    this.setupDevAutoApply();

    // 5. İşlem Butonlarını ve Hızlı Komutları Bağla
    this.setupDevActionButtons();

    // 6. Dinamik Hesaplama Etiketlerini Güncelle
    this.updateMeasureIntervalLabel();
  }

  openDevModal() {
    if (!this.dom.devOptionsModal) return;
    this.dom.devOptionsModal.classList.remove('hidden');
    this.dom.devOptionsModal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    lucide.createIcons();
    this.updateMeasureIntervalLabel();

    // Bağlı ise cihazdan güncel ayarları oku
    if (this.ble.isConnected) {
      this.devReadConfigFromDevice();
    }
  }

  closeDevModal() {
    if (!this.dom.devOptionsModal) return;
    this.dom.devOptionsModal.classList.add('hidden');
    this.dom.devOptionsModal.classList.remove('flex');
    document.body.style.overflow = '';
  }

  logDevTerminal(message, type = 'info') {
    if (!this.dom.devCmdTerminal) return;
    const line = document.createElement('div');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

    let colorCls = 'text-slate-400';
    let prefix = 'ℹ️';
    if (type === 'tx') {
      colorCls = 'text-cyan-400 font-bold';
      prefix = '📤 [TX]';
    } else if (type === 'rx') {
      colorCls = 'text-emerald-400 font-bold';
      prefix = '📥 [RX]';
    } else if (type === 'warn') {
      colorCls = 'text-amber-400';
      prefix = '⚠️';
    } else if (type === 'error') {
      colorCls = 'text-rose-400 font-bold';
      prefix = '❌';
    }

    line.className = `py-0.5 break-all ${colorCls}`;
    line.textContent = `[${timeStr}] ${prefix} ${message}`;
    this.dom.devCmdTerminal.appendChild(line);

    this.dom.devCmdTerminal.scrollTop = this.dom.devCmdTerminal.scrollHeight;

    while (this.dom.devCmdTerminal.children.length > 150) {
      this.dom.devCmdTerminal.removeChild(this.dom.devCmdTerminal.children[1]);
    }
  }

  async sendDevPacket(packet, title = 'Komut') {
    const hex = Array.from(packet).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    this.logDevTerminal(`${title}: ${hex}`, 'tx');

    this.saveDevSettingsToStorage();

    if (!this.ble.isConnected) {
      this.logDevTerminal(`Cihaz bağlı değil. Ayar hafızaya kaydedildi, bağlantı sağlandığında sensöre aktarılacak.`, 'warn');
      this.showToast(`💾 ${title} kaydedildi. Cihaza bağlanınca uygulanacak.`, 'info');
      return false;
    }

    try {
      await this.ble.sendAtcCommand(packet);
      this.showToast(`⚡ ${title} sensörde devreye alındı!`, 'success');
      return true;
    } catch (err) {
      this.logDevTerminal(`Gönderme hatası: ${err.message}`, 'error');
      this.showToast(`Hata: ${err.message}`, 'error');
      return false;
    }
  }

  packCustomConfig() {
    const advType = parseInt(document.getElementById('dev_cfg_adv_type')?.value || '1', 10);
    const comfort = document.getElementById('dev_cfg_comfort')?.checked ? 1 : 0;
    const clock = document.getElementById('dev_cfg_clock')?.checked ? 1 : 0;
    const tempUnit = parseInt(document.getElementById('dev_cfg_temp_unit')?.value || '0', 10);
    const showBatt = document.getElementById('dev_cfg_show_batt')?.checked ? 1 : 0;
    const txMeas = document.getElementById('dev_cfg_tx_meas')?.checked ? 1 : 0;
    const lpMeas = document.getElementById('dev_cfg_lp_meas')?.checked ? 1 : 0;

    const flg = (advType & 0x03) |
                (comfort ? 0x04 : 0) |
                (clock ? 0x08 : 0) |
                (tempUnit ? 0x10 : 0) |
                (showBatt ? 0x20 : 0) |
                (txMeas ? 0x40 : 0) |
                (lpMeas ? 0x80 : 0);

    const smiley = parseInt(document.getElementById('dev_ext_smiley')?.value || '0', 10);
    const advCrypto = document.getElementById('dev_cfg_adv_crypto')?.checked ? 1 : 0;
    const advFlags = document.getElementById('dev_cfg_adv_flags')?.checked ? 1 : 0;
    const bt5Flags = document.getElementById('dev_cfg_bt5_flags')?.checked ? 1 : 0;
    const longrange = document.getElementById('dev_cfg_longrange')?.checked ? 1 : 0;
    const screenOff = document.getElementById('dev_cfg_scr_off')?.checked ? 1 : 0;

    const flg2 = (smiley & 0x07) |
                 (advCrypto ? 0x08 : 0) |
                 (advFlags ? 0x10 : 0) |
                 (bt5Flags ? 0x20 : 0) |
                 (longrange ? 0x40 : 0) |
                 (screenOff ? 0x80 : 0);

    const tempOffset = 0;
    const humiOffset = 0;

    const advIntervalMs = parseFloat(document.getElementById('dev_cfg_adv_interval')?.value || '1000.0');
    const advIntRaw = Math.max(16, Math.min(65535, Math.round(advIntervalMs / 0.625)));

    const measureInterval = parseInt(document.getElementById('dev_cfg_measure_interval')?.value || '2', 10);
    const rfTxPower = parseInt(document.getElementById('dev_cfg_rf_tx_power')?.value || '63', 10);

    const connLatMs = parseInt(document.getElementById('dev_cfg_connect_latency')?.value || '1000', 10);
    const connLatRaw = Math.max(1, Math.min(65535, Math.round(connLatMs / 1.25)));

    const lcdRefreshSec = parseFloat(document.getElementById('dev_cfg_lcd_refresh')?.value || '2.45');
    const lcdRefreshRaw = Math.max(10, Math.min(255, Math.round(lcdRefreshSec / 0.05)));

    const averaging = parseInt(document.getElementById('dev_cfg_averaging')?.value || '1', 10);
    const advDelay = parseInt(document.getElementById('dev_cfg_adv_delay')?.value || '10', 10);
    const eventAdvCnt = parseInt(document.getElementById('dev_cfg_event_adv_cnt')?.value || '6', 10);

    return new Uint8Array([
      0x55,
      flg,
      flg2,
      tempOffset & 0xff,
      humiOffset & 0xff,
      advIntRaw & 0xff,
      (advIntRaw >> 8) & 0xff,
      measureInterval & 0xff,
      rfTxPower & 0xff,
      connLatRaw & 0xff,
      (connLatRaw >> 8) & 0xff,
      lcdRefreshRaw & 0xff,
      averaging & 0xff,
      advDelay & 0xff,
      eventAdvCnt & 0xff
    ]);
  }

  packComfortConfig() {
    const loT = Math.round((parseFloat(document.getElementById('dev_cmf_temp_lo')?.value || '21.0')) * 100);
    const hiT = Math.round((parseFloat(document.getElementById('dev_cmf_temp_hi')?.value || '26.0')) * 100);
    const loH = Math.round((parseFloat(document.getElementById('dev_cmf_hum_lo')?.value || '30.0')) * 100);
    const hiH = Math.round((parseFloat(document.getElementById('dev_cmf_hum_hi')?.value || '60.0')) * 100);

    const packet = new Uint8Array(9);
    const dv = new DataView(packet.buffer);
    dv.setUint8(0, 0x20);
    dv.setInt16(1, loT, true);
    dv.setInt16(3, hiT, true);
    dv.setInt16(5, loH, true);
    dv.setInt16(7, hiH, true);
    return packet;
  }

  packSensorConfig() {
    const tk = parseFloat(document.getElementById('dev_sens_temp_k')?.value || '1.0');
    const tz = Math.round((parseFloat(document.getElementById('dev_sens_temp_z')?.value || '0.0')) * 100);
    const hk = parseFloat(document.getElementById('dev_sens_hum_k')?.value || '1.0');
    const hz = Math.round((parseFloat(document.getElementById('dev_sens_hum_z')?.value || '0.0')) * 100);

    const packet = new Uint8Array(13);
    const dv = new DataView(packet.buffer);
    dv.setUint8(0, 0x25);
    dv.setFloat32(1, tk, true);
    dv.setFloat32(5, hk, true);
    dv.setInt16(9, tz, true);
    dv.setInt16(11, hz, true);
    return packet;
  }

  packTimeDeltaConfig() {
    const delta = parseInt(document.getElementById('dev_sens_time_delta')?.value || '0', 10);
    const packet = new Uint8Array(3);
    const dv = new DataView(packet.buffer);
    dv.setUint8(0, 0x24);
    dv.setInt16(1, delta, true);
    return packet;
  }

  packTimeStampConfig() {
    const interval = parseInt(document.getElementById('dev_ts_interval')?.value || '0', 10);
    const macStr = (document.getElementById('dev_ts_mac')?.value || '').replace(/[^0-9A-Fa-f]/g, '');
    const macBytes = [];
    for (let i = 0; i < 12; i += 2) {
      macBytes.push(parseInt(macStr.substr(i, 2), 16) || 0);
    }
    const packet = new Uint8Array(9);
    const dv = new DataView(packet.buffer);
    dv.setUint8(0, 0x26);
    dv.setUint16(1, interval, true);
    for (let i = 0; i < 6; i++) {
      dv.setUint8(3 + i, macBytes[5 - i] || 0);
    }
    return packet;
  }

  packTrgConfig() {
    const tHyst = Math.round((parseFloat(document.getElementById('dev_trg_temp_hyst')?.value || '-0.55')) * 100);
    const tThr = Math.round((parseFloat(document.getElementById('dev_trg_temp_thresh')?.value || '21.0')) * 100);
    const hHyst = Math.round((parseFloat(document.getElementById('dev_trg_hum_hyst')?.value || '0.0')) * 100);
    const hThr = Math.round((parseFloat(document.getElementById('dev_trg_hum_thresh')?.value || '50.0')) * 100);
    const rsMode = parseInt(document.getElementById('dev_rs_mode')?.value || '0', 10);
    const rsInvert = document.getElementById('dev_rs_invert')?.checked ? 1 : 0;
    const rsInterval = parseInt(document.getElementById('dev_rs_interval')?.value || '3600', 10);

    const packet = new Uint8Array(12);
    const dv = new DataView(packet.buffer);
    dv.setUint8(0, 0x44);
    dv.setInt16(1, tHyst, true);
    dv.setInt16(3, tThr, true);
    dv.setInt16(5, hHyst, true);
    dv.setInt16(7, hThr, true);
    dv.setUint16(9, rsInterval, true);
    dv.setUint8(11, (rsMode & 0x01) | (rsInvert ? 0x02 : 0));
    return packet;
  }

  packScreenShow() {
    const bigNumStr = (document.getElementById('dev_ext_bignumb')?.value || '123.4').trim();
    const smalNumStr = (document.getElementById('dev_ext_smalnumb')?.value || '99').trim();
    const bigNum = Math.round((parseFloat(bigNumStr) || 0) * 10);
    const smalNum = Math.round(parseFloat(smalNumStr) || 0);
    const durSec = parseInt(document.getElementById('dev_ext_duration')?.value || '600', 10);

    const smb = parseInt(document.getElementById('dev_ext_tmpsmb')?.value || '6', 10);
    const smi = parseInt(document.getElementById('dev_ext_smiley')?.value || '7', 10);
    const pct = document.getElementById('dev_ext_percent')?.checked ? 1 : 0;
    const bat = document.getElementById('dev_ext_battery')?.checked ? 1 : 0;

    const cfg = (bat ? 0x01 : 0) |
                (pct ? 0x02 : 0) |
                ((smb & 0x07) << 2) |
                ((smi & 0x07) << 5);

    const packet = new Uint8Array(8);
    const dv = new DataView(packet.buffer);
    dv.setUint8(0, 0x22);
    dv.setInt16(1, bigNum, true);
    dv.setInt16(3, smalNum, true);
    dv.setUint16(5, durSec, true);
    dv.setUint8(7, cfg);
    return packet;
  }

  packUtcTime(epoch = Math.floor(Date.now() / 1000)) {
    const packet = new Uint8Array(5);
    const dv = new DataView(packet.buffer);
    dv.setUint8(0, 0x23);
    dv.setUint32(1, epoch, true);
    return packet;
  }

  packDeviceName(nameStr) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(nameStr);
    const packet = new Uint8Array(1 + bytes.length);
    packet[0] = 0x01;
    packet.set(bytes, 1);
    return packet;
  }

  packPinCode(pinStr) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(pinStr);
    const packet = new Uint8Array(1 + bytes.length);
    packet[0] = 0x12;
    packet.set(bytes, 1);
    return packet;
  }

  packDeviceMac(macStr) {
    const clean = macStr.replace(/[^0-9A-Fa-f]/g, '');
    const bytes = [];
    for (let i = 0; i < clean.length; i += 2) {
      bytes.push(parseInt(clean.substr(i, 2), 16) || 0);
    }
    const packet = new Uint8Array(7);
    packet[0] = 0x10;
    for (let i = 0; i < 6; i++) {
      packet[1 + i] = bytes[5 - i] || 0;
    }
    return packet;
  }

  packBindKey(hexKey) {
    const clean = hexKey.replace(/[^0-9A-Fa-f]/g, '');
    const bytes = [];
    for (let i = 0; i < clean.length; i += 2) {
      bytes.push(parseInt(clean.substr(i, 2), 16) || 0);
    }
    const packet = new Uint8Array(1 + bytes.length);
    packet[0] = 0x11;
    packet.set(bytes, 1);
    return packet;
  }

  updateMeasureIntervalLabel() {
    const advEl = document.getElementById('dev_cfg_adv_interval');
    const measEl = document.getElementById('dev_cfg_measure_interval');
    const lbl = document.getElementById('devCfgMeasureSecLabel');
    if (!advEl || !measEl || !lbl) return;

    const advMs = parseFloat(advEl.value) || 1000.0;
    const meas = parseInt(measEl.value, 10) || 2;
    const sec = ((advMs * meas) / 1000).toFixed(1);
    lbl.textContent = `x(yayın aralığı) = ${sec} sn`;
  }

  setupDevAutoApply() {
    let debounceTimer = null;
    const debounceApply = (fn, delay = 350) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fn, delay);
    };

    // 1. Genel Cihaz & Ekran Yapılandırması (0x55)
    const cfgInputs = [
      'dev_cfg_scr_off', 'dev_cfg_comfort', 'dev_cfg_show_batt', 'dev_cfg_clock',
      'dev_cfg_lp_meas', 'dev_cfg_tx_meas', 'dev_cfg_bt5_flags', 'dev_cfg_longrange',
      'dev_cfg_adv_type', 'dev_cfg_adv_flags', 'dev_cfg_adv_crypto', 'dev_cfg_temp_unit',
      'dev_cfg_adv_interval', 'dev_cfg_measure_interval', 'dev_cfg_connect_latency', 'dev_cfg_rf_tx_power',
      'dev_cfg_lcd_refresh', 'dev_cfg_averaging', 'dev_cfg_adv_delay', 'dev_cfg_event_adv_cnt'
    ];

    cfgInputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const isSelectOrCheck = el.type === 'checkbox' || el.tagName === 'SELECT';
      const eventName = isSelectOrCheck ? 'change' : 'input';

      el.addEventListener(eventName, () => {
        this.updateMeasureIntervalLabel();
        if (isSelectOrCheck) {
          this.sendDevPacket(this.packCustomConfig(), 'Cihaz Yapılandırması');
        } else {
          debounceApply(() => {
            this.sendDevPacket(this.packCustomConfig(), 'Cihaz Yapılandırması');
          });
        }
      });
    });

    // 2. Konfor Bölgesi Parametreleri (0x20)
    const cmfInputs = ['dev_cmf_temp_lo', 'dev_cmf_temp_hi', 'dev_cmf_hum_lo', 'dev_cmf_hum_hi'];
    cmfInputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        debounceApply(() => {
          this.sendDevPacket(this.packComfortConfig(), 'Konfor Parametreleri');
        });
      });
    });

    // 3. Sensör Hassasiyet Kalibrasyonu (0x25)
    const sensInputs = ['dev_sens_temp_k', 'dev_sens_temp_z', 'dev_sens_hum_k', 'dev_sens_hum_z'];
    sensInputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        debounceApply(() => {
          this.sendDevPacket(this.packSensorConfig(), 'Sensör Kalibrasyonu');
        });
      });
    });

    // 4. Saat Kristal Sapması (0x24)
    const deltaEl = document.getElementById('dev_sens_time_delta');
    if (deltaEl) {
      deltaEl.addEventListener('input', () => {
        debounceApply(() => {
          this.sendDevPacket(this.packTimeDeltaConfig(), 'Saat Kristal Sapması');
        });
      });
    }

    // 5. Zaman Damgası & Tarama (0x26)
    const tsInputs = ['dev_ts_interval', 'dev_ts_mac'];
    tsInputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        debounceApply(() => {
          this.sendDevPacket(this.packTimeStampConfig(), 'Zaman Damgası Ayarları');
        });
      });
    });

    // 6. Donanım Tetikleyicileri TRG (0x44)
    const trgInputs = [
      'dev_trg_temp_hyst', 'dev_trg_temp_thresh', 'dev_trg_hum_hyst', 'dev_trg_hum_thresh',
      'dev_rs_mode', 'dev_rs_invert', 'dev_rs_interval'
    ];
    trgInputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const isSelectOrCheck = el.type === 'checkbox' || el.tagName === 'SELECT';
      const eventName = isSelectOrCheck ? 'change' : 'input';

      el.addEventListener(eventName, () => {
        if (isSelectOrCheck) {
          this.sendDevPacket(this.packTrgConfig(), 'TRG & Reed Switch');
        } else {
          debounceApply(() => {
            this.sendDevPacket(this.packTrgConfig(), 'TRG & Reed Switch');
          });
        }
      });
    });

    // 7. Ekran Değerleri (0x22)
    const extInputs = [
      'dev_ext_bignumb', 'dev_ext_tmpsmb', 'dev_ext_smiley', 'dev_ext_smalnumb',
      'dev_ext_duration', 'dev_ext_percent', 'dev_ext_battery'
    ];
    extInputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const isSelectOrCheck = el.type === 'checkbox' || el.tagName === 'SELECT';
      const eventName = isSelectOrCheck ? 'change' : 'input';

      el.addEventListener(eventName, () => {
        if (isSelectOrCheck) {
          this.sendDevPacket(this.packScreenShow(), 'LCD Ekran Değerleri');
        } else {
          debounceApply(() => {
            this.sendDevPacket(this.packScreenShow(), 'LCD Ekran Değerleri');
          });
        }
      });
    });
  }

  setupDevActionButtons() {
    document.getElementById('btnDevGetConfig')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x55]), 'Ayarları Oku (0x55)');
    });

    document.getElementById('btnDevSendConfig')?.addEventListener('click', () => {
      this.sendDevPacket(this.packCustomConfig(), 'Ayarları Gönder (0x55)');
    });

    document.getElementById('btnDevSetTime')?.addEventListener('click', () => {
      this.sendDevPacket(this.packUtcTime(), 'Saati Eşitle (Set Time)');
    });

    document.getElementById('btnDevSetDefault')?.addEventListener('click', () => {
      if (confirm('Sensörü fabrika varsayılan yapılandırmasına sıfırlamak istediğinize emin misiniz?')) {
        this.sendDevPacket(new Uint8Array([0x56]), 'Varsayılan Yapılandırma (0x56)');
      }
    });

    document.getElementById('btnDevDeleteRecords')?.addEventListener('click', () => {
      if (confirm('Sensörün dahili flash belleğindeki tüm kayıtlar silinecektir. Devam edilsin mi?')) {
        this.sendDevPacket(new Uint8Array([0x35]), 'Bellek Kayıtlarını Sil (0x35)');
      }
    });

    document.getElementById('btnDevExtShow')?.addEventListener('click', () => {
      this.sendDevPacket(this.packScreenShow(), 'LCD Ekrana Yansıt (0x22)');
    });

    document.getElementById('btnDevExtGetOld')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x22, 0, 0, 0, 0, 0, 0, 0]), 'Eski Ekran Verilerini Getir');
    });

    document.getElementById('btnDevStartTx')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x33, 0x01]), 'Telemetri Başlat (Start Tx)');
    });

    document.getElementById('btnDevStopTx')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x33, 0x00]), 'Telemetri Durdur (Stop Tx)');
    });

    document.getElementById('btnDevGetSens')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x25]), 'Kalibrasyonu Oku (0x25)');
    });

    document.getElementById('btnDevSetSens')?.addEventListener('click', () => {
      this.sendDevPacket(this.packSensorConfig(), 'Kalibrasyonu Gönder (0x25)');
    });

    document.getElementById('btnDevResetSens')?.addEventListener('click', () => {
      const p = new Uint8Array(13);
      const dv = new DataView(p.buffer);
      dv.setUint8(0, 0x25);
      dv.setFloat32(1, 1.0, true);
      dv.setFloat32(5, 1.0, true);
      dv.setInt16(9, 0, true);
      dv.setInt16(11, 0, true);
      const tkEl = document.getElementById('dev_sens_temp_k');
      const tzEl = document.getElementById('dev_sens_temp_z');
      const hkEl = document.getElementById('dev_sens_hum_k');
      const hzEl = document.getElementById('dev_sens_hum_z');
      if (tkEl) tkEl.value = '1.00';
      if (tzEl) tzEl.value = '0.00';
      if (hkEl) hkEl.value = '1.00';
      if (hzEl) hzEl.value = '0.00';
      this.sendDevPacket(p, 'Fabrika Kalibrasyonu (Tk=1, Tz=0, Hk=1, Hz=0)');
    });

    document.getElementById('btnDevGetTimeDelta')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x24]), 'Saat Sapmasını Oku (0x24)');
    });

    document.getElementById('btnDevSetTimeDelta')?.addEventListener('click', () => {
      this.sendDevPacket(this.packTimeDeltaConfig(), 'Saat Sapmasını Ata (0x24)');
    });

    document.getElementById('btnDevCalcTimeDelta')?.addEventListener('click', () => {
      this.sendDevPacket(this.packUtcTime(), 'Saat Senkronizasyonu & Sapma Testi');
    });

    document.getElementById('btnDevGetComfort')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x20]), 'Konfor Parametrelerini Oku (0x20)');
    });

    document.getElementById('btnDevSetComfort')?.addEventListener('click', () => {
      this.sendDevPacket(this.packComfortConfig(), 'Konfor Parametrelerini Kaydet (0x20)');
    });

    document.getElementById('btnDevGetTimeStamp')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x26]), 'Zaman Damgası Ayarlarını Oku (0x26)');
    });

    document.getElementById('btnDevSetTimeStamp')?.addEventListener('click', () => {
      this.sendDevPacket(this.packTimeStampConfig(), 'Zaman Damgası Ayarlarını Kaydet (0x26)');
    });

    document.getElementById('btnDevGetTrg')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x44]), 'TRG Ayarlarını Oku (0x44)');
    });

    document.getElementById('btnDevSetTrg')?.addEventListener('click', () => {
      this.sendDevPacket(this.packTrgConfig(), 'TRG Ayarlarını Kaydet (0x44)');
    });

    document.getElementById('btnDevPinHigh')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x45, 0x01]), 'Reset Pini Yüksek (Pin=1)');
    });

    document.getElementById('btnDevPinLow')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x45, 0x00]), 'Reset Pini Düşük (Pin=0)');
    });

    document.getElementById('btnDevGetName')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x01]), 'Cihaz Adını Oku (0x01)');
    });

    document.getElementById('btnDevSetName')?.addEventListener('click', () => {
      const name = (document.getElementById('dev_device_name')?.value || '').trim();
      if (!name) return this.showToast('Cihaz adı boş olamaz.', 'error');
      this.sendDevPacket(this.packDeviceName(name), `Cihaz Adı Ata: ${name}`);
    });

    document.getElementById('btnDevResetName')?.addEventListener('click', () => {
      const defName = 'ATC_597941';
      const el = document.getElementById('dev_device_name');
      if (el) el.value = defName;
      this.sendDevPacket(this.packDeviceName(defName), `Cihaz Adını Sıfırla: ${defName}`);
    });

    document.getElementById('btnDevSetPin')?.addEventListener('click', () => {
      const pin = (document.getElementById('dev_pin_code')?.value || '000000').trim();
      this.sendDevPacket(this.packPinCode(pin), `PIN Kodu Ata: ${pin}`);
    });

    document.getElementById('btnDevGetMac')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x10]), 'MAC Adresini Oku (0x10)');
    });

    document.getElementById('btnDevSetMac')?.addEventListener('click', () => {
      const mac = (document.getElementById('dev_device_mac')?.value || '').trim();
      if (!mac) return this.showToast('Lütfen geçerli bir MAC adresi girin.', 'error');
      this.sendDevPacket(this.packDeviceMac(mac), `MAC Adresi Ata: ${mac}`);
    });

    document.getElementById('btnDevCleanMac')?.addEventListener('click', () => {
      if (confirm('Özel MAC adresi temizlensin mi?')) {
        this.sendDevPacket(new Uint8Array([0x10, 0, 0, 0, 0, 0, 0]), 'Özel MAC Adresini Temizle');
      }
    });

    document.getElementById('btnDevGetBindKey')?.addEventListener('click', () => {
      this.sendDevPacket(new Uint8Array([0x11]), 'BindKey Oku (0x11)');
    });

    document.getElementById('btnDevSetBindKey')?.addEventListener('click', () => {
      const key = (document.getElementById('dev_bind_key')?.value || '').trim();
      if (!key) return this.showToast('Lütfen geçerli bir hex BindKey girin.', 'error');
      this.sendDevPacket(this.packBindKey(key), 'BindKey Kaydet (0x11)');
    });

    document.getElementById('btnDevSendCustomCmd')?.addEventListener('click', () => {
      const txt = (document.getElementById('dev_cmd_txt')?.value || '').trim();
      if (!txt) return this.showToast('Lütfen gönderilecek onaltılık (hex) komut dizisi girin.', 'info');

      try {
        const hexParts = txt.replace(/0x/gi, '').split(/[\s,:-]+/).filter(x => x.length > 0);
        const bytes = new Uint8Array(hexParts.map(h => parseInt(h, 16)));
        this.sendDevPacket(bytes, 'Özel Komut');
      } catch (err) {
        this.showToast('Geçersiz onaltılık (hex) formatı!', 'error');
      }
    });

    document.querySelectorAll('.dev-quick-cmd').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        if (!cmd) return;
        const input = document.getElementById('dev_cmd_txt');
        if (input) input.value = cmd;
        try {
          const byteVal = parseInt(cmd, 16);
          this.sendDevPacket(new Uint8Array([byteVal]), `Hızlı Komut 0x${cmd}`);
        } catch (e) {}
      });
    });
  }

  async devReadConfigFromDevice() {
    if (!this.ble.isConnected) return;
    this.logDevTerminal('Sensörden güncel parametreler talep ediliyor...', 'info');
    await this.ble.sendAtcCommand(new Uint8Array([0x55])).catch(() => {});
  }

  handleIncomingDevPacket(b) {
    if (!b || b.byteLength === 0) return;
    const len = b.byteLength;
    const cmd = b.getUint8(0);

    const hexArr = [];
    for (let i = 0; i < len; i++) {
      hexArr.push(b.getUint8(i).toString(16).padStart(2, '0').toUpperCase());
    }
    const hexStr = hexArr.join(' ');
    this.logDevTerminal(`0x${cmd.toString(16).padStart(2, '0').toUpperCase()}: ${hexStr}`, 'rx');

    // 1. Yapılandırma Paketi (0x55)
    if (cmd === 0x55 && len >= 12) {
      const flg = b.getUint8(1);
      const flg2 = b.getUint8(2);

      const advType = flg & 0x03;
      const comfort = !!(flg & 0x04);
      const clock = !!(flg & 0x08);
      const tempUnit = (flg & 0x10) ? 1 : 0;
      const showBatt = !!(flg & 0x20);
      const txMeas = !!(flg & 0x40);
      const lpMeas = !!(flg & 0x80);

      const smiley = flg2 & 0x07;
      const advCrypto = !!(flg2 & 0x08);
      const advFlags = !!(flg2 & 0x10);
      const bt5Flags = !!(flg2 & 0x20);
      const longrange = !!(flg2 & 0x40);
      const screenOff = !!(flg2 & 0x80);

      const advIntRaw = b.getUint16(5, true);
      const advIntMs = (advIntRaw * 0.625).toFixed(1);
      const measureInterval = b.getUint8(7);
      const rfTxPower = b.getUint8(8);
      const connLatRaw = b.getUint16(9, true);
      const connLatMs = Math.round(connLatRaw * 1.25);
      const lcdRefreshRaw = b.getUint8(11);
      const lcdRefreshSec = (lcdRefreshRaw * 0.05).toFixed(2);
      const averaging = len >= 13 ? b.getUint8(12) : 1;
      const advDelay = len >= 14 ? b.getUint8(13) : 10;
      const eventAdvCnt = len >= 15 ? b.getUint8(14) : 6;

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      const setChecked = (id, chk) => { const el = document.getElementById(id); if (el) el.checked = chk; };

      setVal('dev_cfg_adv_type', advType);
      setChecked('dev_cfg_comfort', comfort);
      setChecked('dev_cfg_clock', clock);
      setVal('dev_cfg_temp_unit', tempUnit);
      setChecked('dev_cfg_show_batt', showBatt);
      setChecked('dev_cfg_tx_meas', txMeas);
      setChecked('dev_cfg_lp_meas', lpMeas);

      setVal('dev_ext_smiley', smiley);
      setChecked('dev_cfg_adv_crypto', advCrypto);
      setChecked('dev_cfg_adv_flags', advFlags);
      setChecked('dev_cfg_bt5_flags', bt5Flags);
      setChecked('dev_cfg_longrange', longrange);
      setChecked('dev_cfg_scr_off', screenOff);

      setVal('dev_cfg_adv_interval', advIntMs);
      setVal('dev_cfg_measure_interval', measureInterval);
      setVal('dev_cfg_connect_latency', connLatMs);
      setVal('dev_cfg_rf_tx_power', rfTxPower);
      setVal('dev_cfg_lcd_refresh', lcdRefreshSec);
      setVal('dev_cfg_averaging', averaging);
      setVal('dev_cfg_adv_delay', advDelay);
      setVal('dev_cfg_event_adv_cnt', eventAdvCnt);

      this.updateMeasureIntervalLabel();
      this.saveDevSettingsToStorage();
      this.showToast('Sensör donanım yapılandırması (0x55) başarıyla okundu.', 'info');
      return;
    }

    // 2. Konfor Parametreleri (0x20)
    if (cmd === 0x20 && len >= 9) {
      const loT = (b.getInt16(1, true) / 100).toFixed(2);
      const hiT = (b.getInt16(3, true) / 100).toFixed(2);
      const loH = (b.getInt16(5, true) / 100).toFixed(2);
      const hiH = (b.getInt16(7, true) / 100).toFixed(2);

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('dev_cmf_temp_lo', loT);
      setVal('dev_cmf_temp_hi', hiT);
      setVal('dev_cmf_hum_lo', loH);
      setVal('dev_cmf_hum_hi', hiH);

      this.saveDevSettingsToStorage();
      this.showToast('Konfor bölgesi ayarları (0x20) okundu.', 'info');
      return;
    }

    // 3. Kalibrasyon Paketi (0x25)
    if (cmd === 0x25 && len >= 13) {
      const tk = b.getFloat32(1, true).toFixed(3);
      const hk = b.getFloat32(5, true).toFixed(3);
      const tz = (b.getInt16(9, true) / 100).toFixed(2);
      const hz = (b.getInt16(11, true) / 100).toFixed(2);

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('dev_sens_temp_k', tk);
      setVal('dev_sens_temp_z', tz);
      setVal('dev_sens_hum_k', hk);
      setVal('dev_sens_hum_z', hz);

      this.saveDevSettingsToStorage();
      this.showToast('Sensör hassasiyet kalibrasyonu (0x25) okundu.', 'info');
      return;
    }

    // 4. Saat Sapması (0x24)
    if (cmd === 0x24 && len >= 3) {
      const delta = b.getInt16(1, true);
      const el = document.getElementById('dev_sens_time_delta');
      if (el) el.value = delta;
      this.saveDevSettingsToStorage();
      this.showToast(`Saat kristal sapması okundu: ${delta}`, 'info');
      return;
    }

    // 5. TRG & Reed Switch (0x44)
    if (cmd === 0x44 && len >= 11) {
      const tHyst = (b.getInt16(1, true) / 100).toFixed(2);
      const tThr = (b.getInt16(3, true) / 100).toFixed(2);
      const hHyst = (b.getInt16(5, true) / 100).toFixed(2);
      const hThr = (b.getInt16(7, true) / 100).toFixed(2);
      const rsInt = b.getUint16(9, true);
      const rsCfg = len >= 12 ? b.getUint8(11) : 0;

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('dev_trg_temp_hyst', tHyst);
      setVal('dev_trg_temp_thresh', tThr);
      setVal('dev_trg_hum_hyst', hHyst);
      setVal('dev_trg_hum_thresh', hThr);
      setVal('dev_rs_interval', rsInt);
      setVal('dev_rs_mode', rsCfg & 0x01);
      const invertEl = document.getElementById('dev_rs_invert');
      if (invertEl) invertEl.checked = !!(rsCfg & 0x02);

      this.saveDevSettingsToStorage();
      this.showToast('TRG eşik değerleri (0x44) okundu.', 'info');
      return;
    }

    // 6. Cihaz Adı (0x01)
    if (cmd === 0x01 && len > 1) {
      const bytes = new Uint8Array(b.buffer, b.byteOffset + 1, len - 1);
      const name = new TextDecoder().decode(bytes);
      const el = document.getElementById('dev_device_name');
      if (el) el.value = name;
      this.saveDevSettingsToStorage();
      this.showToast(`Cihaz adı okundu: ${name}`, 'info');
      return;
    }

    // 7. MAC Adresi (0x10)
    if (cmd === 0x10 && len >= 7) {
      const macArr = [];
      for (let i = 6; i >= 1; i--) {
        macArr.push(b.getUint8(i).toString(16).padStart(2, '0').toUpperCase());
      }
      const macStr = macArr.join(':');
      const el = document.getElementById('dev_device_mac');
      if (el) el.value = macStr;
      this.saveDevSettingsToStorage();
      this.showToast(`Cihaz MAC adresi: ${macStr}`, 'info');
      return;
    }

    // 8. BindKey (0x11)
    if (cmd === 0x11 && len >= 17) {
      const keyArr = [];
      for (let i = 1; i < 17; i++) {
        keyArr.push(b.getUint8(i).toString(16).padStart(2, '0').toUpperCase());
      }
      const keyStr = keyArr.join('');
      const el = document.getElementById('dev_bind_key');
      if (el) el.value = keyStr;
      this.saveDevSettingsToStorage();
      this.showToast('BindKey başarıyla okundu.', 'info');
      return;
    }

    // 9. UTC Saati (0x23)
    if (cmd === 0x23 && len >= 5) {
      const epoch = b.getUint32(1, true);
      const date = new Date(epoch * 1000);
      this.showToast(`Sensör UTC Saati: ${date.toLocaleString('tr-TR')}`, 'info');
      return;
    }
  }

  saveDevSettingsToStorage() {
    const keys = [
      'dev_cfg_scr_off', 'dev_cfg_comfort', 'dev_cfg_show_batt', 'dev_cfg_clock',
      'dev_cfg_lp_meas', 'dev_cfg_tx_meas', 'dev_cfg_bt5_flags', 'dev_cfg_longrange',
      'dev_cfg_adv_type', 'dev_cfg_adv_flags', 'dev_cfg_adv_crypto', 'dev_cfg_temp_unit',
      'dev_cfg_adv_interval', 'dev_cfg_measure_interval', 'dev_cfg_connect_latency', 'dev_cfg_rf_tx_power',
      'dev_cfg_lcd_refresh', 'dev_cfg_averaging', 'dev_cfg_adv_delay', 'dev_cfg_event_adv_cnt',
      'dev_cmf_temp_lo', 'dev_cmf_temp_hi', 'dev_cmf_hum_lo', 'dev_cmf_hum_hi',
      'dev_sens_temp_k', 'dev_sens_temp_z', 'dev_sens_hum_k', 'dev_sens_hum_z', 'dev_sens_time_delta',
      'dev_ts_interval', 'dev_ts_mac',
      'dev_trg_temp_hyst', 'dev_trg_temp_thresh', 'dev_trg_hum_hyst', 'dev_trg_hum_thresh',
      'dev_rs_mode', 'dev_rs_invert', 'dev_rs_interval',
      'dev_device_name', 'dev_pin_code', 'dev_device_mac', 'dev_bind_key',
      'dev_ext_bignumb', 'dev_ext_tmpsmb', 'dev_ext_smiley', 'dev_ext_smalnumb',
      'dev_ext_duration', 'dev_ext_percent', 'dev_ext_battery'
    ];

    const data = {};
    keys.forEach(k => {
      const el = document.getElementById(k);
      if (!el) return;
      if (el.type === 'checkbox') {
        data[k] = el.checked;
      } else {
        data[k] = el.value;
      }
    });

    try {
      localStorage.setItem('xiaomi_atc_dev_settings', JSON.stringify(data));
    } catch (e) {}
  }

  loadDevSettingsFromStorage() {
    try {
      const raw = localStorage.getItem('xiaomi_atc_dev_settings');
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const [k, v] of Object.entries(data)) {
        const el = document.getElementById(k);
        if (!el) continue;
        if (el.type === 'checkbox') {
          el.checked = !!v;
        } else {
          el.value = v;
        }
      }
    } catch (e) {}
  }
}

// DOM Yüklendiğinde Başlat
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
