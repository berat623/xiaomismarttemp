#!/usr/bin/env python3
"""
Xiaomi LYWSD03MMC & ATC / PVVX Modded Firmware SmartTemp Tracker (Python BLE Client)
Reads real-time data & downloads history via Bleak.
Supports:
  1. BLE Advertisement Listening (--listen): Catches live broadcast packets without connection!
  2. GATT Connection (--live): Supports both Xiaomi Stock (ebe0ccb0) and ATC Modded Firmware (0x181A, 0x1F10)
  3. Accurate Scientific Atmospheric Metrics:
     - Dew Point (Alduchov & Eskridge 1996 Magnus)
     - Apparent Temperature (Steadman 1984 & NOAA Rothfusz)
     - Vapor Pressure & VPD (Buck 1981)
Saves to SQLite database and CSV.
"""

import asyncio
import argparse
import datetime
import math
import os
import sqlite3
import struct
import sys
from typing import Optional, List, Tuple

try:
    from bleak import BleakClient, BleakScanner
    from bleak.backends.characteristic import BleakGATTCharacteristic
    from bleak.backends.scanner import AdvertisementData
    from bleak.backends.device import BLEDevice
except ImportError:
    print("HATA: 'bleak' kütüphanesi yüklü değil. Kurmak için:")
    print("pip install -r requirements.txt")
    sys.exit(1)

# Service and Characteristic UUIDs
SERVICE_STOCK_XIAOMI = "ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6"
CHAR_STOCK_LIVE = "ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6"       # 5 bytes: [temp, hum, volt]
CHAR_STOCK_TIMESTAMP = "ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6"  # 4 bytes uint32
CHAR_STOCK_HISTORY = "ebe0ccbc-7a0a-4b0c-8a1a-6ff2997da3a6"    # 14 bytes
CHAR_STOCK_LAST_HOUR = "ebe0ccbb-7a0a-4b0c-8a1a-6ff2997da3a6"  # 14 bytes

# ATC / PVVX Standard Characteristics
UUID_ENV_SENSING = "0000181a-0000-1000-8000-00805f9b34fb"
CHAR_TEMP_HIGH_RES = "00002a6e-0000-1000-8000-00805f9b34fb"    # int16 / 100
CHAR_TEMP_STD = "00002a1f-0000-1000-8000-00805f9b34fb"         # int16 / 10
CHAR_HUMIDITY = "00002a6f-0000-1000-8000-00805f9b34fb"         # uint16 / 100 or uint8
CHAR_BATTERY = "00002a19-0000-1000-8000-00805f9b34fb"          # uint8 %
CHAR_ATC_CUSTOM = "00001f1f-0000-1000-8000-00805f9b34fb"

DB_FILE = "xiaomi_temp.db"
CSV_FILE = "xiaomi_measurements.csv"


def calc_dew_point(temp: float, hum: float) -> float:
    """Çiğ Noktası: Alduchov & Eskridge (1996) Magnus yaklaşımı (WMO Standardı)"""
    if hum <= 0:
        return temp
    a = 17.625
    b = 243.04
    alpha = ((a * temp) / (b + temp)) + math.log(hum / 100.0)
    dew_point = (b * alpha) / (a - alpha)
    return round(dew_point, 1)


def calc_vapor_pressure(temp: float, hum: float) -> Tuple[float, float, float]:
    """Buhar Basıncı: Buck (1981) formülü -> (vp_act in hPa, vp_sat in hPa, vpd in kPa)"""
    vp_sat = 6.1121 * math.exp((17.502 * temp) / (240.97 + temp))
    vp_act = vp_sat * (max(0.0, min(100.0, float(hum))) / 100.0)
    vpd = (vp_sat - vp_act) / 10.0
    return round(vp_act, 1), round(vp_sat, 1), round(vpd, 2)


def calc_apparent_temp(temp: float, hum: float) -> float:
    """Hissedilen Sıcaklık: Steadman (1984) iç ortam modeli + NOAA Rothfusz Heat Index"""
    e = (hum / 100.0) * 6.105 * math.exp((17.27 * temp) / (237.7 + temp))

    if temp >= 26.7 and hum >= 40:
        tf = (temp * 1.8) + 32.0
        hi = (-42.379
              + 2.04901523 * tf
              + 10.14333127 * hum
              - 0.22475541 * tf * hum
              - 0.00683783 * (tf ** 2)
              - 0.05481717 * (hum ** 2)
              + 0.00122874 * (tf ** 2) * hum
              + 0.00085282 * tf * (hum ** 2)
              - 0.00000199 * (tf ** 2) * (hum ** 2))
        tc = (hi - 32.0) / 1.8
        return round(tc, 1)

    at = temp + (0.33 * e) - 4.0
    return round(at, 1)


