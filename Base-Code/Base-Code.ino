#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ctype.h>

// ===================== WIFI + THINGSPEAK =====================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Telemetry channel: ESP32 -> ThingSpeak
const char* TS_TELEMETRY_WRITE_KEY = "YOUR_TELEMETRY_WRITE_KEY";
const long   TS_TELEMETRY_CHANNEL_ID = 1234567;

// Control channel: Frontend -> ThingSpeak -> ESP32
const char* TS_CONTROL_READ_KEY = "YOUR_CONTROL_READ_KEY";
const long   TS_CONTROL_CHANNEL_ID = 7654321;

// ThingSpeak free tier is 15s minimum update interval, so stay above that.
const unsigned long TELEMETRY_INTERVAL_MS = 20000;
const unsigned long CONTROL_POLL_INTERVAL_MS = 5000;

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

// ===================== AUTO LOGIC =====================
const unsigned long MOTION_HOLD_MS = 3UL * 60UL * 1000UL; // 3 minutes
const int LDR_DARK = 1000;
const int LDR_BRIGHT = 3000;

unsigned long lastMotionMs = 0;
bool roomOccupied = false;

// ===================== ENERGY ESTIMATION =====================
// Prototype estimates; tune after measuring your real hardware.
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
void processAutomaticLogic(int pirState, int ldrValue);
void setTeachingMode();
void setEnergySavingMode(int ldrValue);
void setPresentationMode();
void setFocusMode();
void setEmergencyMode();
void turnOffAll();
void applyOutputs(const OutputState &out);
void resetIndicators();
void accumulateEnergy();
float estimateInstantPowerW(const OutputState &out);
String getModeName(int mode);

void publishTelemetryToThingSpeak(int pirState, int ldrValue);
void pollControlFromThingSpeak();
int readThingSpeakFieldAsInt(int fieldNumber);

void printStatus(int pirState, int ldrValue);

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
  Serial.println("A = AUTO, T = TEACHING, P = PRESENTATION, F = FOCUS, E = EMERGENCY");
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
    processAutomaticLogic(pirState, ldrValue);
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
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
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
void processAutomaticLogic(int pirState, int ldrValue) {
  if (!roomOccupied) {
    if (currentMode != MODE_OFF) {
      Serial.println("[AUTO] Room empty -> lights OFF");
    }
    turnOffAll();
    currentMode = MODE_OFF;
    return;
  }

  if (ldrValue > LDR_BRIGHT) {
    setEnergySavingMode(ldrValue);
  } else {
    setTeachingMode();
  }
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

  analogWrite(ROW1_PIN, out.row1);
  analogWrite(ROW2_PIN, out.row2);
  analogWrite(ROW3_PIN, out.row3);

  digitalWrite(RED_LED,    out.red    ? HIGH : LOW);
  digitalWrite(YELLOW_LED, out.yellow ? HIGH : LOW);
  digitalWrite(BLUE_LED,   out.blue   ? HIGH : LOW);
  digitalWrite(GREEN_LED,  out.green  ? HIGH : LOW);
  digitalWrite(WHITE_LED,  out.white  ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, out.buzzer ? HIGH : LOW);
}

void resetIndicators() {
  OutputState out;
  applyOutputs(out);
}

// ===================== ENERGY =====================
void accumulateEnergy() {
  unsigned long now = millis();
  unsigned long elapsedMs = now - lastEnergyUpdateMs;
  if (elapsedMs == 0) return;

  float powerW = estimateInstantPowerW(currentOutputs);
  float hours = elapsedMs / 3600000.0f;
  float energyWh = powerW * hours;

  energyWhByMode[currentMode] += energyWh;
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

  String url = "http://api.thingspeak.com/update?api_key=";
  url += TS_TELEMETRY_WRITE_KEY;
  url += "&field1=" + String(pirState);
  url += "&field2=" + String(ldrValue);
  url += "&field3=" + String((int)currentMode);
  url += "&field4=" + String(roomOccupied ? 1 : 0);
  url += "&field5=" + String(estimateInstantPowerW(currentOutputs), 2);
  url += "&field6=" + String(totalEnergyWh, 4);
  url += "&field7=" + String(currentOutputs.row1 > 0 || currentOutputs.row2 > 0 || currentOutputs.row3 > 0 ? 1 : 0);
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

  int modeCmd = readThingSpeakFieldAsInt(1);
  int autoFlag = readThingSpeakFieldAsInt(2);
  int emergencyFlag = readThingSpeakFieldAsInt(3);

  if (emergencyFlag == 1) {
    emergencyOverride = true;
    manualOverride = false;
    return;
  }

  if (emergencyFlag == 0 && emergencyOverride) {
    emergencyOverride = false;
    turnOffAll();
  }

  if (autoFlag == 1) {
    manualOverride = false;
  } else {
    manualOverride = true;

    switch (modeCmd) {
      case 1: setTeachingMode(); break;
      case 2: setEnergySavingMode(analogRead(LDR_PIN)); break;
      case 3: setPresentationMode(); break;
      case 4: setFocusMode(); break;
      case 5: emergencyOverride = true; break;
      default: break;
    }
  }
}

int readThingSpeakFieldAsInt(int fieldNumber) {
  if (WiFi.status() != WL_CONNECTED) return 0;

  WiFiClient client;
  HTTPClient http;

  String url = "http://api.thingspeak.com/channels/";
  url += String(TS_CONTROL_CHANNEL_ID);
  url += "/fields/";
  url += String(fieldNumber);
  url += "/last.txt";

  if (strlen(TS_CONTROL_READ_KEY) > 0) {
    url += "?api_key=";
    url += TS_CONTROL_READ_KEY;
  }

  http.begin(client, url);
  int code = http.GET();
  String body = http.getString();
  http.end();

  if (code <= 0) return 0;
  body.trim();
  return body.toInt();
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