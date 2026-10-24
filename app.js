/**
 * Xiaomi SmartTemp Pro — Ultra-Fast, Zero-Animation & Pastel Minimalist Engine
 * Instant BLE Auto-Connect to ATC_597941 & Complete Flash History Ingestion
 * 100% Offline-First Architecture (PWA & Web Bluetooth API)
 */

// ==========================================
// 0. GLOBAL WEB BLUETOOTH GATT OPERATION SERIALIZER
// Android Chrome & Windows allow only one GATT operation at a time.
// This serializes all characteristic/descriptor operations globally.
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
  ["readValue", "writeValue", "writeValueWithResponse", "writeValueWithoutResponse",
   "startNotifications", "stopNotifications"].forEach(n => wrap(BluetoothRemoteGATTCharacteristic.prototype, n));
  ["readValue", "writeValue"].forEach(n => wrap(BluetoothRemoteGATTDescriptor.prototype, n));
  window.__gattQueue = true;
})();

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
  CHAR_ATC_CUSTOM: '00001f1f-0000-1000-8000-00805f9b34fb'
};

// ==========================================
// 2. TELEMETRY RECORD FORMATTER & SANITIZER
// ==========================================
class TelemetryProcessor {
  static format(record) {
    if (!record) return null;
    const t = typeof record.temperature === 'number'
      ? Number(record.temperature.toFixed(2))
      : parseFloat(record.temperature);
    const h = typeof record.humidity === 'number'
      ? Number(record.humidity.toFixed(2))
      : parseFloat(record.humidity);

    // Gerçekçi sensör aralığı kontrolü (hatalı / bozuk paketleri filtrele)
    if (isNaN(t) || isNaN(h) || t < -35 || t > 75 || h <= 0 || h > 100) {
      return null;
    }

    let batt = record.battery != null && !isNaN(Number(record.battery)) ? Number(record.battery) : null;
    let volt = record.voltage != null && !isNaN(Number(record.voltage)) ? Number(record.voltage) : null;

    // Eğer voltaj mV cinsinden geldiyse V cinsine çevir
    if (volt != null && volt > 10) {
      volt = Number((volt / 1000).toFixed(3));
    }

    // CR2032 gerçekçi voltaj aralığı kontrolü (1.50V - 3.80V)
    if (volt != null && (volt < 1.5 || volt > 3.8)) {
      volt = null;
    }

    if (batt != null && (batt < 0 || batt > 100)) {
      batt = null;
    }

    if (volt != null && batt == null) {
      const mv = volt * 1000;
      batt = Math.min(100, Math.max(0, Math.round(((mv - 2100) / 900) * 100)));
    }
    if (batt != null && volt == null) {
      volt = Number((2.1 + (batt / 100) * 0.9).toFixed(2));
    }

    return {
      timestamp: record.timestamp || Date.now(),
      temperature: t,
      humidity: h,
      battery: batt != null ? Math.min(100, Math.max(0, Math.round(batt))) : null,
      voltage: volt != null ? Number(volt.toFixed(2)) : null,
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
    this.dbName = 'XiaomiSmartTempDB_v4';
    this.storeName = 'measurements';
    this.db = null;
    this.records = [];
    this.initPromise = this.initDB();
  }

  async initDB() {
    try {
      indexedDB.deleteDatabase('XiaomiSmartTempDB_v3');
    } catch (e) {}

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

    if (this.records.length > 0) {
      const last = this.records[this.records.length - 1];
      if (last.type === 'live' && formatted.type === 'live' && Math.abs(formatted.timestamp - last.timestamp) < 1200) {
        last.temperature = formatted.temperature;
        last.humidity = formatted.humidity;
        if (formatted.voltage != null) last.voltage = formatted.voltage;
        if (formatted.battery != null) last.battery = formatted.battery;
        return last;
      }
    }

    this.records.push(formatted);
    this.records.sort((a, b) => a.timestamp - b.timestamp);

    if (this.db) {
      try {
        const tx = this.db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).add(formatted);
      } catch (e) {}
    }
    return formatted;
  }

