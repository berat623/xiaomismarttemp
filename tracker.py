#!/usr/bin/env python3
"""
Xiaomi LYWSD03MMC SmartTemp Tracker (Python BLE Client)
Reads real-time data & downloads internal flash history records via Bleak.
Calculates accurate derived meteorological parameters:
  - Dew Point (Çiğ Noktası) via Alduchov & Eskridge (1996) Magnus formula
  - Apparent Temperature (Hissedilen Sıcaklık) via Steadman (1984) & NOAA Rothfusz
  - Vapor Pressure (Buhar Basıncı & VPD) via Buck (1981)
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
except ImportError:
    print("HATA: 'bleak' kütüphanesi yüklü değil. Kurmak için:")
    print("pip install -r requirements.txt")
    sys.exit(1)

# UUIDs for Xiaomi Mijia LYWSD03MMC
SERVICE_UUID = "ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6"
CHAR_LIVE_DATA = "ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6"       # 5 bytes: [temp, hum, volt]
CHAR_BATTERY = "ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6"         # 1 byte %
CHAR_TIMESTAMP = "ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6"       # 4 bytes uint32 epoch sec
CHAR_FIRST_REC_IDX = "ebe0ccba-7a0a-4b0c-8a1a-6ff2997da3a6"   # 4 bytes uint32
CHAR_LAST_CALC_IDX = "ebe0ccb9-7a0a-4b0c-8a1a-6ff2997da3a6"   # 8 bytes: [last_calc_idx, last_rec_idx]
CHAR_HISTORY_STREAM = "ebe0ccbc-7a0a-4b0c-8a1a-6ff2997da3a6"  # 14 bytes: [idx, ts, tMax, hMax, tMin, hMin]
CHAR_LAST_HOUR_DATA = "ebe0ccbb-7a0a-4b0c-8a1a-6ff2997da3a6"   # 14 bytes

DB_FILE = "xiaomi_temp.db"
CSV_FILE = "xiaomi_measurements.csv"


def calc_dew_point(temp: float, hum: float) -> float:
    """
    Çiğ Noktası: Alduchov & Eskridge (1996) Magnus yaklaşımı (WMO Standardı)
    """
    if hum <= 0:
        return temp
    a = 17.625
    b = 243.04
    alpha = ((a * temp) / (b + temp)) + math.log(hum / 100.0)
    dew_point = (b * alpha) / (a - alpha)
    return round(dew_point, 1)


def calc_vapor_pressure(temp: float, hum: float) -> Tuple[float, float, float]:
    """
    Buhar Basıncı: Buck (1981) formülü
    Dönüş: (vp_act in hPa, vp_sat in hPa, vpd in kPa)
    """
    vp_sat = 6.1121 * math.exp((17.502 * temp) / (240.97 + temp))
    vp_act = vp_sat * (max(0.0, min(100.0, float(hum))) / 100.0)
    vpd = (vp_sat - vp_act) / 10.0
    return round(vp_act, 1), round(vp_sat, 1), round(vpd, 2)


def calc_apparent_temp(temp: float, hum: float) -> float:
    """
    Hissedilen Sıcaklık: Steadman (1984) iç ortam modeli + NOAA Rothfusz Heat Index
    """
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
                    vpd REAL
                )
            """)
            # Migration check for existing databases
            cursor = self.conn.execute("PRAGMA table_info(measurements)")
            columns = [row[1] for row in cursor.fetchall()]
            if "apparent_temp" not in columns:
                try:
                    self.conn.execute("ALTER TABLE measurements ADD COLUMN apparent_temp REAL")
                except Exception:
                    pass
            if "vapor_pressure" not in columns:
                try:
                    self.conn.execute("ALTER TABLE measurements ADD COLUMN vapor_pressure REAL")
                except Exception:
                    pass

    def insert(self, record_type: str, temp: float, hum: int, bat: Optional[int], volt: Optional[float], ts: Optional[datetime.datetime] = None):
        if ts is None:
            ts = datetime.datetime.now()
        dew = calc_dew_point(temp, hum)
        at = calc_apparent_temp(temp, hum)
        vp_act, vp_sat, vpd = calc_vapor_pressure(temp, hum)
        ts_str = ts.strftime("%Y-%m-%d %H:%M:%S")

        with self.conn:
            self.conn.execute("""
                INSERT INTO measurements (timestamp, record_type, temperature, apparent_temp, humidity, battery, voltage, dew_point, vapor_pressure, vpd)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (ts_str, record_type, temp, at, hum, bat, volt, dew, vp_act, vpd))

        # Append to CSV
        file_exists = os.path.exists(CSV_FILE)
        with open(CSV_FILE, "a", encoding="utf-8") as f:
            if not file_exists:
                f.write("Tarih_Saat;Tur;Sicaklik_C;Hissedilen_Sicaklik_C;Nem_Yuzde;Cig_Noktasi_C;Buhar_Basinci_hPa;VPD_kPa;Pil_Yuzde;Voltaj_V\n")
            f.write(f"{ts_str};{record_type};{temp:.2f};{at:.1f};{hum};{dew:.1f};{vp_act:.1f};{vpd:.2f};{bat or ''};{volt or ''}\n")


async def scan_devices():
    print("🔍 Çevredeki Xiaomi Bluetooth cihazları taranıyor (5 saniye)...")
    devices = await BleakScanner.discover(timeout=5.0)
    xiaomi_devices = []

    for d in devices:
        name = d.name or ""
        if "LYWSD03MMC" in name or "ATC" in name or "MHO" in name or name.startswith("Xiaomi"):
            xiaomi_devices.append(d)

    if not xiaomi_devices:
        print("⚠️ Yakında Xiaomi LYWSD03MMC bulunamadı. Tüm BLE cihazları listeleniyor:")
        for d in devices:
            if d.name:
                print(f"  • {d.address} -> {d.name} (Sinyal: {d.rssi} dBm)")
    else:
        print(f"✅ {len(xiaomi_devices)} Xiaomi sensörü bulundu:")
        for d in xiaomi_devices:
            print(f"  ⭐ {d.address} — {d.name} (Sinyal: {d.rssi} dBm)")
    return xiaomi_devices


async def run_live(mac_address: str, db: DatabaseManager):
    print(f"📡 {mac_address} adresine bağlanılıyor...")
    async with BleakClient(mac_address) as client:
        print("✅ Bağlantı kuruldu! Canlı veriler dinleniyor (Çıkmak için Ctrl+C)...")

        def notification_handler(sender: BleakGATTCharacteristic, data: bytearray):
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
                print(f"[{now_str}] 🌡️ Sıcaklık: {temp}°C | ☀️ Hissedilen: {at}°C | 💧 Nem: %{hum} | 🌧️ Çiğ N.: {dew}°C | 💨 Buhar B.: {vp_act} hPa (VPD: {vpd} kPa) | 🔋 Pil: %{bat} ({volt}V)")
                db.insert("live", temp, hum, bat, volt)

        await client.start_notify(CHAR_LIVE_DATA, notification_handler)

        while True:
            await asyncio.sleep(1)


async def run_history(mac_address: str, db: DatabaseManager):
    print(f"📦 {mac_address} adresine bağlanılıyor (Dahili Hafıza İndirme)...")
    async with BleakClient(mac_address) as client:
        print("✅ Bağlandı. Cihaz saati güncelleniyor...")
        now_sec = int(datetime.datetime.now().timestamp())
        try:
            await client.write_gatt_char(CHAR_TIMESTAMP, struct.pack("<I", now_sec))
            print("🕒 Saat senkronize edildi.")
        except Exception as e:
            print(f"⚠️ Saat yazma uyarısı: {e}")

        # Read Last hour record
        try:
            last_hour = await client.read_gatt_char(CHAR_LAST_HOUR_DATA)
            if len(last_hour) >= 14:
                idx, ts, t_max_raw, h_max, t_min_raw, h_min = struct.unpack_from("<IIhBhB", last_hour)
                t_avg = round(((t_max_raw / 10.0) + (t_min_raw / 10.0)) / 2, 1)
                h_avg = round((h_max + h_min) / 2)
                dt = datetime.datetime.fromtimestamp(ts) if ts > 1600000000 else datetime.datetime.now()
                at = calc_apparent_temp(t_avg, h_avg)
                dew = calc_dew_point(t_avg, h_avg)
                vp_act, _, vpd = calc_vapor_pressure(t_avg, h_avg)
                print(f"📌 Son 1 Saat Özeti: {dt} -> Ort: {t_avg}°C (Hissedilen: {at}°C), Nem: %{h_avg}, Çiğ N.: {dew}°C, Buhar B.: {vp_act} hPa")
                db.insert("history_hour", t_avg, h_avg, None, None, dt)
        except Exception as e:
            print(f"⚠️ Son saat kaydı okuma hatası: {e}")

        # Stream history records
        records_count = 0

        def history_callback(sender: BleakGATTCharacteristic, data: bytearray):
            nonlocal records_count
            if len(data) >= 14:
                idx, ts, t_max_raw, h_max, t_min_raw, h_min = struct.unpack_from("<IIhBhB", data)
                t_avg = round(((t_max_raw / 10.0) + (t_min_raw / 10.0)) / 2, 1)
                h_avg = round((h_max + h_min) / 2)
                dt = datetime.datetime.fromtimestamp(ts) if ts > 1600000000 else datetime.datetime.now()
                db.insert("history_hour", t_avg, h_avg, None, None, dt)
                records_count += 1
                at = calc_apparent_temp(t_avg, h_avg)
                dew = calc_dew_point(t_avg, h_avg)
                print(f"  📥 [{records_count}] Tarih: {dt.strftime('%d.%m.%Y %H:%M')} | Sıcaklık: {t_avg}°C | Hissedilen: {at}°C | Nem: %{h_avg} | Çiğ N.: {dew}°C")

        print("🔄 Dahili geçmiş kayıtları okunuyor...")
        try:
            await client.start_notify(CHAR_HISTORY_STREAM, history_callback)
            await asyncio.sleep(5.0)  # Wait for chunks
            await client.stop_notify(CHAR_HISTORY_STREAM)
        except Exception as e:
            print(f"ℹ️ Akış tamamlandı veya durduruldu: {e}")

        print(f"\n🎉 Toplam {records_count} geçmiş kayıt başarıyla veritabanına ({DB_FILE}) ve CSV'ye ({CSV_FILE}) aktarıldı.")


def main():
    parser = argparse.ArgumentParser(description="Xiaomi LYWSD03MMC Akıllı Sıcaklık, Nem & Atmosferik Takipçi")
    parser.add_argument("--scan", action="store_true", help="Çevredeki Xiaomi sensörlerini tara")
    parser.add_argument("--mac", type=str, help="Cihazın Bluetooth MAC adresi")
    parser.add_argument("--live", action="store_true", help="Sürekli canlı ölçüm al ve kaydet")
    parser.add_argument("--history", action="store_true", help="Cihazın dahili flaş hafızasındaki geçmiş verileri indir")
    args = parser.parse_args()

    db = DatabaseManager()

    if args.scan:
        asyncio.run(scan_devices())
        return

    mac = args.mac
    if not mac:
        print("MAC adresi belirtilmedi, yakındaki sensör aranıyor...")
        devices = asyncio.run(scan_devices())
        if devices:
            mac = devices[0].address
            print(f"🎯 Otomatik seçilen cihaz: {mac} ({devices[0].name})")
        else:
            print("Lütfen bir cihaz seçip --mac <ADRES> parametresiyle çalıştırın.")
            sys.exit(1)

    if args.history:
        asyncio.run(run_history(mac, db))
    elif args.live:
        try:
            asyncio.run(run_live(mac, db))
        except KeyboardInterrupt:
            print("\nCanlı dinleme sonlandırıldı.")
    else:
        # Default: show history then live
        print("İpucu: Canlı dinleme için '--live', geçmiş indirme için '--history' parametresini kullanabilirsiniz.")
        asyncio.run(run_live(mac, db))


if __name__ == "__main__":
    main()
