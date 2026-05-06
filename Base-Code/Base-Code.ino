#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ctype.h>

// ===================== WIFI + THINGSPEAK =====================
const char* WIFI_SSID = "Victus";
const char* WIFI_PASSWORD = "asdfghjkl;'";

// Telemetry channel: ESP32 -> ThingSpeak
const char* TS_TELEMETRY_WRITE_KEY = "NA5EUCNV6A4RE3RT";
const long   TS_TELEMETRY_CHANNEL_ID = 3371690;

// Control channel: Frontend -> ThingSpeak -> ESP32
const char* TS_CONTROL_READ_KEY = "IYYHCDGUP44GYD0T";
const long   TS_CONTROL_CHANNEL_ID = 3371865;

// Keep telemetry above ThingSpeak minimum interval.
const unsigned long TELEMETRY_INTERVAL_MS = 20000;
// Faster control polling for better responsiveness.
const unsigned long CONTROL_POLL_INTERVAL_MS = 3000;

// ===================== GPIO PINS =====================
const int PIR_PIN      = 2;
const int LDR_PIN      = 3;

const int ROW1_PIN     = 4;
const int ROW2_PIN     = 5;
const int ROW3_PIN     = 6;

const int RED_LED      = 7;
const int YELLOW_LED   = 10;
const int BLUE_LED     = 11;
const int GREEN_LED    = 16;
const int BUZZER_PIN   = 17;
const int WHITE_LED    = 18;

// ===================== MODES =====================
enum Mode {
  MODE_OFF = 0,
  MODE_TEACHING = 1,
  MODE_ENERGY_SAVING = 2,
  MODE_PRESENTATION = 3,
  MODE_FOCUS = 4,
  MODE_EMERGENCY = 5
};

Mode currentMode = MODE_OFF;
bool manualOverride = false;
bool emergencyOverride = false;
int globalManualBrightness = 3; // 1 = Low, 2 = Medium, 3 = Max

// ===================== AUTO LOGIC =====================
const unsigned long MOTION_HOLD_MS = 3UL * 60UL * 1000UL; // 3 minutes
const int LDR_DARK = 1000;
const int LDR_BRIGHT = 3000;

unsigned long lastMotionMs = 0;
bool roomOccupied = false;

// ===================== ENERGY ESTIMATION =====================
const float ROW_FULL_POWER_W  = 0.50f;
const float INDICATOR_POWER_W = 0.03f;
const float BUZZER_POWER_W    = 0.20f;
const float WHITE_POWER_W     = 0.03f;

float energyWhByMode[6] = {0, 0, 0, 0, 0, 0};
float totalEnergyWh = 0.0f;

unsigned long lastEnergyUpdateMs = 0;
unsigned long lastTelemetryPushMs = 0;
unsigned long lastControlPollMs = 0;
unsigned long lastPrintTime = 0;

// Prevent re-processing the same control command again and again
long lastProcessedControlEntryId = -1;

// ===================== OUTPUT STATE =====================
struct OutputState {
  int row1 = 0;
  int row2 = 0;
  int row3 = 0;
  bool red = false;
  bool yellow = false;
  bool blue = false;
  bool green = false;
  bool white = false;
  bool buzzer = false;
};

OutputState currentOutputs;

// ===================== FORWARD DECLARATIONS =====================
void connectWiFi();
void checkSerialCommands();
void updateOccupancy(bool pirState);
void processAutomaticLogic(int ldrValue);
void setTeachingMode();
void setEnergySavingMode(int ldrValue);
void setPresentationMode();
void setFocusMode();
void setEmergencyMode();
void turnOffAll();
void applyOutputs(const OutputState &out);
void accumulateEnergy();
float estimateInstantPowerW(const OutputState &out);
String getModeName(int mode);

void publishTelemetryToThingSpeak(int pirState, int ldrValue);
void pollControlFromThingSpeak();
bool fetchLatestControlFromThingSpeak(String &jsonOut);
int readJsonIntField(const String &json, const char* key, int defaultValue = 0);

