import sqlite3
import os
import hashlib
import random
from datetime import datetime

IS_VERCEL = os.environ.get("VERCEL", False)
DB_PATH = "/tmp/netbox_inventory.db" if IS_VERCEL else os.path.join(os.path.dirname(os.path.abspath(__file__)), "netbox_inventory.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS partners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            partner_code TEXT UNIQUE NOT NULL,
            partner_name TEXT NOT NULL,
            city TEXT,
            assigned_at TEXT DEFAULT (datetime('now')),
            last_login_at TEXT,
            verification_started_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            partner_code TEXT NOT NULL,
            device_id TEXT NOT NULL,
            is_online INTEGER DEFAULT 0,
            customer_name TEXT,
            customer_address TEXT,
            customer_mobile TEXT,
            connection_removed_at TEXT,
            ocr_matched INTEGER DEFAULT 0,
            ocr_photo_path TEXT,
            ocr_matched_at TEXT,
            unverified_reason TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (partner_code) REFERENCES partners(partner_code),
            UNIQUE(partner_code, device_id)
        );

        CREATE INDEX IF NOT EXISTS idx_devices_partner ON devices(partner_code);
        CREATE INDEX IF NOT EXISTS idx_devices_online ON devices(is_online);
        CREATE INDEX IF NOT EXISTS idx_devices_ocr ON devices(ocr_matched);
    """)

    conn.commit()
    conn.close()


# ── Partner Operations ──────────────────────────────────────────────

def upsert_partner(partner_code: str, partner_name: str, city: str):
    conn = get_connection()
    conn.execute(
        """INSERT INTO partners (partner_code, partner_name, city, assigned_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(partner_code) DO UPDATE SET
               partner_name = excluded.partner_name,
               city = excluded.city,
               assigned_at = datetime('now')""",
        (partner_code, partner_name, city),
    )
    conn.commit()
    conn.close()


def get_partner(partner_code: str):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM partners WHERE partner_code = ?", (partner_code,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_partners():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM partners ORDER BY partner_name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def record_partner_login(partner_code: str):
    conn = get_connection()
    conn.execute(
        "UPDATE partners SET last_login_at = datetime('now') WHERE partner_code = ?",
        (partner_code,),
    )
    conn.commit()
    conn.close()


def record_verification_started(partner_code: str):
    """Record when partner first runs ping check (starts verification)."""
    conn = get_connection()
    conn.execute(
        """UPDATE partners SET verification_started_at = datetime('now')
           WHERE partner_code = ? AND verification_started_at IS NULL""",
        (partner_code,),
    )
    conn.commit()
    conn.close()


# ── Device Operations ───────────────────────────────────────────────

def upsert_device(partner_code: str, device_id: str):
    conn = get_connection()
    conn.execute(
        """INSERT INTO devices (partner_code, device_id)
           VALUES (?, ?)
           ON CONFLICT(partner_code, device_id) DO NOTHING""",
        (partner_code, device_id),
    )
    conn.commit()
    conn.close()


def get_devices_by_partner(partner_code: str):
    conn = get_connection()
    rows = conn.execute(
        """SELECT * FROM devices
           WHERE partner_code = ?
           ORDER BY device_id""",
        (partner_code,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_offline_devices(partner_code: str):
    """Get devices that are NOT online (i.e. at partner's location)."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT * FROM devices
           WHERE partner_code = ? AND is_online = 0
           ORDER BY device_id""",
        (partner_code,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _generate_customer(device_id: str, city: str):
    """Generate deterministic dummy customer from device_id hash."""
    rng = random.Random(device_id)

    first_names = [
        "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh",
        "Ayaan", "Krishna", "Ishaan", "Ananya", "Diya", "Priya", "Neha",
        "Kavya", "Meera", "Riya", "Pooja", "Sneha", "Tanvi",
    ]
    last_names = [
        "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Joshi",
        "Reddy", "Nair", "Iyer", "Rao", "Mishra", "Pandey", "Chopra",
        "Malhotra", "Kapoor", "Bansal", "Agarwal", "Tiwari", "Saxena",
    ]
    areas = {
        "Mumbai": ["Andheri West", "Bandra East", "Powai", "Malad West", "Goregaon", "Borivali", "Juhu", "Dadar", "Worli", "Thane"],
        "Delhi": ["Dwarka", "Rohini", "Saket", "Lajpat Nagar", "Janakpuri", "Pitampura", "Vasant Kunj", "Karol Bagh", "Mayur Vihar", "Nehru Place"],
        "Bangalore": ["Koramangala", "Indiranagar", "Whitefield", "HSR Layout", "Jayanagar", "Marathahalli", "Electronic City", "Rajajinagar", "Hebbal", "Yelahanka"],
    }
    city_areas = areas.get(city, ["Sector 1", "Sector 5", "Sector 12", "Sector 18", "Sector 22", "MG Road", "Station Road", "Gandhi Nagar", "Civil Lines", "Model Town"])

    name = f"{rng.choice(first_names)} {rng.choice(last_names)}"
    house = rng.randint(1, 450)
    area = rng.choice(city_areas)
    pin = rng.randint(100000, 999999)
    address = f"H.No {house}, {area}, {city} - {pin}"
    mobile = f"+91 {rng.randint(70000, 99999)}{rng.randint(10000, 99999)}"

    return name, address, mobile


def _generate_removal_date(device_id: str):
    """Generate a deterministic past date for when connection was removed."""
    rng = random.Random(device_id + "_removal")
    days_ago = rng.randint(3, 45)
    from datetime import timedelta
    removed = datetime.now() - timedelta(days=days_ago)
    return removed.strftime("%Y-%m-%d %H:%M")


def simulate_ping(partner_code: str):
    """Dummy ping API: deterministically marks ~60% of devices as online (installed).
    ALL devices get customer data (they were all once installed).
    Offline devices get a connection_removed_at date."""
    conn = get_connection()
    partner = conn.execute(
        "SELECT city FROM partners WHERE partner_code = ?", (partner_code,)
    ).fetchone()
    city = partner["city"] if partner else "Unknown"

    devices = conn.execute(
        "SELECT id, device_id FROM devices WHERE partner_code = ?",
        (partner_code,),
    ).fetchall()

    for d in devices:
        # Deterministic: hash device_id with a salt to decide online/offline
        h = int(hashlib.sha256(f"ping_v8_{d['device_id']}".encode()).hexdigest(), 16)
        is_online = 1 if (h % 100) < 60 else 0

        # All devices get customer data (they were all installed at some point)
        name, address, mobile = _generate_customer(d["device_id"], city)

        if is_online:
            conn.execute(
                """UPDATE devices
                   SET is_online = 1, customer_name = ?, customer_address = ?,
                       customer_mobile = ?, connection_removed_at = NULL
                   WHERE id = ?""",
                (name, address, mobile, d["id"]),
            )
        else:
            removed_at = _generate_removal_date(d["device_id"])
            conn.execute(
                """UPDATE devices
                   SET is_online = 0, customer_name = ?, customer_address = ?,
                       customer_mobile = ?, connection_removed_at = ?
                   WHERE id = ?""",
                (name, address, mobile, removed_at, d["id"]),
            )

    conn.commit()
    conn.close()


def mark_ocr_matched(partner_code: str, device_id: str, photo_path: str):
    conn = get_connection()
    conn.execute(
        """UPDATE devices
           SET ocr_matched = 1, ocr_photo_path = ?, ocr_matched_at = datetime('now')
           WHERE partner_code = ? AND device_id = ? AND is_online = 0""",
        (photo_path, partner_code, device_id),
    )
    conn.commit()
    conn.close()


def bulk_mark_ocr(partner_code: str, matched_ids: list, photo_path: str):
    conn = get_connection()
    matched_count = 0
    for did in matched_ids:
        cursor = conn.execute(
            """UPDATE devices
               SET ocr_matched = 1, ocr_photo_path = ?, ocr_matched_at = datetime('now')
               WHERE partner_code = ? AND device_id = ? AND is_online = 0 AND ocr_matched = 0""",
            (photo_path, partner_code, did),
        )
        matched_count += cursor.rowcount
    conn.commit()
    conn.close()
    return matched_count


def set_unverified_reason(partner_code: str, device_id: str, reason: str):
    """Partner submits a reason for why a device can't be verified."""
    conn = get_connection()
    conn.execute(
        """UPDATE devices SET unverified_reason = ?
           WHERE partner_code = ? AND device_id = ? AND is_online = 0 AND ocr_matched = 0""",
        (reason, partner_code, device_id),
    )
    conn.commit()
    conn.close()


def bulk_set_unverified_reason(partner_code: str, device_ids: list, reason: str):
    """Partner submits a reason for multiple unverified devices."""
    conn = get_connection()
    updated = 0
    for did in device_ids:
        cursor = conn.execute(
            """UPDATE devices SET unverified_reason = ?
               WHERE partner_code = ? AND device_id = ? AND is_online = 0 AND ocr_matched = 0""",
            (reason, partner_code, did),
        )
        updated += cursor.rowcount
    conn.commit()
    conn.close()
    return updated


# ── Dashboard / Reporting ───────────────────────────────────────────

def get_dashboard_stats():
    conn = get_connection()
    rows = conn.execute(
        """SELECT
               p.partner_code,
               p.partner_name,
               p.city,
               p.assigned_at,
               p.last_login_at,
               p.verification_started_at,
               COUNT(d.id) AS total_devices,
               SUM(CASE WHEN d.is_online = 1 THEN 1 ELSE 0 END) AS installed,
               SUM(CASE WHEN d.is_online = 0 THEN 1 ELSE 0 END) AS at_partner,
               SUM(CASE WHEN d.is_online = 0 AND d.ocr_matched = 1 THEN 1 ELSE 0 END) AS ocr_verified,
               SUM(CASE WHEN d.is_online = 0 AND d.ocr_matched = 0 THEN 1 ELSE 0 END) AS unaccounted,
               SUM(CASE WHEN d.is_online = 0 AND d.ocr_matched = 0 AND d.unverified_reason IS NOT NULL THEN 1 ELSE 0 END) AS has_reason
           FROM partners p
           LEFT JOIN devices d ON d.partner_code = p.partner_code
           GROUP BY p.partner_code
           ORDER BY p.partner_name"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_global_counts():
    conn = get_connection()
    row = conn.execute(
        """SELECT
               (SELECT COUNT(*) FROM partners) AS total_partners,
               (SELECT COUNT(*) FROM devices) AS total_devices,
               (SELECT COUNT(*) FROM devices WHERE is_online = 1) AS installed,
               (SELECT COUNT(*) FROM devices WHERE is_online = 0) AS at_partner,
               (SELECT COUNT(*) FROM devices WHERE is_online = 0 AND ocr_matched = 1) AS ocr_verified,
               (SELECT COUNT(*) FROM devices WHERE is_online = 0 AND ocr_matched = 0) AS unaccounted"""
    ).fetchone()
    conn.close()
    return dict(row)


def clear_all_data():
    conn = get_connection()
    conn.executescript("""
        DELETE FROM devices;
        DELETE FROM partners;
    """)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Database initialised at {DB_PATH}")
