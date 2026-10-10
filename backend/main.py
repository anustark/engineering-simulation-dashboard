import csv
import hashlib
import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent.parent
INPUTS = BASE / "Inputs"
DB = BASE / "simulations.db"

LIMIT = 15.0
MAX_FREQ = 50.0

app = FastAPI(title="Engineering Simulation Results Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS files (
            path TEXT PRIMARY KEY,
            hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY,
            project TEXT NOT NULL,
            revision TEXT NOT NULL,
            component TEXT NOT NULL,
            peak REAL NOT NULL,
            peak_frequency REAL NOT NULL,
            overall_peak REAL NOT NULL,
            overall_frequency REAL NOT NULL,
            status TEXT NOT NULL,
            UNIQUE(project, revision, component)
        );

        CREATE TABLE IF NOT EXISTS samples (
            result_id INTEGER REFERENCES results(id) ON DELETE CASCADE,
            frequency REAL NOT NULL,
            magnitude REAL NOT NULL,
            PRIMARY KEY(result_id, frequency)
        );

        CREATE TABLE IF NOT EXISTS demands (
            id INTEGER PRIMARY KEY,
            result_id INTEGER REFERENCES results(id),
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Open',
            origin TEXT NOT NULL DEFAULT 'manual'
        );
        """)


init_db()


def assess(samples):
    assessed = [
        (f, m) for f, m in samples
        if 0 <= f <= MAX_FREQ
    ]

    if not assessed:
        raise ValueError("No valid samples between 0 and 50 Hz")

    frequency, peak = max(assessed, key=lambda item: item[1])
    status = "PASS" if peak <= LIMIT else "FAIL"

    return peak, frequency, status


def sync_inputs():
    report = {"imported": [], "unchanged": [], "errors": []}

    if not INPUTS.exists():
        report["errors"].append("Inputs folder not found")
        return report

    for path in sorted(INPUTS.glob("*/*.csv")):
        relative = str(path.relative_to(BASE))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()

        try:
            with path.open(newline="", encoding="utf-8-sig") as file:
                reader = csv.DictReader(file)

                if reader.fieldnames != [
                    "Frequency [Hz]", "Magnitude [mm]"
                ]:
                    raise ValueError("Unexpected CSV headers")

                samples = []
                for row in reader:
                    f = float(row["Frequency [Hz]"])
                    m = float(row["Magnitude [mm]"])

                    if not (0 <= f <= 10000) or not (0 <= m < float("inf")):
                        raise ValueError("Invalid measurement")

                    samples.append((f, m))

            if not samples:
                raise ValueError("No measurements found")

            if len({f for f, _ in samples}) != len(samples):
                raise ValueError("Duplicate frequencies found")

            peak, peak_f, status = assess(samples)
            overall_f, overall_m = max(samples, key=lambda item: item[1])

            with connect() as db:
                previous = db.execute(
                    "SELECT hash FROM files WHERE path=?", (relative,)
                ).fetchone()

                if previous and previous["hash"] == digest:
                    report["unchanged"].append(relative)
                    continue

                existing = db.execute("""
                    SELECT id FROM results
                    WHERE project=? AND revision=? AND component=?
                """, ("Simulation Project", path.parent.name, path.stem)).fetchone()

                if existing:
                    result_id = existing["id"]
                    db.execute(
                        "DELETE FROM samples WHERE result_id=?", (result_id,)
                    )
                    db.execute("""
                        UPDATE results
                        SET peak=?, peak_frequency=?, overall_peak=?,
                            overall_frequency=?, status=?
                        WHERE id=?
                    """, (peak, peak_f, overall_m, overall_f, status, result_id))
                else:
                    cursor = db.execute("""
                        INSERT INTO results
                        (project, revision, component, peak, peak_frequency,
                         overall_peak, overall_frequency, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        "Simulation Project", path.parent.name, path.stem,
                        peak, peak_f, overall_m, overall_f, status
                    ))
                    result_id = cursor.lastrowid

                db.executemany(
                    "INSERT INTO samples VALUES (?, ?, ?)",
                    [(result_id, f, m) for f, m in samples],
                )
                db.execute(
                    "INSERT OR REPLACE INTO files VALUES (?, ?)",
                    (relative, digest),
                )

            report["imported"].append(relative)

        except (ValueError, KeyError, OSError, csv.Error) as exc:
            report["errors"].append({"file": relative, "error": str(exc)})

    return report