void printStatus(int pirState, int ldrValue);
void printEnergySummary();

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  delay(1000);

  pinMode(PIR_PIN, INPUT);
  pinMode(LDR_PIN, INPUT);

  pinMode(ROW1_PIN, OUTPUT);
  pinMode(ROW2_PIN, OUTPUT);
  pinMode(ROW3_PIN, OUTPUT);

  pinMode(RED_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(BLUE_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(WHITE_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  currentOutputs = OutputState{};
  applyOutputs(currentOutputs);

  connectWiFi();

  lastEnergyUpdateMs = millis();
  lastMotionMs = millis();

  Serial.println("\nSmart Classroom Lighting System with ThingSpeak");
  Serial.println("A = AUTO, T = TEACHING, P = PRESENTATION, F = FOCUS, E = EMERGENCY, O = OFF");
}

// ===================== LOOP =====================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  int pirState = digitalRead(PIR_PIN);
  int ldrValue = analogRead(LDR_PIN);

  accumulateEnergy();
  updateOccupancy(pirState);

  checkSerialCommands();

  if (millis() - lastControlPollMs >= CONTROL_POLL_INTERVAL_MS) {
    pollControlFromThingSpeak();
    lastControlPollMs = millis();
  }

  if (emergencyOverride) {
    setEmergencyMode();
  } else if (!manualOverride) {
    processAutomaticLogic(ldrValue);
  }

  if (millis() - lastTelemetryPushMs >= TELEMETRY_INTERVAL_MS) {
    publishTelemetryToThingSpeak(pirState, ldrValue);
    lastTelemetryPushMs = millis();
  }

  if (millis() - lastPrintTime >= 2000) {
    printStatus(pirState, ldrValue);
    lastPrintTime = millis();
  }
}

// ===================== WIFI =====================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Connecting to Wi-Fi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) {
    delay(250);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi connected");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWi-Fi connection failed");
  }
}

// ===================== OCCUPANCY =====================
void updateOccupancy(bool pirState) {
  if (pirState == HIGH) {
    lastMotionMs = millis();
    roomOccupied = true;
  } else {
    roomOccupied = (millis() - lastMotionMs) <= MOTION_HOLD_MS;
  }
}

// ===================== AUTOMATIC LOGIC =====================
// Hysteresis: keep current mode between thresholds to avoid bouncing.
void processAutomaticLogic(int ldrValue) {
  if (!roomOccupied) {
    if (currentMode != MODE_OFF) {
      Serial.println("[AUTO] Room empty -> lights OFF");
    }
    turnOffAll();
    currentMode = MODE_OFF;
    return;
  }

  // Bright room -> energy saving
  if (ldrValue > LDR_BRIGHT) {
    setEnergySavingMode(ldrValue);
  }
  // Dark room -> teaching
  else if (ldrValue < LDR_DARK) {
    setTeachingMode();
  }
  // Mid band -> keep current mode, do not flip-flop
}

// ===================== MODE FUNCTIONS =====================
void setTeachingMode() {
  if (currentMode != MODE_TEACHING) Serial.println("[MODE] TEACHING");
  currentMode = MODE_TEACHING;

  OutputState out;
  out.row1 = 255;
  out.row2 = 255;
  out.row3 = 255;
  out.white = true;
  applyOutputs(out);
}

void setEnergySavingMode(int ldrValue) {
  if (currentMode != MODE_ENERGY_SAVING) Serial.println("[MODE] ENERGY-SAVING");
  currentMode = MODE_ENERGY_SAVING;

  int brightness = map(ldrValue, LDR_DARK, 4095, 255, 60);
  brightness = constrain(brightness, 60, 255);

  OutputState out;
  out.row1 = brightness;
  out.row2 = brightness;
  out.row3 = brightness;
  out.green = true;
  applyOutputs(out);
}

void setPresentationMode() {
  if (currentMode != MODE_PRESENTATION) Serial.println("[MODE] PRESENTATION");
  currentMode = MODE_PRESENTATION;

  OutputState out;
  out.row1 = 0;
  out.row2 = 100;
  out.row3 = 100;
  out.yellow = true;
  applyOutputs(out);
}

void setFocusMode() {
  if (currentMode != MODE_FOCUS) Serial.println("[MODE] FOCUS");
  currentMode = MODE_FOCUS;

  OutputState out;
  out.row1 = 150;
  out.row2 = 150;
  out.row3 = 150;
  out.blue = true;
  applyOutputs(out);
}

void setEmergencyMode() {
  if (currentMode != MODE_EMERGENCY) Serial.println("!!! EMERGENCY MODE !!!");
  currentMode = MODE_EMERGENCY;

  unsigned long now = millis();
  bool blinkOn = ((now / 500) % 2) == 0;

  OutputState out;
  out.row1 = blinkOn ? 255 : 0;
  out.row2 = blinkOn ? 255 : 0;
  out.row3 = blinkOn ? 255 : 0;
  out.red = blinkOn;
  out.buzzer = blinkOn;
  applyOutputs(out);
}

void turnOffAll() {
  OutputState out;
  applyOutputs(out);
  currentMode = MODE_OFF;
}

