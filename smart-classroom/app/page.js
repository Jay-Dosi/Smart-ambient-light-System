"use client";

import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
//  🔥  FIREBASE REALTIME DATABASE — SETUP INSTRUCTIONS
// ─────────────────────────────────────────────────────────────────────────────
//  1. Run:  npm install firebase
//  2. Uncomment the imports below and replace with your Firebase project config.
//  3. Go to Firebase Console → Realtime Database and structure your DB like:
//       {
//         "sensors":  { "pir": 0, "ldr": 2048 },
//         "mode":     "OFF",
//         "control":  "MANUAL"
//       }
//  4. Your ESP32 firmware should READ  /control  and /mode  to act on commands.
//     Your ESP32 firmware should WRITE /sensors/pir and /sensors/ldr in real-time.
// ═══════════════════════════════════════════════════════════════════════════════

// import { initializeApp, getApps } from "firebase/app";
// import { getDatabase, ref, onValue, set }  from "firebase/database";
//
// const firebaseConfig = {
//   apiKey:            "YOUR_API_KEY",
//   authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
//   databaseURL:       "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
//   projectId:         "YOUR_PROJECT_ID",
//   storageBucket:     "YOUR_PROJECT_ID.appspot.com",
//   messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
//   appId:             "YOUR_APP_ID",
// };
//
// const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
// const db = getDatabase(firebaseApp);

// ─────────────────────────────────────────────────────────────────────────────
//  ALTERNATIVE: Supabase Realtime — uncomment if using Supabase instead
// ─────────────────────────────────────────────────────────────────────────────
// import { createClient } from "@supabase/supabase-js";
// const supabase = createClient("YOUR_SUPABASE_URL", "YOUR_SUPABASE_ANON_KEY");

// ═══════════════════════════════════════════════════════════════════════════════
//  LIGHTING MODE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════
const MODES = {
  OFF:           { label: "OFF",           watts: 0,   energySaved: 100, colorKey: "slate"  },
  TEACHING:      { label: "TEACHING",      watts: 150, energySaved: 0,   colorKey: "white"  },
  ENERGY_SAVING: { label: "ENERGY-SAVING", watts: 60,  energySaved: 60,  colorKey: "green"  },
  PRESENTATION:  { label: "PRESENTATION",  watts: 80,  energySaved: 47,  colorKey: "yellow" },
  FOCUS:         { label: "FOCUS",         watts: 100, energySaved: 33,  colorKey: "blue"   },
  EMERGENCY:     { label: "EMERGENCY",     watts: 200, energySaved: -33, colorKey: "red"    },
};

const MAX_WATTS = 150; // TEACHING is the 100% reference baseline

// ═══════════════════════════════════════════════════════════════════════════════
//  CLOUD API FUNCTIONS — Replace placeholders with real Firebase/Supabase calls
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SUBSCRIBE to live sensor data from Firebase Realtime Database.
 * Called once on component mount. Returns an unsubscribe function.
 *
 * @param {function} onData  - Callback: ({ pir, ldr }) => void
 * @param {function} onError - Callback: (error) => void
 * @returns {function} unsubscribe
 */
function subscribeSensorData(onData, onError) {
  // ── FIREBASE IMPLEMENTATION ──────────────────────────────────────────────
  // const sensorsRef = ref(db, "sensors");
  // const unsubscribe = onValue(sensorsRef, (snapshot) => {
  //   const data = snapshot.val();
  //   if (data) onData({ pir: data.pir, ldr: data.ldr });
  // }, onError);
  // return unsubscribe;

  // ── SUPABASE IMPLEMENTATION ──────────────────────────────────────────────
  // const channel = supabase
  //   .channel("sensor-updates")
  //   .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sensors" },
  //     (payload) => onData({ pir: payload.new.pir, ldr: payload.new.ldr })
  //   ).subscribe();
  // return () => supabase.removeChannel(channel);

  // ── PLACEHOLDER: Simulated sensor data ──────────────────────────────────
  const interval = setInterval(() => {
    onData({
      pir: Math.random() > 0.4 ? 1 : 0,
      ldr: Math.floor(Math.random() * 4096),
    });
  }, 3000);
  return () => clearInterval(interval);
}

