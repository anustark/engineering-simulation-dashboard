# Design decisions

This describes the current implementation. Proposed work is labeled as future improvement; it is not implemented.

## Implemented

### Storage and relationships

SQLite is a good fit for this local MVP: it is included with Python, stores data in one local file, and needs no database server. `backend/main.py` initializes `simulations.db` in the project root when imported or started.

There are no separate project or revision tables:

| Table | Stored information and relationship |
| --- | --- |
| `files` | Project-relative file path (primary key) and SHA256 hash. Not foreign-key linked to a result. |
| `results` | Project, revision, component, assessed peak/frequency, overall peak/frequency, and status. `(project, revision, component)` is unique. |
| `samples` | Frequency and magnitude for a result. `result_id` references `results.id` with `ON DELETE CASCADE`; `(result_id, frequency)` is the primary key. |
| `demands` | Description, status, origin, and optional `result_id` reference to the originating result. The result reference does not cascade on delete. |

The project is always named `Simulation Project`. A CSV's immediate parent folder supplies the revision and its filename supplies the component.

### CSV import and change detection

The dashboard's **Sync CSV files** button calls `POST /api/import`. The importer searches sorted paths matching `Inputs/*/*.csv`; folders nested more deeply are not searched. Files are read as UTF-8 with an optional BOM and must have exact ordered headers `Frequency [Hz]`, `Magnitude [mm]`.

For each file, the importer hashes its bytes with SHA256, parses and validates the CSV, then checks the stored digest for that relative path. Identical content is reported as unchanged; changed or new content updates/inserts the result, replaces its samples if that result already exists, and stores the new digest. Uniqueness constraints prevent duplicate results and duplicate frequency samples. A changed file for an existing revision updates the row in place rather than retaining a prior version.

Frequencies must be in 0–10000 Hz, magnitudes must be non-negative and finite, each file must have samples and no repeated frequency, and at least one sample must be in the assessment band. Caught parsing, validation, and file-open errors are reported per file. The initial byte read used for hashing occurs before the per-file `try`, so an unreadable file can instead abort the request. Files that are deleted or moved are not reconciled or removed from the database. There are no automated tests for import behavior.

### Assessment and charts

The assessment uses the maximum magnitude for samples where `0 <= frequency <= 50`. A maximum at or below 15 mm is `PASS`; above 15 mm is `FAIL`. An empty assessment range raises a `ValueError`. The overall peak is calculated separately across all samples. If maximum magnitudes tie, Python's `max` returns the first encountered sample.

The React UI uses Recharts for line charts, numeric frequency axes, tooltips and a legend on the comparison chart. A single-result chart shows the full response, the 15 mm reference line and the 50 Hz boundary. The peak and its frequency are displayed as summary metrics, but no dedicated chart marker identifies the peak sample.

`GET /api/compare` returns two result records and samples, the assessed peak difference (`revision_b - revision_a`), limit, and frequency range. The UI shows each assessed peak/status and whether the difference increased, decreased, or stayed the same. The comparison chart iterates frequencies from revision A and includes a revision B value only for an exactly matching frequency; values found only in revision B are omitted. It plots full response curves, while the numeric difference compares only assessed peaks. The endpoint identifies records by component and revision; project is not a query parameter.

### Demands, revision history, and navigation

The API lists demands, creates them, and updates description/status. Supported statuses are `Open`, `In Progress`, and `Resolved`. Creation may be manual or linked to a result. A linked source must exist and have `FAIL` status; invalid status names and missing sources are rejected. The demand list joins the source result to return its project, component, revision, peak, frequency, and result status. Manual demands have no linked result. The API accepts an `origin` string but does not enforce a fixed set of origin values.

The dashboard provides status filtering, description editing and status selection. For a linked demand, **View originating result** selects its component and revision and scrolls to the dashboard top. It does not navigate to a comparison. The row shows the source finding and a component-based list of available revision peaks and assessments. That list is not a demand-to-each-revision relationship in the database; it is built from all loaded results matching the component. The display sorts by converting the part after `rev` to a number, so other revision naming schemes may not sort reliably. A later passing result does not automatically resolve the demand.

The source link points to the `results` row. If its CSV is changed and re-imported under the same revision/component, that row is overwritten, so the original measurement is not an immutable snapshot.

## Assumptions and alternatives

- **SQLite instead of a server database:** minimizes setup for one-user local review. A server database is a future option for concurrent, shared use.
- **Folder/file-derived identity:** simple for the supplied layout, but assumes a single project and revision folder per data set. A project/revision manifest or explicit metadata would better support varied datasets.
- **SHA256 instead of timestamps:** checks actual file content and detects replacement even if timestamps do not change.
- **Retain all frequencies:** charts show the full response while assessment remains limited to 0–50 Hz, as required.
- **No interpolation:** assessment uses measured samples only. Whether to interpolate or align comparison curves requires domain guidance.

## Incomplete requirements and limitations

Relative to `task.md`, the project selector is fixed rather than database-driven. Demands do not have explicit relationships to each later revision, and the visible revision history is a component-based display, not an immutable audit history. Navigation exists from a linked demand to its originating result selection, but not to a related revision comparison. The application does not automatically create the three example rev1 demands. Deleted inputs remain in the database; changed inputs replace same-revision result data. Comparison curves can omit nonmatching frequencies, chart peaks are not separately marked, and revision history ordering assumes `revN` names.

Automated tests cover only the assessment function and a small portion of demand API behavior. They do not cover CSV ingestion/change detection, other API routes, successful demand creation, demand updates, revision history, or the frontend. The task requests a GitHub repository URL; none is included with this project.

## Future improvements (not implemented)

- Add explicit project/revision entities and make project selection data-driven.
- Reconcile deleted/moved inputs and move all per-file I/O into error reporting.
- Add import, API, demand-update and frontend tests.
- Preserve immutable source findings and model each demand's relationship to later revision observations.
- Add navigation from a demand to its comparison; retain the existing originating-result link.
- Plot comparison frequencies from a principled common grid or union, with interpolation only if engineering practice supports it.
- Mark peak points directly on charts and make revision sorting explicit.
- Add deployment guidance and publish the repository if required.

## Questions for an engineering domain expert

1. Is the 0–50 Hz band always inclusive, and is any boundary tolerance or rounding required?
2. Are all values displacement magnitudes in millimetres, and are unit conversions or coordinate conventions needed?
3. Should tied peaks all be reported? Should interpolation between measured samples affect the peak?
4. What defines project, component and revision identifiers, and how should revisions be ordered?
5. Should a changed CSV replace an existing revision or create an immutable audit version?
6. Which exact result fields should be captured as the demand's originating finding, and what criteria allow it to be resolved?
7. How should curves with different frequency samples be compared?

## Tests that exist

`backend/tests/test_assessment.py` has five tests: at-limit pass, above-limit fail, inclusion of 50 Hz, ignoring values above 50 Hz, and rejecting a sample set with no in-range frequency. `backend/tests/test_demands.py` has two tests: listing demands returns a list, and creating a demand with a nonexistent result returns 404. The latter two do not verify successful creation or status/description updates.