void applyOutputs(const OutputState &out) {
  currentOutputs = out;

  float brightnessFactor = 1.0f;
  if (manualOverride) {
    if (globalManualBrightness == 1) brightnessFactor = 0.33f;
    else if (globalManualBrightness == 2) brightnessFactor = 0.66f;
  }

  int outR1 = (int)(out.row1 * brightnessFactor);
  int outR2 = (int)(out.row2 * brightnessFactor);
  int outR3 = (int)(out.row3 * brightnessFactor);

  analogWrite(ROW1_PIN, outR1);
  analogWrite(ROW2_PIN, outR2);
  analogWrite(ROW3_PIN, outR3);

  digitalWrite(RED_LED,    out.red    ? HIGH : LOW);
  digitalWrite(YELLOW_LED, out.yellow ? HIGH : LOW);
  digitalWrite(BLUE_LED,   out.blue   ? HIGH : LOW);
  digitalWrite(GREEN_LED,  out.green  ? HIGH : LOW);
  digitalWrite(WHITE_LED,  out.white   ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, out.buzzer  ? HIGH : LOW);
}

// ===================== ENERGY =====================
void accumulateEnergy() {
  unsigned long now = millis();
  unsigned long elapsedMs = now - lastEnergyUpdateMs;
  if (elapsedMs == 0) return;

  float powerW = estimateInstantPowerW(currentOutputs);
  float hours = elapsedMs / 3600000.0f;
  float energyWh = powerW * hours;

  if (currentMode >= 0 && currentMode <= 5) {
    energyWhByMode[currentMode] += energyWh;
  }
  totalEnergyWh += energyWh;

  lastEnergyUpdateMs = now;
}

float estimateInstantPowerW(const OutputState &out) {
  auto rowPower = [](int pwm) -> float {
    return ROW_FULL_POWER_W * (pwm / 255.0f);
  };

  float power = 0.0f;
  power += rowPower(out.row1);
  power += rowPower(out.row2);
  power += rowPower(out.row3);

  if (out.red)    power += INDICATOR_POWER_W;
  if (out.yellow) power += INDICATOR_POWER_W;
  if (out.blue)   power += INDICATOR_POWER_W;
  if (out.green)  power += INDICATOR_POWER_W;
  if (out.white)  power += WHITE_POWER_W;
  if (out.buzzer) power += BUZZER_POWER_W;

  return power;
}

// ===================== THINGSPEAK TELEMETRY =====================
void publishTelemetryToThingSpeak(int pirState, int ldrValue) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(2000);

  String url = "http://api.thingspeak.com/update?api_key=";
  url += TS_TELEMETRY_WRITE_KEY;
  url += "&field1=" + String(pirState);
  url += "&field2=" + String(ldrValue);
  url += "&field3=" + String((int)currentMode);
  url += "&field4=" + String(roomOccupied ? 1 : 0);
  url += "&field5=" + String(estimateInstantPowerW(currentOutputs), 2);
  url += "&field6=" + String(totalEnergyWh, 4);
  url += "&field7=" + String((currentOutputs.row1 > 0 || currentOutputs.row2 > 0 || currentOutputs.row3 > 0) ? 1 : 0);
  url += "&field8=" + String(digitalRead(BUZZER_PIN));

  http.begin(client, url);
  int code = http.GET();
  String payload = http.getString();
  http.end();

  Serial.print("[ThingSpeak] telemetry code=");
  Serial.print(code);
  Serial.print(" response=");
  Serial.println(payload);
}

// ===================== THINGSPEAK CONTROL =====================
void pollControlFromThingSpeak() {
  if (WiFi.status() != WL_CONNECTED) return;

  String json;
  if (!fetchLatestControlFromThingSpeak(json)) {
    return;
  }

  long entryId = readJsonIntField(json, "entry_id", -1);
  if (entryId == -1 || entryId == lastProcessedControlEntryId) {
    return;
  }
  lastProcessedControlEntryId = entryId;

  int modeCmd = readJsonIntField(json, "field1", 0);      // 0 = no change, 1..5 = modes
  int autoFlag = readJsonIntField(json, "field2", 1);     // 1 = auto, 0 = manual
  int emergencyFlag = readJsonIntField(json, "field3", 0);
  int brightnessCmd = readJsonIntField(json, "field4", 0); // optional manual brightness

  if (brightnessCmd >= 1 && brightnessCmd <= 3) {
    globalManualBrightness = brightnessCmd;
  }

  if (emergencyFlag == 1) {
    emergencyOverride = true;
    manualOverride = false;
    return;
  }

  if (emergencyFlag == 0 && emergencyOverride) {
    emergencyOverride = false;
    // Do not force Teaching here; let the current mode or next command decide.
  }

  if (autoFlag == 1) {
    manualOverride = false;
    return;
  }

  // Manual mode
  manualOverride = true;

  // IMPORTANT FIX:
  // Do NOT force mode 1 when modeCmd is 0.
  // A zero means "no new manual command", so keep the current mode.
  switch (modeCmd) {
    case 1:
      setTeachingMode();
      break;
    case 2:
      setEnergySavingMode(analogRead(LDR_PIN));
      break;
    case 3:
      setPresentationMode();
      break;
    case 4:
      setFocusMode();
      break;
    case 5:
      emergencyOverride = true;
      break;
    case 0:
    default:
      // No new command, keep current state.
      break;
  }
}

