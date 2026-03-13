import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
      ...(options.headers || {})
    }
  });
  return res;
}

const SCORE_MAP = { "Strongly Disagree": 1, "Disagree": 2, "Neutral": 3, "Agree": 4, "Strongly Agree": 5 };
const SCORE_COLOR = { 1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#22c55e", 5: "#16a34a" };

const QUESTIONS = [
  { key: "q1", short: "Overall Experience", full: "Overall, my interviewing experience was a positive one." },
  { key: "q2", short: "Role Clarity", full: "The role and expectations were clearly explained." },
  { key: "q3", short: "Interviewer Quality", full: "The interviewers were well prepared and conducted the conversation professionally." },
  { key: "q4", short: "Opportunity to Shine", full: "The interview process gave me an opportunity to present my strengths." },
];

const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "—";
const toScore = (v) => SCORE_MAP[v?.trim()] || null;
const scoreLabel = (n) => {
  if (!n || n === "—") return { label: "No data", color: "#6b7a99" };
  if (n >= 4.5) return { label: "Excellent", color: "#16a34a" };
  if (n >= 3.5) return { label: "Good", color: "#22c55e" };
  if (n >= 2.5) return { label: "Needs Work", color: "#eab308" };
  return { label: "Critical", color: "#ef4444" };
};

// Parse CSV exported from Google Sheets
function parseCSV(text) {
  // Properly handle quoted CSV fields (fields can contain commas and newlines)
  function splitLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += line[i];
      }
    }
    result.push(current.trim());
    return result;
  }

  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map(line => splitLine(line));
}

// GH CSV column positions (fixed):
// 0: Submitted On, 1: Offices, 2: Departments
// 3: Q1, 4: Q1 Notes, 5: Q2, 6: Q2 Notes
// 7: Q3, 8: Q3 Notes, 9: Q4, 10: Q4 Notes
// 11: Q5, 12: Q5 Notes
function mapRow(row) {
  if (!row || row.length < 4) return null;
  return {
    date: (row[0] || "").split(" ")[0] || "",
    dept: row[2] || "",
    office: row[1] || "",
    q1: row[3] || "",
    note1: row[4] || "",
    q2: row[5] || "",
    note2: row[6] || "",
    q3: row[7] || "",
    note3: row[8] || "",
    q4: row[9] || "",
    note4: row[10] || "",
    q5: row[11] || "",
    note5: row[12] || "",
  };
}

const SETUP_STEPS = [
  {
    n: "01",
    title: "Export from Greenhouse",
    desc: "Go to Reports → Candidate Surveys → click Export. A .csv file will download to your computer.",
  },
  {
    n: "02",
    title: "Drop the file below",
    desc: "Drag and drop the downloaded CSV into the area below — or click to browse and select it manually.",
  },
];


