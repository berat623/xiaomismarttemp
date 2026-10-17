#!/usr/bin/env python3
"""
Xiaomi LYWSD03MMC SmartTemp Tracker (Python BLE Client)
Reads real-time data & downloads internal flash history records via Bleak.
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
from typing import Optional, List

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
    a, b = 17.27, 237.7
    alpha = ((a * temp) / (b + temp)) + math.log(hum / 100.0)
    return round((b * alpha) / (a - alpha), 1)


def calc_vpd(temp: float, hum: float) -> float:
    vp_sat = 0.61078 * math.exp((17.27 * temp) / (temp + 237.3))
    vp_air = vp_sat * (hum / 100.0)
    return round(vp_sat - vp_air, 2)


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
                    humidity INTEGER NOT NULL,
                    battery INTEGER,
                    voltage REAL,
                    dew_point REAL,
                    vpd REAL
                )
            """)

    def insert(self, record_type: str, temp: float, hum: int, bat: Optional[int], volt: Optional[float], ts: Optional[datetime.datetime] = None):
        if ts is None:
            ts = datetime.datetime.now()
        dew = calc_dew_point(temp, hum)
        vpd = calc_vpd(temp, hum)
        ts_str = ts.strftime("%Y-%m-%d %H:%M:%S")

        with self.conn:
            self.conn.execute("""
                INSERT INTO measurements (timestamp, record_type, temperature, humidity, battery, voltage, dew_point, vpd)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (ts_str, record_type, temp, hum, bat, volt, dew, vpd))

        # Append to CSV
        file_exists = os.path.exists(CSV_FILE)
        with open(CSV_FILE, "a", encoding="utf-8") as f:
            if not file_exists:
                f.write("Tarih_Saat;Tur;Sicaklik_C;Nem_Yuzde;Pil_Yuzde;Voltaj_V;Cig_Noktasi;VPD_kPa\n")
            f.write(f"{ts_str};{record_type};{temp:.2f};{hum};{bat or ''};{volt or ''};{dew};{vpd}\n")


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
                vpd = calc_vpd(temp, hum)

                now_str = datetime.datetime.now().strftime("%H:%M:%S")
                print(f"[{now_str}] 🌡️ Sıcaklık: {temp}°C | 💧 Nem: %{hum} | 🔋 Pil: %{bat} ({volt}V) | Çiğ N.: {dew}°C | VPD: {vpd} kPa")
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
                print(f"📌 Son 1 Saat Özeti: {dt} -> Ort: {t_avg}°C (Min:{t_min_raw/10:.1f}/Max:{t_max_raw/10:.1f}), Nem: %{h_avg}")
                db.insert("history_hour", t_avg, h_avg, None, None, dt)
        except Exception as e:
            print(f"⚠️ Son saat kaydı okuma hatası: {e}")

        # Stream history records
        records_count = 0
        stream_done = asyncio.Event()

        def history_callback(sender: BleakGATTCharacteristic, data: bytearray):
            nonlocal records_count
            if len(data) >= 14:
                idx, ts, t_max_raw, h_max, t_min_raw, h_min = struct.unpack_from("<IIhBhB", data)
                t_avg = round(((t_max_raw / 10.0) + (t_min_raw / 10.0)) / 2, 1)
                h_avg = round((h_max + h_min) / 2)
                dt = datetime.datetime.fromtimestamp(ts) if ts > 1600000000 else datetime.datetime.now()
                db.insert("history_hour", t_avg, h_avg, None, None, dt)
                records_count += 1
                print(f"  📥 [{records_count}] Tarih: {dt.strftime('%d.%m.%Y %H:%M')} | Sıcaklık: {t_avg}°C | Nem: %{h_avg}")

        print("🔄 Dahili geçmiş kayıtları okunuyor...")
        try:
            await client.start_notify(CHAR_HISTORY_STREAM, history_callback)
            await asyncio.sleep(5.0)  # Wait for chunks
            await client.stop_notify(CHAR_HISTORY_STREAM)
        except Exception as e:
            print(f"ℹ️ Akış tamamlandı veya durduruldu: {e}")

        print(f"\n🎉 Toplam {records_count} geçmiş kayıt başarıyla veritabanına ({DB_FILE}) ve CSV'ye ({CSV_FILE}) aktarıldı.")


def main():
    parser = argparse.ArgumentParser(description="Xiaomi LYWSD03MMC Akıllı Sıcaklık & Nem Takipçisi")
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
