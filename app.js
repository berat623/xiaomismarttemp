/**
 * Xiaomi SmartTemp Pro — Poppins Typography & Dual Theme (Light / Dark)
 * Device: Xiaomi Mijia LYWSD03MMC
 * Features: Web Bluetooth GATT Live Streaming, Internal Flash Memory History Sync,
 *           IndexedDB Persistent Storage, Chart.js Time Series & Physical Metrics.
 */

// ==========================================
// 1. CONSTANTS & UUID DEFINITIONS
// ==========================================
const XIAOMI_CONFIG = {
  // Service UUIDs
  SERVICE_UUID: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
  ENV_SENSING_UUID: '0000181a-0000-1000-8000-00805f9b34fb', // Custom FW fallback
  BATTERY_SERVICE_UUID: '0000180f-0000-1000-8000-00805f9b34fb',

  // Characteristic UUIDs (Stock Xiaomi LYWSD03MMC GATT Profile)
  CHAR_LIVE_DATA: 'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6',       // 5 bytes: [temp (int16), hum (uint8), volt (int16)]
  CHAR_BATTERY: 'ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6',         // 1 byte %
  CHAR_UNIT: 'ebe0ccbe-7a0a-4b0c-8a1a-6ff2997da3a6',            // 0x00=C, 0x01=F
  CHAR_TIMESTAMP: 'ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6',       // 4 bytes uint32 epoch sec
  CHAR_FIRST_REC_IDX: 'ebe0ccba-7a0a-4b0c-8a1a-6ff2997da3a6',   // 4 bytes uint32
  CHAR_LAST_CALC_IDX: 'ebe0ccb9-7a0a-4b0c-8a1a-6ff2997da3a6',   // 8 bytes: [last_calc_idx, last_rec_idx]
  CHAR_HISTORY_STREAM: 'ebe0ccbc-7a0a-4b0c-8a1a-6ff2997da3a6',  // 14 bytes: [idx, ts, tMax, hMax, tMin, hMin]
  CHAR_LAST_HOUR_DATA: 'ebe0ccbb-7a0a-4b0c-8a1a-6ff2997da3a6'   // 14 bytes: latest 1-hour record
};

