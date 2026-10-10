import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine
} from "recharts";
import "./App.css";

const API = "http://127.0.0.1:8000/api";

function App() {
  const [results, setResults] = useState([]);
  const [component, setComponent] = useState("Bracket");
  const [revision, setRevision] = useState("rev1");
  const [compareRevision, setCompareRevision] = useState("rev2");
  const [data, setData] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [demands, setDemands] = useState([]);
  const [filter, setFilter] = useState("All");
  const [description, setDescription] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [message, setMessage] = useState("");

  async function loadResults() {
    const response = await fetch(`${API}/revisions`);
    const rows = await response.json();
    setResults(rows);
  }

  async function loadDemands() {
    const response = await fetch(`${API}/demands`);
    setDemands(await response.json());
  }

  async function syncData() {
    try {
      const response = await fetch(`${API}/import`, { method: "POST" });
      const report = await response.json();
      setMessage(
        `Import complete: ${report.imported.length} imported, ` +
        `${report.unchanged.length} unchanged, ${report.errors.length} errors.`
      );
      await loadResults();
    } catch {
      setMessage("Could not import data. Is the backend running?");
    }
  }

  useEffect(() => {
    loadResults();
    loadDemands();
  }, []);

  const components = [...new Set(results.map((r) => r.component))];
  const revisions = results
    .filter((r) => r.component === component)
    .map((r) => r.revision);

  useEffect(() => {
    if (!components.includes(component) && components.length) {
      setComponent(components[0]);
    }
  }, [results]);

  useEffect(() => {
    if (revisions.length && !revisions.includes(revision)) {
      setRevision(revisions[0]);
    }
    if (revisions.length > 1 && !revisions.includes(compareRevision)) {
      setCompareRevision(revisions[1]);
    }
  }, [component, results]);

  useEffect(() => {
    const selected = results.find(
      (r) => r.component === component && r.revision === revision
    );
    if (!selected) {
      setData(null);
      return;
    }

    fetch(`${API}/results/${selected.id}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [results, component, revision]);

  useEffect(() => {
    if (!component || revision === compareRevision) {
      setComparison(null);
      return;
    }

    fetch(
      `${API}/compare?component=${encodeURIComponent(component)}` +
      `&revision_a=${encodeURIComponent(revision)}` +
      `&revision_b=${encodeURIComponent(compareRevision)}`
    )
      .then((r) => r.ok ? r.json() : null)
      .then(setComparison)
      .catch(() => setComparison(null));
  }, [component, revision, compareRevision, results]);

  async function createDemand(event) {
    event.preventDefault();
    if (!description.trim()) return;

    const payload = {
      description,
      status: "Open",
      origin: sourceId ? "finding" : "manual",
      result_id: sourceId ? Number(sourceId) : null
    };

    const response = await fetch(`${API}/demands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(body.detail || "Could not create demand.");
      return;
    }

    setDescription("");
    setMessage("Demand created.");
    await loadDemands();
  }

  async function updateDemand(demand, field, value) {
    const response = await fetch(`${API}/demands/${demand.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: field === "description" ? value : demand.description,
        status: field === "status" ? value : demand.status
      })
    });

    if (response.ok) {
      await loadDemands();
    } else {
      setMessage("Could not update demand.");
    }
  }

  const chartData = data?.samples || [];
  const difference = comparison?.peak_difference_mm;
  const visibleDemands = demands.filter(
    (d) => filter === "All" || d.status === filter
  );

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">ENGINEERING · SIMULATION REVIEW</p>
          <h1>Simulation Results Dashboard</h1>
          <p className="subtitle">
            Review frequency response, compare revisions and track findings.
          </p>
        </div>
        <button className="secondary-button" onClick={syncData}>
          Sync CSV files
        </button>
      </header>

      {message && (
        <div className="notice">
          {message}
          <button className="close-button" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}

      <section className="panel controls">
        <label>
          Project
          <select value="Simulation Project" disabled>
            <option>Simulation Project</option>
          </select>
        </label>
        <label>
          Component
          <select value={component} onChange={(e) => setComponent(e.target.value)}>
            {components.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Selected revision
          <select value={revision} onChange={(e) => setRevision(e.target.value)}>
            {revisions.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Compare with
          <select
            value={compareRevision}
            onChange={(e) => setCompareRevision(e.target.value)}
          >
            {revisions.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </section>

      {data ? (
        <>
          <section className="metrics">
            <article className="metric-card">
              <span>Assessment</span>
              <strong className={data.status === "PASS" ? "pass" : "fail"}>
                {data.status}
              </strong>
              <small>Limit: 15 mm, from 0 to 50 Hz</small>
            </article>
            <article className="metric-card">
              <span>Peak in assessment range</span>
              <strong>{data.peak.toFixed(2)} mm</strong>
              <small>Maximum within 0–50 Hz</small>
            </article>
            <article className="metric-card">
              <span>Peak frequency</span>
              <strong>{data.peak_frequency.toFixed(2)} Hz</strong>
              <small>Frequency of assessed peak</small>
            </article>
            <article className="metric-card">
              <span>Overall response peak</span>
              <strong>{data.overall_peak.toFixed(2)} mm</strong>
              <small>At {data.overall_frequency.toFixed(2)} Hz</small>
            </article>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Frequency response</h2>
                <p>
                  {component} · {revision} · Magnitude against frequency
                </p>
              </div>
              <span className={`status-pill ${data.status.toLowerCase()}`}>
                {data.status}
              </span>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="frequency"
                    type="number"
                    domain={[0, "dataMax"]}
                    tickFormatter={(v) => `${v}`}
                    label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -5 }}
                  />
                  <YAxis
                    label={{ value: "Magnitude (mm)", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} mm`, "Magnitude"]}
                    labelFormatter={(value) => `${value} Hz`}
                  />
                  <ReferenceLine
                    y={15}
                    stroke="#dc5555"
                    strokeDasharray="6 4"
                    label="15 mm limit"
                  />
                  <ReferenceLine
                    x={50}
                    stroke="#888"
                    strokeDasharray="4 4"
                    label="50 Hz"
                  />
                  <Line
                    type="monotone"
                    dataKey="magnitude"
                    name={revision}
                    stroke="#3678c8"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-note">
              The red line is the displacement limit. Only measurements at
              frequencies from 0 through 50 Hz determine the assessment.
              This criterion alone is not a complete safety assessment.
            </p>
          </section>
        </>
      ) : (
        <section className="panel">
          <p>Loading results, or no result is available for this selection.</p>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Revision comparison</h2>
            <p>{component}: {revision} versus {compareRevision}</p>
          </div>
        </div>

        {comparison ? (
          <>
            <div className="comparison-cards">
              {[comparison.revision_a, comparison.revision_b].map((r) => (
                <div className="comparison-card" key={r.revision}>
                  <span>{r.revision}</span>
                  <strong>{r.peak.toFixed(2)} mm</strong>
                  <small>Peak at {r.peak_frequency} Hz</small>
                  <span className={r.status === "PASS" ? "pass" : "fail"}>
                    {r.status}
                  </span>
                </div>
              ))}
              <div className="comparison-card">
                <span>Peak difference</span>
                <strong>
                  {difference > 0 ? "+" : ""}{difference.toFixed(2)} mm
                </strong>
                <small>
                  {difference < 0
                    ? "Peak decreased"
                    : difference > 0
                    ? "Peak increased"
                    : "Peak unchanged"}
                </small>
              </div>
            </div>
            <div className="chart comparison-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={comparison.revision_a.samples.map((a) => {
                    const b = comparison.revision_b.samples.find(
                      (s) => s.frequency === a.frequency
                    );
                    return {
                      frequency: a.frequency,
                      [comparison.revision_a.revision]: a.magnitude,
                      [comparison.revision_b.revision]: b?.magnitude
                    };
                  })}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="frequency" type="number" domain={[0, "dataMax"]} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <ReferenceLine y={15} stroke="#dc5555" strokeDasharray="6 4" />
                  <Line
                    type="monotone"
                    dataKey={comparison.revision_a.revision}
                    stroke="#3678c8"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={comparison.revision_b.revision}
                    stroke="#1a9871"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-note">
              Comparison uses the assessed peak from 0 to 50 Hz.
              The chart displays the response curves across their full range.
            </p>
          </>
        ) : (
          <p className="muted">
            Select two different revisions to compare them.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Engineering demands</h2>
            <p>Track findings through revisions. Resolve items only after engineering review.</p>
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["All", "Open", "In Progress", "Resolved"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        <form className="demand-form" onSubmit={createDemand}>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should be investigated or changed?"
            required
          />
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Manual demand</option>
            {results.filter((r) => r.status === "FAIL").map((r) => (
              <option key={r.id} value={r.id}>
                {r.component} · {r.revision} · {r.peak} mm at {r.peak_frequency} Hz
              </option>
            ))}
          </select>
          <button type="submit">Create demand</button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Component / revision</th>
                <th>Description</th>
                <th>Origin finding</th>
                <th>Latest observed result</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleDemands.map((d) => {
                const history = results
                  .filter((r) => r.component === d.component)
                  .sort((a, b) => Number(a.revision.slice(3)) - Number(b.revision.slice(3)));
                const latest = history[history.length - 1];

                return (
                  <tr key={d.id}>                    
                    <td>
                      <strong>{d.component || "Manual"}</strong>
                      <small>{d.project || "No linked project"}</small>
                      {d.revision && <small>Origin: {d.revision}</small>}
                      {d.result_id && (
                        <button
                          className="link-button"
                          onClick={() => {
                            setComponent(d.component);
                            setRevision(d.revision);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          View originating result
                        </button>
                      )}
                    </td>
                    <td>
                      <input
                        className="description-edit"
                        defaultValue={d.description}
                        key={`${d.id}-${d.description}`}
                        onBlur={(e) => {
                          if (e.target.value !== d.description && e.target.value.trim()) {
                            updateDemand(d, "description", e.target.value);
                          }
                        }}
                      />
                    </td>
                    <td>
                      {d.result_id
                        ? `${d.peak} mm at ${d.peak_frequency} Hz · limit 15 mm`
                        : "Created manually"}
                    </td>
                    <td>
                      {history.length > 0 ? (
                        <div className="revision-history">
                          {history.map((r) => (
                            <div key={r.id}>
                              <strong>{r.revision}</strong>: {r.peak} mm at{" "}
                              {r.peak_frequency} Hz
                              <span className={r.status === "PASS" ? "pass" : "fail"}>
                                {" "}({r.status})
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        "No result"
                      )}
                    </td>
                    <td>
                      <select
                        value={d.status}
                        onChange={(e) => updateDemand(d, "status", e.target.value)}
                      >
                        {["Open", "In Progress", "Resolved"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {visibleDemands.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty">
                    No demands yet. Create one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="chart-note">
          Demands preserve their originating finding. Newer revision results
          are shown separately and do not automatically resolve a demand.
        </p>
      </section>

      <footer>
        Engineering review tool · Assessment criterion: ≤ 15 mm from 0–50 Hz
      </footer>
    </main>
  );
}

export default App;
