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
// 2. TELEMETRY RECORD FORMATTER & SANITIZER
// ==========================================
class TelemetryProcessor {
  static format(record) {
    const t = typeof record.temperature === 'number'
      ? Number(record.temperature.toFixed(2))
      : parseFloat(record.temperature);
    const h = typeof record.humidity === 'number'
      ? Number(record.humidity.toFixed(2))
      : parseFloat(record.humidity);

    // Gerçekçi sensör aralığı kontrolü
    if (isNaN(t) || isNaN(h) || t < -40 || t > 85 || h < 0 || h > 100) {
      return null;
    }

    let batt = record.battery != null ? Number(record.battery) : null;
    let volt = record.voltage != null ? Number(record.voltage) : null;

    if (volt != null && batt == null) {
      const mv = volt > 10 ? volt : volt * 1000;
      batt = Math.min(100, Math.max(0, Math.round(((mv - 2100) / 900) * 100)));
    }
    if (batt != null && volt == null) {
      volt = Number((2.1 + (batt / 100) * 0.9).toFixed(2));
    }

    return {
      timestamp: record.timestamp || Date.now(),
      temperature: t,
      humidity: h,
      battery: batt != null && !isNaN(batt) ? Math.min(100, Math.max(0, Math.round(batt))) : null,
      voltage: volt != null && !isNaN(volt) ? Number(volt.toFixed(2)) : null,
      source: record.source || 'gatt_live',
      type: record.type || 'live'
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
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => {
        const raw = req.result || [];
        const clean = [];
        for (let i = 0; i < raw.length; i++) {
          const r = raw[i];
          const formatted = TelemetryProcessor.format(r);
          if (formatted) {
            clean.push(formatted);
          } else if (r.id) {
            store.delete(r.id);
          }
        }
        this.records = clean;
        this.records.sort((a, b) => a.timestamp - b.timestamp);
        resolve(this.records);
      };
      req.onerror = () => resolve([]);
    });
  }

  async addRecord(record) {
    const formatted = TelemetryProcessor.format(record);
    if (!formatted) return null;

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
      if (formatted && !existingTimestamps.has(formatted.timestamp)) {
        existingTimestamps.add(formatted.timestamp);
        this.records.push(formatted);
        toInsert.push(formatted);
      }
    }

    if (toInsert.length > 0 && this.db) {
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
      'Voltaj_V'
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
        r.voltage != null ? r.voltage.toFixed(2) : ''
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
  constructor(onDataCallback, onStatusCallback, onHistoryProgressCallback, onSensorTimeCallback) {
    this.onData = onDataCallback;
    this.onStatus = onStatusCallback;
    this.onHistoryProgress = onHistoryProgressCallback;
    this.onSensorTime = onSensorTimeCallback;

    this.device = null;
    this.server = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.isFetchingHistory = false;
    this._activeHistoryPromise = null;
    this.deviceProfile = 'unknown'; // 'stock_xiaomi' | 'atc'

    this.primaryService = null;
    this.atcChar = null;
    this.isWatchingAdvertisements = false;

    this.cachedTemp = null;
    this.cachedHum = null;
    this.cachedBattery = null;
    this.cachedVoltage = null;
  }

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
          console.log(`⚡ ${target.name} bulundu, doğrudan otomatik bağlanılıyor...`);
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

    // 1. Reklam Paket Yakalayıcı
    this.startAdvertisementWatcher();

    // 2. GATT Bağlantısı
    try {
      this.server = await this.device.gatt.connect();
    } catch (connErr) {
      console.warn('GATT bağlantısı kurulamadı:', connErr);
      if (this.isWatchingAdvertisements) {
        this.isConnected = true;
        this.isConnecting = false;
        this.onStatus('connected', `${devName} (BLE Yayın)`);
        return true;
      }
      this.isConnecting = false;
      throw connErr;
    }

    // 3. GATT Servislerini Keşfet
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
          const vb = b.getUint16(10, true);
          const batt = b.getUint8(12);
          const volt = vb > 500 ? Number((vb / 1000).toFixed(2)) : null;
          this.emitTelemetry(temp, hum, 'ble_adv', 'atc', batt, volt);
          return;
        } else if (len >= 13) {
          const temp = b.getInt16(6, false) / 10.0;
          const hum = b.getUint8(8);
          const batt = b.getUint8(9);
          const vb = b.getUint16(10, false);
          const volt = vb > 500 ? Number((vb / 1000).toFixed(2)) : null;
          this.emitTelemetry(temp, hum, 'ble_adv', 'atc', batt, volt);
          return;
        }
      }

      // 2. BTHome v2 (0xFCD2)
      if (lowerKey.includes('fcd2') && len > 1) {
        this.deviceProfile = 'atc';
        let ptr = 1;
        let t = null, h = null, batt = null, volt = null;
        while (ptr < len) {
          const id = b.getUint8(ptr);
          if (id === 0x01 && ptr + 1 < len) {
            batt = b.getUint8(ptr + 1);
            ptr += 2;
          } else if (id === 0x02 && ptr + 2 < len) {
            t = b.getInt16(ptr + 1, true) * 0.01;
            ptr += 3;
          } else if (id === 0x03 && ptr + 2 < len) {
            h = b.getUint16(ptr + 1, true) * 0.01;
            ptr += 3;
          } else if (id === 0x0c && ptr + 2 < len) {
            volt = Number((b.getUint16(ptr + 1, true) * 0.001).toFixed(2));
            ptr += 3;
          } else {
            ptr++;
          }
        }
        if (t !== null && h !== null) {
          this.emitTelemetry(t, h, 'ble_adv', 'atc', batt, volt);
          return;
        }
      }

      // 3. Xiaomi MiBeacon (0xFE95)
      if (lowerKey.includes('fe95') && len >= 14) {
        this.deviceProfile = 'stock_xiaomi';
        let temp = null, hum = null, batt = null;
        for (let p = 11; p < len - 3; p++) {
          const objId = b.getUint16(p, true);
          const objLen = b.getUint8(p + 2);
          if (objId === 0x100d && objLen === 4 && p + 7 <= len) {
            temp = b.getInt16(p + 3, true) / 10.0;
            hum = b.getInt16(p + 5, true) / 10.0;
          } else if (objId === 0x100a && objLen === 1 && p + 4 <= len) {
            batt = b.getUint8(p + 3);
          }
        }
        if (temp !== null && hum !== null) {
          this.emitTelemetry(temp, hum, 'ble_adv', 'stock_xiaomi', batt, null);
          return;
        }
      }
    }
  }

  async setupGattProfiles() {
    let bound = false;

    // 1. ATC Standart Environmental Sensing (0x181A)
    try {
      const envService = await this.server.getPrimaryService(BLE_PROFILES.ENV_SENSING_SERVICE)
        .catch(() => this.server.getPrimaryService(0x181a)).catch(() => null);

      if (envService) {
        this.deviceProfile = 'atc';
        await this.bindAtcEnvService(envService);
        bound = true;
      }
    } catch (e) {}

    // 2. ATC Custom Control Servisi (0x1F10 & 0x1F1F)
    try {
      const atcService = await this.server.getPrimaryService(BLE_PROFILES.ATC_CUSTOM_SERVICE)
        .catch(() => this.server.getPrimaryService(0x1f10)).catch(() => null);

      if (atcService) {
        this.deviceProfile = 'atc';
        const atcChar = await atcService.getCharacteristic(BLE_PROFILES.CHAR_ATC_CUSTOM)
          .catch(() => atcService.getCharacteristic(0x1f1f)).catch(() => null);

        if (atcChar) {
          this.atcChar = atcChar;
          atcChar.addEventListener('characteristicvaluechanged', (e) => {
            this.handleAtcNotification(e.target.value);
          });
          await atcChar.startNotifications().catch(() => {});

          await new Promise(r => setTimeout(r, 120));

          // 0x33 telemetri akışını başlat (PVVX live telemetry format)
          await this.sendAtcCommand(new Uint8Array([0x33, 0x01])).catch(() => {});

          await new Promise(r => setTimeout(r, 120));

          // 0x23 sensör donanım saatini (RTC) senkronize et (5 bayt: 0x23 + uint32 epoch)
          const nowSec = Math.floor(Date.now() / 1000);
          const timeCmd = new Uint8Array([
            0x23,
            nowSec & 0xff,
            (nowSec >> 8) & 0xff,
            (nowSec >> 16) & 0xff,
            (nowSec >> 24) & 0xff
          ]);
          await this.sendAtcCommand(timeCmd).catch(() => {});
          if (this.onSensorTime) {
            this.onSensorTime(nowSec * 1000);
          }

          bound = true;
        }
      }
    } catch (e) {}

    // 3. Standart Pil Servislerinden Pil Bilgisini Güvenli Oku
    await this.readBatterySafely();

    // 4. Orijinal Xiaomi Servisi
    if (!bound) {
      try {
        const xiaomiService = await this.server.getPrimaryService(BLE_PROFILES.XIAOMI_SERVICE).catch(() => null);
        if (xiaomiService) {
          this.deviceProfile = 'stock_xiaomi';
          this.primaryService = xiaomiService;
          await this.bindXiaomiStockService(xiaomiService);
          bound = true;
        }
      } catch (e) {}
    }
  }

  async readBatterySafely() {
    // 1. Standart Pil Servisi (0x180F -> 0x2A19)
    try {
      const batService = await this.server.getPrimaryService(BLE_PROFILES.BATTERY_SERVICE)
        .catch(() => this.server.getPrimaryService(0x180f)).catch(() => null);
      if (batService) {
        const batChar = await batService.getCharacteristic(BLE_PROFILES.CHAR_BATTERY)
          .catch(() => batService.getCharacteristic(0x2a19)).catch(() => null);
        if (batChar) {
          const val = await batChar.readValue().catch(() => null);
          if (val && val.byteLength >= 1) {
            const b = val.getUint8(0);
            if (b <= 100) {
              this.cachedBattery = b;
              this.cachedVoltage = Number((2.1 + (b / 100) * 0.9).toFixed(2));
              if (this.cachedTemp !== null && this.cachedHum !== null) {
                this.emitTelemetry(this.cachedTemp, this.cachedHum, 'gatt_live', this.deviceProfile, this.cachedBattery, this.cachedVoltage);
              }
              return;
            }
          }
        }
      }
    } catch (e) {}

    // 2. Environmental Sensing Servisi (0x181A) altındaki 0x2A19 veya 0x2A58
    try {
      const envService = await this.server.getPrimaryService(BLE_PROFILES.ENV_SENSING_SERVICE)
        .catch(() => this.server.getPrimaryService(0x181a)).catch(() => null);
      if (envService) {
        const batChar = await envService.getCharacteristic(0x2a19).catch(() => null);
        if (batChar) {
          const val = await batChar.readValue().catch(() => null);
          if (val && val.byteLength >= 1) {
            const b = val.getUint8(0);
            if (b <= 100) {
              this.cachedBattery = b;
              this.cachedVoltage = Number((2.1 + (b / 100) * 0.9).toFixed(2));
              if (this.cachedTemp !== null && this.cachedHum !== null) {
                this.emitTelemetry(this.cachedTemp, this.cachedHum, 'gatt_live', this.deviceProfile, this.cachedBattery, this.cachedVoltage);
              }
              return;
            }
          }
        }

        const voltChar = await envService.getCharacteristic(0x2a58).catch(() => null);
        if (voltChar) {
          const val = await voltChar.readValue().catch(() => null);
          if (val && val.byteLength >= 2) {
            const mv = val.getUint16(0, true);
            if (mv > 500) {
              this.cachedVoltage = Number((mv / 1000).toFixed(2));
              this.cachedBattery = Math.min(100, Math.max(0, Math.round(((mv - 2100) / 900) * 100)));
              if (this.cachedTemp !== null && this.cachedHum !== null) {
                this.emitTelemetry(this.cachedTemp, this.cachedHum, 'gatt_live', this.deviceProfile, this.cachedBattery, this.cachedVoltage);
              }
              return;
            }
          }
        }
      }
    } catch (e) {}
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
              this.emitTelemetry(this.cachedTemp, this.cachedHum, 'gatt_live', 'atc', this.cachedBattery, this.cachedVoltage);
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
              this.emitTelemetry(this.cachedTemp, this.cachedHum, 'gatt_live', 'atc', this.cachedBattery, this.cachedVoltage);
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
      const voltMv = initialVal.getUint16(3, true);
      const volt = Number((voltMv / 1000).toFixed(2));
      const batt = Math.min(100, Math.max(0, Math.round(((voltMv - 2100) / 900) * 100)));
      this.cachedTemp = temp;
      this.cachedHum = hum;
      this.cachedBattery = batt;
      this.cachedVoltage = volt;
      this.emitTelemetry(temp, hum, 'gatt_live', 'stock_xiaomi', batt, volt);
    }

    liveChar.addEventListener('characteristicvaluechanged', (e) => {
      const val = e.target.value;
      if (val && val.byteLength >= 5) {
        const temp = val.getInt16(0, true) / 100.0;
        const hum = val.getUint8(2);
        const voltMv = val.getUint16(3, true);
        const volt = Number((voltMv / 1000).toFixed(2));
        const batt = Math.min(100, Math.max(0, Math.round(((voltMv - 2100) / 900) * 100)));
        this.cachedTemp = temp;
        this.cachedHum = hum;
        this.cachedBattery = batt;
        this.cachedVoltage = volt;
        this.emitTelemetry(temp, hum, 'gatt_live', 'stock_xiaomi', batt, volt);
      }
    });

    await liveChar.startNotifications().catch(() => {});
  }

  handleAtcNotification(value) {
    if (!value || value.byteLength < 1) return;
    const cmdId = value.getUint8(0);

    // 0x35: Flaş Geçmiş Kayıtları
    if (cmdId === 0x35 && this._atcHistoryHandler) {
      this._atcHistoryHandler(value);
      return;
    }

    // 0x23: Sensör Donanım Saati (RTC) Bildirimi
    if (cmdId === 0x23 && value.byteLength >= 5) {
      const epochSec = value.getUint32(1, true);
      if (epochSec > 1577836800 && this.onSensorTime) {
        this.onSensorTime(epochSec * 1000);
      }
      return;
    }

    // Canlı Telemetri Paketi (0x33 veya standart telemetri baytları)
    if (cmdId === 0x33 || (value.byteLength >= 5 && cmdId !== 0x35)) {
      const b = value;
      const offset = b.getUint8(0) === 0x33 ? 1 : 0;
      if (b.byteLength >= offset + 4) {
        const t = b.getInt16(offset, true) / 100.0;
        const h = b.getUint16(offset + 2, true) / 100.0;
        let volt = null;
        let batt = null;
        if (b.byteLength >= offset + 6) {
          const vb = b.getUint16(offset + 4, true);
          if (vb > 500) {
            volt = Number((vb / 1000).toFixed(2));
            batt = Math.min(100, Math.max(0, Math.round(((vb - 2100) / 900) * 100)));
          }
        }
        if (b.byteLength >= offset + 7) {
          const pBatt = b.getUint8(offset + 6);
          if (pBatt <= 100) batt = pBatt;
        }

        if (t >= -40 && t <= 85 && h >= 0 && h <= 100) {
          this.cachedTemp = t;
          this.cachedHum = h;
          if (batt != null) this.cachedBattery = batt;
          if (volt != null) this.cachedVoltage = volt;
          this.emitTelemetry(t, h, 'gatt_live', 'atc', this.cachedBattery, this.cachedVoltage);
        }
      }
    }
  }

  async sendAtcCommand(cmdBytes) {
    if (!this.atcChar) throw new Error('0x1F1F karakteristiği bulunamadı.');
    const buf = cmdBytes instanceof Uint8Array ? cmdBytes : new Uint8Array(cmdBytes);
    try {
      if (this.atcChar.writeValueWithoutResponse) {
        await this.atcChar.writeValueWithoutResponse(buf);
      } else {
        await this.atcChar.writeValue(buf);
      }
    } catch (e) {
      if (this.atcChar.writeValue) {
        await this.atcChar.writeValue(buf);
      }
    }
  }

  emitTelemetry(temperature, humidity, source = 'gatt_live', profile = 'atc', battery = null, voltage = null) {
    if (temperature < -40 || temperature > 85 || humidity < 0 || humidity > 100) return;
    if (battery != null) this.cachedBattery = battery;
    if (voltage != null) this.cachedVoltage = voltage;

    const b = battery != null ? battery : this.cachedBattery;
    const v = voltage != null ? voltage : this.cachedVoltage;

    if (this.onData) {
      this.onData({
        timestamp: Date.now(),
        temperature: Number(temperature.toFixed(2)),
        humidity: Number(humidity.toFixed(2)),
        battery: b != null ? Number(b) : null,
        voltage: v != null ? Number(v) : null,
        source: source,
        type: 'live',
        profile: profile
      });
    }
  }

  // Cihazın dahili flaş belleğindeki TÜM geçmişi eksiksiz çekme
  async fetchDeviceHistory() {
    if (!this.isConnected) {
      throw new Error('Önce cihaza bağlanmalısınız.');
    }
    // Halihazırda süren bir çekme işlemi varsa, onu bekle ve sonucunu dön
    if (this.isFetchingHistory && this._activeHistoryPromise) {
      return await this._activeHistoryPromise;
    }

    this.isFetchingHistory = true;
    this._activeHistoryPromise = (async () => {
      try {
        this.onHistoryProgress({ active: true, percent: 5, message: 'Flaş bellek taranıyor...' });

        // 1. ATC / PVVX Modlu Cihaz
        if (this.atcChar) {
          const fetchedRecords = await this.fetchAtcHistoryFromFlash();
          this.onHistoryProgress({ active: false, percent: 100, message: 'Tamamlandı' });
          return fetchedRecords;
        }

        // 2. Orijinal Xiaomi Cihazı
        if (this.primaryService) {
          const historyChar = await this.primaryService.getCharacteristic(BLE_PROFILES.CHAR_HISTORY_STREAM).catch(() => null);
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
            await new Promise(r => setTimeout(r, 2800));
            historyChar.removeEventListener('characteristicvaluechanged', handler);
            await historyChar.stopNotifications().catch(() => {});
            this.onHistoryProgress({ active: false, percent: 100, message: 'Tamamlandı' });
            return records;
          }
        }

        this.onHistoryProgress({ active: false, percent: 100, message: 'Kayıt bulunamadı' });
        return [];
      } catch (err) {
        this.onHistoryProgress({ active: false, percent: 0, message: 'Hata' });
        throw err;
      } finally {
        this.isFetchingHistory = false;
        this._activeHistoryPromise = null;
      }
    })();

    return await this._activeHistoryPromise;
  }

  async fetchAtcHistoryFromFlash() {
    return new Promise(async (resolve, reject) => {
      const rawSamples = [];
      let expectedTotal = null;
      let timeoutTimer = null;
      let retryTimer = null;
      let hasCompleted = false;
      let receivedAnyPacket = false;
      let attempt = 0;

      const finishDownload = async () => {
        if (hasCompleted) return;
        hasCompleted = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (retryTimer) clearInterval(retryTimer);
        this._atcHistoryHandler = null;

        // Canlı telemetri akışını tekrar başlat (PVVX 0x33, 0x01)
        try {
          await this.sendAtcCommand(new Uint8Array([0x33, 0x01])).catch(() => {});
        } catch (e) {}

        if (rawSamples.length === 0) {
          resolve([]);
          return;
        }

        try {
          const validEpochSamples = rawSamples.filter(s => s.tc > 1577836800);
          const isEpochValid = validEpochSamples.length > 0;
          const maxTc = Math.max(...rawSamples.map(s => s.tc));
          const nowMs = Date.now();

          const records = [];
          for (let i = 0; i < rawSamples.length; i++) {
            const s = rawSamples[i];
            let ts;
            if (isEpochValid && s.tc > 1577836800) {
              ts = s.tc * 1000;
            } else {
              const diffSec = maxTc - s.tc;
              ts = nowMs - (diffSec * 1000);
            }

            if (s.tm >= -40 && s.tm <= 85 && s.hm >= 0 && s.hm <= 100) {
              const volt = s.vb > 500 ? Number((s.vb / 1000).toFixed(2)) : null;
              const batt = s.vb > 500 ? Math.min(100, Math.max(0, Math.round(((s.vb - 2100) / 900) * 100))) : null;

              records.push(TelemetryProcessor.format({
                timestamp: ts,
                temperature: Number(s.tm.toFixed(2)),
                humidity: Number(s.hm.toFixed(2)),
                battery: batt,
                voltage: volt,
                source: 'device_flash',
                type: 'history_hour'
              }));
            }
          }

          records.sort((a, b) => a.timestamp - b.timestamp);

          // Flaş kayıtlarından son geçerli pil ve voltajı alıp önbelleğe aktar
          for (let i = records.length - 1; i >= 0; i--) {
            if (records[i].battery != null) {
              this.cachedBattery = records[i].battery;
              if (records[i].voltage != null) this.cachedVoltage = records[i].voltage;
              break;
            }
          }

          if (isEpochValid && this.onSensorTime) {
            this.onSensorTime(maxTc * 1000);
          }

          // Cihaz saatini senkronize et (5 bayt)
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
            if (this.onSensorTime) {
              this.onSensorTime(timeNowSec * 1000);
            }
          } catch (e) {}

          resolve(records);
        } catch (err) {
          reject(err);
        }
      };

      const resetTimeout = (delay = 4500) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        timeoutTimer = setTimeout(() => {
          finishDownload();
        }, delay);
      };

      this._atcHistoryHandler = (val) => {
        const len = val.byteLength;
        if (len < 1) return;
        const cmdId = val.getUint8(0);
        if (cmdId !== 0x35) return;

        receivedAnyPacket = true;
        if (retryTimer) {
          clearInterval(retryTimer);
          retryTimer = null;
        }

        // 1. Toplam kayıt sayısı bildirimi paketi
        if (len === 2 || (len >= 3 && len < 13)) {
          expectedTotal = len === 2 ? val.getUint8(1) : val.getUint16(1, true);
          if (expectedTotal === 0 && rawSamples.length === 0) {
            finishDownload();
            return;
          }
          this.onHistoryProgress({
            active: true,
            percent: Math.min(25, Math.max(10, Math.round((rawSamples.length / Math.max(1, expectedTotal)) * 80))),
            message: `${expectedTotal} bellek kaydı taranıyor...`
          });
          resetTimeout(4500);
        } else if (len >= 13) {
          // 2. Ölçüm verileri paketi (1 pakette birden çok 12 baytlık kayıt gelebilir)
          let offset = 1;
          while (offset + 12 <= len) {
            const cnt = val.getUint16(offset, true);
            const tc = val.getUint32(offset + 2, true);
            const tm = val.getInt16(offset + 6, true) / 100.0;
            const hm = val.getUint16(offset + 8, true) / 100.0;
            const vb = val.getUint16(offset + 10, true);
            offset += 12;

            if (tm >= -40 && tm <= 85 && hm >= 0 && hm <= 100) {
              rawSamples.push({ cnt, tc, tm, hm, vb });
            }
          }

          let pct;
          if (expectedTotal && expectedTotal > 0) {
            pct = Math.min(95, Math.round((rawSamples.length / expectedTotal) * 85) + 10);
          } else {
            pct = Math.min(92, 10 + Math.floor(rawSamples.length / 4));
          }

          this.onHistoryProgress({
            active: true,
            percent: pct,
            message: `${rawSamples.length} kayıt aktarıldı...`
          });

          if (expectedTotal && rawSamples.length >= expectedTotal) {
            finishDownload();
            return;
          }

          resetTimeout(4500);
        }
      };

      try {
        // Canlı telemetri bildirimlerini geçici olarak duraklat (paket çakışmasını engellemek için)
        await this.sendAtcCommand(new Uint8Array([0x33, 0x00])).catch(() => {});
        await new Promise(r => setTimeout(r, 100));

        // PVVX 0x35: Tüm bellek kayıtlarını talep et
        const sendReq = async (mode = 0) => {
          const cmd = mode === 0
            ? new Uint8Array([0x35, 0xff, 0xff, 0x00, 0x00])
            : (mode === 1 ? new Uint8Array([0x35, 0x00, 0x00, 0x00, 0x00]) : new Uint8Array([0x35, 0x00, 0x00]));
          await this.sendAtcCommand(cmd).catch(() => {});
        };

        await sendReq(0);
        resetTimeout(6000);

        // Akıllı Yeniden Deneme: 1.5 sn içinde yanıt gelmezse komutu tekrarla
        retryTimer = setInterval(async () => {
          if (receivedAnyPacket || hasCompleted) {
            clearInterval(retryTimer);
            return;
          }
          attempt++;
          if (attempt <= 2) {
            await sendReq(attempt);
          } else {
            clearInterval(retryTimer);
          }
        }, 1500);

      } catch (err) {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (retryTimer) clearInterval(retryTimer);
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
    this.sensorClockOffset = null;
    this.hasReceivedSensorClock = false;
    this.ble = new UniversalBleManager(
      (data) => this.handleNewData(data),
      (status, text) => this.handleBleStatus(status, text),
      (prog) => this.handleHistoryProgress(prog),
      (sensorTimeMs) => this.setSensorClock(sensorTimeMs)
    );

    this.currentTheme = localStorage.getItem('smarttemp_theme') || 'light';
    this.currentUnit = localStorage.getItem('smarttemp_unit') || 'C';
    this.chartMode = 'temps'; // 'temps' | 'hum' | 'battery' | 'all'
    this.currentPage = 1;
    this.pageSize = 15;
    this.latestTelemetry = null;
    this.latestBattery = null;
    this.latestVoltage = null;
    this._autoSyncTimer = null;
    this._updateScheduled = false;
    this.isSyncing = false;

    this.cacheDomElements();
    this.init();
  }

  cacheDomElements() {
    this.dom = {
      // Header
      liveClockTime: document.getElementById('liveClockTime'),
      sensorClockPulse: document.getElementById('sensorClockPulse'),
      connectionStatusText: document.getElementById('connectionStatusText'),
      btnConnect: document.getElementById('btnConnect'),
      btnConnectLabel: document.getElementById('btnConnectLabel'),
      btnFetchHistory: document.getElementById('btnFetchHistory'),
      btnThemeToggle: document.getElementById('btnThemeToggle'),
      themeIcon: document.getElementById('themeIcon'),

      // Sync Progress Banner
      syncProgressBanner: document.getElementById('syncProgressBanner'),
      syncProgressLabel: document.getElementById('syncProgressLabel'),
      syncProgressPercent: document.getElementById('syncProgressPercent'),
      syncProgressBar: document.getElementById('syncProgressBar'),

      // Primary Cards
      valTemp: document.getElementById('valTemp'),
      lblTempUnit: document.getElementById('lblTempUnit'),
      btnToggleUnit: document.getElementById('btnToggleUnit'),

      valHum: document.getElementById('valHum'),
      humidityStatusBadge: document.getElementById('humidityStatusBadge'),
      humProgressBar: document.getElementById('humProgressBar'),

      valBattery: document.getElementById('valBattery'),
      valVoltageBadge: document.getElementById('valVoltageBadge'),
      batteryProgressBar: document.getElementById('batteryProgressBar'),

      // Chart
      chartCard: document.getElementById('chartCard'),
      btnToggleFullscreenChart: document.getElementById('btnToggleFullscreenChart'),
      iconChartFullscreen: document.getElementById('iconChartFullscreen'),
      chartEmptyOverlay: document.getElementById('chartEmptyOverlay'),
      telemetryChart: document.getElementById('telemetryChart'),

      // Records Table
      historyTableBody: document.getElementById('historyTableBody'),
      tableSummaryText: document.getElementById('tableSummaryText'),
      btnExportCsv: document.getElementById('btnExportCsv'),
      btnClearData: document.getElementById('btnClearData'),
      btnPrevPage: document.getElementById('btnPrevPage'),
      pageIndicator: document.getElementById('pageIndicator'),
      btnNextPage: document.getElementById('btnNextPage'),

      // Toast
      toastContainer: document.getElementById('toastContainer')
    };
  }

  async init() {
    this.initServiceWorker();
    this.initLiveClock();
    this.applyTheme(this.currentTheme);
    lucide.createIcons();
    this.setupEventListeners();
    this.initChart();

    await this.storage.initPromise;
    this.renderTable();

    // En son kaydedilmiş geçerli pil ve voltaj değerlerini bulup önbelleğe al
    for (let i = this.storage.records.length - 1; i >= 0; i--) {
      const rec = this.storage.records[i];
      if (rec.battery != null && this.latestBattery == null) {
        this.latestBattery = rec.battery;
      }
      if (rec.voltage != null && this.latestVoltage == null) {
        this.latestVoltage = rec.voltage;
      }
      if (this.latestBattery != null && this.latestVoltage != null) break;
    }

    if (this.storage.records.length > 0) {
      const last = { ...this.storage.records[this.storage.records.length - 1] };
      if (last.battery == null && this.latestBattery != null) {
        last.battery = this.latestBattery;
      }
      if (last.voltage == null && this.latestVoltage != null) {
        last.voltage = this.latestVoltage;
      }
      this.renderTelemetryCards(last);
      this.updateChart();
    }

    // Doğrudan otomatik bağlanmayı dene
    this.ble.tryAutoConnect().catch(() => {});

    // İlk kullanıcı dokunuşunda anında bağlan
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
        const isFullscreen = this.dom.chartCard?.classList.contains('chart-fullscreen');
        const isMobile = window.innerWidth < 640;
        this.chart.options.scales.x.ticks.maxTicksLimit = isFullscreen ? (isMobile ? 8 : 14) : (isMobile ? 4 : 7);
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

  setSensorClock(sensorTimeMs) {
    if (!sensorTimeMs || isNaN(sensorTimeMs)) return;
    this.sensorClockOffset = sensorTimeMs - Date.now();
    this.hasReceivedSensorClock = true;
    this.updateSensorClockDisplay();
  }

  updateSensorClockDisplay() {
    if (!this.hasReceivedSensorClock) {
      if (this.dom.liveClockTime) this.dom.liveClockTime.textContent = '--:--:--';
      if (this.dom.connectionStatusText) this.dom.connectionStatusText.textContent = 'Sensör Saati';
      return;
    }

    const sensorNow = new Date(Date.now() + (this.sensorClockOffset || 0));
    if (this.dom.liveClockTime) {
      this.dom.liveClockTime.textContent = sensorNow.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
    if (this.dom.connectionStatusText) {
      this.dom.connectionStatusText.textContent = 'Canlı RTC';
    }
  }

  initLiveClock() {
    this.updateSensorClockDisplay();
    setInterval(() => {
      this.updateSensorClockDisplay();
    }, 1000);
  }

  setupEventListeners() {
    // Bluetooth Connect Button
    if (this.dom.btnConnect) {
      this.dom.btnConnect.addEventListener('click', () => {
        if (this.ble.isConnected) {
          this.ble.disconnect();
        } else {
          this.connectBluetooth();
        }
      });
    }

    // Fetch History Button
    if (this.dom.btnFetchHistory) {
      this.dom.btnFetchHistory.addEventListener('click', () => {
        this.syncDeviceHistory(false);
      });
    }

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
        this.scheduleVisualUpdate();
      });
    }

    // Chart Mode Buttons (Sıcaklık, Nem, Voltaj, Tümü)
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.chartMode = e.currentTarget.dataset.mode || 'temps';
        this.updateChart();
      });
    });

    // Chart Fullscreen Toggle Button
    if (this.dom.btnToggleFullscreenChart) {
      this.dom.btnToggleFullscreenChart.addEventListener('click', () => {
        this.toggleChartFullscreen();
      });
    }

    // Escape Key to Exit Fullscreen Chart
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const chartCard = this.dom.chartCard || document.getElementById('chartCard');
        if (chartCard && chartCard.classList.contains('chart-fullscreen')) {
          this.toggleChartFullscreen();
        }
      }
    });

    // CSV Export
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

    // Clear Database
    if (this.dom.btnClearData) {
      this.dom.btnClearData.addEventListener('click', async () => {
        if (confirm('Tüm kayıtlar silinecektir. Emin misiniz?')) {
          await this.storage.clearAll();
          this.latestTelemetry = null;
          this.renderTable();
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
        this.showToast('Önce Bluetooth ile cihaza bağlanmalısınız.', 'info');
      }
      return;
    }

    if (this.isSyncing) {
      if (!isAuto) {
        this.showToast('Veriler zaten aktarılıyor, lütfen bekleyin...', 'info');
      }
      return;
    }

    this.isSyncing = true;
    try {
      if (!isAuto) {
        this.showToast('Sensör belleğindeki kayıtlar taranıyor...', 'info');
      }
      const records = await this.ble.fetchDeviceHistory();
      if (records && records.length > 0) {
        for (let i = records.length - 1; i >= 0; i--) {
          if (records[i].battery != null) {
            this.latestBattery = records[i].battery;
            if (records[i].voltage != null) this.latestVoltage = records[i].voltage;
            break;
          }
        }
        const addedCount = await this.storage.addBatch(records);
        const last = this.storage.records[this.storage.records.length - 1];
        if (last) {
          if (last.battery == null && this.latestBattery != null) last.battery = this.latestBattery;
          if (last.voltage == null && this.latestVoltage != null) last.voltage = this.latestVoltage;
          this.renderTelemetryCards(last);
        }
        this.renderTable();
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
    } finally {
      this.isSyncing = false;
    }
  }

  handleBleStatus(status, text) {
    if (this.dom.connectionStatusText) {
      this.dom.connectionStatusText.textContent = text;
    }

    if (status === 'connected') {
      // Bağlantının ve GATT bildirimlerinin oturması için 1.5 saniye bekle ve ardından geçmişi çek
      if (this._autoSyncTimer) clearTimeout(this._autoSyncTimer);
      this._autoSyncTimer = setTimeout(() => {
        if (this.ble && this.ble.isConnected) {
          this.syncDeviceHistory(true);
        }
      }, 1500);
    } else {
      if (this._autoSyncTimer) {
        clearTimeout(this._autoSyncTimer);
        this._autoSyncTimer = null;
      }
    }

    // Durum Noktası
    if (this.dom.sensorClockPulse) {
      if (status === 'connected') {
        this.dom.sensorClockPulse.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0';
      } else if (status === 'connecting' || status === 'scanning') {
        this.dom.sensorClockPulse.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0';
      } else {
        this.dom.sensorClockPulse.className = 'w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-600 flex-shrink-0';
      }
    }

    // Bağlan Butonu
    if (this.dom.btnConnect) {
      if (status === 'connected') {
        if (this.dom.btnConnectLabel) this.dom.btnConnectLabel.textContent = 'Bağlantıyı Kes';
        this.dom.btnConnect.className = 'px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 bg-[#ba1a1a] hover:bg-[#93000a] text-white shadow-sm';
      } else {
        if (this.dom.btnConnectLabel) this.dom.btnConnectLabel.textContent = 'Bağlan';
        this.dom.btnConnect.className = 'px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-sm';
      }
    }
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
    if (data.battery != null) {
      this.latestBattery = data.battery;
    } else if (this.latestBattery != null) {
      data.battery = this.latestBattery;
    }

    if (data.voltage != null) {
      this.latestVoltage = data.voltage;
    } else if (this.latestVoltage != null) {
      data.voltage = this.latestVoltage;
    } else if (data.battery != null) {
      data.voltage = Number((2.1 + (data.battery / 100) * 0.9).toFixed(2));
      this.latestVoltage = data.voltage;
    }

    const enriched = await this.storage.addRecord(data);
    if (!enriched) return;
    this.latestTelemetry = enriched;

    // 1. Ana kartlar gecikmesiz, anında güncellenir (0ms anlık his)
    this.renderTelemetryCards(enriched);

    // 2. Tablo ve grafik güncellemeleri Samsung A23 vb. cihazlarda 60-90 FPS akıcılık için optimize edilir
    this.scheduleVisualUpdate();
  }

  scheduleVisualUpdate() {
    if (this._updateScheduled) return;
    this._updateScheduled = true;
    requestAnimationFrame(() => {
      this._updateScheduled = false;
      this.renderTable();
      this.updateChart();
    });
  }

  renderTelemetryCards(data) {
    // 1. Sıcaklık Kartı
    let displayTemp = data.temperature;
    if (this.currentUnit === 'F') {
      displayTemp = (data.temperature * 9 / 5) + 32;
    }
    if (this.dom.valTemp) this.dom.valTemp.textContent = displayTemp.toFixed(2);
    if (this.dom.lblTempUnit) this.dom.lblTempUnit.textContent = `°${this.currentUnit}`;

    // 2. Bağıl Nem Kartı
    const humNum = Number(data.humidity);
    const humFormatted = !isNaN(humNum) ? humNum.toFixed(2) : data.humidity;
    if (this.dom.valHum) this.dom.valHum.textContent = humFormatted;
    if (this.dom.humProgressBar) {
      this.dom.humProgressBar.style.width = `${Math.min(100, Math.max(0, humNum))}%`;
    }

    if (this.dom.humidityStatusBadge) {
      if (humNum < 30) {
        this.dom.humidityStatusBadge.textContent = 'Kuru';
        this.dom.humidityStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold';
      } else if (humNum > 60) {
        this.dom.humidityStatusBadge.textContent = 'Yüksek Nem';
        this.dom.humidityStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-sky-100 text-[#0284c7] dark:bg-sky-950/80 dark:text-sky-300 font-semibold';
      } else {
        this.dom.humidityStatusBadge.textContent = 'İdeal';
        this.dom.humidityStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 font-semibold';
      }
    }

    // 3. Pil & Voltaj Kartı
    const effectiveBattery = data.battery != null ? data.battery : this.latestBattery;
    const effectiveVoltage = data.voltage != null ? data.voltage : this.latestVoltage;

    if (this.dom.valBattery) {
      this.dom.valBattery.textContent = effectiveBattery != null ? effectiveBattery : '--';
    }

    if (this.dom.batteryProgressBar) {
      if (effectiveBattery != null) {
        this.dom.batteryProgressBar.style.width = `${Math.min(100, Math.max(0, effectiveBattery))}%`;
        if (effectiveBattery < 20) {
          this.dom.batteryProgressBar.className = 'h-full bg-rose-500 rounded-full';
        } else if (effectiveBattery < 50) {
          this.dom.batteryProgressBar.className = 'h-full bg-amber-500 rounded-full';
        } else {
          this.dom.batteryProgressBar.className = 'h-full bg-emerald-500 rounded-full';
        }
      } else {
        this.dom.batteryProgressBar.style.width = '0%';
      }
    }

    if (this.dom.valVoltageBadge) {
      if (effectiveVoltage != null) {
        this.dom.valVoltageBadge.textContent = `${Number(effectiveVoltage).toFixed(2)} V`;
      } else if (effectiveBattery != null) {
        const calcV = (2.1 + (effectiveBattery / 100) * 0.9).toFixed(2);
        this.dom.valVoltageBadge.textContent = `${calcV} V`;
      } else {
        this.dom.valVoltageBadge.textContent = '-- V';
      }
    }
  }

  renderTable() {
    const list = this.storage.records;
    const total = list.length;
    if (this.dom.tableSummaryText) {
      this.dom.tableSummaryText.textContent = `${total} kayıt`;
    }

    if (total === 0) {
      if (this.dom.historyTableBody) {
        this.dom.historyTableBody.innerHTML = `
          <tr>
            <td colspan="4" class="py-6 text-center text-slate-400 dark:text-slate-500 font-sans">
              Henüz kayıt bulunmuyor.
            </td>
          </tr>
        `;
      }
      if (this.dom.pageIndicator) this.dom.pageIndicator.textContent = '1 / 1';
      if (this.dom.btnPrevPage) this.dom.btnPrevPage.disabled = true;
      if (this.dom.btnNextPage) this.dom.btnNextPage.disabled = true;
      return;
    }

    const maxPage = Math.ceil(total / this.pageSize) || 1;
    this.currentPage = Math.min(this.currentPage, maxPage);
    if (this.dom.pageIndicator) this.dom.pageIndicator.textContent = `${this.currentPage} / ${maxPage}`;
    if (this.dom.btnPrevPage) this.dom.btnPrevPage.disabled = this.currentPage <= 1;
    if (this.dom.btnNextPage) this.dom.btnNextPage.disabled = this.currentPage >= maxPage;

    const reversed = [...list].reverse();
    const start = (this.currentPage - 1) * this.pageSize;
    const pageItems = reversed.slice(start, start + this.pageSize);

    if (this.dom.historyTableBody) {
      this.dom.historyTableBody.innerHTML = pageItems.map(item => {
        const d = new Date(item.timestamp);
        const timeStr = `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

        let t = item.temperature;
        if (this.currentUnit === 'F') {
          t = (t * 9 / 5) + 32;
        }
        const humNum = Number(item.humidity);
        let batStr = '--';
        if (item.voltage != null && !isNaN(Number(item.voltage))) {
          const v = Number(item.voltage).toFixed(2);
          batStr = item.battery != null ? `${v}V (%${item.battery})` : `${v}V`;
        } else if (item.battery != null) {
          const v = (2.1 + (Number(item.battery) / 100) * 0.9).toFixed(2);
          batStr = `${v}V (%${item.battery})`;
        }

        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td class="py-2 px-2.5 sm:px-3 text-slate-600 dark:text-slate-300 font-sans">${timeStr}</td>
            <td class="py-2 px-2 sm:px-3 font-bold text-[#0b57d0] dark:text-[#a8c7fa]">${t.toFixed(1)}°${this.currentUnit}</td>
            <td class="py-2 px-2 sm:px-3 font-semibold text-sky-600 dark:text-sky-400">%${humNum.toFixed(1)}</td>
            <td class="py-2 px-2 sm:px-3 font-semibold text-emerald-600 dark:text-emerald-400">${batStr}</td>
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
    tempGradient.addColorStop(0, isDark ? 'rgba(96, 165, 250, 0.35)' : 'rgba(11, 87, 208, 0.22)');
    tempGradient.addColorStop(1, 'rgba(11, 87, 208, 0.0)');

    const humGradient = ctx.createLinearGradient(0, 0, 0, 320);
    humGradient.addColorStop(0, isDark ? 'rgba(56, 189, 248, 0.30)' : 'rgba(2, 132, 199, 0.20)');
    humGradient.addColorStop(1, 'rgba(2, 132, 199, 0.0)');

    const batGradient = ctx.createLinearGradient(0, 0, 0, 320);
    batGradient.addColorStop(0, isDark ? 'rgba(52, 211, 153, 0.30)' : 'rgba(16, 185, 129, 0.20)');
    batGradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            // 0: Sıcaklık
            label: 'Sıcaklık',
            data: [],
            borderColor: isDark ? '#60a5fa' : '#0b57d0',
            backgroundColor: tempGradient,
            borderWidth: 2.2,
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHitRadius: 15,
            pointBackgroundColor: isDark ? '#60a5fa' : '#0b57d0',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            yAxisID: 'yTemp'
          },
          {
            // 1: Bağıl Nem
            label: 'Bağıl Nem',
            data: [],
            borderColor: '#0284c7',
            backgroundColor: humGradient,
            borderWidth: 2.2,
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHitRadius: 15,
            pointBackgroundColor: '#0284c7',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            yAxisID: 'yHum'
          },
          {
            // 2: Pil Voltajı
            label: 'Pil Voltajı (V)',
            data: [],
            borderColor: '#10b981',
            backgroundColor: batGradient,
            borderWidth: 2.2,
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHitRadius: 15,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            yAxisID: 'yBat'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        interaction: {
          mode: 'nearest',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
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
            boxPadding: 4,
            usePointStyle: true,
            bodyFont: { family: 'Parkinsans', size: 12, weight: 500 },
            titleFont: { family: 'Parkinsans', size: 12, weight: 700 },
            callbacks: {
              title: (items) => {
                if (!items || items.length === 0) return '';
                const idx = items[0].dataIndex;
                const rec = this.chartRecords ? this.chartRecords[idx] : null;
                if (rec && rec.timestamp) {
                  const d = new Date(rec.timestamp);
                  return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                }
                return items[0].label || '';
              },
              label: (context) => {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (val == null) return null;
                if (context.dataset.yAxisID === 'yTemp') {
                  return ` ${label}: ${Number(val).toFixed(2)} °${this.currentUnit}`;
                } else if (context.dataset.yAxisID === 'yHum') {
                  return ` ${label}: %${Number(val).toFixed(1)}`;
                } else {
                  return ` ${label}: ${Number(val).toFixed(2)} V`;
                }
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
              borderDash: [3, 3],
              drawBorder: false
            },
            ticks: {
              color: isDark ? '#64748b' : '#94a3b8',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              maxTicksLimit: isMobile ? 5 : 8
            }
          },
          yTemp: {
            type: 'linear',
            display: true,
            position: 'left',
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
              borderDash: [3, 3],
              drawBorder: false
            },
            ticks: {
              color: isDark ? '#a8c7fa' : '#0b57d0',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              callback: (v) => `${Number(v).toFixed(1)}°`
            }
          },
          yHum: {
            type: 'linear',
            display: false,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#0284c7',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              callback: (v) => `%${Number(v).toFixed(0)}`
            },
            min: 0,
            max: 100
          },
          yBat: {
            type: 'linear',
            display: false,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#10b981',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              callback: (v) => `${Number(v).toFixed(2)} V`
            },
            suggestedMin: 2.1,
            suggestedMax: 3.3
          }
        }
      }
    });
  }

  adaptChartTheme() {
    if (!this.chart) return;
    const isDark = this.currentTheme === 'dark';

    this.chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(12, 19, 28, 0.96)' : 'rgba(255, 255, 255, 0.98)';
    this.chart.options.plugins.tooltip.borderColor = isDark ? 'rgba(168, 199, 250, 0.25)' : 'rgba(11, 87, 208, 0.2)';
    this.chart.options.plugins.tooltip.titleColor = isDark ? '#f8fafd' : '#041e49';
    this.chart.options.plugins.tooltip.bodyColor = isDark ? '#cbd5e1' : '#334155';

    this.chart.options.scales.x.grid.color = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    this.chart.options.scales.yTemp.grid.color = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    this.chart.options.scales.x.ticks.color = isDark ? '#64748b' : '#94a3b8';
    this.chart.options.scales.yTemp.ticks.color = isDark ? '#a8c7fa' : '#0b57d0';

    this.chart.data.datasets[0].borderColor = isDark ? '#60a5fa' : '#0b57d0';
    this.chart.data.datasets[0].pointBackgroundColor = isDark ? '#60a5fa' : '#0b57d0';

    this.chart.update('none');
  }

  updateChart() {
    if (!this.chart) return;
    let records = [...this.storage.records];

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
      this.chartRecords = [];
      this.chart.data.labels = [];
      this.chart.data.datasets.forEach(ds => { ds.data = []; });
      this.chart.update('none');
      return;
    }

    const isFullscreen = this.dom.chartCard?.classList.contains('chart-fullscreen');
    const isMobile = window.innerWidth < 640;

    // Detay seviyesi: Samsung A23 ve mobilde 300 (tam ekranda 500), masaüstünde 700 (tam ekranda 1200) nokta
    const maxPoints = isFullscreen ? (isMobile ? 500 : 1200) : (isMobile ? 300 : 700);
    if (records.length > maxPoints) {
      const step = Math.ceil(records.length / maxPoints);
      records = records.filter((_, idx) => idx % step === 0 || idx === records.length - 1);
    }
    this.chartRecords = records;

    const pRadius = records.length <= 8 ? 3.5 : (records.length <= 25 ? 2.0 : 0);
    this.chart.data.datasets.forEach(ds => {
      ds.pointRadius = pRadius;
    });

    const labels = records.map(r => {
      const d = new Date(r.timestamp);
      return (records.length <= 8)
        ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    });

    const tempData = records.map(r => {
      const t = Number(r.temperature);
      return this.currentUnit === 'F' ? Number(((t * 9 / 5) + 32).toFixed(2)) : Number(t.toFixed(2));
    });

    const humData = records.map(r => Number(Number(r.humidity).toFixed(1)));

    // Voltaj verisi: Kayıttan veya pilden voltaj (V) türetilir
    const voltData = records.map(r => {
      if (r.voltage != null && !isNaN(Number(r.voltage))) {
        return Number(Number(r.voltage).toFixed(2));
      }
      if (r.battery != null && !isNaN(Number(r.battery))) {
        return Number((2.1 + (Number(r.battery) / 100) * 0.9).toFixed(2));
      }
      if (this.latestVoltage != null && !isNaN(Number(this.latestVoltage))) {
        return Number(Number(this.latestVoltage).toFixed(2));
      }
      if (this.latestBattery != null && !isNaN(Number(this.latestBattery))) {
        return Number((2.1 + (Number(this.latestBattery) / 100) * 0.9).toFixed(2));
      }
      return null;
    });

    this.chart.data.labels = labels;
    this.chart.data.datasets[0].label = `Sıcaklık (°${this.currentUnit})`;
    this.chart.data.datasets[0].data = tempData;
    this.chart.data.datasets[1].label = `Bağıl Nem (%)`;
    this.chart.data.datasets[1].data = humData;
    this.chart.data.datasets[2].label = `Pil Voltajı (V)`;
    this.chart.data.datasets[2].data = voltData;

    const ds = this.chart.data.datasets;
    const scales = this.chart.options.scales;

    if (this.chartMode === 'temps') {
      ds[0].hidden = false;
      ds[1].hidden = true;
      ds[2].hidden = true;
      scales.yTemp.display = true;
      scales.yHum.display = false;
      scales.yBat.display = false;
      this.chart.options.interaction.mode = 'nearest';
    } else if (this.chartMode === 'hum') {
      ds[0].hidden = true;
      ds[1].hidden = false;
      ds[2].hidden = true;
      scales.yTemp.display = false;
      scales.yHum.display = true;
      scales.yBat.display = false;
      this.chart.options.interaction.mode = 'nearest';
    } else if (this.chartMode === 'battery') {
      ds[0].hidden = true;
      ds[1].hidden = true;
      ds[2].hidden = false;
      scales.yTemp.display = false;
      scales.yHum.display = false;
      scales.yBat.display = true;
      this.chart.options.interaction.mode = 'nearest';
    } else {
      // 'all'
      ds[0].hidden = false;
      ds[1].hidden = false;
      ds[2].hidden = false;
      scales.yTemp.display = true;
      scales.yHum.display = true;
      scales.yBat.display = false;
      this.chart.options.interaction.mode = 'index';
    }

    this.chart.update('none');
  }

  toggleChartFullscreen() {
    const chartCard = this.dom.chartCard || document.getElementById('chartCard');
    const icon = this.dom.iconChartFullscreen || document.getElementById('iconChartFullscreen');
    if (!chartCard) return;

    const isFullscreen = chartCard.classList.toggle('chart-fullscreen');
    document.body.classList.toggle('overflow-hidden', isFullscreen);

    if (icon) {
      icon.setAttribute('data-lucide', isFullscreen ? 'minimize-2' : 'maximize-2');
      lucide.createIcons();
    }

    if (this.dom.btnToggleFullscreenChart) {
      this.dom.btnToggleFullscreenChart.setAttribute(
        'title',
        isFullscreen ? 'Grafiği Küçült (Normal Görünüm)' : 'Grafiği Tam Ekran Büyüt'
      );
    }

    if (this.chart) {
      const isMobile = window.innerWidth < 640;
      this.chart.options.scales.x.ticks.maxTicksLimit = isFullscreen ? (isMobile ? 8 : 14) : (isMobile ? 4 : 7);
      this.chart.resize();
      this.updateChart();
    }
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('smarttemp_theme', theme);
    const html = document.documentElement;

    if (theme === 'dark') {
      html.classList.add('dark');
      html.classList.remove('light');
      if (this.dom.themeIcon) this.dom.themeIcon.setAttribute('data-lucide', 'sun');
      const meta = document.getElementById('metaThemeColor');
      if (meta) meta.setAttribute('content', '#0c131c');
    } else {
      html.classList.remove('dark');
      html.classList.add('light');
      if (this.dom.themeIcon) this.dom.themeIcon.setAttribute('data-lucide', 'moon');
      const meta = document.getElementById('metaThemeColor');
      if (meta) meta.setAttribute('content', '#f8fafc');
    }

    this.adaptChartTheme();
  }

  showToast(message, type = 'info') {
    if (!this.dom.toastContainer) return;
    const toast = document.createElement('div');
    const colors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      info: 'bg-slate-900 dark:bg-slate-800 text-white'
    };
    toast.className = `p-3 rounded-2xl shadow-lg text-xs font-semibold flex items-center justify-between gap-2 pointer-events-auto ${colors[type] || colors.info}`;
    toast.textContent = message;

    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 2800);
  }

  downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// ==========================================
// 6. APPLICATION BOOTSTRAP
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
