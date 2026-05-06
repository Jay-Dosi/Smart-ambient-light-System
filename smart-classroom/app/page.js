"use client";

import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const MODE_NAMES = {
  0: "OFF",
  1: "TEACHING",
  2: "ENERGY-SAVING",
  3: "PRESENTATION",
  4: "FOCUS",
  5: "EMERGENCY",
  6: "CUSTOM",
};

const MODE_BUTTONS = [
  { mode: 0, label: "OFF", sub: "All LEDs off" },
  { mode: 1, label: "Teaching", sub: "All rows ON" },
  { mode: 2, label: "Energy-Saving", sub: "Daylight aware" },
  { mode: 3, label: "Presentation", sub: "Front row OFF" },
  { mode: 4, label: "Focus", sub: "Study mode" },
  { mode: 5, label: "Emergency", sub: "Alarm override" },
];

function Card({ title, value, sub, highlight }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border p-5 transition-all duration-300 ${
      highlight 
      ? "border-blue-500/50 bg-blue-500/5" 
      : "border-slate-800 bg-slate-900"
    }`}>
      <div className={`text-[11px] uppercase tracking-[0.15em] font-medium ${highlight ? "text-blue-400" : "text-slate-400"}`}>
        {title}
      </div>
      <div className={`mt-2 text-2xl font-bold ${highlight ? "text-blue-50" : "text-white"}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default function Page() {
  const [latest, setLatest] = useState(null);
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [controlMode, setControlMode] = useState(0);
  const [autoMode, setAutoMode] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sliderVal, setSliderVal] = useState(0);

  async function loadTelemetry() {
    try {
      const res = await fetch("/api/thingspeak/latest", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Telemetry load failed");
      }

      setLatest(data.latest);
      setFeeds(data.feeds || []);
      setLoading(false);
      setError("");
    } catch (e) {
      setLoading(false);
      setError(e.message || "Failed to load telemetry");
    }
  }

  useEffect(() => {
    loadTelemetry();
    const timer = setInterval(loadTelemetry, 15000);
    return () => clearInterval(timer);
  }, []);

  const parsed = useMemo(() => {
    const f = latest || {};
    const pir = Number(f.field1 ?? 0);
    const ldr = Number(f.field2 ?? 0);
    const mode = Number(f.field3 ?? 0);
    const occupied = Number(f.field4 ?? 0);
    const power = Number(f.field5 ?? 0);
    const energy = Number(f.field6 ?? 0);
    const brightness = Number(f.field7 ?? 0);
    const buzzer = Number(f.field8 ?? 0);

    return {
      pir,
      ldr,
      mode,
      occupied,
      power,
      energy,
      brightness,
      buzzer,
    };
  }, [latest]);

  const ldrPct = Math.max(0, Math.min(100, Math.round((parsed.ldr / 4095) * 100)));

  const savePercent = useMemo(() => {
    const base = 0.50 * 3; // same prototype estimate used on ESP32
    const current = parsed.power;
    if (!base || Number.isNaN(current)) return 0;
    return Math.round(((base - current) / base) * 100);
  }, [parsed.power]);

  const chartData = useMemo(() => {
    return feeds.map((f) => ({
      time: f.created_at ? new Date(f.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "",
      energy: Number(f.field6 ?? 0),
      power: Number(f.field5 ?? 0)
    }));
  }, [feeds]);

  async function sendCommand(next) {
    setSending(true);
    try {
      const res = await fetch("/api/thingspeak/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Command failed");

      setControlMode(next.mode ?? 0);
      setAutoMode(!!next.auto);
      await loadTelemetry();
    } catch (e) {
      setError(e.message || "Command failed");
    } finally {
      setSending(false);
    }
  }

  const lastUpdated = latest?.created_at
    ? new Date(latest.created_at).toLocaleString()
    : "No data yet";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 font-sans">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${loading ? "bg-amber-400" : error ? "bg-red-500" : "bg-green-500"}`} />
              <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">
                Classroom Dashboard
              </p>
            </div>
            <h1 className="mt-1 text-3xl font-bold text-white tracking-tight">
              Lighting & Energy
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Last synced: {lastUpdated}
            </p>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <section className="grid gap-5 md:grid-cols-4">
          <Card
            title="Occupancy"
            value={parsed.pir ? "Motion" : "Empty"}
            sub={parsed.occupied ? "Hold timer active" : "No movement"}
            highlight={parsed.pir > 0}
          />
          <Card
            title="Ambient Light"
            value={String(parsed.ldr)}
            sub={`${ldrPct}% relative brightness`}
          />
          <Card
            title="Active Mode"
            value={MODE_NAMES[parsed.mode] || "UNKNOWN"}
            sub={autoMode ? "Sensor Driven (Auto)" : "Manual Override"}
            highlight={!autoMode}
          />
          <Card
            title="Accumulated Energy"
            value={`${parsed.energy.toFixed(4)} Wh`}
            sub={savePercent > 0 ? `Saving ${savePercent}% vs base` : "Estimating..."}
            highlight={savePercent > 0}
          />
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <Card
            title="Current Draw"
            value={`${parsed.power.toFixed(2)} W`}
            sub="Live estimated power"
          />
          <Card
            title="LED Brightness"
            value={String(parsed.brightness)}
            sub="0 to 1 level indicator"
          />
          <Card
            title="Alert Status"
            value={parsed.buzzer ? "ALARM" : "CLEAR"}
            sub={parsed.buzzer ? "Emergency mode active" : "Normal ops"}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest font-medium text-slate-400">
                  Control Panel
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {autoMode ? "Automatic Mode" : "Manual Override"}
                </div>
              </div>

              <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                <button
                  disabled={sending}
                  onClick={() => sendCommand({ mode: 0, auto: true, emergency: 0 })}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${autoMode ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  Auto
                </button>
                <button
                  disabled={sending}
                  onClick={() => sendCommand({ mode: 0, auto: false, emergency: 0 })}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${!autoMode ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  Manual
                </button>
              </div>
            </div>

            <div className={`mt-6 grid gap-3 grid-cols-2 md:grid-cols-3 transition-opacity ${autoMode ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
              {MODE_BUTTONS.map((btn) => {
                const isActive = controlMode === btn.mode && !autoMode;
                return (
                  <button
                    key={btn.mode}
                    disabled={sending || autoMode}
                    onClick={() =>
                      sendCommand({ mode: btn.mode, auto: false, emergency: btn.mode === 5 ? 1 : 0, brightness: 0 })
                    }
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      isActive
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-800 bg-slate-950 hover:border-slate-600"
                    }`}
                  >
                    <div className={`text-sm font-medium ${isActive ? "text-blue-400" : "text-slate-200"}`}>{btn.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{btn.sub}</div>
                  </button>
                );
              })}
            </div>

            <div className={`mt-8 border-t border-slate-800 pt-6 transition-opacity ${autoMode ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
              <div className="text-xs uppercase tracking-widest font-medium text-slate-400 mb-6">
                Manual Brightness Override
              </div>
              <div className="px-2">
                <div className="relative">
                  <div className="absolute top-1/2 left-0 right-0 h-1.5 -mt-[3px] bg-slate-800 rounded-full flex justify-between px-[2px] pointer-events-none">
                    {[1, 2, 3].map((stop) => (
                      <div key={stop} className={`h-1.5 w-1.5 rounded-full ${sliderVal >= stop ? "bg-blue-500" : "bg-slate-600"}`} />
                    ))}
                  </div>
                  
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="1"
                    disabled={sending || autoMode}
                    value={Math.max(1, sliderVal)}
                    onChange={(e) => setSliderVal(Number(e.target.value))}
                    onMouseUp={(e) => {
                      if (!autoMode) {
                        sendCommand({ mode: 6, auto: false, emergency: 0, brightness: Number(e.target.value) });
                      }
                    }}
                    className="relative z-10 w-full h-2 appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-slate-900 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-slate-900"
                  />
                </div>
                
                <div className="flex justify-between mt-3 text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  <span className={sliderVal <= 1 ? "text-blue-400" : ""}>Low</span>
                  <span className={sliderVal === 2 ? "text-blue-400" : ""}>Med</span>
                  <span className={sliderVal === 3 ? "text-blue-400" : ""}>Max</span>
                </div>
              </div>
            </div>
          </section>

          <section className="col-span-1 rounded-xl border border-slate-800 bg-slate-900 p-6 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs uppercase tracking-widest font-medium text-slate-400">
                Live Analytics
              </div>
            </div>
            
            <div className="flex-1 w-full bg-slate-950 rounded-lg p-2 border border-slate-800 min-h-[200px]" style={{ minHeight: "200px", minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={200} minWidth={100}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(2)} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px', color: '#fff' }} 
                    itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }} 
                  />
                  <Area type="monotone" dataKey="energy" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorEnergy)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-center text-xs text-slate-500">
              Accumulated Energy Source (Wh)
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-xs uppercase tracking-widest font-medium text-slate-400 mb-4">
            Telemetry Stream
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#0B1121] text-xs uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="px-5 py-4 font-semibold">Timestamp</th>
                  <th className="px-5 py-4 font-semibold">PIR Event</th>
                  <th className="px-5 py-4 font-semibold">LDR Value</th>
                  <th className="px-5 py-4 font-semibold">System Mode</th>
                  <th className="px-5 py-4 font-semibold">Est. Power (W)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {feeds.slice(-8).reverse().map((f) => (
                  <tr key={f.entry_id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-300">
                      {f.created_at ? new Date(f.created_at).toLocaleTimeString() : "-"}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{f.field1 ?? "-"}</td>
                    <td className="px-5 py-3 text-slate-400">{f.field2 ?? "-"}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-300">
                        {MODE_NAMES[Number(f.field3)] || f.field3 || "-"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-emerald-400/90 font-mono">{f.field5 ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}