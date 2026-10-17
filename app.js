/**
 * Xiaomi SmartTemp Pro — Poppins Typography & Dual Theme (Light / Dark)
 * Device: Xiaomi Mijia LYWSD03MMC (Stock & ATC / PVVX Modded Firmware Support)
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

    // Cache of partial readings from distinct characteristics
    this.cachedTemp = null;
    this.cachedHum = null;
    this.cachedBat = 100;
    this.cachedVolt = 3.0;

    // Throttle for live incoming data
    this.lastEmitTime = 0;
  }

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Tarayıcınız Web Bluetooth API desteği sağlamıyor. Lütfen Google Chrome veya Microsoft Edge kullanın.');
    }

    this.onStatus('scanning', 'Bluetooth cihazları taranıyor...');

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
      // acceptAllDevices: true kullanarak tarayıcı eşleme penceresinde
      // ATC_..., LYWSD03MMC ve modlu tüm BLE cihazlarının 100% görünmesini sağlıyoruz!
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: optionalServices
      });
    } catch (err) {
      this.isConnected = false;
      if (err.name === 'NotFoundError') {
        this.onStatus('disconnected', 'Cihaz seçimi iptal edildi.');
        return false;
      }
      this.onStatus('disconnected', 'Bluetooth cihaz listesi açılamadı.');
      throw err;
    }

    this.device.addEventListener('gattserverdisconnected', () => this.handleDisconnect());

    // 1. ADVERTISMENT WATCHER (BLE Sinyalleri & Paket Yakalayıcı)
    this.startAdvertisementWatcher();

    // 2. GATT BAĞLANTISI
    const devName = this.device.name || 'ATC Cihazı';
    this.onStatus('connecting', `${devName} bağlanıyor...`);

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
          atcChar.addEventListener('characteristicvaluechanged', (e) => {
            this.parseAtc1f1fPacket(e.target.value);
          });
          await atcChar.startNotifications().catch(() => {});
          // 0x33 komutunu göndererek telemetri akışını tetikle
          await atcChar.writeValueWithoutResponse(new Uint8Array([0x33])).catch(() => {});
          bound = true;
          console.log('✅ ATC Custom (0x1F10 / 0x1F1F) telemetri akışı başlatıldı.');
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

  // ATC Custom 0x1F1F Paket Çözümleme
  parseAtc1f1fPacket(value) {
    if (!value || value.byteLength < 5) return;
    const b = value;
    let offset = 0;
    if (b.getUint8(0) === 0x33 || b.getUint8(0) === 0x55) {
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
    this.isConnected = false;
    this.onStatus('disconnected', 'Bağlantı kesildi.');
  }

  handleDisconnect() {
    this.isConnected = false;
    this.onStatus('disconnected', 'Cihaz bağlantısı koptu.');
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
    this.chartRange = '1h';
    this.chartMode = 'all';
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
      btnFetchHistory: document.getElementById('btnFetchHistory'),
      btnFetchHistoryMobile: document.getElementById('btnFetchHistoryMobile'),

      btnHelp: document.getElementById('btnHelp'),
      btnCloseHelp: document.getElementById('btnCloseHelp'),
      btnGotIt: document.getElementById('btnGotIt'),
      helpModal: document.getElementById('helpModal'),

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
      valFirmwareBadge: document.getElementById('valFirmwareBadge'),
      bleLiveStatusTag: document.getElementById('bleLiveStatusTag'),

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
      toastContainer: document.getElementById('toastContainer')
    };

    this.init();
  }

  async init() {
    this.initLiveClock();
    this.applyTheme(this.currentTheme);
    lucide.createIcons();
    this.setupEventListeners();
    this.initChart();

    await this.storage.initPromise;
    this.updateStatsAndTable();

    if (this.storage.records.length > 0) {
      const last = this.storage.records[this.storage.records.length - 1];
      this.renderTelemetryCards(last);
      this.updateChart();
    }

    window.addEventListener('resize', () => {
      if (this.chart) {
        this.chart.options.scales.x.ticks.maxTicksLimit = window.innerWidth < 640 ? 4 : 7;
        this.chart.resize();
      }
    });
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
      if (this.dom.metaThemeColor) this.dom.metaThemeColor.setAttribute('content', '#020617');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      if (this.dom.themeIcon) this.dom.themeIcon.setAttribute('data-lucide', 'moon');
      if (this.dom.themeLabel) this.dom.themeLabel.textContent = 'Koyu';
      if (this.dom.metaThemeColor) this.dom.metaThemeColor.setAttribute('content', '#f8fafc');
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
        this.showToast('Çevredeki tüm BLE cihazları listeleniyor. ATC_... cihazınızı seçin.', 'info');
        const success = await this.ble.connect();
        if (success) {
          const fw = this.ble.deviceProfile === 'atc' ? 'ATC Modlu Firmware' : 'Xiaomi Orijinal';
          this.showToast(`Bağlandı: ${this.ble.device ? this.ble.device.name : 'Cihaz'} (${fw})`, 'success');
        }
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          this.showToast('Bağlantı hatası: ' + err.message, 'error');
        }
      }
    }
  }

  async triggerFetchHistory() {
    try {
      if (this.dom.btnFetchHistory) this.dom.btnFetchHistory.disabled = true;
      if (this.dom.btnFetchHistoryMobile) this.dom.btnFetchHistoryMobile.disabled = true;

      this.showToast('Geçmiş kayıtlar sorgulanıyor...', 'info');
      const historyRecords = await this.ble.fetchDeviceHistory();
      if (historyRecords && historyRecords.length > 0) {
        await this.storage.addBatch(historyRecords);
        this.updateStatsAndTable();
        this.updateChart();
        this.showToast(`${historyRecords.length} geçmiş kayıt başarıyla arşive eklendi!`, 'success');
      } else {
        this.showToast('Kayıtlar güncel. Anlık ve yayınlanan tüm ölçümler arşivde kaydediliyor.', 'info');
      }
    } catch (err) {
      this.showToast('Geçmiş alınırken hata: ' + err.message, 'error');
    } finally {
      if (this.dom.btnFetchHistory) this.dom.btnFetchHistory.disabled = false;
      if (this.dom.btnFetchHistoryMobile) this.dom.btnFetchHistoryMobile.disabled = false;
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

    if (this.dom.btnFetchHistory) {
      this.dom.btnFetchHistory.addEventListener('click', () => this.triggerFetchHistory());
    }
    if (this.dom.btnFetchHistoryMobile) {
      this.dom.btnFetchHistoryMobile.addEventListener('click', () => this.triggerFetchHistory());
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

    const toggleHelp = (show) => {
      if (show) {
        this.dom.helpModal.classList.remove('hidden');
        setTimeout(() => this.dom.helpModal.classList.remove('opacity-0'), 10);
      } else {
        this.dom.helpModal.classList.add('opacity-0');
        setTimeout(() => this.dom.helpModal.classList.add('hidden'), 300);
      }
    };
    this.dom.btnHelp.addEventListener('click', () => toggleHelp(true));
    this.dom.btnCloseHelp.addEventListener('click', () => toggleHelp(false));
    this.dom.btnGotIt.addEventListener('click', () => toggleHelp(false));
  }

  handleBleStatus(status, text) {
    if (this.dom.connectionStatusText) this.dom.connectionStatusText.textContent = text;

    const updateDot = (el) => {
      if (!el) return;
      el.className = 'w-2.5 h-2.5 rounded-full inline-block flex-shrink-0';
      if (status === 'connected') {
        el.classList.add('bg-emerald-500', 'dot-live');
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
        btn.className = `${isMobile ? 'flex-1' : ''} py-2.5 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/20 transition-all active:scale-95`;
      } else {
        btn.innerHTML = `<i data-lucide="bluetooth" class="w-4 h-4"></i><span>Cihaza Bağlan</span>`;
        btn.className = `${isMobile ? 'flex-1' : ''} py-2.5 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95`;
      }
    };
    updateBtn(this.dom.btnConnect, false);
    updateBtn(this.dom.btnConnectMobile, true);

    const isConnected = status === 'connected';
    if (this.dom.btnFetchHistory) this.dom.btnFetchHistory.disabled = !isConnected;
    if (this.dom.btnFetchHistoryMobile) this.dom.btnFetchHistoryMobile.disabled = !isConnected;
    if (this.dom.lastUpdatedAgo) this.dom.lastUpdatedAgo.classList.toggle('hidden', !isConnected);

    if (this.dom.bleLiveStatusTag) {
      if (isConnected) {
        const fwName = this.ble.deviceProfile === 'atc' ? 'ATC Modlu FW Yayını' : 'Xiaomi Orijinal Yayın';
        this.dom.bleLiveStatusTag.textContent = fwName;
        this.dom.bleLiveStatusTag.className = 'font-mono text-[10px] uppercase px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30';
      } else {
        this.dom.bleLiveStatusTag.textContent = 'Sinyal Dinleme Hazır';
        this.dom.bleLiveStatusTag.className = 'font-mono text-[10px] uppercase px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700';
      }
    }

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
    }

    if (this.dom.valFirmwareBadge) {
      if (profile === 'atc') {
        this.dom.valFirmwareBadge.textContent = 'ATC Modlu FW';
        this.dom.valFirmwareBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 font-bold';
      } else if (profile === 'stock_xiaomi') {
        this.dom.valFirmwareBadge.textContent = 'Xiaomi Orijinal';
        this.dom.valFirmwareBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-bold';
      }
    }
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
    // 1. Sıcaklık Kartı
    let displayTemp = data.temperature;
    if (this.currentUnit === 'F') {
      displayTemp = (data.temperature * 9 / 5) + 32;
    }
    this.dom.valTemp.textContent = displayTemp.toFixed(1);
    this.dom.lblTempUnit.textContent = `°${this.currentUnit}`;

    // 2. Bağıl Nem Kartı
    this.dom.valHum.textContent = data.humidity;
    this.dom.humProgressBar.style.width = `${Math.min(100, Math.max(0, data.humidity))}%`;

    if (data.humidity < 30) {
      this.dom.humidityStatusBadge.textContent = 'Kuru';
      this.dom.humidityStatusBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium';
    } else if (data.humidity > 60) {
      this.dom.humidityStatusBadge.textContent = 'Yüksek Nem';
      this.dom.humidityStatusBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 font-medium';
    } else {
      this.dom.humidityStatusBadge.textContent = 'İdeal';
      this.dom.humidityStatusBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-medium';
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
        this.dom.apparentDiffBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-mono font-semibold';
      } else if (diff > 0) {
        this.dom.apparentDiffBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-mono font-semibold';
      } else {
        this.dom.apparentDiffBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20 font-mono font-semibold';
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
        this.dom.dewPointRiskBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-bold';
      } else if (data.dewPoint >= 21) {
        this.dom.dewPointRiskBadge.textContent = 'Baskıcı Nem';
        this.dom.dewPointRiskBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium';
      } else if (data.dewPoint >= 10 && data.dewPoint < 16) {
        this.dom.dewPointRiskBadge.textContent = 'Konforlu';
        this.dom.dewPointRiskBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-medium';
      } else if (data.dewPoint < 10) {
        this.dom.dewPointRiskBadge.textContent = 'Kuru Hava';
        this.dom.dewPointRiskBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20 font-medium';
      } else {
        this.dom.dewPointRiskBadge.textContent = 'Normal';
        this.dom.dewPointRiskBadge.className = 'text-xs px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 font-medium';
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
        this.dom.batteryProgressBar.className = 'h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-500';
      }
    }
    if (data.voltage != null) {
      this.dom.valVoltage.textContent = `${data.voltage.toFixed(2)} V`;
    }
    if (data.rssi != null && this.dom.valRssi) {
      this.dom.valRssi.textContent = `${data.rssi} dBm`;
    }

    if (this.dom.valFirmwareBadge) {
      const isAtc = (data.profile === 'atc' || (data.source && data.source.includes('atc')));
      this.dom.valFirmwareBadge.textContent = isAtc ? 'ATC Modlu FW' : 'Xiaomi Orijinal';
      this.dom.valFirmwareBadge.className = isAtc
        ? 'text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 font-bold'
        : 'text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-bold';
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
          ? '<span class="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 text-[10px] font-sans">Hafıza</span>'
          : (item.source === 'ble_adv'
            ? '<span class="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20 text-[10px] font-sans">BLE Sinyal</span>'
            : '<span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-sans">GATT Canlı</span>');

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
            <td class="py-2.5 sm:py-3 px-3 font-bold text-emerald-600 dark:text-emerald-400">
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

    const tempGradient = ctx.createLinearGradient(0, 0, 0, 320);
    tempGradient.addColorStop(0, isDark ? 'rgba(34, 197, 94, 0.35)' : 'rgba(34, 197, 94, 0.2)');
    tempGradient.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Sıcaklık',
            data: [],
            borderColor: '#22c55e',
            backgroundColor: tempGradient,
            borderWidth: isMobile ? 2 : 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: isMobile ? 1.5 : 2,
            pointHoverRadius: 5,
            yAxisID: 'yTemp'
          },
          {
            label: 'Hissedilen Sıcaklık',
            data: [],
            borderColor: '#f59e0b',
            borderWidth: isMobile ? 1.8 : 2.2,
            borderDash: [4, 4],
            fill: false,
            tension: 0.35,
            pointRadius: isMobile ? 1.5 : 2,
            pointHoverRadius: 5,
            yAxisID: 'yTemp'
          },
          {
            label: 'Çiğ Noktası',
            data: [],
            borderColor: '#a855f7',
            borderWidth: isMobile ? 1.8 : 2.2,
            borderDash: [2, 2],
            fill: false,
            tension: 0.35,
            pointRadius: isMobile ? 1.5 : 2,
            pointHoverRadius: 5,
            yAxisID: 'yTemp'
          },
          {
            label: 'Bağıl Nem (%)',
            data: [],
            borderColor: '#06b6d4',
            borderWidth: isMobile ? 2 : 2.5,
            fill: false,
            tension: 0.35,
            pointRadius: isMobile ? 1.5 : 2,
            pointHoverRadius: 5,
            yAxisID: 'yHum'
          },
          {
            label: 'Buhar Basıncı (hPa)',
            data: [],
            borderColor: '#ec4899',
            borderWidth: isMobile ? 1.8 : 2.2,
            fill: false,
            tension: 0.35,
            pointRadius: isMobile ? 1.5 : 2,
            pointHoverRadius: 5,
            yAxisID: 'yPress'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: isDark ? '#94a3b8' : '#475569',
              font: { family: 'Poppins', size: isMobile ? 10 : 12, weight: 600 },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
            borderColor: isDark ? '#334155' : '#cbd5e1',
            borderWidth: 1,
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            padding: 10,
            cornerRadius: 12,
            bodyFont: { family: 'Poppins' },
            titleFont: { family: 'Poppins', weight: 'bold' }
          }
        },
        scales: {
          x: {
            grid: { color: isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(203, 213, 225, 0.5)' },
            ticks: {
              color: '#64748b',
              font: { family: 'JetBrains Mono', size: isMobile ? 9 : 10 },
              maxTicksLimit: isMobile ? 4 : 7
            }
          },
          yTemp: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: !isMobile,
              text: 'Sıcaklık (°C)',
              color: '#22c55e',
              font: { family: 'Poppins', size: 11, weight: 600 }
            },
            grid: { color: isDark ? 'rgba(51, 65, 85, 0.25)' : 'rgba(203, 213, 225, 0.4)' },
            ticks: {
              color: '#22c55e',
              font: { family: 'JetBrains Mono', size: isMobile ? 10 : 11 }
            }
          },
          yHum: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: !isMobile,
              text: 'Nem (%)',
              color: '#06b6d4',
              font: { family: 'Poppins', size: 11, weight: 600 }
            },
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#06b6d4',
              font: { family: 'JetBrains Mono', size: isMobile ? 10 : 11 }
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
              text: 'Buhar B. (hPa)',
              color: '#ec4899',
              font: { family: 'Poppins', size: 11, weight: 600 }
            },
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#ec4899',
              font: { family: 'JetBrains Mono', size: isMobile ? 9 : 10 }
            },
            min: 0
          }
        }
      }
    });
  }

  adaptChartTheme() {
    if (!this.chart) return;
    const isDark = this.currentTheme === 'dark';

    this.chart.options.plugins.legend.labels.color = isDark ? '#94a3b8' : '#475569';
    this.chart.options.plugins.tooltip.backgroundColor = isDark ? '#0f172a' : '#ffffff';
    this.chart.options.plugins.tooltip.borderColor = isDark ? '#334155' : '#cbd5e1';
    this.chart.options.plugins.tooltip.titleColor = isDark ? '#f8fafc' : '#0f172a';
    this.chart.options.plugins.tooltip.bodyColor = isDark ? '#cbd5e1' : '#334155';

    this.chart.options.scales.x.grid.color = isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(203, 213, 225, 0.5)';
    this.chart.options.scales.yTemp.grid.color = isDark ? 'rgba(51, 65, 85, 0.25)' : 'rgba(203, 213, 225, 0.4)';

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

    if (records.length > 300) {
      const step = Math.ceil(records.length / 300);
      records = records.filter((_, idx) => idx % step === 0 || idx === records.length - 1);
    }

    const isMobile = window.innerWidth < 640;
    const labels = records.map(r => {
      const d = new Date(r.timestamp);
      return this.chartRange === '1h'
        ? d.toLocaleTimeString('tr-TR', { minute: '2-digit', second: '2-digit' })
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

    this.chart.data.datasets[0].label = `Sıcaklık (°${this.currentUnit})`;
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

    if (this.chartMode === 'temps') {
      ds[0].hidden = false;
      ds[1].hidden = false;
      ds[2].hidden = false;
      ds[3].hidden = true;
      ds[4].hidden = true;
      scales.yTemp.display = true;
      scales.yHum.display = false;
      scales.yPress.display = false;
    } else if (this.chartMode === 'temp') {
      ds[0].hidden = false;
      ds[1].hidden = true;
      ds[2].hidden = true;
      ds[3].hidden = true;
      ds[4].hidden = true;
      scales.yTemp.display = true;
      scales.yHum.display = false;
      scales.yPress.display = false;
    } else if (this.chartMode === 'apparent') {
      ds[0].hidden = true;
      ds[1].hidden = false;
      ds[2].hidden = true;
      ds[3].hidden = true;
      ds[4].hidden = true;
      scales.yTemp.display = true;
      scales.yHum.display = false;
      scales.yPress.display = false;
    } else if (this.chartMode === 'dew') {
      ds[0].hidden = true;
      ds[1].hidden = true;
      ds[2].hidden = false;
      ds[3].hidden = true;
      ds[4].hidden = true;
      scales.yTemp.display = true;
      scales.yHum.display = false;
      scales.yPress.display = false;
    } else if (this.chartMode === 'hum') {
      ds[0].hidden = true;
      ds[1].hidden = true;
      ds[2].hidden = true;
      ds[3].hidden = false;
      ds[4].hidden = true;
      scales.yTemp.display = false;
      scales.yHum.display = true;
      scales.yPress.display = false;
    } else if (this.chartMode === 'press') {
      ds[0].hidden = true;
      ds[1].hidden = true;
      ds[2].hidden = true;
      ds[3].hidden = true;
      ds[4].hidden = false;
      scales.yTemp.display = false;
      scales.yHum.display = false;
      scales.yPress.display = true;
    } else {
      ds[0].hidden = false;
      ds[1].hidden = false;
      ds[2].hidden = false;
      ds[3].hidden = false;
      ds[4].hidden = false;
      scales.yTemp.display = true;
      scales.yHum.display = true;
      scales.yPress.display = false;
    }

    scales.yTemp.title.text = `Sıcaklık (°${this.currentUnit})`;
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
      success: 'bg-emerald-600 text-white dark:bg-emerald-950/90 dark:border-emerald-500/50 dark:text-emerald-200 border border-emerald-500/30',
      error: 'bg-rose-600 text-white dark:bg-rose-950/90 dark:border-rose-500/50 dark:text-rose-200 border border-rose-500/30',
      info: 'bg-slate-900 text-white dark:bg-slate-900/90 dark:border-slate-700/60 dark:text-slate-200 border border-slate-700/60'
    };
    toast.className = `p-3 sm:p-3.5 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs sm:text-sm font-medium toast-animate ${colors[type] || colors.info}`;
    toast.innerHTML = `
      <span class="w-2 h-2 rounded-full ${type === 'success' ? 'bg-white dark:bg-emerald-400' : type === 'error' ? 'bg-white dark:bg-rose-400' : 'bg-cyan-400'} flex-shrink-0"></span>
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
}

// DOM Yüklendiğinde Başlat
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