// ==========================================
// 2. STORAGE MANAGER (IndexedDB + Memory)
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
        this.records = req.result || [];
        this.records.sort((a, b) => a.timestamp - b.timestamp);
        resolve(this.records);
      };
      req.onerror = () => resolve([]);
    });
  }

  async addRecord(record) {
    this.records.push(record);
    this.records.sort((a, b) => a.timestamp - b.timestamp);

    if (this.db) {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).add(record);
    }
  }

  async addBatch(recordsList) {
    if (!recordsList || recordsList.length === 0) return;
    for (const r of recordsList) {
      const exists = this.records.some(ex => Math.abs(ex.timestamp - r.timestamp) < 5000 && ex.type === r.type);
      if (!exists) {
        this.records.push(r);
        if (this.db) {
          const tx = this.db.transaction(this.storeName, 'readwrite');
          tx.objectStore(this.storeName).add(r);
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
    const headers = ['ID', 'Tarih', 'Saat', 'Tür', 'Sıcaklık (°C)', 'Nem (%)', 'Pil (%)', 'Voltaj (V)', 'Çiğ Noktası (°C)', 'VPD (kPa)'];
    const rows = this.records.map((r, i) => {
      const d = new Date(r.timestamp);
      return [
        i + 1,
        d.toLocaleDateString('tr-TR'),
        d.toLocaleTimeString('tr-TR'),
        r.type === 'history_hour' ? 'Cihaz Geçmişi' : 'Canlı Ölçüm',
        r.temperature.toFixed(2),
        r.humidity,
        r.battery != null ? r.battery : '',
        r.voltage != null ? r.voltage.toFixed(2) : '',
        r.dewPoint != null ? r.dewPoint.toFixed(1) : '',
        r.vpd != null ? r.vpd.toFixed(2) : ''
      ].join(';');
    });
    return [headers.join(';'), ...rows].join('\r\n');
  }

  exportJSON() {
    return JSON.stringify(this.records, null, 2);
  }
}

// ==========================================
// 3. BLUETOOTH MANAGER (Web Bluetooth API)
// ==========================================
class XiaomiBleManager {
  constructor(onDataCallback, onStatusCallback, onHistoryProgressCallback) {
    this.onData = onDataCallback;
    this.onStatus = onStatusCallback;
    this.onHistoryProgress = onHistoryProgressCallback;

    this.device = null;
    this.server = null;
    this.primaryService = null;
    this.liveChar = null;
    this.isConnected = false;
    this.isFetchingHistory = false;
  }

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Tarayıcınız Web Bluetooth API desteği sağlamıyor. Lütfen Google Chrome veya Microsoft Edge kullanın.');
    }

    this.onStatus('scanning', 'Cihaz aranıyor...');

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'LYWSD03MMC' },
          { namePrefix: 'ATC' },
          { namePrefix: 'MHO' },
          { services: [XIAOMI_CONFIG.SERVICE_UUID] }
        ],
        optionalServices: [
          XIAOMI_CONFIG.SERVICE_UUID,
          XIAOMI_CONFIG.ENV_SENSING_UUID,
          XIAOMI_CONFIG.BATTERY_SERVICE_UUID
        ]
      });

      this.device.addEventListener('gattserverdisconnected', () => this.handleDisconnect());

      this.onStatus('connecting', `${this.device.name || 'Xiaomi Cihazı'} bağlanıyor...`);
      this.server = await this.device.gatt.connect();

      this.primaryService = await this.server.getPrimaryService(XIAOMI_CONFIG.SERVICE_UUID);
      await this.startLiveNotifications();

      this.isConnected = true;
      this.onStatus('connected', `${this.device.name || 'LYWSD03MMC'} Bağlandı`);
      return true;
    } catch (err) {
      this.isConnected = false;
      this.onStatus('disconnected', 'Bağlantı iptal edildi veya başarısız.');
      throw err;
    }
  }

  async startLiveNotifications() {
    if (!this.primaryService) return;

    try {
      this.liveChar = await this.primaryService.getCharacteristic(XIAOMI_CONFIG.CHAR_LIVE_DATA);
      await this.liveChar.startNotifications();
      this.liveChar.addEventListener('characteristicvaluechanged', (e) => this.handleLivePacket(e));

      // Initial read
      const val = await this.liveChar.readValue();
      this.parseAndEmitLivePacket(val);
    } catch (err) {
      console.warn('Özel bildirim karakteristiği alınamadı, standart çevre servisi deneniyor...', err);
      try {
        const envService = await this.server.getPrimaryService(XIAOMI_CONFIG.ENV_SENSING_UUID);
        const tempChar = await envService.getCharacteristic('00002a6e-0000-1000-8000-00805f9b34fb');
        const humChar = await envService.getCharacteristic('00002a6f-0000-1000-8000-00805f9b34fb');

        const tempVal = await tempChar.readValue();
        const humVal = await humChar.readValue();
        const temp = tempVal.getInt16(0, true) / 100.0;
        const hum = humVal.getUint16(0, true) / 100.0;

        this.onData({
          temperature: temp,
          humidity: hum,
          voltage: 3.0,
          battery: 90,
          timestamp: Date.now(),
          type: 'live'
        });
      } catch (e2) {
        throw new Error('Sensör karakteristiklerine erişilemedi: ' + err.message);
      }
    }
  }

  handleLivePacket(event) {
    const value = event.target.value;
    this.parseAndEmitLivePacket(value);
  }

  parseAndEmitLivePacket(value) {
    if (!value || value.byteLength < 5) return;

    const tempRaw = value.getInt16(0, true);
    const temperature = tempRaw / 100.0;
    const humidity = value.getUint8(2);

    const voltageRaw = value.getInt16(3, true);
    const voltage = voltageRaw / 1000.0;

    let battery = Math.round(((voltage - 2.1) / 1.0) * 100);
    battery = Math.max(0, Math.min(100, battery));

    this.onData({
      temperature: Number(temperature.toFixed(2)),
      humidity: humidity,
      voltage: Number(voltage.toFixed(2)),
      battery: battery,
      timestamp: Date.now(),
      type: 'live'
    });
  }

  async fetchDeviceHistory() {
    if (!this.isConnected || !this.primaryService) {
      throw new Error('Geçmiş kayıtları çekmek için önce cihaza bağlı olmalısınız.');
    }

    if (this.isFetchingHistory) {
      throw new Error('Geçmiş indirme işlemi zaten devam ediyor.');
    }

    this.isFetchingHistory = true;
    this.onHistoryProgress({ active: true, percent: 5, message: 'Cihaz saati senkronize ediliyor...' });

    try {
      // 1. Sync Timestamp
      const nowSec = Math.floor(Date.now() / 1000);
      try {
        const timeChar = await this.primaryService.getCharacteristic(XIAOMI_CONFIG.CHAR_TIMESTAMP);
        const timeBuf = new ArrayBuffer(4);
        new DataView(timeBuf).setUint32(0, nowSec, true);
        await timeChar.writeValue(timeBuf);
      } catch (e) {
        console.warn('Saat senkronizasyonu atlandı:', e);
      }

      // 2. Read pointers
      this.onHistoryProgress({ active: true, percent: 15, message: 'Kayıt indeksleri okunuyor...' });
      let lastCalcIdx = 0;
      let lastRecIdx = 0;
      try {
        const idxChar = await this.primaryService.getCharacteristic(XIAOMI_CONFIG.CHAR_LAST_CALC_IDX);
        const idxVal = await idxChar.readValue();
        if (idxVal.byteLength >= 8) {
          lastCalcIdx = idxVal.getUint32(0, true);
          lastRecIdx = idxVal.getUint32(4, true);
        }
      } catch (e) {
        console.warn('İndeks karakteristiği okunamadı:', e);
      }

      // 3. Read Latest 1-Hour Record
      const fetchedRecords = [];
      try {
        const lastHourChar = await this.primaryService.getCharacteristic(XIAOMI_CONFIG.CHAR_LAST_HOUR_DATA);
        const lastVal = await lastHourChar.readValue();
        const parsed = this.parseHistoryChunk(lastVal);
        if (parsed) fetchedRecords.push(parsed);
      } catch (e) {
        console.warn('Son saat kaydı okunamadı:', e);
      }

      // 4. Stream full history via notifications
      this.onHistoryProgress({ active: true, percent: 35, message: 'Geçmiş kayıt akışı dinleniyor...' });
      try {
        const historyChar = await this.primaryService.getCharacteristic(XIAOMI_CONFIG.CHAR_HISTORY_STREAM);
        await historyChar.startNotifications();

        await new Promise((resolve) => {
          let timeout = null;
          const handler = (event) => {
            const chunk = event.target.value;
            const item = this.parseHistoryChunk(chunk);
            if (item) {
              fetchedRecords.push(item);
              const count = fetchedRecords.length;
              const target = Math.max(1, lastRecIdx || 24);
              const pct = Math.min(95, 35 + Math.round((count / target) * 60));
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
      } catch (err) {
        console.warn('Geçmiş bildirim akışı alınamadı:', err);
      }

      this.onHistoryProgress({ active: false, percent: 100, message: 'Tamamlandı' });
      this.isFetchingHistory = false;
      return fetchedRecords;
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

    return {
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
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
  }

  handleDisconnect() {
    this.isConnected = false;
    this.onStatus('disconnected', 'Cihaz bağlantısı koptu.');
  }
}

// ==========================================
// 4. PHYSICAL METRICS CALCULATOR
// ==========================================
class PhysicalMetrics {
  // Magnus Formula for Dew Point (Çiğ Noktası)
  static calculateDewPoint(temperature, humidity) {
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * temperature) / (b + temperature)) + Math.log(humidity / 100.0);
    const dewPoint = (b * alpha) / (a - alpha);
    return Number(dewPoint.toFixed(1));
  }

  // Vapor Pressure Deficit (VPD in kPa)
  static calculateVPD(temperature, humidity) {
    const vpSat = 0.61078 * Math.exp((17.27 * temperature) / (temperature + 237.3));
    const vpAir = vpSat * (humidity / 100.0);
    const vpd = vpSat - vpAir;
    return Number(vpd.toFixed(2));
  }
}

// ==========================================
// 5. APPLICATION UI CONTROLLER
// ==========================================
class AppController {
  constructor() {
    this.storage = new TelemetryStorage();
    this.ble = new XiaomiBleManager(
      (data) => this.handleNewData(data),
      (state, text) => this.handleBleStatus(state, text),
      (prog) => this.handleHistoryProgress(prog)
    );

    // State
    this.currentUnit = 'C'; // 'C' or 'F'
    this.currentTheme = localStorage.getItem('smarttemp_theme') || 'light';
    this.latestTelemetry = null;
    this.demoInterval = null;
    this.isDemoActive = false;
    this.chartRange = '1h';
    this.chartMode = 'both';
    this.currentPage = 1;
    this.pageSize = 15;

    this.chart = null;

    // Cache DOM Elements
    this.dom = {
      btnThemeToggle: document.getElementById('btnThemeToggle'),
      themeIcon: document.getElementById('themeIcon'),
      themeLabel: document.getElementById('themeLabel'),
      metaThemeColor: document.getElementById('metaThemeColor'),

      btnConnect: document.getElementById('btnConnect'),
      btnFetchHistory: document.getElementById('btnFetchHistory'),
      btnDemo: document.getElementById('btnDemo'),
      btnHelp: document.getElementById('btnHelp'),
      btnCloseHelp: document.getElementById('btnCloseHelp'),
      btnGotIt: document.getElementById('btnGotIt'),
      helpModal: document.getElementById('helpModal'),

      connectionDot: document.getElementById('connectionDot'),
      connectionStatusText: document.getElementById('connectionStatusText'),
      lastUpdatedAgo: document.getElementById('lastUpdatedAgo'),

      // Metrics
      valTemp: document.getElementById('valTemp'),
      lblTempUnit: document.getElementById('lblTempUnit'),
      btnToggleUnit: document.getElementById('btnToggleUnit'),
      tempMinMax: document.getElementById('tempMinMax'),
      tempTrendBadge: document.getElementById('tempTrendBadge'),
      valDewPoint: document.getElementById('valDewPoint'),

      valHum: document.getElementById('valHum'),
      humProgressBar: document.getElementById('humProgressBar'),
      humMinMax: document.getElementById('humMinMax'),
      humidityStatusBadge: document.getElementById('humidityStatusBadge'),
      valVpd: document.getElementById('valVpd'),

      valBattery: document.getElementById('valBattery'),
      valVoltage: document.getElementById('valVoltage'),
      batteryProgressBar: document.getElementById('batteryProgressBar'),
      totalPointsCount: document.getElementById('totalPointsCount'),

      // Sync Progress
      syncProgressBanner: document.getElementById('syncProgressBanner'),
      syncProgressLabel: document.getElementById('syncProgressLabel'),
      syncProgressPercent: document.getElementById('syncProgressPercent'),
      syncProgressBar: document.getElementById('syncProgressBar'),

      // Table
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

    // Adapt chart styling to theme
    if (this.chart) {
      this.adaptChartTheme();
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    this.showToast(`${nextTheme === 'dark' ? 'Koyu' : 'Açık'} tema aktif edildi.`, 'info');
  }

  setupEventListeners() {
    // Theme Switcher
    this.dom.btnThemeToggle.addEventListener('click', () => this.toggleTheme());

    // Bluetooth Connect
    this.dom.btnConnect.addEventListener('click', async () => {
      if (this.ble.isConnected) {
        await this.ble.disconnect();
      } else {
        try {
          if (this.isDemoActive) this.stopDemo();
          await this.ble.connect();
          this.showToast('Xiaomi sensörü başarıyla bağlandı!', 'success');
        } catch (err) {
          if (err.name !== 'NotFoundError') {
            this.showToast('Bağlantı hatası: ' + err.message, 'error');
          }
        }
      }
    });

    // Fetch History
    this.dom.btnFetchHistory.addEventListener('click', async () => {
      try {
        this.dom.btnFetchHistory.disabled = true;
        this.showToast('Cihaz hafızasındaki geçmiş kayıtlar indiriliyor...', 'info');
        const historyRecords = await this.ble.fetchDeviceHistory();
        if (historyRecords && historyRecords.length > 0) {
          await this.storage.addBatch(historyRecords);
          this.updateStatsAndTable();
          this.updateChart();
          this.showToast(`${historyRecords.length} geçmiş kayıt başarıyla arşive eklendi!`, 'success');
        } else {
          this.showToast('Yeni geçmiş kaydı bulunamadı veya saatlik log henüz oluşmadı.', 'info');
        }
      } catch (err) {
        this.showToast('Geçmiş alınırken hata: ' + err.message, 'error');
      } finally {
        this.dom.btnFetchHistory.disabled = false;
      }
    });

    // Demo Mode Toggle
    this.dom.btnDemo.addEventListener('click', () => {
      if (this.isDemoActive) {
        this.stopDemo();
      } else {
        this.startDemo();
      }
    });

    // Unit Toggle
    this.dom.btnToggleUnit.addEventListener('click', () => {
      this.currentUnit = this.currentUnit === 'C' ? 'F' : 'C';
      this.dom.lblTempUnit.textContent = `°${this.currentUnit}`;
      if (this.latestTelemetry) {
        this.renderTelemetryCards(this.latestTelemetry);
      }
      this.updateChart();
      this.renderTable();
    });

    // Chart Range Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.chartRange = e.target.dataset.range;
        this.updateChart();
      });
    });

    // Chart Metric Mode Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.chartMode = e.target.dataset.mode;
        this.updateChart();
      });
    });

    // CSV & JSON Export
    this.dom.btnExportCsv.addEventListener('click', () => {
      const csv = this.storage.exportCSV();
      if (!csv) return this.showToast('Dışa aktarılacak veri bulunmuyor.', 'info');
      this.downloadFile('xiaomi_sicaklik_nem_verileri.csv', csv, 'text/csv;charset=utf-8;');
      this.showToast('CSV dosyası başarıyla indirildi.', 'success');
    });

    this.dom.btnExportJson.addEventListener('click', () => {
      const json = this.storage.exportJSON();
      if (!json || json === '[]') return this.showToast('Dışa aktarılacak veri bulunmuyor.', 'info');
      this.downloadFile('xiaomi_telemetri.json', json, 'application/json');
      this.showToast('JSON dosyası başarıyla indirildi.', 'success');
    });

    // Clear Data
    this.dom.btnClearData.addEventListener('click', async () => {
      if (confirm('Tüm kayıtlı sıcaklık ve nem verilerini silmek istediğinize emin misiniz?')) {
        await this.storage.clearAll();
        this.updateStatsAndTable();
        this.updateChart();
        this.showToast('Veritabanı temizlendi.', 'info');
      }
    });

    // Table Pagination
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

    // Help Modal
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
    this.dom.connectionStatusText.textContent = text;
    this.dom.connectionDot.className = 'w-2 h-2 rounded-full inline-block flex-shrink-0';

    if (status === 'connected') {
      this.dom.connectionDot.classList.add('bg-emerald-500', 'dot-live');
      this.dom.btnConnect.innerHTML = `<i data-lucide="power" class="w-4 h-4"></i><span>Kapat</span>`;
      this.dom.btnConnect.className = 'px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2 bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/20 transition-all active:scale-95';
      this.dom.btnFetchHistory.disabled = false;
      this.dom.lastUpdatedAgo.classList.remove('hidden');
    } else if (status === 'connecting' || status === 'scanning') {
      this.dom.connectionDot.classList.add('bg-amber-500', 'animate-ping');
      this.dom.btnFetchHistory.disabled = true;
    } else {
      this.dom.connectionDot.classList.add('bg-slate-400', 'dark:bg-slate-500');
      this.dom.btnConnect.innerHTML = `<i data-lucide="bluetooth" class="w-4 h-4"></i><span class="hidden xs:inline sm:inline">Bağlan</span>`;
      this.dom.btnConnect.className = 'px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2 bg-emerald-500 hover:bg-emerald-600 dark:bg-gradient-to-r dark:from-emerald-500 dark:to-teal-500 dark:hover:from-emerald-400 dark:hover:to-teal-400 text-white dark:text-slate-950 shadow-md shadow-emerald-500/20 transition-all active:scale-95';
      this.dom.btnFetchHistory.disabled = true;
    }
    lucide.createIcons();
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

  handleNewData(data) {
    data.dewPoint = PhysicalMetrics.calculateDewPoint(data.temperature, data.humidity);
    data.vpd = PhysicalMetrics.calculateVPD(data.temperature, data.humidity);

    this.latestTelemetry = data;
    this.storage.addRecord(data);

    this.renderTelemetryCards(data);
    this.updateStatsAndTable();
    this.updateChart();
  }

  renderTelemetryCards(data) {
    // Temperature conversion
    let displayTemp = data.temperature;
    if (this.currentUnit === 'F') {
      displayTemp = (data.temperature * 9 / 5) + 32;
    }
    this.dom.valTemp.textContent = displayTemp.toFixed(1);

    // Humidity
    this.dom.valHum.textContent = data.humidity;
    this.dom.humProgressBar.style.width = `${Math.min(100, data.humidity)}%`;

    // Humidity status
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

    // Physical dew point and VPD
    this.dom.valDewPoint.textContent = `${data.dewPoint} °C`;
    this.dom.valVpd.textContent = `${data.vpd} kPa`;

    // Battery
    if (data.battery != null) {
      this.dom.valBattery.textContent = data.battery;
      this.dom.batteryProgressBar.style.width = `${Math.min(100, data.battery)}%`;
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

    this.dom.lastUpdatedAgo.textContent = `• ${new Date().toLocaleTimeString('tr-TR')}`;
  }

  updateStatsAndTable() {
    const list = this.storage.records;
    this.dom.totalPointsCount.textContent = list.length;

    if (list.length > 0) {
      const temps = list.map(r => r.temperature);
      const hums = list.map(r => r.humidity);
      const minTemp = Math.min(...temps);
      const maxTemp = Math.max(...temps);
      const minHum = Math.min(...hums);
      const maxHum = Math.max(...hums);

      const conv = (t) => this.currentUnit === 'F' ? (t * 9 / 5 + 32).toFixed(1) : t.toFixed(1);
      this.dom.tempMinMax.textContent = `${conv(minTemp)} / ${conv(maxTemp)} °${this.currentUnit}`;
      this.dom.humMinMax.textContent = `%${minHum} / %${maxHum}`;

      // Trend check
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
    this.dom.tableSummaryText.textContent = `${total} kayıt arşivde`;

    if (total === 0) {
      this.dom.historyTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="py-8 text-center text-slate-400 dark:text-slate-500 font-sans">
            Henüz kayıt bulunmuyor. Cihaza bağlanın veya Demo Modunu açın.
          </td>
        </tr>
      `;
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

    this.dom.historyTableBody.innerHTML = pageItems.map(item => {
      const d = new Date(item.timestamp);
      const timeStr = `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      const typeBadge = item.type === 'history_hour'
        ? '<span class="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 text-[10px] font-sans">Dahili Arşiv (1s)</span>'
        : '<span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-sans">Canlı Veri</span>';

      let t = item.temperature;
      if (this.currentUnit === 'F') t = (t * 9 / 5) + 32;

      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
          <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-slate-600 dark:text-slate-300 font-sans font-medium">${timeStr}</td>
          <td class="py-2.5 sm:py-3 px-3 sm:px-4">${typeBadge}</td>
          <td class="py-2.5 sm:py-3 px-3 sm:px-4 font-bold ${item.temperature > 26 ? 'text-amber-600 dark:text-amber-400' : item.temperature < 19 ? 'text-cyan-600 dark:text-cyan-400' : 'text-emerald-600 dark:text-emerald-400'}">
            ${t.toFixed(1)} °${this.currentUnit}
          </td>
          <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-cyan-600 dark:text-cyan-300 font-semibold">%${item.humidity}</td>
          <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-slate-500 dark:text-slate-400">${item.dewPoint != null ? `${item.dewPoint} °C` : '--'}</td>
          <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-slate-500 dark:text-slate-400">${item.battery != null ? `%${item.battery}` : (item.voltage ? `${item.voltage}V` : '--')}</td>
        </tr>
      `;
    }).join('');
  }

  initChart() {
    const ctx = document.getElementById('telemetryChart').getContext('2d');
    const isDark = this.currentTheme === 'dark';

    const tempGradient = ctx.createLinearGradient(0, 0, 0, 320);
    tempGradient.addColorStop(0, isDark ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.25)');
    tempGradient.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

    const humGradient = ctx.createLinearGradient(0, 0, 0, 320);
    humGradient.addColorStop(0, isDark ? 'rgba(6, 182, 212, 0.4)' : 'rgba(6, 182, 212, 0.25)');
    humGradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Sıcaklık (°C)',
            data: [],
            borderColor: '#22c55e',
            backgroundColor: tempGradient,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 6,
            yAxisID: 'yTemp'
          },
          {
            label: 'Bağıl Nem (%)',
            data: [],
            borderColor: '#06b6d4',
            backgroundColor: humGradient,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 6,
            yAxisID: 'yHum'
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
              font: { family: 'Poppins', size: 12, weight: 600 }
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
              color: isDark ? '#64748b' : '#64748b',
              font: { family: 'JetBrains Mono', size: 10 },
              maxTicksLimit: 7
            }
          },
          yTemp: {
            type: 'linear',
            display: true,
            position: 'left',
            grid: { color: isDark ? 'rgba(51, 65, 85, 0.25)' : 'rgba(203, 213, 225, 0.4)' },
            ticks: {
              color: '#22c55e',
              font: { family: 'JetBrains Mono', size: 11 }
            }
          },
          yHum: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#06b6d4',
              font: { family: 'JetBrains Mono', size: 11 }
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

    const labels = records.map(r => {
      const d = new Date(r.timestamp);
      return this.chartRange === '1h'
        ? d.toLocaleTimeString('tr-TR', { minute: '2-digit', second: '2-digit' })
        : `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    });

    const tempData = records.map(r => {
      return this.currentUnit === 'F' ? (r.temperature * 9 / 5) + 32 : r.temperature;
    });

    const humData = records.map(r => r.humidity);

    this.chart.data.labels = labels;
    this.chart.data.datasets[0].label = `Sıcaklık (°${this.currentUnit})`;
    this.chart.data.datasets[0].data = tempData;
    this.chart.data.datasets[1].data = humData;

    if (this.chartMode === 'temp') {
      this.chart.data.datasets[0].hidden = false;
      this.chart.data.datasets[1].hidden = true;
      this.chart.options.scales.yHum.display = false;
      this.chart.options.scales.yTemp.display = true;
    } else if (this.chartMode === 'hum') {
      this.chart.data.datasets[0].hidden = true;
      this.chart.data.datasets[1].hidden = false;
      this.chart.options.scales.yHum.display = true;
      this.chart.options.scales.yTemp.display = false;
    } else {
      this.chart.data.datasets[0].hidden = false;
      this.chart.data.datasets[1].hidden = false;
      this.chart.options.scales.yHum.display = true;
      this.chart.options.scales.yTemp.display = true;
    }

    this.chart.update('none');
  }

  startDemo() {
    this.isDemoActive = true;
    this.dom.btnDemo.innerHTML = `<i data-lucide="square" class="w-4 h-4 text-rose-500"></i><span>Durdur</span>`;
    this.handleBleStatus('connected', 'Demo Modu (Simülasyon)');
    this.showToast('Demo modu başlatıldı. Gerçekçi simüle veriler üretiliyor.', 'info');

    if (this.storage.records.length === 0) {
      const now = Date.now();
      const mockHistory = [];
      let baseTemp = 21.5;
      let baseHum = 48;

      for (let i = 48; i >= 1; i--) {
        const time = now - (i * 3600 * 1000);
        baseTemp += (Math.random() - 0.5) * 0.4;
        baseHum += (Math.random() - 0.5) * 2;
        baseTemp = Math.max(18, Math.min(26, baseTemp));
        baseHum = Math.max(35, Math.min(65, baseHum));

        mockHistory.push({
          timestamp: time,
          temperature: Number(baseTemp.toFixed(1)),
          humidity: Math.round(baseHum),
          tempMax: Number((baseTemp + 0.4).toFixed(1)),
          tempMin: Number((baseTemp - 0.4).toFixed(1)),
          humMax: Math.round(baseHum + 3),
          humMin: Math.round(baseHum - 3),
          voltage: 3.02,
          battery: 95,
          type: 'history_hour',
          dewPoint: PhysicalMetrics.calculateDewPoint(baseTemp, baseHum),
          vpd: PhysicalMetrics.calculateVPD(baseTemp, baseHum)
        });
      }
      this.storage.addBatch(mockHistory);
      this.updateStatsAndTable();
      this.updateChart();
    }

    let currentTemp = 22.4;
    let currentHum = 51;
    this.demoInterval = setInterval(() => {
      currentTemp += (Math.random() - 0.48) * 0.15;
      currentHum += (Math.random() - 0.5) * 0.8;
      currentTemp = Math.max(19, Math.min(25, currentTemp));
      currentHum = Math.max(40, Math.min(60, Math.round(currentHum)));

      this.handleNewData({
        temperature: Number(currentTemp.toFixed(2)),
        humidity: currentHum,
        voltage: 3.01,
        battery: 94,
        timestamp: Date.now(),
        type: 'live'
      });
    }, 2500);
  }

  stopDemo() {
    this.isDemoActive = false;
    clearInterval(this.demoInterval);
    this.dom.btnDemo.innerHTML = `<i data-lucide="play" class="w-4 h-4 text-amber-500"></i><span class="hidden lg:inline">Demo</span>`;
    this.handleBleStatus('disconnected', 'Cihaz bekleniyor');
    this.showToast('Demo modu durduruldu.', 'info');
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

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