export default function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("setup");
  const [activeDept, setActiveDept] = useState("All");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [dateSort, setDateSort] = useState("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [reports, setReports] = useState([]);
  const [activeReport, setActiveReport] = useState(null);
  const [reportName, setReportName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  // Load all reports from Supabase on mount
  useEffect(() => {
    async function loadReports() {
      try {
        const res = await sbFetch("survey_responses?select=id,name,uploaded_at&order=uploaded_at.desc", {
          headers: { "Accept": "application/json" }
        });
        if (!res.ok) return;
        const rows = await res.json();
        setReports(rows);
        if (rows.length > 0) {
          loadReport(rows[0].id, rows[0].name, rows[0].uploaded_at);
        }
      } catch (e) { console.error(e); }
    }
    loadReports();
  }, []);

  const loadReport = async (id, name, uploadedAt) => {
    try {
      const res = await sbFetch(`survey_responses?id=eq.${id}&select=data`, {
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) return;
      const rows = await res.json();
      if (rows.length > 0) {
        setData(rows[0].data);
        setActiveReport({ id, name });
        setLastUpdated(new Date(uploadedAt).toLocaleString("en-US"));
        setActiveTab("overview");
        setActiveDept("All");
      }
    } catch (e) { console.error(e); }
  };

  const saveToSupabase = async (parsed, name) => {
    setSaving(true);
    setSaveStatus("");
    try {
      const res = await sbFetch("survey_responses", {
        method: "POST",
        body: JSON.stringify({ name, data: parsed })
      });
      if (res.ok || res.status === 201) {
        setSaveStatus("saved");
        // Refresh reports list
        const r2 = await sbFetch("survey_responses?select=id,name,uploaded_at&order=uploaded_at.desc", {
          headers: { "Accept": "application/json" }
        });
        const rows = await r2.json();
        setReports(rows);
        if (rows.length > 0) setActiveReport({ id: rows[0].id, name: rows[0].name });
      } else {
        setSaveStatus("error");
      }
    } catch (e) {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const deleteReport = async (id) => {
    await sbFetch(`survey_responses?id=eq.${id}`, { method: "DELETE" });
    const remaining = reports.filter(r => r.id !== id);
    setReports(remaining);
    if (activeReport?.id === id) {
      if (remaining.length > 0) loadReport(remaining[0].id, remaining[0].name, remaining[0].uploaded_at);
      else { setData([]); setActiveReport(null); setActiveTab("setup"); }
    }
  };

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) { setError("Please upload a .csv file — export from Greenhouse in CSV format."); return; }
    setLoading(true);
    setError("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = parseCSV(text).map(mapRow).filter(r => r && r.q1);
        if (parsed.length === 0) throw new Error("No data found. Make sure the file contains Greenhouse survey responses with the correct headers.");
        setData(parsed);
        setLastUpdated(new Date().toLocaleTimeString("en-US"));
        setActiveTab("overview");
        setPendingData(parsed);
        setReportName("");
        setShowSaveModal(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleInputChange = (e) => handleFile(e.target.files[0]);

  const toComparableDate = (d) => {
    if (!d) return "";
    // Handle MM/DD/YYYY format from GH
    if (d.includes("/")) {
      const [m, day, y] = d.split("/");
      return `${y}-${m.padStart(2,"0")}-${day.padStart(2,"0")}`;
    }
    return d;
  };

  const filtered = data.filter(r => {
    if (activeDept !== "All" && r.dept !== activeDept) return false;
    const rDate = toComparableDate(r.date);
    if (dateFrom && rDate < dateFrom) return false;
    if (dateTo && rDate > dateTo) return false;
    return true;
  });
  const depts = ["All", ...Array.from(new Set(data.map(r => r.dept))).filter(Boolean).sort()];

  const qAvgs = QUESTIONS.map(q => {
    const scores = filtered.map(r => toScore(r[q.key])).filter(Boolean);
    const a = scores.length ? parseFloat(avg(scores)) : null;
    return { ...q, avg: a, scores, ...(a ? scoreLabel(a) : { label: "No data", color: "#6b7a99" }) };
  });

  const overallAvg = qAvgs.filter(q => q.avg).length
    ? parseFloat(avg(qAvgs.filter(q => q.avg).map(q => q.avg))).toFixed(2)
    : null;

  const q1scores = filtered.map(r => toScore(r.q1)).filter(Boolean);
  const promoters = q1scores.filter(s => s === 5).length;
  const passives = q1scores.filter(s => s === 4 || s === 3).length;
  const detractors = q1scores.filter(s => s <= 2).length;
  const total = q1scores.length;
  const nps = total ? Math.round(((promoters - detractors) / total) * 100) : null;

  const deptData = Array.from(new Set(data.map(r => r.dept))).filter(Boolean).map(dept => {
    const rows = data.filter(r => r.dept === dept);
    const avgs = QUESTIONS.map(q => {
      const s = rows.map(r => toScore(r[q.key])).filter(Boolean);
      return s.length ? parseFloat(avg(s)) : null;
    }).filter(Boolean);
    const overall = avgs.length ? parseFloat(avg(avgs)) : null;
    return { dept, overall, count: rows.length };
  }).filter(d => d.overall).sort((a, b) => b.overall - a.overall);

  const comments = filtered.flatMap(r => {
    const items = [];
    [1, 2, 3, 4].forEach(i => {
      const note = r[`note${i}`];
      if (note && note.trim()) {
        items.push({ dept: r.dept, date: r.date, q: QUESTIONS[i - 1].full, text: note, score: toScore(r[`q${i}`]) });
      }
    });
    return items;
  });

  const tabs = data.length > 0
    ? ["setup", "overview", "questions", "departments", "feedback"]
    : ["setup"];

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: "#080c12", minHeight: "100vh", color: "#e2e8f0", padding: "0 0 80px" }}>

      {/* Save modal */}
      {showSaveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2d3d", borderRadius: 16, padding: 32, width: 400, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#f1f5f9", marginBottom: 6 }}>Name this report</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>e.g. "January 2026" or "Q1 2026"</div>
            <input
              autoFocus
              value={reportName}
              onChange={e => setReportName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && reportName.trim()) { saveToSupabase(pendingData, reportName.trim()); setShowSaveModal(false); }}}
              placeholder="Report name..."
              style={{ width: "100%", background: "#0f172a", border: "1px solid #1f2d3d", borderRadius: 8, color: "#e2e8f0", padding: "11px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowSaveModal(false)} style={{ background: "none", border: "1px solid #1f2d3d", color: "#64748b", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Skip</button>
              <button onClick={() => { if (reportName.trim()) { saveToSupabase(pendingData, reportName.trim()); setShowSaveModal(false); }}} disabled={!reportName.trim()} style={{ background: reportName.trim() ? "#3b82f6" : "#1e2d3d", border: "none", color: reportName.trim() ? "#fff" : "#64748b", padding: "9px 22px", borderRadius: 8, cursor: reportName.trim() ? "pointer" : "default", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(180deg, #0d1520 0%, #080c12 100%)", borderBottom: "1px solid #1a2332", padding: "24px 40px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          {/* Left: title + status */}
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, color: "#f1f5f9", letterSpacing: -0.3 }}>Candidate Survey Analytics</h1>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
              {data.length > 0 ? `${data.length} responses` : "Upload a CSV to get started"}
              {saving && <span style={{ color: "#f59e0b" }}>· saving...</span>}
              {saveStatus === "saved" && <span style={{ color: "#22c55e" }}>· saved</span>}
              {saveStatus === "error" && <span style={{ color: "#ef4444" }}>· save failed</span>}
            </div>
          </div>

          {/* Right: score + report selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {overallAvg && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>Avg Score</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: scoreLabel(parseFloat(overallAvg)).color, lineHeight: 1 }}>{overallAvg}<span style={{ fontSize: 16, color: "#475569", fontWeight: 400 }}>/5</span></div>
              </div>
            )}
            {reports.length > 0 && (
              <select
                value={activeReport?.id || ""}
                onChange={e => {
                  const r = reports.find(r => r.id === parseInt(e.target.value));
                  if (r) loadReport(r.id, r.name, r.uploaded_at);
                }}
                style={{ background: "#111827", border: "1px solid #1f2d3d", color: "#94a3b8", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
              >
                {reports.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Tabs + filters row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 0 }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{
                background: "none", border: "none", padding: "10px 18px", cursor: "pointer", fontSize: 13,
                color: activeTab === t ? "#60a5fa" : "#64748b",
                borderBottom: activeTab === t ? "2px solid #60a5fa" : "2px solid transparent",
                fontFamily: "inherit", letterSpacing: 0.3, transition: "color 0.15s"
              }}>{t === "setup" ? "Setup" : t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>

          {data.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 10 }}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ background: "#111827", border: "1px solid #1f2d3d", color: "#94a3b8", padding: "6px 10px", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }} />
              <span style={{ fontSize: 11, color: "#475569" }}>→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ background: "#111827", border: "1px solid #1f2d3d", color: "#94a3b8", padding: "6px 10px", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ background: "none", border: "1px solid #1f2d3d", color: "#64748b", padding: "5px 9px", borderRadius: 7, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
              )}
              <select value={activeDept} onChange={e => setActiveDept(e.target.value)} style={{ background: "#111827", border: "1px solid #1f2d3d", color: "#94a3b8", padding: "6px 12px", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }}>
                {depts.map(d => <option key={d}>{d}</option>)}
              </select>
              <label style={{ background: "none", border: "1px solid #3b82f6", color: "#60a5fa", padding: "6px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                ↑ Upload CSV
                <input type="file" accept=".csv" onChange={handleInputChange} style={{ display: "none" }} />
              </label>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "28px 40px" }}>

        {/* SETUP TAB */}
        {activeTab === "setup" && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 500, color: "#f1f5f9" }}>Load survey data</h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>Export a CSV from Greenhouse and drop it here. To refresh — just upload a new file.</p>
            </div>
            {SETUP_STEPS.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 14, marginBottom: 18 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#111827", border: "1px solid #1f2d3d", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "monospace", fontSize: 11, color: "#3b82f6" }}>{s.n}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#e2e8f0", marginBottom: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                border: `1.5px dashed ${dragOver ? "#3b82f6" : "#1f2d3d"}`,
                borderRadius: 12, padding: "44px 20px", cursor: "pointer", marginTop: 8,
                background: dragOver ? "#0d1f33" : "#0d1520", transition: "all 0.2s", textAlign: "center"
              }}
            >
              <input type="file" accept=".csv" onChange={handleInputChange} style={{ display: "none" }} />
              <div style={{ fontSize: 28, marginBottom: 10, color: "#3b82f6" }}>↓</div>
              <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500, marginBottom: 4 }}>
                {loading ? "Loading..." : "Drop CSV here"}
              </div>
              <div style={{ fontSize: 12, color: "#475569" }}>or click to browse files</div>
              {fileName && !loading && <div style={{ marginTop: 10, fontSize: 12, color: "#3b82f6" }}>✓ {fileName}</div>}
            </label>
            {error && <div style={{ background: "#1c0a0a", border: "1px solid #ef4444", borderRadius: 8, padding: "11px 14px", fontSize: 12, color: "#fca5a5", marginTop: 12 }}>⚠ {error}</div>}
            {data.length > 0 && (
              <div style={{ marginTop: 14, background: "#091c12", border: "1px solid #166534", borderRadius: 8, padding: "11px 14px", fontSize: 12, color: "#86efac", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>✓ {data.length} responses loaded</span>
                <button onClick={() => setActiveTab("overview")} style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>View dashboard →</button>
              </div>
            )}
          </div>
        )}

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && data.length > 0 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
              {qAvgs.map((q, i) => (
                <div key={i} style={{ background: "#0d1520", border: "1px solid #1a2332", borderRadius: 12, padding: "18px 16px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: q.color, opacity: 0.8 }} />
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Q{i+1}</div>
                  <div style={{ fontSize: 34, fontWeight: 700, color: q.color, lineHeight: 1 }}>{q.avg ?? "—"}</div>
                  <div style={{ fontSize: 10, color: q.color, marginTop: 4, fontWeight: 600, letterSpacing: 0.5 }}>{q.label}</div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 10, lineHeight: 1.5 }}>{q.full}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "#0d1520", border: "1px solid #1a2332", borderRadius: 12, padding: 22 }}>
                <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 18 }}>Score by Question</div>
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={qAvgs.map((q, i) => ({ name: `Q${i + 1}`, avg: q.avg || 0 }))} barSize={32}>
                    <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 5]} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2d3d", borderRadius: 8, color: "#e2e8f0", fontSize: 12 }} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {qAvgs.map((q, i) => <Cell key={i} fill={q.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "#0d1520", border: "1px solid #1a2332", borderRadius: 12, padding: 22, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
                <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Summary</div>
                {[
                  { label: "Overall avg. score", value: overallAvg ? `${overallAvg} / 5` : "—", color: overallAvg ? scoreLabel(parseFloat(overallAvg)).color : "#475569" },
                  { label: "Total responses", value: filtered.length, color: "#60a5fa" },
                  { label: "Departments", value: deptData.length, color: "#94a3b8" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#080c12", borderRadius: 8 }}>
                    <div style={{ fontSize: 13, color: "#64748b" }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* QUESTIONS TAB */}
        {activeTab === "questions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {QUESTIONS.map((q, qi) => {
              const counts = { "Strongly Disagree": 0, "Disagree": 0, "Neutral": 0, "Agree": 0, "Strongly Agree": 0 };
              filtered.forEach(r => { if (r[q.key]) counts[r[q.key]]++; });
              const t = Object.values(counts).reduce((a, b) => a + b, 0);
              const scores = filtered.map(r => toScore(r[q.key])).filter(Boolean);
              const a = scores.length ? parseFloat(avg(scores)) : null;
              const sl = a ? scoreLabel(a) : { label: "No data", color: "#475569" };
              return (
                <div key={qi} style={{ background: "#0d1520", border: "1px solid #1a2332", borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sl.color }} />
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16, paddingLeft: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Q{qi + 1}</div>
                      <div style={{ fontSize: 14, color: "#e2e8f0", lineHeight: 1.5 }}>{q.full}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 30, fontWeight: 700, color: sl.color, lineHeight: 1 }}>{a ?? "—"}</div>
                      <div style={{ fontSize: 10, color: sl.color, fontWeight: 600, marginTop: 3 }}>{sl.label}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 8 }}>
                    {Object.entries(counts).reverse().map(([label, count]) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 120, fontSize: 11, color: "#475569", textAlign: "right", flexShrink: 0 }}>{label}</div>
                        <div style={{ flex: 1, height: 7, background: "#080c12", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: t > 0 ? `${(count / t) * 100}%` : "0%", background: SCORE_COLOR[SCORE_MAP[label]], borderRadius: 4, transition: "width 0.4s ease" }} />
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b", width: 22, textAlign: "right" }}>{count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DEPARTMENTS TAB */}
        {activeTab === "departments" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14 }}>
            {deptData.map(({ dept, overall, count }) => {
              const rows = data.filter(r => r.dept === dept);
              const sl = scoreLabel(overall);
              const qScores = QUESTIONS.map(q => {
                const s = rows.map(r => toScore(r[q.key])).filter(Boolean);
                return s.length ? parseFloat(avg(s)) : 0;
              });
              return (
                <div key={dept} style={{ background: "#0d1520", border: "1px solid #1a2332", borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: sl.color }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{dept}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{count} response{count !== 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: sl.color, lineHeight: 1 }}>{overall}</div>
                      <div style={{ fontSize: 10, color: sl.color, marginTop: 2 }}>{sl.label}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {qScores.map((qs, i) => (
                      <div key={i} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ height: 36, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                          <div style={{ width: "55%", background: scoreLabel(qs).color, borderRadius: "3px 3px 0 0", height: `${(qs / 5) * 36}px`, opacity: 0.75 }} />
                        </div>
                        <div style={{ fontSize: 9, color: "#475569", marginTop: 3 }}>Q{i + 1}</div>
                        <div style={{ fontSize: 10, color: scoreLabel(qs).color, fontWeight: 600 }}>{qs || "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FEEDBACK TAB */}
        {activeTab === "feedback" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#475569", marginRight: 4 }}>Sort:</span>
              {[["Newest first", "desc"], ["Oldest first", "asc"]].map(([label, val]) => (
                <button key={val} onClick={() => setDateSort(val)} style={{
                  background: dateSort === val ? "#1e3a5f" : "none",
                  border: `1px solid ${dateSort === val ? "#3b82f6" : "#1f2d3d"}`,
                  color: dateSort === val ? "#60a5fa" : "#64748b",
                  padding: "5px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit"
                }}>{label}</button>
              ))}
            </div>

            {filtered.filter(r => r.q1).length === 0 && (
              <div style={{ color: "#475569", textAlign: "center", padding: 48, fontSize: 14 }}>No responses for this filter.</div>
            )}
            {[...filtered].sort((a, b) => {
              const da = new Date(a.date), db = new Date(b.date);
              return dateSort === "desc" ? db - da : da - db;
            }).map((r, ri) => {
              const notes = QUESTIONS.map((q, i) => ({
                q: q.full,
                rating: r[`q${i+1}`],
                text: r[`note${i+1}`]?.trim() || "",
                score: toScore(r[`q${i+1}`])
              })).filter(n => n.rating);
              if (notes.length === 0) return null;
              return (
                <div key={ri} style={{ background: "#0d1520", border: "1px solid #1a2332", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "10px 18px", background: "#080c12", borderBottom: "1px solid #1a2332", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{r.dept}</span>
                    <span style={{ fontSize: 11, color: "#334155", marginLeft: "auto" }}>{r.date}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {notes.map((note, ni) => (
                      <div key={ni} style={{
                        padding: "12px 18px",
                        borderBottom: ni < notes.length - 1 ? "1px solid #1a2332" : "none",
                        borderLeft: `3px solid ${SCORE_COLOR[note.score] || "#3b82f6"}`
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: note.text ? 6 : 0 }}>
                          <div style={{ fontSize: 11, color: "#64748b", flex: 1, paddingRight: 12 }}>{note.q}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: SCORE_COLOR[note.score] || "#64748b", flexShrink: 0, background: "#080c12", padding: "2px 8px", borderRadius: 5 }}>{note.rating}</div>
                        </div>
                        {note.text && <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>{note.text}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

}