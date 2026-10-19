/**
 * Xiaomi SmartTemp Pro — Ultra-Fast, Zero-Animation & Mobile-Optimized Engine
 * Instant BLE Auto-Connect to ATC_597941 & Ultra-Fast Flash History Ingestion
 * 100% Offline-First Architecture (PWA & Web Bluetooth API)
 */

// ==========================================
// 1. CONSTANTS & BLE PROFILES
// ==========================================
const BLE_PROFILES = {
  // Xiaomi Stock Firmware GATT Service & Characteristics
  XIAOMI_SERVICE: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
  CHAR_STOCK_LIVE: 'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6',
  CHAR_HISTORY_STREAM: 'ebe0ccbc-7a0a-4b0c-8a1a-6ff2997da3a6',

  // ATC / PVVX Custom Firmware GATT Services & Characteristics
  ENV_SENSING_SERVICE: '0000181a-0000-1000-8000-00805f9b34fb',
  CHAR_TEMP_HIGH_RES: '00002a6e-0000-1000-8000-00805f9b34fb',
  CHAR_TEMP_STD: '00002a1f-0000-1000-8000-00805f9b34fb',
  CHAR_HUMIDITY: '00002a6f-0000-1000-8000-00805f9b34fb',
  BATTERY_SERVICE: '0000180f-0000-1000-8000-00805f9b34fb',
  CHAR_BATTERY: '00002a19-0000-1000-8000-00805f9b34fb',

  // ATC Custom Control & Command Characteristic (0x1F1F)
  ATC_CUSTOM_SERVICE: '00001f10-0000-1000-8000-00805f9b34fb',
  CHAR_ATC_CUSTOM: '00001f1f-0000-1000-8000-00805f9b34fb',

  // Advertisement UUIDs
  UUID_MIBEACON: '0000fe95-0000-1000-8000-00805f9b34fb',
  UUID_BTHOME_V2: '0000fcd2-0000-1000-8000-00805f9b34fb',
  UUID_BTHOME_V1: '0000181c-0000-1000-8000-00805f9b34fb'
};

// ==========================================
// 2. TELEMETRY RECORD FORMATTER
// ==========================================
class TelemetryProcessor {
  static format(record) {
    const t = typeof record.temperature === 'number'
      ? Number(record.temperature.toFixed(2))
      : parseFloat(record.temperature);
    const h = typeof record.humidity === 'number'
      ? Number(record.humidity.toFixed(2))
      : parseFloat(record.humidity);
    const b = record.battery != null ? Math.round(Number(record.battery)) : null;

    return {
      timestamp: record.timestamp || Date.now(),
      temperature: t,
      humidity: h,
      battery: b,
      source: record.source || 'gatt_live',
      type: record.type || 'live',
      rssi: record.rssi != null ? record.rssi : null
    };
  }
}

// ==========================================
// 3. STORAGE MANAGER (IndexedDB + RAM Cache)
// ==========================================
class TelemetryStorage {
  constructor() {
    this.dbName = 'XiaomiSmartTempDB_v3';
    this.storeName = 'measurements';
    this.db = null;
    this.records = [];
    this.initPromise = this.initDB();
  }

  async initDB() {
    return new Promise((resolve) => {
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
      request.onerror = () => {
        console.warn('IndexedDB başlatılamadı, RAM önbellek kullanılıyor.');
        resolve(null);
      };
    });
  }