class DatabaseManager:
    def __init__(self, db_path: str = DB_FILE):
        self.conn = sqlite3.connect(db_path)
        self.create_tables()

    def create_tables(self):
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS measurements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    record_type TEXT NOT NULL,
                    temperature REAL NOT NULL,
                    apparent_temp REAL,
                    humidity INTEGER NOT NULL,
                    battery INTEGER,
                    voltage REAL,
                    dew_point REAL,
                    vapor_pressure REAL,
                    vpd REAL,
                    rssi INTEGER
                )
            """)
            cursor = self.conn.execute("PRAGMA table_info(measurements)")
            columns = [row[1] for row in cursor.fetchall()]
            for col in ["apparent_temp", "vapor_pressure", "rssi"]:
                if col not in columns:
                    try:
                        self.conn.execute(f"ALTER TABLE measurements ADD COLUMN {col} REAL")
                    except Exception:
                        pass

    def insert(self, record_type: str, temp: float, hum: int, bat: Optional[int], volt: Optional[float], rssi: Optional[int] = None, ts: Optional[datetime.datetime] = None):
        if ts is None:
            ts = datetime.datetime.now()
        dew = calc_dew_point(temp, hum)
        at = calc_apparent_temp(temp, hum)
        vp_act, _, vpd = calc_vapor_pressure(temp, hum)
        ts_str = ts.strftime("%Y-%m-%d %H:%M:%S")

        with self.conn:
            self.conn.execute("""
                INSERT INTO measurements (timestamp, record_type, temperature, apparent_temp, humidity, battery, voltage, dew_point, vapor_pressure, vpd, rssi)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (ts_str, record_type, temp, at, hum, bat, volt, dew, vp_act, vpd, rssi))

        # Append to CSV
        file_exists = os.path.exists(CSV_FILE)
        with open(CSV_FILE, "a", encoding="utf-8") as f:
            if not file_exists:
                f.write("Tarih_Saat;Tur;Sicaklik_C;Hissedilen_Sicaklik_C;Nem_Yuzde;Cig_Noktasi_C;Buhar_Basinci_hPa;VPD_kPa;Pil_Yuzde;Voltaj_V;RSSI_dBm\n")
            f.write(f"{ts_str};{record_type};{temp:.2f};{at:.1f};{hum};{dew:.1f};{vp_act:.1f};{vpd:.2f};{bat or ''};{volt or ''};{rssi or ''}\n")


async def scan_devices():
    print("🔍 Çevredeki tüm Bluetooth BLE cihazları taranıyor (ATC / Xiaomi / Modlu dahil)...")
    discovered = await BleakScanner.discover(timeout=6.0, return_adv=True)
    all_devices = []

    for d, adv in discovered.values():
        name = d.name or adv.local_name or ""
        name_lower = name.lower()
        uuids = [u.lower() for u in adv.service_uuids]
        is_xiaomi = ("lywsd" in name_lower or "atc" in name_lower or "mho" in name_lower or "thermo" in name_lower
                     or any("181a" in u or "ebe0" in u or "fe95" in u or "1f10" in u for u in uuids))

        all_devices.append((d, adv, is_xiaomi))

    matched = [item for item in all_devices if item[2]]

    print("\n" + "=" * 60)
    if matched:
        print(f"✅ {len(matched)} Xiaomi / ATC Termometresi Bulundu:")
        for d, adv, _ in matched:
            name = d.name or adv.local_name or "İsimsiz Cihaz"
            print(f"  ⭐ {d.address} — {name} (Sinyal RSSI: {adv.rssi} dBm)")
    else:
        print("⚠️ İsmi eşleşen cihaz bulunamadı. Çevredeki tüm BLE cihazları:")
        for d, adv, _ in all_devices[:15]:
            name = d.name or adv.local_name or "Bilinmeyen"
            print(f"  • {d.address} — {name} (Sinyal RSSI: {adv.rssi} dBm)")
    print("=" * 60 + "\n")
    return [item[0] for item in matched] or [item[0] for item in all_devices]


