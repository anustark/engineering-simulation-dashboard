# Engineering Simulation Results Dashboard

## Objective

Build a web dashboard that helps an engineering user review simulation results, compare revisions, and decide what to investigate or change next. The goal is not simply to display CSV rows: the application should make important behavior, differences, and potential limit violations easy to understand.

## Background

The engineering team runs simulations for product components such as Bracket, Housing, and Lens. Each revision produces a frequency-response CSV. Today, engineers inspect and compare these files manually, which is slow and makes important peaks and revision changes easy to miss.

Create a dashboard that gives the user a clear view of simulation behavior and supports informed follow-up decisions. The application should communicate what the data shows without claiming that a component is safe or production-ready beyond the criteria provided here.

## Input Data

The supplied CSV files are organized by revision, with one project file per revision:

```text
Inputs/
  rev1/
    Bracket.csv
    Housing.csv
    Lens.csv
  rev2/
    Bracket.csv
    Housing.csv
    Lens.csv
  rev3/
    Bracket.csv
    Housing.csv
    Lens.csv
```

Additional revision folders and project CSV files may be added. Discover them from the input directory rather than hard-coding the current names.

Each CSV has two columns:

```csv
Frequency [Hz],Magnitude [mm]
```

Frequency samples extend through 200 Hz. For the supplied review criterion, only values at frequencies up to and including 50 Hz are assessed against the displacement limit.

Treat these CSVs as input files for ingestion, not as the dashboard's live data store. The application must validate and import their contents into a database. The API and web page should read simulation data from that database.

New revision folders and CSV files may appear over time. The import process should detect new and changed files, update the stored data without creating duplicate revisions or samples, and report files that could not be imported.

## Engineering Review Rule

- The displacement limit is **15 mm** for frequencies **from 0 through 50 Hz inclusive**.
- A revision passes this criterion when its maximum magnitude in that frequency range is at or below 15 mm.
- A revision fails when its maximum magnitude in that range is above 15 mm.
- Frequencies above 50 Hz remain useful for visualizing the response, but do not affect this pass/fail result.
- Identify the peak magnitude and its frequency. Make the assessment range and threshold visible so users can understand the result.

This is a data-review criterion, not a complete engineering safety assessment.

## User Workflow

An engineer should be able to:

1. Select a project.
2. Inspect its available revisions.
3. View the selected revision’s frequency response and key summary values.
4. Compare revisions to see how peaks and response curves changed.
5. Trace a component and its findings across revisions, seeing whether its response improved, degraded, or remained unchanged.
6. Understand whether each revision meets the stated 15 mm within 50 Hz criterion, and use that evidence to decide what to investigate or change next.
7. Create and track an engineering demand when a component needs follow-up.

## Revision Traceability and Demands

Keep project, component, and revision relationships visible throughout the review. A comparison should identify which revisions are being compared and show the relevant metric changes. Findings and demands must link back to their source project, component, revision, and measurement so an engineer can follow the history later.

Provide a database-backed demands table for engineering follow-up items. At minimum, each row should show:

- Component and project.
- Demand description: what should be investigated or changed.
- Status: **Open**, **In Progress**, or **Resolved**.
- Origin: the source revision and triggering finding (metric, value, frequency, and limit), or that it was created manually.
- The component's result for each linked revision, including the latest result when available.

Allow an engineer to create a demand from a failed finding and to update its description and status. Keep the origin revision and finding even as newer revisions arrive. A later passing result should update the latest observed result, but must not automatically mark the demand resolved; resolution is an engineering decision. Make it possible to navigate from a demand to its originating result and related revision comparisons.

For example, create one demand for each component based on its rev1 finding: Bracket, Housing, and Lens. Keep those same demands linked to the corresponding component in rev2 and rev3, recording each revision's assessment and relevant peak measurement. Do not create unrelated replacement demands for every revision; the demand history should show how the original rev1 issue changes over time.

## Application Requirements

- Use **Python with FastAPI** for the backend.
- Use **React with Vite** for the frontend.
- Persist imported projects, revisions, result samples, calculated summaries, and demands in a database. SQLite is suitable for the MVP; explain the choice.
- Provide an ingestion/synchronization process for the CSV inputs. Make its trigger clear, and ensure repeat imports are safe and detect changed files.
- Serve project/revision discovery, revision results, and revision comparisons from the database through FastAPI. The frontend should consume these APIs rather than parse CSV files directly.
- Provide APIs to create, list, and update demands, including their source finding and revision links; display them in a filterable dashboard table.
- Preserve traceability across revisions so engineers can follow a component, finding, and demand through its revision history.
- Show frequency versus magnitude in a chart and make peaks easy to locate.
- Make comparisons and pass/fail reasoning clear, including units and the frequency range used.
- Handle missing, malformed, or incompatible data with useful feedback rather than silently presenting misleading results.
- Keep data discovery, metric calculations, API responses, and UI responsibilities reasonably separated so the application can be extended.

## Deliverables

- A working FastAPI backend and React/Vite dashboard.
- Instructions for installing, running, and using the application.
- Tests for important data processing and assessment behavior.
- A `DECISIONS.md` explaining assumptions, chart and UI choices, alternatives considered, future improvements, and questions for an engineering domain expert.
- Share the completed project through a GitHub repository and provide the repository URL.

## Evaluation Focus

The work will be reviewed for correctness, maintainability, API and UI design, clarity of visualization, handling of engineering data, and the quality of reasoning behind the solution. Prior CAE experience is not expected; clearly state assumptions where domain knowledge is missing.