/**
 * WRITE a lighting mode command to the cloud DB.
 * The ESP32 polls / listens to this path and actuates the LEDs accordingly.
 *
 * @param {string} mode - One of the MODES keys, e.g. "FOCUS"
 */
async function sendModeCommand(mode) {
  // ── FIREBASE IMPLEMENTATION ──────────────────────────────────────────────
  // await set(ref(db, "mode"), mode);

  // ── SUPABASE IMPLEMENTATION ──────────────────────────────────────────────
  // await supabase.from("commands").upsert({ id: 1, mode });

  // ── REST / Custom Backend ────────────────────────────────────────────────
  // await fetch("https://YOUR_API_URL/commands", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ mode }),
  // });

  // ── PLACEHOLDER ──────────────────────────────────────────────────────────
  console.log(`[IoT Command] Mode → ${mode}`);
}

/**
 * WRITE the auto/manual control preference to the cloud DB.
 *
 * @param {"AUTO"|"MANUAL"} controlMode
 */
async function sendControlMode(controlMode) {
  // ── FIREBASE IMPLEMENTATION ──────────────────────────────────────────────
  // await set(ref(db, "control"), controlMode);

  // ── PLACEHOLDER ──────────────────────────────────────────────────────────
  console.log(`[IoT Command] Control → ${controlMode}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function StatusPulse({ active, color = "amber" }) {
  const colors = {
    amber: active ? "bg-amber-400" : "bg-slate-600",
    green: active ? "bg-emerald-400" : "bg-slate-600",
    red:   active ? "bg-red-400"    : "bg-slate-600",
    cyan:  active ? "bg-cyan-400"   : "bg-slate-600",
  };
  return (
    <span className="relative flex h-2.5 w-2.5">
      {active && (
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colors[color]}`}
        />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${colors[color]}`} />
    </span>
  );
}

function TelemetryCard({ label, value, sub, accent, icon }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2 hover:border-slate-700 transition-colors duration-200">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono font-medium tracking-widest text-slate-500 uppercase">
          {label}
        </span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`text-xl font-mono font-semibold leading-tight ${accent}`}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] font-mono text-slate-600 truncate">{sub}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SCENE BUTTON CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
const SCENE_BUTTONS = [
  {
    key: "OFF",
    label: "OFF",
    sub: "Dark / Standby",
    icon: "⏻",
    cls: "border-slate-700 text-slate-400 hover:border-slate-500 hover:bg-slate-800 hover:text-slate-200",
    activeCls: "border-slate-400 bg-slate-800 text-slate-100 ring-1 ring-slate-500",
  },
  {
    key: "TEACHING",
    label: "TEACHING",
    sub: "White · 150 W",
    icon: "◎",
    cls: "border-slate-700 text-slate-400 hover:border-white/40 hover:bg-white/5 hover:text-white",
    activeCls: "border-white/60 bg-white/10 text-white ring-1 ring-white/40",
  },
  {
    key: "ENERGY_SAVING",
    label: "ENERGY-SAVING",
    sub: "Green · 60 W",
    icon: "◈",
    cls: "border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:bg-emerald-950/40 hover:text-emerald-300",
    activeCls: "border-emerald-500/70 bg-emerald-950/60 text-emerald-300 ring-1 ring-emerald-500/40",
  },
  {
    key: "PRESENTATION",
    label: "PRESENTATION",
    sub: "Yellow · 80 W",
    icon: "◉",
    cls: "border-slate-700 text-slate-400 hover:border-amber-500/50 hover:bg-amber-950/40 hover:text-amber-300",
    activeCls: "border-amber-500/70 bg-amber-950/60 text-amber-300 ring-1 ring-amber-500/40",
  },
  {
    key: "FOCUS",
    label: "FOCUS",
    sub: "Blue · 100 W",
    icon: "◐",
    cls: "border-slate-700 text-slate-400 hover:border-cyan-500/50 hover:bg-cyan-950/40 hover:text-cyan-300",
    activeCls: "border-cyan-500/70 bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-500/40",
  },
  {
    key: "EMERGENCY",
    label: "EMERGENCY",
    sub: "Red · 200 W",
    icon: "⚠",
    cls: "border-slate-700 text-slate-400 hover:border-red-500/50 hover:bg-red-950/40 hover:text-red-400",
    activeCls: "border-red-500/70 bg-red-950/60 text-red-400 ring-1 ring-red-500/40",
    emergency: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function SmartClassroomDashboard() {
  const [isAutoMode, setIsAutoMode]     = useState(true);
  const [currentMode, setCurrentMode]   = useState("OFF");
  const [pirStatus, setPirStatus]       = useState(0);       // 0 = empty, 1 = motion
  const [ldrValue, setLdrValue]         = useState(2048);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [connStatus, setConnStatus]     = useState("connecting"); // connecting | live | error
  const [isSending, setIsSending]       = useState(false);

  // ── Subscribe to live sensor data on mount ─────────────────────────────
  useEffect(() => {
    setConnStatus("connecting");
    const unsubscribe = subscribeSensorData(
      ({ pir, ldr }) => {
        setPirStatus(pir);
        setLdrValue(ldr);
        setLastUpdated(new Date());
        setConnStatus("live");
      },
      (err) => {
        console.error("[Firebase] Sensor subscription error:", err);
        setConnStatus("error");
      }
    );
    return () => unsubscribe();
  }, []);

  // ── Handle Auto / Manual toggle ────────────────────────────────────────
  const handleToggleMode = useCallback(async () => {
    const next = !isAutoMode;
    setIsAutoMode(next);
    try {
      await sendControlMode(next ? "AUTO" : "MANUAL");
      if (next) {
        // When switching back to AUTO, clear the manual override mode
        setCurrentMode("OFF");
        await sendModeCommand("OFF");
      }
    } catch (e) {
      console.error("[Firebase] Control mode write failed:", e);
    }
  }, [isAutoMode]);

  // ── Handle scene button click ──────────────────────────────────────────
  const handleSceneSelect = useCallback(async (key) => {
    if (isAutoMode || isSending) return;
    setIsSending(true);
    setCurrentMode(key);
    try {
      await sendModeCommand(key);
    } catch (e) {
      console.error("[Firebase] Mode command write failed:", e);
    } finally {
      setIsSending(false);
    }
  }, [isAutoMode, isSending]);

  // ── Derived display values ─────────────────────────────────────────────
  const modeData      = MODES[currentMode] ?? MODES["OFF"];
  const energySaved   = modeData.energySaved;
  const wattage       = modeData.watts;
  const pirLabel      = pirStatus === 1 ? "Motion Detected" : "Room Empty";
  const ldrPercent    = Math.round((ldrValue / 4095) * 100);
  const ldrLabel      =
    ldrValue < 800   ? "Very Dark"
    : ldrValue < 1600 ? "Low Light"
    : ldrValue < 2800 ? "Moderate"
    : ldrValue < 3600 ? "Bright"
    : "Very Bright";

  const connDot = {
    connecting: { color: "amber", label: "Connecting…" },
    live:        { color: "green", label: "Live"         },
    error:       { color: "red",   label: "Error"        },
  }[connStatus];

  return (
    <>
      {/* ── Global font import ──────────────────────────────────────────
           Add these lines to your layout.js <head> instead for production:
           <link rel="preconnect" href="https://fonts.googleapis.com" />
           <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@600;700&display=swap" rel="stylesheet" />
      ──────────────────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@600;700&display=swap');
        .font-display { font-family: 'Syne', sans-serif; }
        .font-data    { font-family: 'IBM Plex Mono', monospace; }
        .toggle-track {
          transition: background 0.25s ease;
        }
        .toggle-thumb {
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .scene-btn {
          transition: all 0.15s ease;
        }
        .scene-btn:active:not(:disabled) {
          transform: scale(0.97);
        }
        .ldr-bar {
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
      `}</style>

      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 font-data">
        <div className="max-w-3xl mx-auto space-y-6 fade-in">

          {/* ── Header ──────────────────────────────────────────────── */}
          <header className="flex items-start justify-between">
            <div>
              <p className="text-[10px] tracking-[0.25em] text-slate-500 uppercase mb-1 font-data">
                ESP32 · Smart Classroom
              </p>
              <h1 className="font-display text-2xl font-bold text-white leading-tight">
                Lighting Control
              </h1>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-3 py-1.5">
                <StatusPulse active={connStatus === "live"} color={connDot.color} />
                <span className="text-[11px] font-data text-slate-400">
                  {connDot.label}
                </span>
              </div>
              {lastUpdated && (
                <p className="text-[10px] text-slate-600 font-data pr-1">
                  Updated {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
          </header>

          {/* ── Telemetry Cards ──────────────────────────────────────── */}
          <section>
            <p className="text-[10px] tracking-[0.2em] text-slate-600 uppercase mb-3 font-data">
              Live Telemetry
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TelemetryCard
                label="PIR Sensor"
                value={pirLabel}
                sub={pirStatus ? "Lights may activate" : "Standby eligible"}
                accent={pirStatus ? "text-amber-400" : "text-slate-400"}
                icon="⟁"
              />
              <TelemetryCard
                label="LDR Ambient"
                value={`${ldrValue}`}
                sub={`${ldrPercent}% · ${ldrLabel}`}
                accent="text-cyan-400"
                icon="◑"
              />
              <TelemetryCard
                label="Active Mode"
                value={modeData.label}
                sub={isAutoMode ? "Automatic" : "Manual Override"}
                accent="text-white"
                icon="⬡"
              />
              <TelemetryCard
                label="Energy"
                value={energySaved >= 0 ? `${energySaved}% saved` : `${Math.abs(energySaved)}% over`}
                sub={`${wattage} W · vs ${MAX_WATTS} W base`}
                accent={energySaved > 30 ? "text-emerald-400" : energySaved > 0 ? "text-amber-400" : "text-red-400"}
                icon="⚡"
              />
            </div>
          </section>

          {/* ── LDR Visual Bar ───────────────────────────────────────── */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] tracking-widest text-slate-500 uppercase font-data">
                Ambient Light Level
              </span>
              <span className="text-[11px] font-data text-slate-400">
                {ldrValue} / 4095
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full ldr-bar"
                style={{
                  width: `${ldrPercent}%`,
                  background:
                    ldrPercent < 25  ? "oklch(70% 0.15 200)"   // dim cyan
                    : ldrPercent < 55 ? "oklch(75% 0.18 230)"  // blue
                    : ldrPercent < 80 ? "oklch(80% 0.18 80)"   // amber
                    :                   "oklch(85% 0.15 95)",   // bright yellow
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-slate-700 font-data">Dark (0)</span>
              <span className="text-[9px] text-slate-700 font-data">Bright (4095)</span>
            </div>
          </div>

          {/* ── Auto / Manual Toggle ─────────────────────────────────── */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] tracking-[0.2em] text-slate-500 uppercase mb-1 font-data">
                  Control Mode
                </p>
                <p className="text-base font-display font-semibold text-white">
                  {isAutoMode ? "Automatic" : "Manual Override"}
                </p>
                <p className="text-[11px] text-slate-500 font-data mt-0.5">
                  {isAutoMode
                    ? "ESP32 controls lighting based on PIR & LDR sensors"
                    : "Dashboard commands override ESP32 sensor logic"}
                </p>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={handleToggleMode}
                aria-label={`Switch to ${isAutoMode ? "Manual" : "Automatic"} mode`}
                className="relative flex-shrink-0 ml-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-full"
              >
                <div
                  className={`toggle-track w-16 h-8 rounded-full border ${
                    isAutoMode
                      ? "bg-amber-500/20 border-amber-500/50"
                      : "bg-slate-800 border-slate-600"
                  }`}
                />
                <div
                  className={`toggle-thumb absolute top-1 w-6 h-6 rounded-full shadow-md ${
                    isAutoMode ? "bg-amber-400" : "bg-slate-300"
                  }`}
                  style={{ transform: isAutoMode ? "translateX(36px)" : "translateX(4px)" }}
                />
              </button>
            </div>

            <div className="flex gap-2 mt-4">
              <div
                className={`flex-1 text-center py-1.5 rounded-lg text-[11px] font-data tracking-wider border transition-all duration-200 ${
                  !isAutoMode
                    ? "border-slate-700 text-slate-600 bg-transparent"
                    : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                }`}
              >
                AUTO
              </div>
              <div
                className={`flex-1 text-center py-1.5 rounded-lg text-[11px] font-data tracking-wider border transition-all duration-200 ${
                  isAutoMode
                    ? "border-slate-700 text-slate-600 bg-transparent"
                    : "border-slate-400/40 text-slate-300 bg-slate-800/60"
                }`}
              >
                MANUAL
              </div>
            </div>
          </section>

          {/* ── Scene Buttons ─────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] tracking-[0.2em] text-slate-600 uppercase font-data">
                Lighting Scenes
              </p>
              {isAutoMode && (
                <span className="text-[10px] font-data text-amber-500/80 border border-amber-500/30 rounded-full px-2.5 py-0.5 bg-amber-500/10">
                  Switch to Manual to enable
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SCENE_BUTTONS.map((btn) => {
                const isActive  = currentMode === btn.key;
                const disabled  = isAutoMode || isSending;
                return (
                  <button
                    key={btn.key}
                    onClick={() => handleSceneSelect(btn.key)}
                    disabled={disabled}
                    aria-pressed={isActive}
                    className={`scene-btn relative flex flex-col items-start gap-1 p-4 rounded-xl border text-left
                      ${disabled
                        ? "opacity-40 cursor-not-allowed border-slate-800 bg-transparent text-slate-600"
                        : isActive
                          ? btn.activeCls
                          : btn.cls
                      }
                      ${!disabled ? "cursor-pointer" : ""}
                      ${btn.emergency && !disabled ? "animate-[pulse_3s_ease-in-out_infinite]" : ""}
                    `}
                  >
                    {/* Active indicator dot */}
                    {isActive && !isAutoMode && (
                      <span className="absolute top-3 right-3">
                        <StatusPulse
                          active
                          color={
                            btn.key === "EMERGENCY" ? "red"
                            : btn.key === "ENERGY_SAVING" ? "green"
                            : btn.key === "FOCUS" ? "cyan"
                            : "amber"
                          }
                        />
                      </span>
                    )}
                    <span className="text-lg leading-none">{btn.icon}</span>
                    <span className="font-data font-semibold text-[12px] tracking-widest leading-tight">
                      {btn.label}
                    </span>
                    <span className="font-data text-[10px] opacity-60 leading-none">
                      {btn.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <footer className="flex items-center justify-between pt-2 pb-4 border-t border-slate-900">
            <p className="text-[10px] font-data text-slate-700">
              Smart Classroom · ESP32 IoT Dashboard
            </p>
            <p className="text-[10px] font-data text-slate-700">
              {/* Replace YOUR_PROJECT_ID with your actual Firebase project */}
              DB: <span className="text-slate-600">firebase://YOUR_PROJECT_ID</span>
            </p>
          </footer>
        </div>
      </main>
    </>
  );
}