def parse_atc_advertisement(data: bytes) -> Optional[Tuple[float, int, float, int]]:
    """ATC1441 veya PVVX BLE sinyal yayın paketini çözümler"""
    if len(data) >= 15:
        # PVVX Format (Little-Endian)
        # Byte 6-7: temp (int16 / 100), Byte 8-9: hum (int16 / 100), Byte 10-11: volt (mV), Byte 12: bat %
        temp = struct.unpack_from("<h", data, 6)[0] / 100.0
        hum = round(struct.unpack_from("<h", data, 8)[0] / 100.0)
        volt = struct.unpack_from("<H", data, 10)[0] / 1000.0
        bat = data[12]
        return round(temp, 2), hum, round(volt, 2), bat
    elif len(data) >= 13:
        # ATC1441 Format (Big-Endian)
        # Byte 6-7: temp (int16 / 10), Byte 8: hum (uint8), Byte 9: bat (uint8), Byte 10-11: volt (mV)
        temp = struct.unpack_from(">h", data, 6)[0] / 10.0
        hum = data[8]
        bat = data[9]
        volt = struct.unpack_from(">H", data, 10)[0] / 1000.0
        return round(temp, 2), hum, round(volt, 2), bat
    return None


async def run_passive_listener(mac_address: Optional[str], db: DatabaseManager):
    """Cihaza hiç bağlanmadan havadaki BLE sinyallerini (Advertisements) canlı dinler ve kaydeder"""
    print("📡 Pasif BLE Sinyal Yakalayıcı Başlatıldı (Eşleme / Bağlantı gerektirmez)...")
    print("Çıkmak için Ctrl+C tuşlarına basın.\n")

    def detection_callback(device: BLEDevice, advertisement_data: AdvertisementData):
        if mac_address and device.address.lower() != mac_address.lower():
            return

        name = device.name or advertisement_data.local_name or ""
        service_data = advertisement_data.service_data

        # 0x181A Service Data kontrolü
        for uuid, raw_bytes in service_data.items():
            if "181a" in uuid.lower():
                parsed = parse_atc_advertisement(raw_bytes)
                if parsed:
                    temp, hum, volt, bat = parsed
                    at = calc_apparent_temp(temp, hum)
                    dew = calc_dew_point(temp, hum)
                    vp_act, _, vpd = calc_vapor_pressure(temp, hum)
                    now_str = datetime.datetime.now().strftime("%H:%M:%S")

                    print(f"[{now_str}] 📶 [{advertisement_data.rssi} dBm] {device.address} ({name}) -> "
                          f"🌡️ {temp}°C | ☀️ His: {at}°C | 💧 %{hum} | 🌧️ Çiğ: {dew}°C | 💨 {vp_act} hPa | 🔋 %{bat} ({volt}V)")

                    db.insert("ble_adv", temp, hum, bat, volt, rssi=advertisement_data.rssi)

    scanner = BleakScanner(detection_callback=detection_callback)
    await scanner.start()
    try:
        while True:
            await asyncio.sleep(1)
    finally:
        await scanner.stop()


