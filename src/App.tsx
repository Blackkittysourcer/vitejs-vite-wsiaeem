import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const SCORE_MAP = {
  'Strongly Disagree': 1,
  Disagree: 2,
  Neutral: 3,
  Agree: 4,
  'Strongly Agree': 5,
};
const SCORE_COLOR = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#22c55e',
  5: '#16a34a',
};
const SCORE_EMOJI = { 1: '😡', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };

const QUESTIONS = [
  {
    key: 'q1',
    short: 'Overall Experience',
    full: 'Overall, my interviewing experience was a positive one.',
  },
  {
    key: 'q2',
    short: 'Role Clarity',
    full: 'The role and expectations were clearly explained.',
  },
  {
    key: 'q3',
    short: 'Interviewer Quality',
    full: 'The interviewers were well prepared and conducted the conversation professionally.',
  },
  {
    key: 'q4',
    short: 'Opportunity to Shine',
    full: 'The interview process gave me an opportunity to present my strengths.',
  },
  {
    key: 'q5',
    short: 'Nothing to Improve',
    full: 'Is there anything you wish Readdle had done differently?',
  },
];

const avg = (arr) =>
  arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '—';
const toScore = (v) => SCORE_MAP[v?.trim()] || null;
const scoreLabel = (n) => {
  if (!n || n === '—') return { label: 'No data', color: '#6b7a99' };
  if (n >= 4.5) return { label: 'Excellent', color: '#16a34a' };
  if (n >= 3.5) return { label: 'Good', color: '#22c55e' };
  if (n >= 2.5) return { label: 'Needs Work', color: '#eab308' };
  return { label: 'Critical', color: '#ef4444' };
};

// Parse CSV exported from Google Sheets
function parseCSV(text) {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
  if (lines.length < 2) return [];
  const headers = lines[0];
  return lines.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] || '';
    });
    return obj;
  });
}

// Map GH CSV columns to our internal format
function mapRow(raw) {
  const keys = Object.keys(raw);
  // GH exports: Submitted On, Offices, Departments, 1. Question..., Notes, 2. Question..., Notes, ...
  const qCols = keys.filter((k) => /^\d+\./.test(k));
  const noteCols = keys.filter((k) => k === 'Notes');
  // Find note columns by position
  const allCols = keys;
  return {
    date: raw['Submitted On']?.split(' ')[0] || '',
    dept: raw['Departments'] || '',
    office: raw['Offices'] || '',
    q1: raw[qCols[0]] || '',
    q2: raw[qCols[1]] || '',
    q3: raw[qCols[2]] || '',
    q4: raw[qCols[3]] || '',
    q5: raw[qCols[4]] || '',
    note1: raw[allCols[allCols.indexOf(qCols[0]) + 1]] || '',
    note2: raw[allCols[allCols.indexOf(qCols[1]) + 1]] || '',
    note3: raw[allCols[allCols.indexOf(qCols[2]) + 1]] || '',
    note4: raw[allCols[allCols.indexOf(qCols[3]) + 1]] || '',
    note5: raw[allCols[allCols.indexOf(qCols[4]) + 1]] || '',
  };
}