  async addBatch(recordsList) {
    if (!recordsList || recordsList.length === 0) return 0;

    const validIncoming = [];
    for (let i = 0; i < recordsList.length; i++) {
      const formatted = TelemetryProcessor.format(recordsList[i]);
      if (formatted) {
        validIncoming.push(formatted);
      }
    }
    if (validIncoming.length === 0) return 0;

    const maxIncomingTs = Math.max(...validIncoming.map(r => r.timestamp));
    const minIncomingTs = Math.min(...validIncoming.map(r => r.timestamp));

    const preservedLive = this.records.filter(r => {
      if (r.source === 'device_flash' || r.type === 'history_hour') return false;
      return r.timestamp > maxIncomingTs + 5000 || r.timestamp < minIncomingTs - 60000;
    });

    const prevCount = this.records.length;
    const combined = [...validIncoming, ...preservedLive];
    combined.sort((a, b) => a.timestamp - b.timestamp);
    this.records = combined;

    if (this.db) {
      await new Promise((resolve) => {
        try {
          const tx = this.db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          store.clear();
          for (let i = 0; i < this.records.length; i++) {
            const item = { ...this.records[i] };
            delete item.id;
            store.add(item);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    }

    const newlyAdded = Math.max(0, this.records.length - prevCount);
    return newlyAdded > 0 ? newlyAdded : validIncoming.length;
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
      'Voltaj_V'
    ];
    const rows = this.records.map((r, i) => {
      const d = new Date(r.timestamp);
      const humVal = typeof r.humidity === 'number' ? r.humidity.toFixed(2) : parseFloat(r.humidity).toFixed(2);
      return [
        i + 1,
        d.toLocaleDateString('tr-TR'),
        d.toLocaleTimeString('tr-TR'),
        r.type === 'history_hour' ? 'Cihaz Belleği' : 'Canlı Ölçüm',
        r.temperature.toFixed(2),
        !isNaN(parseFloat(humVal)) ? humVal : r.humidity,
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
// 4. UNIVERSAL BLE MANAGER (Robust GATT Engine)
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
    this.hasAtcLiveStream = false;

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
      '00001f10-0000-1000-8000-00805f9b34fb',
      '0000181a-0000-1000-8000-00805f9b34fb',
      '0000180f-0000-1000-8000-00805f9b34fb',
      'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
      0x1f10,
      0x181a,
      0x180f,
      0xfe95,
      0xfcd2
    ];

    try {
      try {
        this.device = await navigator.bluetooth.requestDevice({
          filters: [
            { name: 'ATC_597941' },
            { namePrefix: 'ATC_' },
            { namePrefix: 'LYWSD03' },
            { namePrefix: 'MHO' }
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
    if (!device) return false;
    this.isConnecting = true;
    this.device = device;
    this.server = null;
    this.atcChar = null;
    this.primaryService = null;
    this.hasAtcLiveStream = false;
    const devName = this.device.name || 'ATC_597941';

    this.onStatus('connecting', `${devName} bağlanıyor...`);

    // Önceki bağlantı dinleyicisini temizle
    this.device.removeEventListener?.('gattserverdisconnected', this._boundDisconnect);
    this._boundDisconnect = () => this.handleDisconnect();
    this.device.addEventListener('gattserverdisconnected', this._boundDisconnect);

    // Hızlı doğrudan GATT bağlantısı (Gereksiz bekleme ve döngüler kaldırıldı)
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        this.server = await this.device.gatt.connect();
        if (this.server && this.server.connected) {
          break;
        }
      } catch (connErr) {
        lastError = connErr;
        console.warn(`GATT denemesi ${attempt} başarısız:`, connErr);
      }
    }

    if (!this.server || !this.server.connected) {
      this.isConnected = false;
      this.isConnecting = false;
      this.onStatus('disconnected', 'GATT bağlantısı kurulamadı.');
      throw (lastError || new Error('Cihaza bağlanılamadı.'));
    }

    // GATT Servislerini Keşfet ve Karakteristikleri Anında Bağla
    await this.setupGattProfiles();

    this.isConnected = true;
    this.isConnecting = false;

    if (this.onSensorTime) {
      this.onSensorTime(Date.now());
    }

    const fwBadge = this.deviceProfile === 'atc' ? 'Canlı Bağlı' : 'Xiaomi FW';
    this.onStatus('connected', `${devName} · ${fwBadge}`);
    return true;
  }

  async setupGattProfiles() {
    // 1. ATC / PVVX Custom Control Servisini (0x1F10 -> 0x1F1F) Keşfet (En hızlı ve birincil profil)
    try {
      const atcService = await this.server.getPrimaryService('00001f10-0000-1000-8000-00805f9b34fb')
        .catch(() => this.server.getPrimaryService(0x1f10)).catch(() => null);

      if (atcService) {
        this.deviceProfile = 'atc';
        const atcChar = await atcService.getCharacteristic('00001f1f-0000-1000-8000-00805f9b34fb')
          .catch(() => atcService.getCharacteristic(0x1f1f)).catch(() => null);

        if (atcChar) {
          this.atcChar = atcChar;
          atcChar.addEventListener('characteristicvaluechanged', (e) => {
            this.handleAtcNotification(e.target.value);
          });
          await atcChar.startNotifications().catch(() => {});

          // RTC donanım saat senkronizasyonu (0x23 + uint32 epoch)
          const nowSec = Math.floor(Date.now() / 1000);
          const timeCmd = new Uint8Array([
            0x23,
            nowSec & 0xff,
            (nowSec >> 8) & 0xff,
            (nowSec >> 16) & 0xff,
            (nowSec >> 24) & 0xff
          ]);
          await this.sendAtcCommand(timeCmd).catch(() => {});

          // Canlı telemetri akışını başlat (0x33, 0x01) — pil voltajı, sıcaklık ve nemi tek pakette gecikmesiz getirir
          await this.sendAtcCommand(new Uint8Array([0x33, 0x01])).catch(() => {});

          // ATC firmware bağlandı! Olmayan 0x180F pil servisini arayıp 2.5 sn timeout beklemeyi engelle ve hemen çık.
          return;
        }
      }
    } catch (e) {
      console.warn('ATC GATT servisi başlatılamadı:', e);
    }

    // 2. Standart Pil Servisini (0x180F) Oku (Yalnızca ATC servisi yoksa fallback olarak)
    let bound = false;
    await this.readBatterySafely();

    // 3. Standart Çevre Algılama Servisi (0x181A)
    try {
      const envService = await this.server.getPrimaryService('0000181a-0000-1000-8000-00805f9b34fb')
        .catch(() => this.server.getPrimaryService(0x181a)).catch(() => null);

      if (envService) {
        await this.bindAtcEnvService(envService);
        bound = true;
      }
    } catch (e) {}

    // 4. Xiaomi Orijinal Servisi
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
    try {
      const batService = await this.server.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb')
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
              if (this.cachedVoltage == null) {
                this.cachedVoltage = Number((2.1 + (b / 100) * 0.9).toFixed(2));
              }
              if (this.cachedTemp !== null && this.cachedHum !== null) {
                this.emitTelemetry(this.cachedTemp, this.cachedHum, 'gatt_live', this.deviceProfile, this.cachedBattery, this.cachedVoltage);
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  async bindAtcEnvService(service) {
    try {
      let isHighRes = true;
      let tempChar = await service.getCharacteristic(BLE_PROFILES.CHAR_TEMP_HIGH_RES)
        .catch(() => service.getCharacteristic(0x2a6e))
        .catch(() => null);

      if (!tempChar) {
        isHighRes = false;
        tempChar = await service.getCharacteristic(BLE_PROFILES.CHAR_TEMP_STD)
          .catch(() => service.getCharacteristic(0x2a1f))
          .catch(() => null);
      }

      const divisor = isHighRes ? 100.0 : 10.0;

      if (tempChar) {
        const initial = await tempChar.readValue().catch(() => null);
        if (initial && initial.byteLength >= 2) {
          const t = initial.getInt16(0, true) / divisor;
          if (t >= -35 && t <= 75) this.cachedTemp = t;
        }
        tempChar.addEventListener('characteristicvaluechanged', (e) => {
          if (this.hasAtcLiveStream) return;
          const v = e.target.value;
          if (v && v.byteLength >= 2) {
            const t = v.getInt16(0, true) / divisor;
            if (t >= -35 && t <= 75) {
              this.cachedTemp = t;
              if (this.cachedHum !== null) {
                this.emitTelemetry(this.cachedTemp, this.cachedHum, 'gatt_live', 'atc', this.cachedBattery, this.cachedVoltage);
              }
            }
          }
        });
        await tempChar.startNotifications().catch(() => {});
      }
    } catch (e) {}

    try {
      const humChar = await service.getCharacteristic(BLE_PROFILES.CHAR_HUMIDITY)
        .catch(() => service.getCharacteristic(0x2a6f))
        .catch(() => null);

      if (humChar) {
        const initial = await humChar.readValue().catch(() => null);
        if (initial) {
          const h = initial.byteLength >= 2
            ? initial.getUint16(0, true) / 100.0
            : initial.getUint8(0);
          if (h > 0 && h <= 100) this.cachedHum = h;
        }
        humChar.addEventListener('characteristicvaluechanged', (e) => {
          if (this.hasAtcLiveStream) return;
          const v = e.target.value;
          if (v) {
            const h = v.byteLength >= 2
              ? v.getUint16(0, true) / 100.0
              : v.getUint8(0);
            if (h > 0 && h <= 100) {
              this.cachedHum = h;
              if (this.cachedTemp !== null) {
                this.emitTelemetry(this.cachedTemp, this.cachedHum, 'gatt_live', 'atc', this.cachedBattery, this.cachedVoltage);
              }
            }
          }
        });
        await humChar.startNotifications().catch(() => {});
      }
    } catch (e) {}

    if (!this.hasAtcLiveStream && this.cachedTemp !== null && this.cachedHum !== null) {
      this.emitTelemetry(this.cachedTemp, this.cachedHum, 'gatt_live', 'atc', this.cachedBattery, this.cachedVoltage);
    }
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

    // 1. 0x35: Flaş Geçmiş Kayıtları (Memo Stream)
    if (cmdId === 0x35) {
      if (this._atcHistoryHandler) {
        this._atcHistoryHandler(value);
      }
      return;
    }

    // 2. 0x23: Sensör Donanım Saati (RTC) Bildirimi
    if (cmdId === 0x23 && value.byteLength >= 5) {
      const epochSec = value.getUint32(1, true);
      if (epochSec > 1577836800 && this.onSensorTime) {
        this.onSensorTime(epochSec * 1000);
      }
      return;
    }

    // 3. 0x33: Resmi PVVX Canlı Telemetri Paketi (9 bayt: 0x33, vbat_mV, temp, humi)
    if (cmdId === 0x33 && value.byteLength >= 7) {
      const vb = value.getUint16(1, true);           // Offset 1..2: Pil Voltajı (mV)
      const t = value.getInt16(3, true) / 100.0;     // Offset 3..4: Sıcaklık (°C)
      const h = value.getUint16(5, true) / 100.0;    // Offset 5..6: Nem (%)

      if (t >= -35 && t <= 75 && h > 0 && h <= 100 && vb >= 1500 && vb <= 3800) {
        this.hasAtcLiveStream = true;
        const volt = Number((vb / 1000).toFixed(2));
        const batt = Math.min(100, Math.max(0, Math.round(((vb - 2100) / 900) * 100)));

        this.cachedTemp = t;
        this.cachedHum = h;
        this.cachedVoltage = volt;
        this.cachedBattery = batt;

        if (this.onSensorTime) {
          this.onSensorTime(Date.now());
        }

        if (!this.isFetchingHistory) {
          this.emitTelemetry(t, h, 'gatt_live', 'atc', batt, volt);
        }
      }
    }
  }

  async sendAtcCommand(cmdBytes) {
    if (!this.atcChar) throw new Error('0x1F1F karakteristiği bağlı değil.');
    const buf = cmdBytes instanceof Uint8Array ? cmdBytes : new Uint8Array(cmdBytes);
    try {
      if (this.atcChar.writeValue) {
        await this.atcChar.writeValue(buf);
      } else if (this.atcChar.writeValueWithResponse) {
        await this.atcChar.writeValueWithResponse(buf);
      } else {
        await this.atcChar.writeValueWithoutResponse(buf);
      }
    } catch (e) {
      if (this.atcChar.writeValueWithoutResponse) {
        await this.atcChar.writeValueWithoutResponse(buf);
      }
    }
  }

  emitTelemetry(temperature, humidity, source = 'gatt_live', profile = 'atc', battery = null, voltage = null) {
    if (temperature < -35 || temperature > 75 || humidity <= 0 || humidity > 100) return;
    if (battery != null && battery >= 0 && battery <= 100) this.cachedBattery = battery;
    if (voltage != null && voltage >= 1.5 && voltage <= 3.8) this.cachedVoltage = voltage;

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
    if (!this.isConnected || !this.server || !this.server.connected) {
      throw new Error('Lütfen önce Bluetooth ile cihaza bağlanın.');
    }
    if (this.isFetchingHistory && this._activeHistoryPromise) {
      return await this._activeHistoryPromise;
    }

    this.isFetchingHistory = true;
    this._activeHistoryPromise = (async () => {
      try {
        this.onHistoryProgress({ active: true, percent: 5, message: 'Sensör flaş belleği taranıyor...' });

        // 1. ATC / PVVX Modlu Cihaz (0x1F1F -> 0x35)
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
            await new Promise(r => setTimeout(r, 3200));
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

  /**
   * Resmi PVVX GraphMemo Protokolü ile Flaş Bellekten Tüm Kayıtları Eksiksiz Çekme
   */
  async fetchAtcHistoryFromFlash() {
    if (!this.atcChar) throw new Error('0x1F1F karakteristiği bağlı değil.');

    return new Promise(async (resolve, reject) => {
      const rawSamples = [];
      let timeoutTimer = null;
      let hasCompleted = false;

      const finishDownload = async () => {
        if (hasCompleted) return;
        hasCompleted = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
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
          // Kronolojik sırayı doğrula
          if (rawSamples.length >= 2) {
            let posDiffs = 0;
            let negDiffs = 0;
            const validStepSamples = [];
            for (let i = 0; i < rawSamples.length - 1; i++) {
              const d = rawSamples[i + 1].tc - rawSamples[i].tc;
              if (d > 0) posDiffs++;
              else if (d < 0) negDiffs++;
            }
            if (negDiffs > posDiffs) {
              rawSamples.reverse();
            }

            for (let i = 0; i < rawSamples.length - 1; i++) {
              const d = rawSamples[i + 1].tc - rawSamples[i].tc;
              if (d > 0 && d <= 14400) {
                validStepSamples.push(d);
              }
            }
            validStepSamples.sort((a, b) => a - b);
            var stepSec = validStepSamples.length > 0
              ? validStepSamples[Math.floor(validStepSamples.length / 2)]
              : 600;
          } else {
            var stepSec = 600;
          }

          const lastSample = rawSamples[rawSamples.length - 1];
          const nowMs = Date.now();
          const nowSec = Math.floor(nowMs / 1000);
          const tzOffsetSec = -(new Date().getTimezoneOffset() * 60);

          let anchorMs = nowMs;
          if (lastSample.tc > 1600000000) {
            if (lastSample.tc > nowSec + 1200 && Math.abs((lastSample.tc - tzOffsetSec) - nowSec) < 86400) {
              anchorMs = (lastSample.tc - tzOffsetSec) * 1000;
            } else if (lastSample.tc <= nowSec + 300 && (nowSec - lastSample.tc) < 14 * 86400) {
              anchorMs = lastSample.tc * 1000;
            }
          }

          const timestamps = new Array(rawSamples.length);
          timestamps[rawSamples.length - 1] = anchorMs;

          for (let i = rawSamples.length - 2; i >= 0; i--) {
            const diffSec = rawSamples[i + 1].tc - rawSamples[i].tc;
            const effectiveDiffSec = (diffSec > 0 && diffSec <= 14400) ? diffSec : stepSec;
            timestamps[i] = timestamps[i + 1] - (effectiveDiffSec * 1000);
          }

          const records = [];
          for (let i = 0; i < rawSamples.length; i++) {
            const s = rawSamples[i];
            const volt = Number((s.vb / 1000).toFixed(2));
            const batt = Math.min(100, Math.max(0, Math.round(((s.vb - 2100) / 900) * 100)));

            const formatted = TelemetryProcessor.format({
              timestamp: timestamps[i],
              temperature: Number(s.tm.toFixed(2)),
              humidity: Number(s.hm.toFixed(2)),
              battery: batt,
              voltage: volt,
              source: 'device_flash',
              type: 'history_hour'
            });
            if (formatted) {
              records.push(formatted);
            }
          }

          if (records.length > 0) {
            const latestRec = records[records.length - 1];
            if (latestRec.battery != null) this.cachedBattery = latestRec.battery;
            if (latestRec.voltage != null) this.cachedVoltage = latestRec.voltage;
          }

          resolve(records);
        } catch (err) {
          reject(err);
        }
      };

      const resetTimeout = (delay = 2500) => {
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

        if (len >= 13) {
          let offset = 1;
          while (offset + 12 <= len) {
            const cnt = val.getUint16(offset, true);
            const tc = val.getUint32(offset + 2, true);
            const tm = val.getInt16(offset + 6, true) / 100.0;
            const hm = val.getUint16(offset + 8, true) / 100.0;
            const vb = val.getUint16(offset + 10, true);
            offset += 12;

            if (tm >= -35 && tm <= 75 && hm > 0 && hm <= 100 && vb >= 1500 && vb <= 3800 && tc !== 0xffffffff) {
              rawSamples.push({ cnt, tc, tm, hm, vb });
            }
          }

          const pct = Math.min(95, 10 + Math.round((rawSamples.length / Math.max(80, rawSamples.length + 30)) * 85));
          this.onHistoryProgress({
            active: true,
            percent: pct,
            message: `${rawSamples.length} kayıt indirildi...`
          });
          resetTimeout(2500);
        } else if (len >= 2 && len < 13) {
          if (rawSamples.length > 0) {
            finishDownload();
          } else {
            resetTimeout(600);
          }
        }
      };

      try {
        await this.sendAtcCommand(new Uint8Array([0x33, 0x00])).catch(() => {});
        await new Promise(r => setTimeout(r, 60));

        await this.sendAtcCommand(new Uint8Array([0x55])).catch(() => {});
        await new Promise(r => setTimeout(r, 120));

        await this.sendAtcCommand(new Uint8Array([0x35, 0xff, 0xff, 0x00, 0x00])).catch(() => {});
        resetTimeout(4000);
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
      source: 'device_flash',
      type: 'history_hour'
    });
  }

  async disconnect() {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      try {
        this.device.gatt.disconnect();
      } catch (e) {}
    }
    this.server = null;
    this.atcChar = null;
    this.primaryService = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.hasAtcLiveStream = false;
    this.onStatus('disconnected', 'Bağlantı kesildi.');
  }

  handleDisconnect() {
    this.server = null;
    this.atcChar = null;
    this.primaryService = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.hasAtcLiveStream = false;
    this.onStatus('disconnected', 'Bağlantı koptu.');
  }
}

// ==========================================
// 5. APPLICATION CONTROLLER
// ==========================================
class AppController {
  constructor() {
    this.storage = new TelemetryStorage();
    this.sensorClockOffset = 0;
    this.hasReceivedSensorClock = false;
    this._clockTimer = null;
    this._autoSyncTimer = null;
    this._updateScheduled = false;
    this.isSyncing = false;

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

      valBattery: document.getElementById('valBattery'),
      valVoltageBadge: document.getElementById('valVoltageBadge'),

      // Chart
      chartCard: document.getElementById('chartCard'),
      btnToggleFullscreenChart: document.getElementById('btnToggleFullscreenChart'),
      btnToggleFullscreenChartMobile: document.getElementById('btnToggleFullscreenChartMobile'),
      iconChartFullscreen: document.getElementById('iconChartFullscreen'),
      iconChartFullscreenMobile: document.getElementById('iconChartFullscreenMobile'),
      lblChartFullscreen: document.getElementById('lblChartFullscreen'),
      lblChartFullscreenMobile: document.getElementById('lblChartFullscreenMobile'),
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
      this.latestTelemetry = last;
      this.renderTelemetryCards(last);
      this.updateChart();
    }

    // Doğrudan otomatik bağlanmayı dene (daha önce izin verildiyse)
    this.ble.tryAutoConnect().catch(() => {});

    window.addEventListener('resize', () => {
      if (this.chart) {
        const isFullscreen = this.dom.chartCard?.classList.contains('chart-fullscreen');
        const isMobile = window.innerWidth < 640;
        this.chart.options.scales.x.ticks.maxTicksLimit = isFullscreen ? (isMobile ? 8 : 14) : (isMobile ? 5 : 9);
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
    const validMs = (sensorTimeMs && !isNaN(sensorTimeMs) && sensorTimeMs > 1577836800000)
      ? sensorTimeMs
      : Date.now();
    this.sensorClockOffset = validMs - Date.now();
    this.hasReceivedSensorClock = true;
    this.updateSensorClockDisplay();

    // Sadece cihaz bağlıyken saat zamanlayıcısını çalıştır (boşta CPU harcamasını önle)
    if (!this._clockTimer) {
      this._clockTimer = setInterval(() => {
        this.updateSensorClockDisplay();
      }, 1000);
    }
  }

  updateSensorClockDisplay() {
    if (!this.hasReceivedSensorClock && !this.ble?.isConnected) {
      if (this.dom.liveClockTime) this.dom.liveClockTime.textContent = '--:--:--';
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

    // Chart Fullscreen Toggle Buttons (Desktop & Mobile)
    if (this.dom.btnToggleFullscreenChart) {
      this.dom.btnToggleFullscreenChart.addEventListener('click', () => {
        this.toggleChartFullscreen();
      });
    }
    if (this.dom.btnToggleFullscreenChartMobile) {
      this.dom.btnToggleFullscreenChartMobile.addEventListener('click', () => {
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
    if (!this.ble.isConnected || !this.ble.server || !this.ble.server.connected) {
      if (!isAuto) {
        this.showToast('Lütfen önce Bluetooth ile cihaza bağlanın.', 'info');
      }
      return;
    }

    if (this.isSyncing) {
      if (!isAuto) {
        this.showToast('Veriler aktarılıyor, lütfen bekleyin...', 'info');
      }
      return;
    }

    this.isSyncing = true;
    try {
      if (!isAuto) {
        this.showToast('Sensör belleğindeki kayıtlar indiriliyor...', 'info');
      }
      const records = await this.ble.fetchDeviceHistory();
      if (records && records.length > 0) {
        for (let i = records.length - 1; i >= 0; i--) {
          if (records[i].voltage != null) {
            this.latestVoltage = records[i].voltage;
            if (records[i].battery != null) this.latestBattery = records[i].battery;
            break;
          }
        }
        await this.storage.addBatch(records);
        const last = this.storage.records[this.storage.records.length - 1];
        if (last) {
          if (last.battery == null && this.latestBattery != null) last.battery = this.latestBattery;
          if (last.voltage == null && this.latestVoltage != null) last.voltage = this.latestVoltage;
          this.latestTelemetry = last;
          this.renderTelemetryCards(last);
        }
        this.renderTable();
        this.updateChart();
        this.showToast(`Sensör belleğinden ${records.length} kayıt aktarıldı.`, 'success');
      } else {
        if (!isAuto) {
          this.showToast('Sensör belleğinde yeni kayıt bulunamadı.', 'info');
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
      if (!this.hasReceivedSensorClock) {
        this.setSensorClock(Date.now());
      } else {
        this.updateSensorClockDisplay();
      }
    } else {
      if (this._clockTimer) {
        clearInterval(this._clockTimer);
        this._clockTimer = null;
      }
      if (this._autoSyncTimer) {
        clearTimeout(this._autoSyncTimer);
        this._autoSyncTimer = null;
      }
      if (this.dom.liveClockTime) {
        this.dom.liveClockTime.textContent = '--:--:--';
      }
    }

    // Durum Noktası (Pastel Tonlar)
    if (this.dom.sensorClockPulse) {
      if (status === 'connected') {
        this.dom.sensorClockPulse.className = 'w-2.5 h-2.5 rounded-full bg-[#79b496] flex-shrink-0';
      } else if (status === 'connecting' || status === 'scanning') {
        this.dom.sensorClockPulse.className = 'w-2.5 h-2.5 rounded-full bg-[#e6b87d] flex-shrink-0';
      } else {
        this.dom.sensorClockPulse.className = 'w-2.5 h-2.5 rounded-full bg-[#a1abb8] flex-shrink-0';
      }
    }

    // Bağlan Butonu (Pastel Tonlar)
    if (this.dom.btnConnect) {
      if (status === 'connected') {
        if (this.dom.btnConnectLabel) this.dom.btnConnectLabel.textContent = 'Bağlantıyı Kes';
        this.dom.btnConnect.className = 'px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-[#c26d66] hover:bg-[#ab5852] text-white shadow-none cursor-pointer';
      } else {
        if (this.dom.btnConnectLabel) this.dom.btnConnectLabel.textContent = 'Bağlan';
        this.dom.btnConnect.className = 'px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-[#546e7a] hover:bg-[#455a64] text-white shadow-none cursor-pointer';
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
    if (!this.hasReceivedSensorClock) {
      this.setSensorClock(Date.now());
    }

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

    // 1. Ana kartlar gecikmesiz, anında güncellenir
    this.renderTelemetryCards(enriched);

    // 2. Tablo ve grafik güncellemeleri akıcı şekilde optimize edilir
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
    // 1. Sıcaklık Kartı (Pastel Coral)
    const rawTemp = Number(data.temperature);
    let displayTemp = rawTemp;
    if (this.currentUnit === 'F') {
      displayTemp = (rawTemp * 9 / 5) + 32;
    }
    if (this.dom.valTemp) this.dom.valTemp.textContent = displayTemp.toFixed(2);
    if (this.dom.lblTempUnit) this.dom.lblTempUnit.textContent = `°${this.currentUnit}`;

    // 2. Bağıl Nem Kartı (Pastel Teal)
    const humNum = Number(data.humidity);
    const humFormatted = !isNaN(humNum) ? humNum.toFixed(2) : data.humidity;
    if (this.dom.valHum) this.dom.valHum.textContent = humFormatted;

    if (this.dom.humidityStatusBadge) {
      if (humNum < 30) {
        this.dom.humidityStatusBadge.textContent = 'Kuru';
        this.dom.humidityStatusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-[#fcf5ec] text-[#9c6a28] dark:bg-[#2b2419] dark:text-[#e4b97a] border border-[#f5e3cc] dark:border-[#3e3322] font-medium';
      } else if (humNum > 60) {
        this.dom.humidityStatusBadge.textContent = 'Yüksek Nem';
        this.dom.humidityStatusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-[#eef4fb] text-[#3d6896] dark:bg-[#182433] dark:text-[#86b0de] border border-[#d5e4f5] dark:border-[#23354a] font-medium';
      } else {
        this.dom.humidityStatusBadge.textContent = 'İdeal';
        this.dom.humidityStatusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-[#edf6f5] text-[#387671] dark:bg-[#1a2928] dark:text-[#88cec7] border border-[#d8ebe8] dark:border-[#243b39] font-medium';
      }
    }

    // 3. Pil Voltajı Kartı (Pastel Sage Green)
    const effectiveBattery = data.battery != null ? data.battery : this.latestBattery;
    let effectiveVoltage = data.voltage != null ? Number(data.voltage) : (this.latestVoltage != null ? Number(this.latestVoltage) : null);

    if (effectiveVoltage == null && effectiveBattery != null) {
      effectiveVoltage = Number((2.1 + (Number(effectiveBattery) / 100) * 0.9).toFixed(2));
    }

    if (this.dom.valBattery) {
      this.dom.valBattery.textContent = (effectiveVoltage != null && !isNaN(effectiveVoltage))
        ? effectiveVoltage.toFixed(2)
        : '--.--';
    }

    // Sağ üst voltaj rozeti
    if (this.dom.valVoltageBadge) {
      if (effectiveVoltage != null && !isNaN(effectiveVoltage)) {
        const mv = Math.round(effectiveVoltage * 1000);
        const stateLabel = effectiveVoltage >= 2.75 ? 'İyi' : (effectiveVoltage >= 2.45 ? 'Orta' : 'Düşük');
        this.dom.valVoltageBadge.textContent = `${mv} mV · ${stateLabel}`;
        if (effectiveVoltage < 2.45) {
          this.dom.valVoltageBadge.className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#faeceb] text-[#9e433e] dark:bg-[#2b1c1b] dark:text-[#e88d88] border border-[#f2d8d6] dark:border-[#3d2726]';
        } else if (effectiveVoltage < 2.75) {
          this.dom.valVoltageBadge.className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#fcf5ec] text-[#9c6a28] dark:bg-[#2b2419] dark:text-[#e4b97a] border border-[#f5e3cc] dark:border-[#3e3322]';
        } else {
          this.dom.valVoltageBadge.className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#eef5f0] text-[#436e53] dark:bg-[#1c2921] dark:text-[#97d0ab] border border-[#d9ebd8] dark:border-[#283b2f]';
        }
      } else {
        this.dom.valVoltageBadge.textContent = '-- mV';
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
            <td colspan="4" class="py-6 text-center text-[#7a828e] dark:text-[#8f96a3] font-sans">
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
        const timeStr = `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

        let t = item.temperature;
        if (this.currentUnit === 'F') {
          t = (t * 9 / 5) + 32;
        }
        const humNum = Number(item.humidity);
        let voltStr = '--';
        if (item.voltage != null && !isNaN(Number(item.voltage))) {
          voltStr = `${Number(item.voltage).toFixed(2)} V`;
        } else if (item.battery != null && !isNaN(Number(item.battery))) {
          const v = (2.1 + (Number(item.battery) / 100) * 0.9).toFixed(2);
          voltStr = `${v} V`;
        }

        return `
          <tr class="hover:bg-[#f6f8fa]/60 dark:hover:bg-[#1e232c]/50">
            <td class="py-2 px-2.5 sm:px-3 text-[#525a66] dark:text-[#a1abb8] font-sans">${timeStr}</td>
            <td class="py-2 px-2 sm:px-3 font-bold text-[#d97757] dark:text-[#f09985]">${t.toFixed(2)}°${this.currentUnit}</td>
            <td class="py-2 px-2 sm:px-3 font-semibold text-[#4a908a] dark:text-[#76beb7]">%${humNum.toFixed(1)}</td>
            <td class="py-2 px-2 sm:px-3 font-semibold text-[#588b6b] dark:text-[#83c299]">${voltStr}</td>
          </tr>
        `;
      }).join('');
    }
  }

  initChart() {
    const ctx = document.getElementById('telemetryChart').getContext('2d');
    const isDark = this.currentTheme === 'dark';
    const isMobile = window.innerWidth < 640;

    // Pastel Gradients
    const tempGradient = ctx.createLinearGradient(0, 0, 0, 320);
    tempGradient.addColorStop(0, isDark ? 'rgba(240, 153, 133, 0.20)' : 'rgba(217, 119, 87, 0.14)');
    tempGradient.addColorStop(1, 'rgba(217, 119, 87, 0.0)');

    const humGradient = ctx.createLinearGradient(0, 0, 0, 320);
    humGradient.addColorStop(0, isDark ? 'rgba(118, 190, 183, 0.20)' : 'rgba(74, 144, 138, 0.14)');
    humGradient.addColorStop(1, 'rgba(74, 144, 138, 0.0)');

    const batGradient = ctx.createLinearGradient(0, 0, 0, 320);
    batGradient.addColorStop(0, isDark ? 'rgba(131, 194, 153, 0.20)' : 'rgba(88, 139, 107, 0.14)');
    batGradient.addColorStop(1, 'rgba(88, 139, 107, 0.0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            // 0: Sıcaklık (Pastel Coral)
            label: 'Sıcaklık',
            data: [],
            borderColor: isDark ? '#f09985' : '#d97757',
            backgroundColor: tempGradient,
            borderWidth: 2,
            fill: true,
            cubicInterpolationMode: 'monotone',
            tension: 0.15,
            spanGaps: true,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 14,
            pointBackgroundColor: isDark ? '#f09985' : '#d97757',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            yAxisID: 'yTemp'
          },
          {
            // 1: Bağıl Nem (Pastel Teal)
            label: 'Bağıl Nem',
            data: [],
            borderColor: isDark ? '#76beb7' : '#4a908a',
            backgroundColor: humGradient,
            borderWidth: 2,
            fill: true,
            cubicInterpolationMode: 'monotone',
            tension: 0.15,
            spanGaps: true,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 14,
            pointBackgroundColor: isDark ? '#76beb7' : '#4a908a',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            yAxisID: 'yHum'
          },
          {
            // 2: Pil Voltajı (Pastel Sage)
            label: 'Pil Voltajı (V)',
            data: [],
            borderColor: isDark ? '#83c299' : '#588b6b',
            backgroundColor: batGradient,
            borderWidth: 2,
            fill: true,
            cubicInterpolationMode: 'monotone',
            tension: 0.15,
            spanGaps: true,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 14,
            pointBackgroundColor: isDark ? '#83c299' : '#588b6b',
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
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: true,
            animation: false,
            backgroundColor: isDark ? 'rgba(24, 28, 34, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e6eb',
            borderWidth: 1,
            titleColor: isDark ? '#f0f2f5' : '#2d3139',
            bodyColor: isDark ? '#c5cbd4' : '#525a66',
            padding: 8,
            cornerRadius: 10,
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
              color: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
              borderDash: [3, 3],
              drawBorder: false
            },
            ticks: {
              color: isDark ? '#7a828e' : '#8e96a3',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              maxTicksLimit: isMobile ? 5 : 9
            }
          },
          yTemp: {
            type: 'linear',
            display: true,
            position: 'left',
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
              borderDash: [3, 3],
              drawBorder: false
            },
            ticks: {
              color: isDark ? '#f09985' : '#d97757',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              callback: (v) => `${Number(v).toFixed(1)}°`
            },
            grace: '10%'
          },
          yHum: {
            type: 'linear',
            display: false,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: isDark ? '#76beb7' : '#4a908a',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              callback: (v) => `%${Number(v).toFixed(0)}`
            },
            suggestedMin: 20,
            suggestedMax: 80,
            grace: '10%'
          },
          yBat: {
            type: 'linear',
            display: false,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: isDark ? '#83c299' : '#588b6b',
              font: { family: 'Parkinsans', size: isMobile ? 10 : 11, weight: 600 },
              callback: (v) => `${Number(v).toFixed(2)} V`
            },
            suggestedMin: 2.4,
            suggestedMax: 3.2,
            grace: '10%'
          }
        }
      }
    });
  }

  adaptChartTheme() {
    if (!this.chart) return;
    const isDark = this.currentTheme === 'dark';

    this.chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(24, 28, 34, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    this.chart.options.plugins.tooltip.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e6eb';
    this.chart.options.plugins.tooltip.titleColor = isDark ? '#f0f2f5' : '#2d3139';
    this.chart.options.plugins.tooltip.bodyColor = isDark ? '#c5cbd4' : '#525a66';

    this.chart.options.scales.x.grid.color = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)';
    this.chart.options.scales.yTemp.grid.color = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)';
    this.chart.options.scales.x.ticks.color = isDark ? '#7a828e' : '#8e96a3';
    this.chart.options.scales.yTemp.ticks.color = isDark ? '#f09985' : '#d97757';

    this.chart.data.datasets[0].borderColor = isDark ? '#f09985' : '#d97757';
    this.chart.data.datasets[0].pointBackgroundColor = isDark ? '#f09985' : '#d97757';
    this.chart.data.datasets[1].borderColor = isDark ? '#76beb7' : '#4a908a';
    this.chart.data.datasets[1].pointBackgroundColor = isDark ? '#76beb7' : '#4a908a';
    this.chart.data.datasets[2].borderColor = isDark ? '#83c299' : '#588b6b';
    this.chart.data.datasets[2].pointBackgroundColor = isDark ? '#83c299' : '#588b6b';

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

    const maxPoints = 2500;
    if (records.length > maxPoints) {
      const step = Math.ceil(records.length / maxPoints);
      records = records.filter((_, idx) => idx % step === 0 || idx === records.length - 1);
    }
    this.chartRecords = records;

    const pRadius = records.length <= 12 ? 3.5 : (records.length <= 35 ? 2.0 : 0);
    this.chart.data.datasets.forEach(ds => {
      ds.pointRadius = pRadius;
    });

    const labels = records.map(r => {
      const d = new Date(r.timestamp);
      return (records.length <= 10)
        ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    });

    const tempData = records.map(r => {
      const t = Number(r.temperature);
      return this.currentUnit === 'F' ? Number(((t * 9 / 5) + 32).toFixed(2)) : Number(t.toFixed(2));
    });

    const humData = records.map(r => Number(Number(r.humidity).toFixed(1)));

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
    } else if (this.chartMode === 'hum') {
      ds[0].hidden = true;
      ds[1].hidden = false;
      ds[2].hidden = true;
      scales.yTemp.display = false;
      scales.yHum.display = true;
      scales.yBat.display = false;
    } else if (this.chartMode === 'battery') {
      ds[0].hidden = true;
      ds[1].hidden = true;
      ds[2].hidden = false;
      scales.yTemp.display = false;
      scales.yHum.display = false;
      scales.yBat.display = true;
    } else {
      // 'all'
      ds[0].hidden = false;
      ds[1].hidden = false;
      ds[2].hidden = false;
      scales.yTemp.display = true;
      scales.yHum.display = true;
      scales.yBat.display = false;
    }

    this.chart.update('none');
  }

  toggleChartFullscreen() {
    const chartCard = this.dom.chartCard || document.getElementById('chartCard');
    if (!chartCard) return;

    const isFullscreen = chartCard.classList.toggle('chart-fullscreen');
    document.body.classList.toggle('overflow-hidden', isFullscreen);

    const iconName = isFullscreen ? 'minimize-2' : 'maximize-2';
    const labelText = isFullscreen ? 'Küçült' : 'Büyüt';

    if (this.dom.iconChartFullscreen) {
      this.dom.iconChartFullscreen.setAttribute('data-lucide', iconName);
    }
    if (this.dom.iconChartFullscreenMobile) {
      this.dom.iconChartFullscreenMobile.setAttribute('data-lucide', iconName);
    }
    if (this.dom.lblChartFullscreen) {
      this.dom.lblChartFullscreen.textContent = labelText;
    }
    if (this.dom.lblChartFullscreenMobile) {
      this.dom.lblChartFullscreenMobile.textContent = labelText;
    }
    lucide.createIcons();

    if (this.chart) {
      const isMobile = window.innerWidth < 640;
      this.chart.options.scales.x.ticks.maxTicksLimit = isFullscreen ? (isMobile ? 8 : 14) : (isMobile ? 5 : 9);
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
      if (meta) meta.setAttribute('content', '#121519');
    } else {
      html.classList.remove('dark');
      html.classList.add('light');
      if (this.dom.themeIcon) this.dom.themeIcon.setAttribute('data-lucide', 'moon');
      const meta = document.getElementById('metaThemeColor');
      if (meta) meta.setAttribute('content', '#fbfbfa');
    }

    lucide.createIcons();
    this.adaptChartTheme();
  }

  showToast(message, type = 'info') {
    if (!this.dom.toastContainer) return;
    this.dom.toastContainer.innerHTML = '';

    const toast = document.createElement('div');
    const colors = {
      success: 'bg-[#4a7c59] text-[#f2f9f5] border border-[#588b6b]/30',
      error: 'bg-[#a3534d] text-[#fdf3f2] border border-[#c26d66]/30',
      info: 'bg-[#3f4d5e] text-[#f0f3f6] border border-[#546e7a]/30'
    };
    toast.className = `p-3 rounded-2xl shadow-sm text-xs font-semibold flex items-center justify-between gap-2 pointer-events-auto ${colors[type] || colors.info}`;
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
