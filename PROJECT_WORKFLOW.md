# Smart Classroom - Project Workflow and Architecture

## 1. High-Level Architecture
The project is an IoT-enabled Smart Classroom system that uses an **ESP32 microcontroller** for physical hardware control and a **Next.js React dashboard** for remote monitoring and overriding. They do not communicate directly; instead, they use **ThingSpeak** (a cloud IoT platform) as an asynchronous bridge.

**The Triangle of Communication:**
1. **ESP32 (Hardware)**: Reads sensors, computes local logic, controls LEDs, and pushes data to ThingSpeak.
2. **ThingSpeak (Cloud Broker)**: Holds two channels—one for Telemetry (sensor data) and one for Control (UI commands).
3. **Next.js (Frontend)**: Pulls Telemetry data to display charts/stats and pushes Control data when the user clicks a button.

## 2. Hardware Layer: ESP32 Logic (`Base-Code.ino`)
The ESP32 runs a continuous `loop()` that handles several critical tasks.

#### A. Sensing & Inputs
* **PIR Sensor (Motion)**: Detects if the room is occupied. If motion is detected, a 3-minute "hold timer" starts. If no motion occurs for 3 minutes, the room is marked as "Empty", and all lights are shut off to save power.
* **LDR Sensor (Light)**: Measures ambient daylight. If the room is occupied, this value determines if the lights should be fully bright (Teaching mode) or dimmed (Energy-saving mode).

#### B. Energy Estimation
Calculated entirely on the ESP32:
* It maps the active PWM values (0-255) of the LED rows to an estimated wattage (assuming 0.50W per row at 100%).
* It adds flat wattage values for active indicator LEDs (e.g., Blue, Green, Red) and the Buzzer.
* Every fraction of a second, it multiplies the instant `power (W)` by the `elapsed time (hours)` to calculate and accumulate **Watt-hours (Wh)**.

#### C. Actuators
* **3 LED Rows (PWM)**: Simulates the main overhead lights in a classroom.
* **5 Indicator LEDs & Buzzer**: Used to represent statuses (e.g., Yellow for Presentation, Red + Buzzer for Emergency).

#### D. The Overrides
The ESP32 processes logic in a specific hierarchy to ensure safety:
1. **Emergency Override**: Triggers alarms and red lights regardless of anything else.
2. **Manual Override**: Listens to the UI via ThingSpeak. If a user selects a preset like "Presentation", the ESP32 ignores sensors and forces the requested lighting.
3. **Automatic Logic**: If no overrides are active, it relies on the PIR and LDR sensors to make decisions.

## 3. Cloud Broker: ThingSpeak API
ThingSpeak acts as the middleman to solve the issue of the ESP32 and Next.js server not being on the same local Wi-Fi router. 

* **Telemetry Channel (ESP32 -> Cloud)**: Every 20 seconds, the ESP32 bundles its Pir state, LDR state, current Mode, Occupancy, active Power, Accumulated Energy, and Buzzer state into an HTTP GET request to update Fields 1 through 8.
* **Control Channel (Cloud <- Next.js)**: When you click a button on the UI, Next.js writes to this channel. 
* **Polling (Cloud -> ESP32)**: Every 3 seconds, the ESP32 checks the Control Channel to see if the UI has requested a mode change.

## 4. Software Layer: Next.js Frontend (`app/page.js`)
The dashboard provides a premium, non-AI-looking graphical interface for the classroom.

#### A. Data Ingestion (Telemetry)
* `loadTelemetry()` runs every 15 seconds. It fetches the latest ThingSpeak data through a backend API route (`/api/thingspeak/latest`).
* React's `useMemo` hooks instantly parse these raw fields into readable metrics (`parsed` and `chartData`).

#### B. UI & Visualization
* **Stats Cards**: Display calculated daylight percentage, accumulated energy, occupancy status, and an estimated "saving percentage" versus a theoretical max power baseline.
* **Recharts AreaChart**: Takes the historical array of energy data and plots it continuously over time.

#### C. Command Execution
When a user interacts with the Control Panel:
1. **Auto / Manual Switch**: Determines whether the UI sends a `mode: 0, auto: true` command (re-enabling sensor logic) or locks into manual.
2. **Preset Buttons**: E.g., Clicking "Focus" fires an API POST to `/api/thingspeak/command` setting the ThingSpeak control field to `4`.

## 5. Detailed Step-by-Step Flow Example

**Scenario: User activates the "Focus" Preset**
1. **User Action**: The dashboard is set to "Manual". The user clicks the `Focus` preset button.
2. **Frontend API Call**: `sendCommand()` serializes a JSON payload: `{ mode: 4, auto: false, emergency: 0 }` and POSTs it to the Next.js backend.
3. **Next.js Backend**: The `/api/thingspeak/command/route.js` receives the JSON, formats it into a ThingSpeak API string, and transmits it to the **Control Channel**.
4. **Hardware Polling**: Within ~3 seconds, the ESP32 runs `pollControlFromThingSpeak()` and reads the newly updated value from the Control Channel.
5. **Hardware Execution**: The ESP32 switches `manualOverride = true`, flags `currentMode = MODE_FOCUS (4)`, and adjusts the physical LED rows correctly for deep focus lighting.
6. **Hardware Feedback**: On the next 20-second interval, the ESP32 pushes its new state (including the new wattage from the updated LEDs) back up to the **Telemetry Channel**.
7. **Frontend Update**: 15 seconds later, the React dashboard polls the Telemetry Channel, receives the updated wattage and new `FOCUS` mode label, and visually updates the user interface and Recharts graph to reflect the change.