async def run_live_gatt(mac_address: str, db: DatabaseManager):
    """GATT bağlantısı kurarak hem Xiaomi Stock hem de ATC Modlu cihazları canlı dinler"""
    print(f"📡 {mac_address} adresine bağlanılıyor...")
    async with BleakClient(mac_address) as client:
        print("✅ Bağlantı kuruldu! Donanım ve servis profili algılanıyor...")

        # Servisleri listele
        char_uuids = [c.uuid.lower() for c in client.services.characteristics.values()]
        is_stock = CHAR_STOCK_LIVE.lower() in char_uuids
        is_atc = CHAR_TEMP_HIGH_RES.lower() in char_uuids or CHAR_HUMIDITY.lower() in char_uuids or CHAR_ATC_CUSTOM.lower() in char_uuids

        cached_temp = None
        cached_hum = None
        cached_bat = 100
        cached_volt = 3.0

        if is_stock:
            print("⭐ Profil: Orijinal Xiaomi LYWSD03MMC Firmware")

            def stock_handler(sender: BleakGATTCharacteristic, data: bytearray):
                if len(data) >= 5:
                    temp_raw = struct.unpack_from("<h", data, 0)[0]
                    temp = round(temp_raw / 100.0, 2)
                    hum = data[2]
                    volt_raw = struct.unpack_from("<h", data, 3)[0]
                    volt = round(volt_raw / 1000.0, 2)
                    bat = min(100, max(0, int(round((volt - 2.1) / 1.0 * 100))))

                    dew = calc_dew_point(temp, hum)
                    at = calc_apparent_temp(temp, hum)
                    vp_act, _, vpd = calc_vapor_pressure(temp, hum)

                    now_str = datetime.datetime.now().strftime("%H:%M:%S")
                    print(f"[{now_str}] 🌡️ {temp}°C | ☀️ His: {at}°C | 💧 %{hum} | 🌧️ Çiğ: {dew}°C | 💨 {vp_act} hPa | 🔋 %{bat} ({volt}V)")
                    db.insert("live_stock", temp, hum, bat, volt)

            await client.start_notify(CHAR_STOCK_LIVE, stock_handler)

        elif is_atc:
            print("⭐ Profil: ATC / PVVX Modlu Firmware (0x181A & 0x1F10)")

            def emit_atc():
                nonlocal cached_temp, cached_hum, cached_bat, cached_volt
                if cached_temp is not None and cached_hum is not None:
                    dew = calc_dew_point(cached_temp, cached_hum)
                    at = calc_apparent_temp(cached_temp, cached_hum)
                    vp_act, _, vpd = calc_vapor_pressure(cached_temp, cached_hum)
                    now_str = datetime.datetime.now().strftime("%H:%M:%S")
                    print(f"[{now_str}] 🌡️ {cached_temp}°C | ☀️ His: {at}°C | 💧 %{cached_hum} | 🌧️ Çiğ: {dew}°C | 💨 {vp_act} hPa | 🔋 %{cached_bat} ({cached_volt}V)")
                    db.insert("live_atc", cached_temp, cached_hum, cached_bat, cached_volt)

            def temp_handler(sender: BleakGATTCharacteristic, data: bytearray):
                nonlocal cached_temp
                if len(data) >= 2:
                    cached_temp = round(struct.unpack_from("<h", data, 0)[0] / 100.0, 2)
                    emit_atc()

            def hum_handler(sender: BleakGATTCharacteristic, data: bytearray):
                nonlocal cached_hum
                if len(data) >= 2:
                    cached_hum = round(struct.unpack_from("<H", data, 0)[0] / 100.0)
                elif len(data) == 1:
                    cached_hum = data[0]
                emit_atc()

            if CHAR_TEMP_HIGH_RES.lower() in char_uuids:
                await client.start_notify(CHAR_TEMP_HIGH_RES, temp_handler)
            if CHAR_HUMIDITY.lower() in char_uuids:
                await client.start_notify(CHAR_HUMIDITY, hum_handler)

        else:
            print("⚠️ Özel karakteristiğe ulaşılamadı, sinyaller pasif dinleyici üzerinden takip ediliyor.")

        while True:
            await asyncio.sleep(1)


def main():
    parser = argparse.ArgumentParser(description="Xiaomi LYWSD03MMC & ATC Modlu BLE Termometre Takipçisi")
    parser.add_argument("--scan", action="store_true", help="Çevredeki tüm Bluetooth BLE cihazlarını tara")
    parser.add_argument("--listen", action="store_true", help="Bağlantı kurmadan BLE sinyallerini (Advertisements) canlı dinle ve kaydet")
    parser.add_argument("--live", action="store_true", help="GATT bağlantısı kurarak sürekli telemetri al")
    parser.add_argument("--mac", type=str, help="Cihazın Bluetooth MAC adresi (örn: A4:C1:38:XX:XX:XX)")
    args = parser.parse_args()

    db = DatabaseManager()

    if args.scan:
        asyncio.run(scan_devices())
        return

    if args.listen:
        asyncio.run(run_passive_listener(args.mac, db))
        return

    mac = args.mac
    if not mac:
        print("MAC adresi belirtilmedi, çevredeki Xiaomi / ATC sensörleri taranıyor...")
        devices = asyncio.run(scan_devices())
        if devices:
            mac = devices[0].address
            print(f"🎯 Otomatik seçilen cihaz: {mac} ({devices[0].name})")
        else:
            print("Lütfen bir cihaz seçip --mac <ADRES> parametresiyle çalıştırın.")
            sys.exit(1)

    try:
        asyncio.run(run_live_gatt(mac, db))
    except KeyboardInterrupt:
        print("\nCanlı dinleme sonlandırıldı.")


if __name__ == "__main__":
    main()