bool fetchLatestControlFromThingSpeak(String &jsonOut) {
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(2500);

  String url = "http://api.thingspeak.com/channels/";
  url += String(TS_CONTROL_CHANNEL_ID);
  url += "/feeds/last.json";

  if (strlen(TS_CONTROL_READ_KEY) > 0) {
    url += "?api_key=";
    url += TS_CONTROL_READ_KEY;
  }

  http.begin(client, url);
  int code = http.GET();

  if (code <= 0) {
    http.end();
    return false;
  }

  jsonOut = http.getString();
  http.end();

  return jsonOut.length() > 0;
}

// Simple JSON integer field parser for ThingSpeak last.json response
int readJsonIntField(const String &json, const char* key, int defaultValue) {
  String needle = String("\"") + key + "\":";
  int idx = json.indexOf(needle);
  if (idx < 0) return defaultValue;

  idx += needle.length();

  while (idx < (int)json.length() && isspace(json[idx])) idx++;
  if (idx >= (int)json.length()) return defaultValue;

  if (json[idx] == '\"') idx++;

  int end = idx;
  while (end < (int)json.length()) {
    char c = json[end];
    if (c == '\"' || c == ',' || c == '}' || c == '\n' || c == '\r') break;
    end++;
  }

  String val = json.substring(idx, end);
  val.trim();

  if (val.length() == 0 || val == "null") return defaultValue;
  return val.toInt();
}

// ===================== SERIAL COMMANDS =====================
void checkSerialCommands() {
  if (!Serial.available()) return;

  char cmd = toupper(Serial.read());

  if (cmd == 'A') {
    manualOverride = false;
    emergencyOverride = false;
    Serial.println("[CMD] AUTO");
  } else if (cmd == 'T') {
    manualOverride = true;
    emergencyOverride = false;
    setTeachingMode();
  } else if (cmd == 'P') {
    manualOverride = true;
    emergencyOverride = false;
    setPresentationMode();
  } else if (cmd == 'F') {
    manualOverride = true;
    emergencyOverride = false;
    setFocusMode();
  } else if (cmd == 'E') {
    emergencyOverride = !emergencyOverride;
    if (!emergencyOverride) {
      turnOffAll();
      Serial.println("[CMD] Emergency OFF");
    } else {
      manualOverride = false;
      Serial.println("[CMD] Emergency ON");
    }
  } else if (cmd == 'O') {
    manualOverride = true;
    emergencyOverride = false;
    turnOffAll();
    Serial.println("[CMD] OFF");
  }
}

// ===================== STATUS =====================
void printStatus(int pirState, int ldrValue) {
  Serial.print("PIR=");
  Serial.print(pirState == HIGH ? "MOTION" : "EMPTY");
  Serial.print(" | LDR=");
  Serial.print(ldrValue);
  Serial.print(" | Occupied=");
  Serial.print(roomOccupied ? "YES" : "NO");
  Serial.print(" | Mode=");
  Serial.print(getModeName(currentMode));
  Serial.print(" | Power(W)=");
  Serial.print(estimateInstantPowerW(currentOutputs), 2);
  Serial.print(" | Energy(Wh)=");
  Serial.println(totalEnergyWh, 4);
}

void printEnergySummary() {
  Serial.println("\n----- Energy Summary (Estimated) -----");
  Serial.print("OFF:             "); Serial.println(energyWhByMode[MODE_OFF], 6);
  Serial.print("TEACHING:        "); Serial.println(energyWhByMode[MODE_TEACHING], 6);
  Serial.print("ENERGY-SAVING:   "); Serial.println(energyWhByMode[MODE_ENERGY_SAVING], 6);
  Serial.print("PRESENTATION:    "); Serial.println(energyWhByMode[MODE_PRESENTATION], 6);
  Serial.print("FOCUS:           "); Serial.println(energyWhByMode[MODE_FOCUS], 6);
  Serial.print("EMERGENCY:       "); Serial.println(energyWhByMode[MODE_EMERGENCY], 6);
  Serial.print("TOTAL:           "); Serial.println(totalEnergyWh, 6);
  Serial.println("-------------------------------------\n");
}

String getModeName(int mode) {
  switch (mode) {
    case MODE_OFF: return "OFF";
    case MODE_TEACHING: return "TEACHING";
    case MODE_ENERGY_SAVING: return "ENERGY-SAVING";
    case MODE_PRESENTATION: return "PRESENTATION";
    case MODE_FOCUS: return "FOCUS";
    case MODE_EMERGENCY: return "EMERGENCY";
    default: return "UNKNOWN";
  }
}