  async loadAllRecords() {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => {
        this.records = (req.result || []).map(r => TelemetryProcessor.format(r));
        this.records.sort((a, b) => a.timestamp - b.timestamp);
        resolve(this.records);
      };
      req.onerror = () => resolve([]);
    });
  }

  async addRecord(record) {
    const formatted = TelemetryProcessor.format(record);
    this.records.push(formatted);
    this.records.sort((a, b) => a.timestamp - b.timestamp);

    if (this.db) {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).add(formatted);
    }
    return formatted;
  }

  async addBatch(recordsList) {
    if (!recordsList || recordsList.length === 0) return 0;
    const existingTimestamps = new Set(this.records.map(r => r.timestamp));
    const toInsert = [];

    for (let i = 0; i < recordsList.length; i++) {
      const formatted = TelemetryProcessor.format(recordsList[i]);
      if (!existingTimestamps.has(formatted.timestamp)) {
        existingTimestamps.add(formatted.timestamp);
        this.records.push(formatted);
        toInsert.push(formatted);
      }
    }

    if (toInsert.length > 0 && this.db) {
      // Tek bir atomik IndexedDB transaction - Sıfır donma, anında yazım
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      for (let i = 0; i < toInsert.length; i++) {
        store.add(toInsert[i]);
      }
    }

    this.records.sort((a, b) => a.timestamp - b.timestamp);
    return toInsert.length;
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
      'Nem_Yuzde',
      'Pil_Yuzde',
      'Sinyal_RSSI'
    ];
    const rows = this.records.map((r, i) => {
      const d = new Date(r.timestamp);
      const humVal = typeof r.humidity === 'number' ? r.humidity.toFixed(2) : parseFloat(r.humidity).toFixed(2);
      return [
        i + 1,
        d.toLocaleDateString('tr-TR'),
        d.toLocaleTimeString('tr-TR'),
        r.type === 'history_hour' ? 'Cihaz Geçmişi' : (r.source === 'ble_adv' ? 'BLE Sinyal Yayını' : 'GATT Canlı'),
        r.temperature.toFixed(2),
        !isNaN(parseFloat(humVal)) ? humVal : r.humidity,
        r.battery != null ? r.battery : '',
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
// 4. UNIVERSAL BLE MANAGER (Light-Speed Engine)
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
    this.isConnecting = false;
    this.isFetchingHistory = false;
    this.deviceProfile = 'unknown'; // 'stock_xiaomi' | 'atc'

    this.primaryService = null;
    this.atcChar = null;
    this.isWatchingAdvertisements = false;
    this.packetCount = 0;
    this.lastRssi = null;

    this.cachedTemp = null;
    this.cachedHum = null;
    this.cachedBat = 100;
  }

  // Hafızada kayıtlı ATC_597941 veya diğer LYWSD03MMC cihazına anında bağlan
  async tryAutoConnect() {
    if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;
    try {
      const devices = await navigator.bluetooth.getDevices();
      if (devices && devices.length > 0) {
        const target = devices.find(d => d.name === 'ATC_597941') ||
                       devices.find(d => d.name && d.name.startsWith('ATC_')) ||
                       devices.find(d => d.name && (d.name.includes('LYWSD') || d.name.includes('MHO') || d.name.includes('Thermo'))) ||
                       devices[0];
        if (target) {
          console.log(`⚡ ${target.name} bulundu, kamikaze ışık hızında bağlanılıyor...`);
          return await this.connectToDevice(target);
        }
      }
    } catch (e) {
      console.warn('Otomatik bağlanma hatası:', e);
    }
    return false;
  }

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Tarayıcınız Web Bluetooth API desteği sağlamıyor. Lütfen Google Chrome veya Microsoft Edge kullanın.');
    }

    this.onStatus('scanning', 'ATC_597941 aranıyor...');

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
        this.device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: optionalServices
        });
      }
    } catch (err) {
      this.isConnected = false;
      this.isConnecting = false;
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
    this.isConnecting = true;
    this.device = device;
    const devName = this.device.name || 'ATC_597941';
    this.onStatus('connecting', `${devName} bağlanıyor...`);

    this.device.removeEventListener?.('gattserverdisconnected', this._boundDisconnect);
    this._boundDisconnect = () => this.handleDisconnect();
    this.device.addEventListener('gattserverdisconnected', this._boundDisconnect);

    // 1. Reklam Paket Yakalayıcı (Pasif Veri)
    this.startAdvertisementWatcher();

    // 2. GATT Bağlantısı (Aktif Çift Yönlü İletişim)
    try {
      this.server = await this.device.gatt.connect();
    } catch (connErr) {
      console.warn('GATT bağlantısı kurulamadı:', connErr);
      if (this.isWatchingAdvertisements) {
        this.isConnected = true;
        this.isConnecting = false;
        this.onStatus('connected', `${devName} (BLE Sinyal Yayını Aktif)`);
        return true;
      }
      this.isConnecting = false;
      throw connErr;
    }

    // 3. GATT Profillerine abone ol
    await this.setupGattProfiles();

    this.isConnected = true;
    this.isConnecting = false;
    const fwBadge = this.deviceProfile === 'atc' ? 'ATC Modlu FW' : 'Xiaomi Orijinal FW';
    this.onStatus('connected', `${devName} (${fwBadge})`);
    return true;
  }

  startAdvertisementWatcher() {
    if (!this.device || !this.device.watchAdvertisements) return;
    try {
      this.device.addEventListener('advertisementreceived', (event) => {
        this.handleAdvertisementPacket(event);
      });
      this.device.watchAdvertisements().then(() => {
        this.isWatchingAdvertisements = true;
      }).catch(() => {});
    } catch (e) {}
  }

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

      // 1. Environmental Sensing Service (0x181A) — ATC / PVVX
      if (lowerKey.includes('181a')) {
        this.deviceProfile = 'atc';
        if (len >= 15) {
          const temp = b.getInt16(6, true) / 100.0;
          const hum = b.getInt16(8, true) / 100.0;
          const bat = b.getUint8(12);
          this.emitTelemetry(temp, hum, bat, 'ble_adv', 'atc');
          return;
        } else if (len >= 13) {
          const temp = b.getInt16(6, false) / 10.0;
          const hum = b.getUint8(8);
          const bat = b.getUint8(9);
          this.emitTelemetry(temp, hum, bat, 'ble_adv', 'atc');
          return;
        }
      }

      // 2. BTHome v2 (0xFCD2)
      if (lowerKey.includes('fcd2') && len > 1) {
        this.deviceProfile = 'atc';
        let ptr = 1;
        let t = null, h = null, bPct = 100;
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
            ptr += 3;
          } else {
            ptr++;
          }
        }
        if (t !== null && h !== null) {
          this.emitTelemetry(t, h, bPct, 'ble_adv', 'atc');
          return;
        }
      }

      // 3. Xiaomi MiBeacon (0xFE95)
      if (lowerKey.includes('fe95') && len >= 14) {
        this.deviceProfile = 'stock_xiaomi';
        for (let p = 11; p < len - 3; p++) {
          const objId = b.getUint16(p, true);
          const objLen = b.getUint8(p + 2);
          if (objId === 0x100d && objLen === 4 && p + 7 <= len) {
            const temp = b.getInt16(p + 3, true) / 10.0;
            const hum = b.getInt16(p + 5, true) / 10.0;
            this.emitTelemetry(temp, hum, 95, 'ble_adv', 'stock_xiaomi');
            return;
          }
        }
      }
    }
  }

  async setupGattProfiles() {
    let bound = false;

    // 1. ATC Standart Environmental Sensing (0x181A)
    try {
      const envService = await this.server.getPrimaryService(BLE_PROFILES.ENV_SENSING_SERVICE)
        .catch(() => this.server.getPrimaryService(0x181a));

      if (envService) {
        this.deviceProfile = 'atc';
        await this.bindAtcEnvService(envService);
        bound = true;
      }
    } catch (e) {}

    // 2. ATC Custom Control Servisi (0x1F10 & 0x1F1F)
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
          bound = true;
        }
      }
    } catch (e) {}

    // 3. Standart Pil Servisi (0x180F)
    try {
      const batService = await this.server.getPrimaryService(BLE_PROFILES.BATTERY_SERVICE)
        .catch(() => this.server.getPrimaryService(0x180f));
      if (batService) {
        const batChar = await batService.getCharacteristic(BLE_PROFILES.CHAR_BATTERY)
          .catch(() => batService.getCharacteristic(0x2a19));
        if (batChar) {
          const val = await batChar.readValue().catch(() => null);
          if (val && val.byteLength > 0) {
            this.cachedBat = val.getUint8(0);
          }
          batChar.addEventListener('characteristicvaluechanged', (e) => {
            if (e.target.value && e.target.value.byteLength > 0) {
              this.cachedBat = e.target.value.getUint8(0);
              if (this.cachedTemp !== null && this.cachedHum !== null) {
                this.emitTelemetry(this.cachedTemp, this.cachedHum, this.cachedBat, 'gatt_live', this.deviceProfile);
              }
            }
          });
          await batChar.startNotifications().catch(() => {});
        }
      }
    } catch (e) {}

    // 4. Orijinal Xiaomi Servisi
    if (!bound) {
      try {
        const xiaomiService = await this.server.getPrimaryService(BLE_PROFILES.XIAOMI_SERVICE);
        if (xiaomiService) {
          this.deviceProfile = 'stock_xiaomi';
          this.primaryService = xiaomiService;
          await this.bindXiaomiStockService(xiaomiService);
          bound = true;
        }
      } catch (e) {}
    }
  }

  async bindAtcEnvService(service) {
    try {
      const tempChar = await service.getCharacteristic(BLE_PROFILES.CHAR_TEMP_HIGH_RES)
        .catch(() => service.getCharacteristic(BLE_PROFILES.CHAR_TEMP_STD))
        .catch(() => service.getCharacteristic(0x2a6e))
        .catch(() => service.getCharacteristic(0x2a1f));

      if (tempChar) {
        const initial = await tempChar.readValue().catch(() => null);
        if (initial && initial.byteLength >= 2) {
          this.cachedTemp = initial.getInt16(0, true) / 100.0;
        }
        tempChar.addEventListener('characteristicvaluechanged', (e) => {
          const v = e.target.value;
          if (v && v.byteLength >= 2) {
            this.cachedTemp = v.getInt16(0, true) / 100.0;
            if (this.cachedHum !== null) {
              this.emitTelemetry(this.cachedTemp, this.cachedHum, this.cachedBat, 'gatt_live', 'atc');
            }
          }
        });
        await tempChar.startNotifications().catch(() => {});
      }
    } catch (e) {}

    try {
      const humChar = await service.getCharacteristic(BLE_PROFILES.CHAR_HUMIDITY)
        .catch(() => service.getCharacteristic(0x2a6f));

      if (humChar) {
        const initial = await humChar.readValue().catch(() => null);
        if (initial) {
          this.cachedHum = initial.byteLength >= 2
            ? initial.getUint16(0, true) / 100.0
            : initial.getUint8(0);
        }
        humChar.addEventListener('characteristicvaluechanged', (e) => {
          const v = e.target.value;
          if (v) {
            this.cachedHum = v.byteLength >= 2
              ? v.getUint16(0, true) / 100.0
              : v.getUint8(0);
            if (this.cachedTemp !== null) {
              this.emitTelemetry(this.cachedTemp, this.cachedHum, this.cachedBat, 'gatt_live', 'atc');
            }
          }
        });
        await humChar.startNotifications().catch(() => {});
      }
    } catch (e) {}
  }

  async bindXiaomiStockService(service) {
    const liveChar = await service.getCharacteristic(BLE_PROFILES.CHAR_STOCK_LIVE);
    if (!liveChar) return;

    const initialVal = await liveChar.readValue().catch(() => null);
    if (initialVal && initialVal.byteLength >= 5) {
      const temp = initialVal.getInt16(0, true) / 100.0;
      const hum = initialVal.getUint8(2);
      const volt = initialVal.getInt16(3, true) / 1000.0;
      const bat = Math.min(100, Math.max(0, Math.round(((volt - 2.1) / 1.0) * 100)));
      this.cachedTemp = temp;
      this.cachedHum = hum;
      this.cachedBat = bat;
      this.emitTelemetry(temp, hum, bat, 'gatt_live', 'stock_xiaomi');
    }

    liveChar.addEventListener('characteristicvaluechanged', (e) => {
      const val = e.target.value;
      if (val && val.byteLength >= 5) {
        const temp = val.getInt16(0, true) / 100.0;
        const hum = val.getUint8(2);
        const volt = val.getInt16(3, true) / 1000.0;
        const bat = Math.min(100, Math.max(0, Math.round(((volt - 2.1) / 1.0) * 100)));
        this.cachedTemp = temp;
        this.cachedHum = hum;
        this.cachedBat = bat;
        this.emitTelemetry(temp, hum, bat, 'gatt_live', 'stock_xiaomi');
      }
    });

    await liveChar.startNotifications().catch(() => {});
  }

  handleAtcNotification(value) {
    if (!value || value.byteLength < 1) return;
    const cmdId = value.getUint8(0);

    // 0x35: Flash Geçmiş Ölçüm Kayıtları
    if (cmdId === 0x35 && this._atcHistoryHandler) {
      this._atcHistoryHandler(value);
      return;
    }

    // 0x33: Canlı Ölçüm Paketi [0x33, tm_lo, tm_hi, hm_lo, hm_hi, vb_lo, vb_hi, bat]
    if (cmdId === 0x33 && value.byteLength >= 8) {
      const temp = value.getInt16(1, true) / 100.0;
      const hum = value.getUint16(3, true) / 100.0;
      const bat = value.getUint8(7);
      this.cachedTemp = temp;
      this.cachedHum = hum;
      this.cachedBat = bat;
      this.emitTelemetry(temp, hum, bat, 'gatt_live', 'atc');
    }
  }

  async sendAtcCommand(cmdBytes) {
    if (!this.atcChar) throw new Error('0x1F1F karakteristiği bulunamadı.');
    const buf = cmdBytes instanceof Uint8Array ? cmdBytes : new Uint8Array(cmdBytes);
    if (this.atcChar.writeValueWithoutResponse) {
      await this.atcChar.writeValueWithoutResponse(buf);
    } else {
      await this.atcChar.writeValue(buf);
    }
  }

  emitTelemetry(temperature, humidity, battery, source = 'gatt_live', profile = 'atc') {
    if (this.onData) {
      this.onData({
        timestamp: Date.now(),
        temperature: Number(temperature.toFixed(2)),
        humidity: Number(humidity.toFixed(2)),
        battery: battery != null ? battery : this.cachedBat,
        rssi: this.lastRssi,
        source: source,
        type: 'live',
        profile: profile
      });
    }
  }

  // Cihazın dahili flaş belleğindeki geçmişi ışık hızında aktarma
  async fetchDeviceHistory() {
    if (!this.isConnected) {
      throw new Error('Cihaz bağlı değil.');
    }
    if (this.isFetchingHistory) {
      return [];
    }

    this.isFetchingHistory = true;
    this.onHistoryProgress({ active: true, percent: 5, message: 'Flaş bellek taranıyor...' });

    try {
      if (this.atcChar) {
        const fetchedRecords = await this.fetchAtcHistoryFromFlash();
        this.isFetchingHistory = false;
        this.onHistoryProgress({ active: false, percent: 100, message: 'Tamamlandı' });
        return fetchedRecords;
      }

      if (this.deviceProfile === 'stock_xiaomi' && this.primaryService) {
        const historyChar = await this.primaryService.getCharacteristic(BLE_PROFILES.CHAR_HISTORY_STREAM);
        if (historyChar) {
          await historyChar.startNotifications();
          const records = [];
          const handler = (e) => {
            const chunk = e.target.value;
            if (chunk) {
              const item = this.parseHistoryChunk(chunk);
              if (item) records.push(item);
            }
          };
          historyChar.addEventListener('characteristicvaluechanged', handler);
          await new Promise(r => setTimeout(r, 1200));
          historyChar.removeEventListener('characteristicvaluechanged', handler);
          await historyChar.stopNotifications().catch(() => {});
          this.isFetchingHistory = false;
          this.onHistoryProgress({ active: false, percent: 100, message: 'Tamamlandı' });
          return records;
        }
      }

      this.onHistoryProgress({ active: false, percent: 100, message: 'Kayıt bulunamadı' });
      this.isFetchingHistory = false;
      return [];
    } catch (err) {
      this.isFetchingHistory = false;
      this.onHistoryProgress({ active: false, percent: 0, message: 'Hata' });
      throw err;
    }
  }

  async fetchAtcHistoryFromFlash() {
    return new Promise(async (resolve, reject) => {
      const rawSamples = [];
      let expectedTotal = null;
      let timeoutTimer = null;
      let hasCompleted = false;

      const finishDownload = async () => {
        if (hasCompleted) return;
        hasCompleted = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this._atcHistoryHandler = null;

        if (rawSamples.length === 0) {
          resolve([]);
          return;
        }

        try {
          const validEpochSamples = rawSamples.filter(s => s.tc > 1577836800);
          const isEpochValid = validEpochSamples.length > 0;
          const maxTc = Math.max(...rawSamples.map(s => s.tc));
          const nowMs = Date.now();

          const records = rawSamples.map(s => {
            let ts;
            if (isEpochValid && s.tc > 1577836800) {
              ts = s.tc * 1000;
            } else {
              const diffSec = maxTc - s.tc;
              ts = nowMs - (diffSec * 1000);
            }

            const volt = Number((s.vb / 1000.0).toFixed(2));
            const bat = Math.max(0, Math.min(100, Math.round(((volt - 2.1) / 1.0) * 100)));

            return TelemetryProcessor.format({
              timestamp: ts,
              temperature: Number(s.tm.toFixed(2)),
              humidity: Number(s.hm.toFixed(2)),
              battery: bat,
              source: 'device_flash',
              type: 'history_hour'
            });
          });

          records.sort((a, b) => a.timestamp - b.timestamp);

          // Cihaz saatini eşitle (Cmd 0x23)
          try {
            const timeNowSec = Math.floor(Date.now() / 1000);
            const timePkt = new Uint8Array([
              0x23,
              timeNowSec & 0xff,
              (timeNowSec >> 8) & 0xff,
              (timeNowSec >> 16) & 0xff,
              (timeNowSec >> 24) & 0xff
            ]);
            await this.sendAtcCommand(timePkt).catch(() => {});
          } catch (e) {}

          resolve(records);
        } catch (err) {
          reject(err);
        }
      };

      const resetTimeout = (delay = 600) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        timeoutTimer = setTimeout(() => {
          finishDownload();
        }, delay);
      };

      this._atcHistoryHandler = (val) => {
        const len = val.byteLength;
        if (len === 2) {
          expectedTotal = val.getUint16(1, true);
          this.onHistoryProgress({
            active: true,
            percent: 15,
            message: `${expectedTotal} kayıt aktarılıyor...`
          });
          resetTimeout(1500);
        } else if (len >= 13) {
          const cnt = val.getUint16(1, true);
          const tc = val.getUint32(3, true);
          const tm = val.getInt16(7, true) / 100.0;
          const hm = val.getUint16(9, true) / 100.0;
          const vb = val.getUint16(11, true);

          rawSamples.push({ cnt, tc, tm, hm, vb });

          // Beklenen sayıya ulaşıldıysa anında bitir!
          if (expectedTotal && rawSamples.length >= expectedTotal) {
            finishDownload();
            return;
          }

          let pct;
          if (expectedTotal && expectedTotal > 0) {
            pct = Math.min(95, Math.round((rawSamples.length / expectedTotal) * 80) + 15);
          } else {
            pct = Math.min(92, 15 + Math.floor(rawSamples.length / 5));
          }

          this.onHistoryProgress({
            active: true,
            percent: pct,
            message: `${rawSamples.length} kayıt aktarıldı...`
          });

          resetTimeout(600);
        } else if (len >= 3 && len < 13) {
          finishDownload();
        }
      };

      try {
        const cmd = new Uint8Array([0x35, 0xff, 0xff, 0x00, 0x00]);
        await this.sendAtcCommand(cmd);
        resetTimeout(2000);
      } catch (err) {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this._atcHistoryHandler = null;
        reject(err);
      }
    });
  }

  parseHistoryChunk(value) {
    if (!value || value.byteLength < 14) return null;
    const timestampSec = value.getUint32(4, true);
    const tempRawMax = value.getInt16(8, true);
    const humMax = value.getUint8(10);

    return TelemetryProcessor.format({
      timestamp: timestampSec * 1000,
      temperature: tempRawMax / 10.0,
      humidity: humMax,
      battery: this.cachedBat,
      source: 'device_flash',
      type: 'history_hour'
    });
  }

  async disconnect() {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.onStatus('disconnected', 'Bağlantı kesildi.');
  }

  handleDisconnect() {
    this.isConnected = false;
    this.isConnecting = false;
    this.onStatus('disconnected', 'Bağlantı koptu.');
  }
}

