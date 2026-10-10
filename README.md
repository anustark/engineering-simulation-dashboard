# Engineering Simulation Results Dashboard

A local FastAPI and React dashboard for importing simulation CSV files, viewing frequency response, comparing revisions, and tracking engineering demands. The assessment is limited to the stated criterion; it is not a complete engineering safety assessment.

## Requirements

- Python 3.10 or newer
- Node.js 20.19+ or 22.12+ (required by Vite 8)
- npm

## Install and run

### Backend

From the project root:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install "fastapi[standard]" pytest
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

`fastapi[standard]` installs FastAPI, Uvicorn and the standard optional dependencies used by the app and its `TestClient` test. The API docs are at <http://127.0.0.1:8000/docs>. SQLite creates or initializes `simulations.db` in the project root when the backend module is loaded.

### Frontend

In a second terminal, from the project root:

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL Vite prints (normally <http://localhost:5173>). The dashboard uses the API at `http://127.0.0.1:8000`; keep the backend running. Frontend package versions are recorded in `frontend/package-lock.json`.

## Import CSV data

Place input CSVs one directory below `Inputs/`, grouped by revision:

```text
Inputs/
  rev1/
    Bracket.csv
    Housing.csv
  rev2/
    Bracket.csv
    Housing.csv
```

The importer searches `Inputs/*/*.csv`: the immediate parent folder is the revision and the filename without `.csv` is the component. The project name is fixed to `Simulation Project`.

Each file must have these exact ordered headers:

```csv
Frequency [Hz],Magnitude [mm]
```

Values must parse as numbers. Frequencies must be between 0 and 10000 Hz, magnitudes must be non-negative and finite, frequencies within one file must be unique, and there must be at least one sample from 0 through 50 Hz inclusive.

Import is user-triggered, not automatic. Start the backend, then click **Sync CSV files** in the dashboard (or call `POST /api/import`). The response reports imported, unchanged, and errored files. SHA256 digests detect unchanged content by file path; changed content updates the matching result and replaces its samples. All samples, including those above 50 Hz, are retained. Missing or moved files are not removed from the database.

## Dashboard

1. Choose a component, then a selected revision and a different revision to compare. The project selector is currently fixed to `Simulation Project`.
2. Review the 0–50 Hz assessed peak, its frequency and status, alongside the overall peak across all stored frequencies.
3. Compare the selected revisions' assessed peaks and response curves. The comparison chart only plots frequencies present in the first revision and matches the second revision by exact frequency.
4. Create a demand with a description. Leave the source as **Manual demand**, or select a failed result to link it to that originating finding.
5. Filter demands by status, edit a description, or set status to **Open**, **In Progress**, or **Resolved**. A finding-linked demand offers **View originating result**, which selects that component and revision and scrolls to the dashboard top. Its table row also displays that component's available revision assessments.

The assessment is the maximum magnitude at frequencies from **0 through 50 Hz inclusive**. A maximum at or below **15 mm** passes; a maximum above 15 mm fails. Measurements above 50 Hz are charted but excluded from this pass/fail rule. A newer passing result does not automatically resolve a demand.

## Tests

Run the backend tests from `backend/` with the virtual environment activated:

```sh
python -m pytest
```

The current suite has five assessment tests (at-limit pass, above-limit fail, inclusion of 50 Hz, ignoring frequencies above 50 Hz, and rejection of an empty assessment range) and two demand endpoint tests (listing returns a list; creating a demand linked to a nonexistent result returns 404). It does not test CSV synchronization or changed-file handling, successful demand creation, demand updates, other APIs, or frontend behavior.

## Implemented scope and gaps

Implemented: local SQLite persistence, CSV import on demand, result and sample APIs, frequency-response and comparison charts, demand create/list/update endpoints, status filtering, a link back to the originating result view, and component-based revision history in the demand table.

Not implemented or incomplete relative to `task.md`: project selection is fixed; demands are not explicitly linked to every revision as database records; the history is a component-based display rather than immutable demand-to-revision history; there is no navigation from a demand to a revision comparison; the example rev1 demands are not generated automatically; and no GitHub repository URL is supplied. Revision-history ordering assumes names like `rev1`, `rev2`, and is not a general revision-ordering scheme.