@app.post("/api/import")
def import_data():
    return sync_inputs()


@app.get("/")
def home():
    return {"message": "Engineering Simulation Results Dashboard API"}


@app.get("/api/projects")
def projects():
    with connect() as db:
        return [dict(row) for row in db.execute(
            "SELECT DISTINCT project AS name FROM results"
        )]


@app.get("/api/components")
def components():
    with connect() as db:
        return [row["component"] for row in db.execute(
            "SELECT DISTINCT component FROM results ORDER BY component"
        )]


@app.get("/api/revisions")
def revisions(component: str | None = None):
    query = "SELECT * FROM results"
    params = ()

    if component:
        query += " WHERE component=?"
        params = (component,)

    query += " ORDER BY component, revision"

    with connect() as db:
        return [dict(row) for row in db.execute(query, params)]


@app.get("/api/results/{result_id}")
def result(result_id: int):
    with connect() as db:
        row = db.execute(
            "SELECT * FROM results WHERE id=?", (result_id,)
        ).fetchone()

        if not row:
            raise HTTPException(404, "Result not found")

        data = dict(row)
        data["samples"] = [dict(sample) for sample in db.execute(
            "SELECT frequency, magnitude FROM samples "
            "WHERE result_id=? ORDER BY frequency", (result_id,)
        )]

        return data


@app.get("/api/compare")
def compare(component: str, revision_a: str, revision_b: str):
    with connect() as db:
        results = []

        for revision in (revision_a, revision_b):
            row = db.execute(
                "SELECT * FROM results WHERE component=? AND revision=?",
                (component, revision),
            ).fetchone()

            if not row:
                raise HTTPException(404, f"No result for {component} {revision}")

            item = dict(row)
            item["samples"] = [dict(sample) for sample in db.execute(
                "SELECT frequency, magnitude FROM samples "
                "WHERE result_id=? ORDER BY frequency", (item["id"],)
            )]
            results.append(item)

        return {
            "revision_a": results[0],
            "revision_b": results[1],
            "peak_difference_mm": round(
                results[1]["peak"] - results[0]["peak"], 3
            ),
            "limit_mm": LIMIT,
            "frequency_range_hz": [0, 50],
        }


class DemandInput(BaseModel):
    result_id: int | None = None
    description: str
    status: str = "Open"
    origin: str = "manual"


@app.get("/api/demands")
def list_demands():
    with connect() as db:
        rows = db.execute("""
            SELECT d.*, r.project, r.component, r.revision,
                   r.peak, r.peak_frequency,
                   r.status AS origin_result
            FROM demands d
            LEFT JOIN results r ON d.result_id=r.id
            ORDER BY d.id DESC
        """)

        return [dict(row) for row in rows]


@app.post("/api/demands")
def create_demand(demand: DemandInput):
    if demand.status not in ("Open", "In Progress", "Resolved"):
        raise HTTPException(400, "Invalid demand status")

    with connect() as db:
        if demand.result_id is not None:
            row = db.execute(
                "SELECT status FROM results WHERE id=?",
                (demand.result_id,),
            ).fetchone()

            if not row:
                raise HTTPException(404, "Source result not found")

            if row["status"] != "FAIL":
                raise HTTPException(400, "Select a failed finding")

        cursor = db.execute("""
            INSERT INTO demands(result_id, description, status, origin)
            VALUES (?, ?, ?, ?)
        """, (
            demand.result_id, demand.description,
            demand.status, demand.origin
        ))

        return {"id": cursor.lastrowid, "message": "Demand created"}


@app.patch("/api/demands/{demand_id}")
def update_demand(demand_id: int, demand: DemandInput):
    if demand.status not in ("Open", "In Progress", "Resolved"):
        raise HTTPException(400, "Invalid demand status")

    with connect() as db:
        cursor = db.execute("""
            UPDATE demands SET description=?, status=? WHERE id=?
        """, (demand.description, demand.status, demand_id))

        if cursor.rowcount == 0:
            raise HTTPException(404, "Demand not found")

        return {"message": "Demand updated"}