// ==========================================
// 5. APPLICATION CONTROLLER
// ==========================================
class AppController {
  constructor() {
    this.storage = new TelemetryStorage();
    this.ble = new UniversalBleManager(
      (data) => this.handleNewData(data),
      (status, text) => this.handleBleStatus(status, text),
      (prog) => this.handleHistoryProgress(prog),
      (sig) => this.handleSignalUpdate(sig)
    );

    this.currentTheme = localStorage.getItem('smarttemp_theme') || 'light';
    this.currentUnit = localStorage.getItem('smarttemp_unit') || 'C';
    this.chartRange = 'all';
    this.chartMode = 'temps'; // 'temps' | 'hum' | 'all'
    this.currentPage = 1;
    this.pageSize = 15;
    this.latestTelemetry = null;

    this.cacheDomElements();
    this.init();
  }

  cacheDomElements() {
    this.dom = {
      // Header & Navigation
      liveClockTime: document.getElementById('liveClockTime'),
      liveClockDate: document.getElementById('liveClockDate'),
      offlineBadge: document.getElementById('offlineBadge'),
      offlineBadgeMobile: document.getElementById('offlineBadgeMobile'),
      connectionDot: document.getElementById('connectionDot'),
      connectionDotMobile: document.getElementById('connectionDotMobile'),
      connectionStatusText: document.getElementById('connectionStatusText'),
      lastUpdatedAgo: document.getElementById('lastUpdatedAgo'),
      signalPill: document.getElementById('signalPill'),
      signalPillMobile: document.getElementById('signalPillMobile'),
      signalRssiText: document.getElementById('signalRssiText'),
      signalRssiTextMobile: document.getElementById('signalRssiTextMobile'),
      signalBarsHeader: document.getElementById('signalBarsHeader'),
      signalBarsMobile: document.getElementById('signalBarsMobile'),
      signalBarsCard: document.getElementById('signalBarsCard'),
      btnConnect: document.getElementById('btnConnect'),
      btnConnectMobile: document.getElementById('btnConnectMobile'),
      btnThemeToggle: document.getElementById('btnThemeToggle'),
      themeIcon: document.getElementById('themeIcon'),
      themeLabel: document.getElementById('themeLabel'),

      // Sync Progress Banner
      syncProgressBanner: document.getElementById('syncProgressBanner'),
      syncProgressLabel: document.getElementById('syncProgressLabel'),
      syncProgressPercent: document.getElementById('syncProgressPercent'),
      syncProgressBar: document.getElementById('syncProgressBar'),

      // Primary Cards
      valTemp: document.getElementById('valTemp'),
      lblTempUnit: document.getElementById('lblTempUnit'),
      btnToggleUnit: document.getElementById('btnToggleUnit'),
      tempMinMax: document.getElementById('tempMinMax'),
      tempTrendBadge: document.getElementById('tempTrendBadge'),

      valHum: document.getElementById('valHum'),
      humidityStatusBadge: document.getElementById('humidityStatusBadge'),
      humProgressBar: document.getElementById('humProgressBar'),
      humMinMax: document.getElementById('humMinMax'),

      valBattery: document.getElementById('valBattery'),
      batteryProgressBar: document.getElementById('batteryProgressBar'),
      totalPointsCount: document.getElementById('totalPointsCount'),
      valRssi: document.getElementById('valRssi'),

      // Chart & Analytics
      chartStatsStrip: document.getElementById('chartStatsStrip'),
      chartKpiCurrent: document.getElementById('chartKpiCurrent'),
      chartKpiCurrentUnit: document.getElementById('chartKpiCurrentUnit'),
      chartKpiMin: document.getElementById('chartKpiMin'),
      chartKpiMinTime: document.getElementById('chartKpiMinTime'),
      chartKpiMax: document.getElementById('chartKpiMax'),
      chartKpiMaxTime: document.getElementById('chartKpiMaxTime'),
      chartKpiAvg: document.getElementById('chartKpiAvg'),
      chartKpiCount: document.getElementById('chartKpiCount'),
      chartEmptyOverlay: document.getElementById('chartEmptyOverlay'),
      telemetryChart: document.getElementById('telemetryChart'),

      // Records Table & Feed
      btnFetchHistory: document.getElementById('btnFetchHistory'),
      btnExportCsv: document.getElementById('btnExportCsv'),
      btnExportJson: document.getElementById('btnExportJson'),
      btnClearData: document.getElementById('btnClearData'),
      mobileHistoryFeed: document.getElementById('mobileHistoryFeed'),
      historyTableBody: document.getElementById('historyTableBody'),
      tableSummaryText: document.getElementById('tableSummaryText'),
      btnPrevPage: document.getElementById('btnPrevPage'),
      pageIndicator: document.getElementById('pageIndicator'),
      btnNextPage: document.getElementById('btnNextPage'),

      // Toast
      toastContainer: document.getElementById('toastContainer')
    };
  }