const SETUP_STEPS = [
  {
    n: '01',
    title: 'Export from Greenhouse',
    desc: 'Go to Reports → Candidate Surveys → click Export. A .csv file will download to your computer.',
  },
  {
    n: '02',
    title: 'Drop the file below',
    desc: 'Drag and drop the downloaded CSV into the area below — or click to browse and select it manually.',
  },
];

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('setup');
  const [activeDept, setActiveDept] = useState('All');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      setError(
        'Please upload a .csv file — export from Greenhouse in CSV format.'
      );
      return;
    }
    setLoading(true);
    setError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = parseCSV(text)
          .map(mapRow)
          .filter((r) => r.q1);
        if (parsed.length === 0)
          throw new Error(
            'No data found. Make sure the file contains Greenhouse survey responses with the correct headers.'
          );
        setData(parsed);
        setLastUpdated(new Date().toLocaleTimeString('en-US'));
        setActiveTab('overview');
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

  const filtered =
    activeDept === 'All' ? data : data.filter((r) => r.dept === activeDept);
  const depts = [
    'All',
    ...Array.from(new Set(data.map((r) => r.dept)))
      .filter(Boolean)
      .sort(),
  ];

  const qAvgs = QUESTIONS.map((q) => {
    const scores = filtered.map((r) => toScore(r[q.key])).filter(Boolean);
    const a = scores.length ? parseFloat(avg(scores)) : null;
    return {
      ...q,
      avg: a,
      scores,
      ...(a ? scoreLabel(a) : { label: 'No data', color: '#6b7a99' }),
    };
  });

  const overallAvg = qAvgs.filter((q) => q.avg).length
    ? parseFloat(avg(qAvgs.filter((q) => q.avg).map((q) => q.avg))).toFixed(2)
    : null;

  const q1scores = filtered.map((r) => toScore(r.q1)).filter(Boolean);
  const promoters = q1scores.filter((s) => s === 5).length;
  const passives = q1scores.filter((s) => s === 4 || s === 3).length;
  const detractors = q1scores.filter((s) => s <= 2).length;
  const total = q1scores.length;
  const nps = total
    ? Math.round(((promoters - detractors) / total) * 100)
    : null;

  const deptData = Array.from(new Set(data.map((r) => r.dept)))
    .filter(Boolean)
    .map((dept) => {
      const rows = data.filter((r) => r.dept === dept);
      const avgs = QUESTIONS.map((q) => {
        const s = rows.map((r) => toScore(r[q.key])).filter(Boolean);
        return s.length ? parseFloat(avg(s)) : null;
      }).filter(Boolean);
      const overall = avgs.length ? parseFloat(avg(avgs)) : null;
      return { dept, overall, count: rows.length };
    })
    .filter((d) => d.overall)
    .sort((a, b) => b.overall - a.overall);

  const comments = filtered.flatMap((r) =>
    [1, 2, 3, 4, 5].flatMap((i) => {
      const noteKey = `note${i}`;
      if (r[noteKey])
        return [
          {
            dept: r.dept,
            date: r.date,
            q: QUESTIONS[i - 1].short,
            text: r[noteKey],
            score: toScore(r[`q${i}`]),
          },
        ];
      return [];
    })
  );

  const tabs =
    data.length > 0
      ? ['setup', 'overview', 'questions', 'departments', 'feedback']
      : ['setup'];

  return (
    <div
      style={{
        fontFamily: "'Georgia', serif",
        background: '#0f1117',
        minHeight: '100vh',
        color: '#e8e8e8',
        padding: '0 0 60px',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a2332 0%, #0f1117 60%)',
          borderBottom: '1px solid #1e2d3d',
          padding: '28px 36px 0',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 3,
                color: '#4a9eff',
                fontFamily: 'monospace',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              Readdle · Greenhouse ATS
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 400,
                color: '#fff',
                letterSpacing: -0.5,
              }}
            >
              Candidate Survey Analytics
            </h1>
            <div style={{ fontSize: 13, color: '#6b7a99', marginTop: 4 }}>
              {data.length > 0
                ? `${data.length} responses · last updated at ${lastUpdated}`
                : 'Upload a Greenhouse CSV export to view analytics'}
            </div>
          </div>
          {nps !== null && (
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#6b7a99',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Candidate NPS
              </div>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  color:
                    nps >= 50 ? '#22c55e' : nps >= 0 ? '#eab308' : '#ef4444',
                  lineHeight: 1,
                }}
              >
                {nps > 0 ? '+' : ''}
                {nps}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 20px',
                cursor: 'pointer',
                fontSize: 13,
                color: activeTab === t ? '#4a9eff' : '#6b7a99',
                borderBottom:
                  activeTab === t
                    ? '2px solid #4a9eff'
                    : '2px solid transparent',
                textTransform: 'capitalize',
                letterSpacing: 0.5,
                fontFamily: 'inherit',
              }}
            >
              {t === 'setup'
                ? '⚙ Setup'
                : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          {data.length > 0 && (
            <div
              style={{
                marginLeft: 'auto',
                paddingBottom: 10,
                display: 'flex',
                gap: 8,
              }}
            >
              <select
                value={activeDept}
                onChange={(e) => setActiveDept(e.target.value)}
                style={{
                  background: '#1a2332',
                  border: '1px solid #1e2d3d',
                  color: '#c8d4e8',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'inherit',
                }}
              >
                {depts.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <label
                style={{
                  background: '#1a2332',
                  border: '1px solid #4a9eff',
                  color: '#4a9eff',
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ↑ Upload new CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleInputChange}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '28px 36px' }}>
        {activeTab === 'setup' && (
          <div style={{ maxWidth: 620 }}>
            <div style={{ marginBottom: 28 }}>
              <h2
                style={{
                  margin: '0 0 6px',
                  fontSize: 18,
                  fontWeight: 500,
                  color: '#fff',
                }}
              >
                Load survey data
              </h2>
              <p
                style={{
                  margin: 0,
                  color: '#6b7a99',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Export a CSV from Greenhouse and drop it here. Whenever you want
                to refresh the data — just upload a new file.
              </p>
            </div>

            {SETUP_STEPS.map((s, i) => (
              <div
                key={i}
                style={{ display: 'flex', gap: 16, marginBottom: 20 }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#1a2332',
                    border: '1px solid #1e2d3d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: '#4a9eff',
                  }}
                >
                  {s.n}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: '#e8e8e8',
                      marginBottom: 4,
                    }}
                  >
                    {s.title}
                  </div>
                  <div
                    style={{ fontSize: 13, color: '#8896b3', lineHeight: 1.6 }}
                  >
                    {s.desc}
                  </div>
                </div>
              </div>
            ))}

            {/* Drop zone */}
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px dashed ${dragOver ? '#4a9eff' : '#1e2d3d'}`,
                borderRadius: 12,
                padding: '40px 20px',
                cursor: 'pointer',
                marginTop: 8,
                background: dragOver ? '#0d1f33' : '#1a2332',
                transition: 'all 0.2s',
                textAlign: 'center',
              }}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleInputChange}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
              <div
                style={{
                  fontSize: 15,
                  color: '#e8e8e8',
                  fontWeight: 500,
                  marginBottom: 6,
                }}
              >
                {loading ? 'Loading...' : 'Drop CSV here'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7a99' }}>
                or click to browse files
              </div>
              {fileName && !loading && (
                <div style={{ marginTop: 12, fontSize: 12, color: '#4a9eff' }}>
                  ✓ {fileName}
                </div>
              )}
            </label>

            {error && (
              <div
                style={{
                  background: '#2a1515',
                  border: '1px solid #ef4444',
                  borderRadius: 8,
                  padding: '12px 16px',
                  fontSize: 13,
                  color: '#fca5a5',
                  marginTop: 12,
                }}
              >
                ⚠ {error}
              </div>
            )}

            {data.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  background: '#0f2318',
                  border: '1px solid #22c55e',
                  borderRadius: 8,
                  padding: '12px 16px',
                  fontSize: 13,
                  color: '#86efac',
                }}
              >
                ✓ {data.length} responses loaded · {lastUpdated}{' '}
                <button
                  onClick={() => setActiveTab('overview')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4a9eff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    textDecoration: 'underline',
                  }}
                >
                  Go to dashboard →
                </button>
              </div>
            )}
          </div>
        )}

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && data.length > 0 && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 12,
                marginBottom: 28,
              }}
            >
              {qAvgs.map((q, i) => (
                <div
                  key={i}
                  style={{
                    background: '#1a2332',
                    border: '1px solid #1e2d3d',
                    borderRadius: 10,
                    padding: '16px 14px',
                    borderTop: `3px solid ${q.color}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: '#6b7a99',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 8,
                    }}
                  >
                    Q{i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      color: q.color,
                      lineHeight: 1,
                    }}
                  >
                    {q.avg ?? '—'}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: q.color,
                      marginTop: 4,
                      fontWeight: 600,
                    }}
                  >
                    {q.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#8896b3',
                      marginTop: 8,
                      lineHeight: 1.4,
                    }}
                  >
                    {q.short}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
              }}
            >
              <div
                style={{
                  background: '#1a2332',
                  border: '1px solid #1e2d3d',
                  borderRadius: 10,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: '#6b7a99',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom: 16,
                  }}
                >
                  Average Score by Question
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={qAvgs.map((q, i) => ({
                      name: `Q${i + 1}`,
                      avg: q.avg || 0,
                    }))}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#6b7a99', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 5]}
                      tick={{ fill: '#6b7a99', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0f1117',
                        border: '1px solid #1e2d3d',
                        borderRadius: 8,
                        color: '#e8e8e8',
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {qAvgs.map((q, i) => (
                        <Cell key={i} fill={q.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div
                style={{
                  background: '#1a2332',
                  border: '1px solid #1e2d3d',
                  borderRadius: 10,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: '#6b7a99',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom: 16,
                  }}
                >
                  Candidate Sentiment (Q1)
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 0,
                    height: 20,
                    borderRadius: 6,
                    overflow: 'hidden',
                    marginBottom: 20,
                  }}
                >
                  {total > 0 && (
                    <>
                      <div
                        style={{
                          width: `${(promoters / total) * 100}%`,
                          background: '#16a34a',
                        }}
                      />
                      <div
                        style={{
                          width: `${(passives / total) * 100}%`,
                          background: '#eab308',
                        }}
                      />
                      <div
                        style={{
                          width: `${(detractors / total) * 100}%`,
                          background: '#ef4444',
                        }}
                      />
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  {[
                    ['Promoters', promoters, '#16a34a', 'Strongly Agree'],
                    ['Passives', passives, '#eab308', 'Neutral / Agree'],
                    ['Detractors', detractors, '#ef4444', 'Disagree / SD'],
                  ].map(([label, n, color, sub]) => (
                    <div key={label}>
                      <div style={{ fontSize: 28, fontWeight: 700, color }}>
                        {total > 0 ? Math.round((n / total) * 100) : 0}%
                      </div>
                      <div style={{ fontSize: 12, color: '#c8d4e8' }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7a99' }}>
                        {sub}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 16,
                    padding: '12px 14px',
                    background: '#0f1117',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7a99' }}>
                      Overall avg. score
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: overallAvg
                          ? scoreLabel(parseFloat(overallAvg)).color
                          : '#6b7a99',
                      }}
                    >
                      {overallAvg ?? '—'} / 5
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#6b7a99' }}>
                      Responses
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: '#4a9eff',
                      }}
                    >
                      {filtered.length}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* QUESTIONS TAB */}
        {activeTab === 'questions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {QUESTIONS.map((q, qi) => {
              const counts = {
                'Strongly Disagree': 0,
                Disagree: 0,
                Neutral: 0,
                Agree: 0,
                'Strongly Agree': 0,
              };
              filtered.forEach((r) => {
                if (r[q.key]) counts[r[q.key]]++;
              });
              const t = Object.values(counts).reduce((a, b) => a + b, 0);
              const scores = filtered
                .map((r) => toScore(r[q.key]))
                .filter(Boolean);
              const a = scores.length ? parseFloat(avg(scores)) : null;
              const sl = a
                ? scoreLabel(a)
                : { label: 'No data', color: '#6b7a99' };
              return (
                <div
                  key={qi}
                  style={{
                    background: '#1a2332',
                    border: '1px solid #1e2d3d',
                    borderRadius: 10,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: sl.color + '22',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        color: sl.color,
                        flexShrink: 0,
                      }}
                    >
                      Q{qi + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          color: '#e8e8e8',
                          lineHeight: 1.5,
                        }}
                      >
                        {q.full}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: sl.color,
                        }}
                      >
                        {a ?? '—'}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: sl.color,
                          fontWeight: 600,
                        }}
                      >
                        {sl.label}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    {Object.entries(counts)
                      .reverse()
                      .map(([label, count]) => (
                        <div
                          key={label}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 110,
                              fontSize: 11,
                              color: '#6b7a99',
                              textAlign: 'right',
                              flexShrink: 0,
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              flex: 1,
                              height: 8,
                              background: '#0f1117',
                              borderRadius: 4,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: t > 0 ? `${(count / t) * 100}%` : '0%',
                                background: SCORE_COLOR[SCORE_MAP[label]],
                                borderRadius: 4,
                              }}
                            />
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: '#8896b3',
                              width: 20,
                              textAlign: 'right',
                            }}
                          >
                            {count}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DEPARTMENTS TAB */}
        {activeTab === 'departments' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {deptData.map(({ dept, overall, count }) => {
              const rows = data.filter((r) => r.dept === dept);
              const sl = scoreLabel(overall);
              const qScores = QUESTIONS.map((q) => {
                const s = rows.map((r) => toScore(r[q.key])).filter(Boolean);
                return s.length ? parseFloat(avg(s)) : 0;
              });
              return (
                <div
                  key={dept}
                  style={{
                    background: '#1a2332',
                    border: '1px solid #1e2d3d',
                    borderRadius: 10,
                    padding: 20,
                    borderTop: `3px solid ${sl.color}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: '#e8e8e8',
                        }}
                      >
                        {dept}
                      </div>
                      <div
                        style={{ fontSize: 11, color: '#6b7a99', marginTop: 2 }}
                      >
                        {count} response{count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: 26,
                          fontWeight: 700,
                          color: sl.color,
                        }}
                      >
                        {overall}
                      </div>
                      <div style={{ fontSize: 10, color: sl.color }}>
                        {sl.label}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {qScores.map((qs, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                        <div
                          style={{
                            height: 40,
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                          }}
                        >
                          <div
                            style={{
                              width: '60%',
                              background: scoreLabel(qs).color,
                              borderRadius: '3px 3px 0 0',
                              height: `${(qs / 5) * 40}px`,
                              opacity: 0.85,
                            }}
                          />
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: '#6b7a99',
                            marginTop: 3,
                          }}
                        >
                          Q{i + 1}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: scoreLabel(qs).color,
                            fontWeight: 600,
                          }}
                        >
                          {qs || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FEEDBACK TAB */}
        {activeTab === 'feedback' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {comments.length === 0 && (
              <div
                style={{
                  color: '#6b7a99',
                  textAlign: 'center',
                  padding: 40,
                  fontSize: 14,
                }}
              >
                No written comments for this filter.
              </div>
            )}
            {comments.map((c, i) => (
              <div
                key={i}
                style={{
                  background: '#1a2332',
                  border: '1px solid #1e2d3d',
                  borderRadius: 10,
                  padding: 18,
                  borderLeft: `3px solid ${SCORE_COLOR[c.score] || '#4a9eff'}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginBottom: 10,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 18 }}>
                    {SCORE_EMOJI[c.score] || '💬'}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      background: '#0f1117',
                      color: '#8896b3',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {c.dept}
                  </span>
                  <span style={{ fontSize: 11, color: '#4a9eff' }}>{c.q}</span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      color: '#6b7a99',
                    }}
                  >
                    {c.date}
                  </span>
                </div>
                <div
                  style={{ fontSize: 13, color: '#c8d4e8', lineHeight: 1.7 }}
                >
                  {c.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
