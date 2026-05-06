"use client";

import { useEffect, useMemo, useState } from "react";

const MODE_NAMES = {
  0: "OFF",
  1: "TEACHING",
  2: "ENERGY-SAVING",
  3: "PRESENTATION",
  4: "FOCUS",
  5: "EMERGENCY",
};

const MODE_BUTTONS = [
  { mode: 1, label: "Teaching", sub: "All rows ON" },
  { mode: 2, label: "Energy-Saving", sub: "Daylight aware" },
  { mode: 3, label: "Presentation", sub: "Front row OFF" },
  { mode: 4, label: "Focus", sub: "Study mode" },
  { mode: 5, label: "Emergency", sub: "Alarm override" },
];

function Card({ title, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
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
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">
              ESP32 · ThingSpeak Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white">
              Smart Classroom Lighting
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Latest update: {lastUpdated}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
              Connection
            </div>
            <div className="mt-1 text-sm font-medium text-emerald-400">
              {loading ? "Loading..." : error ? "Error" : "Live"}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <Card
            title="PIR"
            value={parsed.pir ? "Motion" : "Empty"}
            sub={parsed.occupied ? "Hold active" : "Not occupied"}
          />
          <Card
            title="LDR"
            value={String(parsed.ldr)}
            sub={`${ldrPct}% ambient level`}
          />
          <Card
            title="Mode"
            value={MODE_NAMES[parsed.mode] || "UNKNOWN"}
            sub={autoMode ? "Automatic" : "Manual override"}
          />
          <Card
            title="Energy"
            value={`${parsed.energy.toFixed(4)} Wh`}
            sub={savePercent > 0 ? `${savePercent}% below base` : "Estimate only"}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card
            title="Instant Power"
            value={`${parsed.power.toFixed(2)} W`}
            sub="Estimated from current LED state"
          />
          <Card
            title="Row Brightness"
            value={String(parsed.brightness)}
            sub="0 to 1 indicator from firmware"
          />
          <Card
            title="Buzzer"
            value={parsed.buzzer ? "ON" : "OFF"}
            sub={parsed.buzzer ? "Emergency active" : "Normal"}
          />
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
                Control Mode
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {autoMode ? "Automatic" : "Manual"}
              </div>
              <p className="text-sm text-slate-400">
                Manual commands are sent to the ThingSpeak control channel, then
                the ESP32 polls them.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                disabled={sending}
                onClick={() => sendCommand({ mode: 0, auto: true, emergency: 0 })}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Auto
              </button>
              <button
                disabled={sending}
                onClick={() => sendCommand({ mode: 0, auto: false, emergency: 0 })}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Manual
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {MODE_BUTTONS.map((btn) => (
              <button
                key={btn.mode}
                disabled={sending || autoMode}
                onClick={() =>
                  sendCommand({ mode: btn.mode, auto: false, emergency: btn.mode === 5 ? 1 : 0 })
                }
                className={`rounded-2xl border p-4 text-left transition ${
                  controlMode === btn.mode && !autoMode
                    ? "border-amber-400 bg-amber-500/10"
                    : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                } disabled:opacity-40`}
              >
                <div className="text-sm font-semibold text-white">{btn.label}</div>
                <div className="mt-1 text-xs text-slate-400">{btn.sub}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
            Recent Entries
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">PIR</th>
                  <th className="px-3 py-2 text-left">LDR</th>
                  <th className="px-3 py-2 text-left">Mode</th>
                  <th className="px-3 py-2 text-left">Power</th>
                </tr>
              </thead>
              <tbody>
                {feeds.slice(-8).reverse().map((f) => (
                  <tr key={f.entry_id} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-300">
                      {f.created_at ? new Date(f.created_at).toLocaleTimeString() : "-"}
                    </td>
                    <td className="px-3 py-2">{f.field1 ?? "-"}</td>
                    <td className="px-3 py-2">{f.field2 ?? "-"}</td>
                    <td className="px-3 py-2">{MODE_NAMES[Number(f.field3)] || f.field3 || "-"}</td>
                    <td className="px-3 py-2">{f.field5 ?? "-"}</td>
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