  async init() {
    this.initServiceWorker();
    this.initNetworkStatus();
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

    // KAMIKAZE HIZI: Sayfa açılır açılmaz doğrudan cihaza bağlanmayı dene
    this.ble.tryAutoConnect().catch(() => {});

    // Kullanıcı ekranda nereye dokunursa dokunsun anında bağlanmayı tetikle (User Gesture)
    const fastConnectGesture = async () => {
      if (!this.ble.isConnected && !this.ble.isConnecting) {
        try {
          await this.connectBluetooth();
        } catch (e) {}
      }
      window.removeEventListener('pointerdown', fastConnectGesture);
    };
    window.addEventListener('pointerdown', fastConnectGesture, { once: true });

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
            console.log('✅ ServiceWorker hazır:', reg.scope);
          })
          .catch((err) => {
            console.warn('ServiceWorker kayıt hatası:', err);
          });
      });
    }
  }

  initNetworkStatus() {
    const updateOnline = () => {
      const isOnline = navigator.onLine;
      if (this.dom.offlineBadge) {
        this.dom.offlineBadge.classList.toggle('hidden', isOnline);
        this.dom.offlineBadge.classList.toggle('inline-flex', !isOnline);
      }
      if (this.dom.offlineBadgeMobile) {
        this.dom.offlineBadgeMobile.classList.toggle('hidden', isOnline);
        this.dom.offlineBadgeMobile.classList.toggle('flex', !isOnline);
      }
    };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    updateOnline();
  }

  initLiveClock() {
    const update = () => {
      const now = new Date();
      if (this.dom.liveClockTime) {
        this.dom.liveClockTime.textContent = now.toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
      if (this.dom.liveClockDate) {
        this.dom.liveClockDate.textContent = now.toLocaleDateString('tr-TR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }
    };
    update();
    setInterval(update, 1000);
  }

  setupEventListeners() {
    // Bluetooth Connect Buttons
    const handleConnect = () => {
      if (this.ble.isConnected) {
        this.ble.disconnect();
      } else {
        this.connectBluetooth();
      }
    };
    if (this.dom.btnConnect) this.dom.btnConnect.addEventListener('click', handleConnect);
    if (this.dom.btnConnectMobile) this.dom.btnConnectMobile.addEventListener('click', handleConnect);

    // Theme Toggle
    if (this.dom.btnThemeToggle) {
      this.dom.btnThemeToggle.addEventListener('click', () => {
        const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(nextTheme);
      });
    }

    // Unit Switcher (°C / °F)
    if (this.dom.btnToggleUnit) {
      this.dom.btnToggleUnit.addEventListener('click', () => {
        this.currentUnit = this.currentUnit === 'C' ? 'F' : 'C';
        localStorage.setItem('smarttemp_unit', this.currentUnit);
        if (this.latestTelemetry) {
          this.renderTelemetryCards(this.latestTelemetry);
        }
        this.updateStatsAndTable();
        this.updateChart();
      });
    }

    // Range Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.chartRange = e.currentTarget.dataset.range || 'all';
        this.updateChart();
      });
    });

    // Chart Parameter Modes
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.chartMode = e.currentTarget.dataset.mode || 'temps';
        this.updateChart();
      });
    });

    // Device History Fetch
    if (this.dom.btnFetchHistory) {
      this.dom.btnFetchHistory.addEventListener('click', () => this.syncDeviceHistory(false));
    }

    // CSV & JSON Exports
    if (this.dom.btnExportCsv) {
      this.dom.btnExportCsv.addEventListener('click', () => {
        const csv = this.storage.exportCSV();
        if (!csv) {
          this.showToast('Dışa aktarılacak ölçüm kaydı bulunamadı.', 'info');
          return;
        }
        this.downloadFile(csv, `Xiaomi_SmartTemp_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
        this.showToast('CSV verileri başarıyla indirildi.', 'success');
      });
    }

    if (this.dom.btnExportJson) {
      this.dom.btnExportJson.addEventListener('click', () => {
        const json = this.storage.exportJSON();
        this.downloadFile(json, `Xiaomi_SmartTemp_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
        this.showToast('JSON arşivi başarıyla indirildi.', 'success');
      });
    }

    // Clear Database
    if (this.dom.btnClearData) {
      this.dom.btnClearData.addEventListener('click', async () => {
        if (confirm('Tüm kayıtlar silinecek. Emin misiniz?')) {
          await this.storage.clearAll();
          this.latestTelemetry = null;
          this.updateStatsAndTable();
          this.updateChart();
          this.showToast('Tüm telemetri geçmişi temizlendi.', 'info');
        }
      });
    }

    // Pagination
    if (this.dom.btnPrevPage) {
      this.dom.btnPrevPage.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderTable();
        }
      });
    }

    if (this.dom.btnNextPage) {
      this.dom.btnNextPage.addEventListener('click', () => {
        const maxPage = Math.ceil(this.storage.records.length / this.pageSize) || 1;
        if (this.currentPage < maxPage) {
          this.currentPage++;
          this.renderTable();
        }
      });
    }
  }

  async connectBluetooth() {
    try {
      await this.ble.connect();
    } catch (err) {
      console.warn('Bluetooth bağlantı hatası:', err);
      if (err.name !== 'NotFoundError') {
        this.showToast(`Bağlantı hatası: ${err.message}`, 'error');
      }
    }
  }

  async syncDeviceHistory(isAuto = false) {
    if (!this.ble.isConnected) {
      if (!isAuto) {
        this.showToast('Önce Bluetooth bağlantısı kurmalısınız.', 'info');
      }
      return;
    }

    try {
      if (!isAuto) {
        this.showToast('Cihaz belleğindeki ölçümler taranıyor...', 'info');
      }
      const records = await this.ble.fetchDeviceHistory();
      if (records && records.length > 0) {
        const addedCount = await this.storage.addBatch(records);
        this.updateStatsAndTable();
        this.updateChart();
        this.showToast(`Cihaz belleğinden ${records.length} ölçüm başarıyla aktarıldı (${addedCount} yeni).`, 'success');
      } else {
        if (!isAuto) {
          this.showToast('Cihaz belleğinde yeni kayıt bulunamadı.', 'info');
        }
      }
    } catch (err) {
      console.warn('Bellek okuma hatası:', err);
      if (!isAuto) {
        this.showToast(`Bellek okuma hatası: ${err.message}`, 'error');
      }
    }
  }

  handleBleStatus(status, text) {
    if (this.dom.connectionStatusText) this.dom.connectionStatusText.textContent = text;

    if (status === 'connected') {
      // ANINDA VERİ AKTARIMI: Hiç beklemeden bellek aktarımını başlat
      this.syncDeviceHistory(true);
    }

    const updateDot = (el) => {
      if (!el) return;
      el.className = 'w-2.5 h-2.5 rounded-full inline-block flex-shrink-0';
      if (status === 'connected') {
        el.classList.add('bg-[#0b57d0]', 'dark:bg-[#a8c7fa]');
      } else if (status === 'connecting' || status === 'scanning') {
        el.classList.add('bg-amber-500');
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
        btn.className = `${isMobile ? 'flex-1' : ''} py-2.5 px-4 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 bg-[#ba1a1a] hover:bg-[#93000a] text-white shadow-sm`;
      } else {
        btn.innerHTML = `<i data-lucide="bluetooth" class="w-4 h-4"></i><span>Cihaza Bağlan</span>`;
        btn.className = `${isMobile ? 'flex-1' : ''} py-2.5 px-4 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-sm`;
      }
    };
    updateBtn(this.dom.btnConnect, false);
    updateBtn(this.dom.btnConnectMobile, true);

    const isConnected = status === 'connected';
    if (this.dom.lastUpdatedAgo) this.dom.lastUpdatedAgo.classList.toggle('hidden', !isConnected);

    lucide.createIcons();
  }

  handleSignalUpdate({ rssi }) {
    if (rssi == null) return;
    if (this.dom.valRssi) this.dom.valRssi.textContent = `${rssi} dBm`;
    if (this.dom.signalRssiText) this.dom.signalRssiText.textContent = `${rssi} dBm`;
    if (this.dom.signalRssiTextMobile) this.dom.signalRssiTextMobile.textContent = `${rssi} dBm`;

    if (this.dom.signalPill) {
      this.dom.signalPill.classList.remove('hidden');
      this.dom.signalPill.classList.add('md:flex');
    }
    if (this.dom.signalPillMobile) {
      this.dom.signalPillMobile.classList.remove('hidden');
      this.dom.signalPillMobile.classList.add('flex');
    }

    this.updateSignalBars(rssi);
  }

  updateSignalBars(rssi) {
    let activeCount = 1;
    if (rssi >= -65) activeCount = 4;
    else if (rssi >= -78) activeCount = 3;
    else if (rssi >= -88) activeCount = 2;

    const setBars = (container) => {
      if (!container) return;
      const bars = container.querySelectorAll('.signal-bar');
      bars.forEach((b, idx) => {
        b.classList.toggle('active', idx < activeCount);
      });
    };
    setBars(this.dom.signalBarsHeader);
    setBars(this.dom.signalBarsMobile);
    setBars(this.dom.signalBarsCard);
  }

  handleHistoryProgress({ active, percent, message }) {
    if (!this.dom.syncProgressBanner) return;
    if (active) {
      this.dom.syncProgressBanner.classList.remove('hidden');
      this.dom.syncProgressLabel.textContent = message;
      this.dom.syncProgressPercent.textContent = `${percent}%`;
      this.dom.syncProgressBar.style.width = `${percent}%`;
    } else {
      this.dom.syncProgressBanner.classList.add('hidden');
      this.dom.syncProgressBar.style.width = '0%';
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
    this.dom.valTemp.textContent = displayTemp.toFixed(2);
    this.dom.lblTempUnit.textContent = `°${this.currentUnit}`;

    // Bağıl Nem Değeri
    const humNum = Number(data.humidity);
    const humFormatted = !isNaN(humNum) ? humNum.toFixed(2) : data.humidity;

    // Grafik KPI Son Okunan Değer
    if (this.dom.chartKpiCurrent) {
      if (this.chartMode === 'hum') {
        this.dom.chartKpiCurrent.textContent = `%${humFormatted}`;
        if (this.dom.chartKpiCurrentUnit) this.dom.chartKpiCurrentUnit.textContent = '%';
      } else {
        this.dom.chartKpiCurrent.textContent = displayTemp.toFixed(2);
        if (this.dom.chartKpiCurrentUnit) this.dom.chartKpiCurrentUnit.textContent = `°${this.currentUnit}`;
      }
    }

    // 2. Bağıl Nem Kartı
    this.dom.valHum.textContent = humFormatted;
    this.dom.humProgressBar.style.width = `${Math.min(100, Math.max(0, humNum))}%`;

    if (humNum < 30) {
      this.dom.humidityStatusBadge.textContent = 'Kuru';
      this.dom.humidityStatusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium';
    } else if (humNum > 60) {
      this.dom.humidityStatusBadge.textContent = 'Yüksek Nem';
      this.dom.humidityStatusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] border border-[#0b57d0]/20 font-medium';
    } else {
      this.dom.humidityStatusBadge.textContent = 'İdeal';
      this.dom.humidityStatusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] border border-[#0b57d0]/20 font-medium';
    }

    // 3. Pil & Donanım Kartı
    if (data.battery != null) {
      this.dom.valBattery.textContent = data.battery;
      this.dom.batteryProgressBar.style.width = `${Math.min(100, Math.max(0, data.battery))}%`;
      if (data.battery < 20) {
        this.dom.batteryProgressBar.className = 'h-full bg-rose-500 rounded-full';
      } else if (data.battery < 50) {
        this.dom.batteryProgressBar.className = 'h-full bg-amber-500 rounded-full';
      } else {
        this.dom.batteryProgressBar.className = 'h-full bg-[#0b57d0] dark:bg-[#a8c7fa] rounded-full';
      }
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
    if (this.dom.totalPointsCount) this.dom.totalPointsCount.textContent = list.length;

    if (list.length > 0) {
      const conv = (t) => this.currentUnit === 'F' ? ((t * 9 / 5) + 32).toFixed(2) : t.toFixed(2);

      const temps = list.map(r => r.temperature);
      this.dom.tempMinMax.textContent = `${conv(Math.min(...temps))} / ${conv(Math.max(...temps))}`;

      const hums = list.map(r => r.humidity);
      this.dom.humMinMax.textContent = `%${Math.min(...hums).toFixed(2)} / %${Math.max(...hums).toFixed(2)}`;

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
            <td colspan="5" class="py-8 text-center text-slate-400 dark:text-slate-500 font-sans">
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

    // 1. Mobil Kart Beslemesi
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
        if (this.currentUnit === 'F') {
          t = (t * 9 / 5) + 32;
        }
        const humNum = Number(item.humidity);

        return `
          <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-2.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-slate-500 dark:text-slate-400">${timeStr}</span>
              ${typeBadge}
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/50">
              <div>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-sans">Sıcaklık</span>
                <div class="flex items-baseline gap-1">
                  <span class="text-xl font-extrabold font-mono text-[#0b57d0] dark:text-[#a8c7fa]">${t.toFixed(2)}</span>
                  <span class="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa]">°${this.currentUnit}</span>
                </div>
              </div>
              <div>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-sans">Bağıl Nem</span>
                <div class="flex items-baseline gap-1">
                  <span class="text-xl font-extrabold font-mono text-cyan-600 dark:text-cyan-400">%${humNum.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-200/80 dark:border-slate-700/60 text-slate-500 dark:text-slate-400">
              <span>Pil Durumu: <strong class="text-slate-700 dark:text-slate-300 font-mono">${item.battery != null ? `%${item.battery}` : '--'}</strong></span>
              <span>${item.rssi != null ? `${item.rssi} dBm` : ''}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    // 2. Masaüstü Tablosu (5 Sütunlu Hızlı Tablo)
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
        if (this.currentUnit === 'F') {
          t = (t * 9 / 5) + 32;
        }
        const humNum = Number(item.humidity);

        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td class="py-2.5 sm:py-3 px-3 text-slate-600 dark:text-slate-300 font-sans font-medium">${timeStr}</td>
            <td class="py-2.5 sm:py-3 px-3">${typeBadge}</td>
            <td class="py-2.5 sm:py-3 px-3 font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
              ${t.toFixed(2)} °${this.currentUnit}
            </td>
            <td class="py-2.5 sm:py-3 px-3 text-cyan-600 dark:text-cyan-400 font-semibold">%${humNum.toFixed(2)}</td>
            <td class="py-2.5 sm:py-3 px-3 text-slate-600 dark:text-slate-300 font-semibold">
              ${item.battery != null ? `%${item.battery}` : '--'}
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

    const tempGradient = ctx.createLinearGradient(0, 0, 0, 300);
    tempGradient.addColorStop(0, isDark ? 'rgba(11, 87, 208, 0.3)' : 'rgba(11, 87, 208, 0.15)');
    tempGradient.addColorStop(1, 'rgba(11, 87, 208, 0.0)');

    const humGradient = ctx.createLinearGradient(0, 0, 0, 300);
    humGradient.addColorStop(0, isDark ? 'rgba(2, 132, 199, 0.25)' : 'rgba(2, 132, 199, 0.12)');
    humGradient.addColorStop(1, 'rgba(2, 132, 199, 0.0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            // 0: Sıcaklık
            label: 'Sıcaklık',
            data: [],
            borderColor: '#0b57d0',
            backgroundColor: tempGradient,
            borderWidth: isMobile ? 2.0 : 2.5,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#0b57d0',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2,
            yAxisID: 'yTemp'
          },
          {
            // 1: Bağıl Nem
            label: 'Bağıl Nem',
            data: [],
            borderColor: '#0284c7',
            backgroundColor: humGradient,
            borderWidth: isMobile ? 2.0 : 2.5,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#0284c7',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2,
            yAxisID: 'yHum'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // SIFIR ANIMASYON: Işık hızında çizim
        transitions: {
          active: { animation: { duration: 0 } }
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
            animation: false,
            backgroundColor: isDark ? 'rgba(12, 19, 28, 0.96)' : 'rgba(255, 255, 255, 0.98)',
            borderColor: isDark ? 'rgba(168, 199, 250, 0.25)' : 'rgba(11, 87, 208, 0.2)',
            borderWidth: 1.5,
            titleColor: isDark ? '#f8fafd' : '#041e49',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            padding: 10,
            cornerRadius: 12,
            bodyFont: { family: 'Parkinsans', size: 11, weight: 500 },
            titleFont: { family: 'Parkinsans', size: 12, weight: '700' },
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (val == null) return null;
                const unit = context.dataset.yAxisID === 'yTemp' ? `°${this.currentUnit}` : '%';
                return ` ${label}: ${Number(val).toFixed(2)} ${unit}`;
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
              text: `Sıcaklık (°${this.currentUnit})`,
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
          }
        }
      }
    });
  }

  adaptChartTheme() {
    if (!this.chart) return;
    const isDark = this.currentTheme === 'dark';

    this.chart.options.plugins.legend.labels.color = isDark ? '#94a3b8' : '#475569';
    this.chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(12, 19, 28, 0.96)' : 'rgba(255, 255, 255, 0.98)';
    this.chart.options.plugins.tooltip.borderColor = isDark ? 'rgba(168, 199, 250, 0.25)' : 'rgba(11, 87, 208, 0.2)';
    this.chart.options.plugins.tooltip.titleColor = isDark ? '#f8fafd' : '#041e49';
    this.chart.options.plugins.tooltip.bodyColor = isDark ? '#cbd5e1' : '#334155';

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

    if (records.length === 0 && this.storage.records.length > 0) {
      records = [...this.storage.records];
    }
    if (records.length === 0 && this.latestTelemetry) {
      records = [this.latestTelemetry];
    }

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
      if (this.dom.chartKpiCurrent) this.dom.chartKpiCurrent.textContent = '--.--';
      if (this.dom.chartKpiCurrentUnit) this.dom.chartKpiCurrentUnit.textContent = `°${this.currentUnit}`;
      if (this.dom.chartKpiMin) this.dom.chartKpiMin.textContent = '--.--';
      if (this.dom.chartKpiMinTime) this.dom.chartKpiMinTime.textContent = '--:--';
      if (this.dom.chartKpiMax) this.dom.chartKpiMax.textContent = '--.--';
      if (this.dom.chartKpiMaxTime) this.dom.chartKpiMaxTime.textContent = '--:--';
      if (this.dom.chartKpiAvg) this.dom.chartKpiAvg.textContent = '--.--';
      if (this.dom.chartKpiCount) this.dom.chartKpiCount.textContent = '0 nokta';

      this.chart.data.labels = [];
      this.chart.data.datasets.forEach(ds => { ds.data = []; });
      this.chart.update('none');
      return;
    }

    const pRadius = records.length <= 4 ? 4.0 : 0;
    this.chart.data.datasets.forEach(ds => {
      ds.pointRadius = pRadius;
    });

    if (records.length > 250) {
      const step = Math.ceil(records.length / 250);
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
    const humData = records.map(r => r.humidity);

    this.chart.data.labels = labels;
    this.chart.data.datasets[0].label = `Sıcaklık (°${this.currentUnit})`;
    this.chart.data.datasets[0].data = tempData;
    this.chart.data.datasets[1].label = `Bağıl Nem (%)`;
    this.chart.data.datasets[1].data = humData;

    const ds = this.chart.data.datasets;
    const scales = this.chart.options.scales;

    const formatClock = (ts) => {
      const d = new Date(ts);
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    };

    const setKpiCards = (arr, unit) => {
      if (!arr || arr.length === 0) return;
      const current = arr[arr.length - 1];
      const minVal = Math.min(...arr);
      const minIdx = arr.indexOf(minVal);
      const minTime = formatClock(records[minIdx] ? records[minIdx].timestamp : Date.now());

      const maxVal = Math.max(...arr);
      const maxIdx = arr.lastIndexOf(maxVal);
      const maxTime = formatClock(records[maxIdx] ? records[maxIdx].timestamp : Date.now());

      const sum = arr.reduce((a, b) => a + b, 0);
      const avg = (sum / arr.length).toFixed(2);

      if (this.dom.chartKpiCurrent) this.dom.chartKpiCurrent.textContent = Number(current).toFixed(2);
      if (this.dom.chartKpiCurrentUnit) this.dom.chartKpiCurrentUnit.textContent = unit;
      if (this.dom.chartKpiMin) this.dom.chartKpiMin.textContent = Number(minVal).toFixed(2);
      if (this.dom.chartKpiMinTime) this.dom.chartKpiMinTime.textContent = minTime;
      if (this.dom.chartKpiMax) this.dom.chartKpiMax.textContent = Number(maxVal).toFixed(2);
      if (this.dom.chartKpiMaxTime) this.dom.chartKpiMaxTime.textContent = maxTime;
      if (this.dom.chartKpiAvg) this.dom.chartKpiAvg.textContent = avg;
      if (this.dom.chartKpiCount) this.dom.chartKpiCount.textContent = `${records.length} nokta`;
    };

    if (this.chartMode === 'temps') {
      ds[0].hidden = false;
      ds[1].hidden = true;

      scales.yTemp.display = true;
      scales.yHum.display = false;

      const minT = Math.min(...tempData);
      const maxT = Math.max(...tempData);
      const pad = Math.max(0.6, (maxT - minT) * 0.12);
      scales.yTemp.min = Math.floor((minT - pad) * 2) / 2;
      scales.yTemp.max = Math.ceil((maxT + pad) * 2) / 2;

      setKpiCards(tempData, `°${this.currentUnit}`);
    } else if (this.chartMode === 'hum') {
      ds[0].hidden = true;
      ds[1].hidden = false;

      scales.yTemp.display = false;
      scales.yHum.display = true;

      const minH = Math.min(...humData);
      const maxH = Math.max(...humData);
      scales.yHum.min = Math.max(0, Math.floor((minH - 5) / 5) * 5);
      scales.yHum.max = Math.min(100, Math.ceil((maxH + 5) / 5) * 5);

      setKpiCards(humData, '%');
    } else {
      // Tüm Parametreler: Sıcaklık & Nem
      ds[0].hidden = false;
      ds[1].hidden = false;

      scales.yTemp.display = true;
      scales.yHum.display = true;

      const minT = Math.min(...tempData);
      const maxT = Math.max(...tempData);
      const pad = Math.max(0.6, (maxT - minT) * 0.12);
      scales.yTemp.min = Math.floor((minT - pad) * 2) / 2;
      scales.yTemp.max = Math.ceil((maxT + pad) * 2) / 2;
      scales.yHum.min = 0;
      scales.yHum.max = 100;

      setKpiCards(tempData, `°${this.currentUnit}`);
    }

    this.chart.update('none'); // Animasyonsuz, sıfır gecikme ile anında çiz
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('smarttemp_theme', theme);
    const html = document.documentElement;

    if (theme === 'dark') {
      html.classList.add('dark');
      html.classList.remove('light');
      if (this.dom.themeIcon) this.dom.themeIcon.setAttribute('data-lucide', 'sun');
      if (this.dom.themeLabel) this.dom.themeLabel.textContent = 'Açık';
      const meta = document.getElementById('metaThemeColor');
      if (meta) meta.setAttribute('content', '#0c131c');
    } else {
      html.classList.remove('dark');
      html.classList.add('light');
      if (this.dom.themeIcon) this.dom.themeIcon.setAttribute('data-lucide', 'moon');
      if (this.dom.themeLabel) this.dom.themeLabel.textContent = 'Koyu';
      const meta = document.getElementById('metaThemeColor');
      if (meta) meta.setAttribute('content', '#f8fafc');
    }

    lucide.createIcons();
    this.adaptChartTheme();
  }

  showToast(message, type = 'info') {
    if (!this.dom.toastContainer) return;

    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-[#d3e3fd] text-[#041e49] border-[#0b57d0]/30 dark:bg-[#0842a0] dark:text-[#d3e3fd]',
      error: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200',
      info: 'bg-[#edf2f9] text-[#041e49] border-[#d8e2ee] dark:bg-[#1e2938] dark:text-slate-200',
      warn: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
    };

    toast.className = `p-3 rounded-2xl border shadow-md flex items-center justify-between gap-3 text-xs font-semibold ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button class="p-1 rounded-full hover:opacity-70 text-current">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    `;

    toast.querySelector('button').addEventListener('click', () => {
      toast.remove();
    });

    this.dom.toastContainer.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
      toast.remove();
    }, 3500);
  }

  downloadFile(content, fileName, contentType) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 100);
  }
}

// DOM Yüklendiğinde Başlat
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
