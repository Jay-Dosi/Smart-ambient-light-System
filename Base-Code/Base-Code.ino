// --- Smart Classroom Lighting System (Local/Serial Version) ---
// Controller: ESP32-C6

// --- GPIO Pin Definitions ---
const int PIR_PIN = 2;
const int LDR_PIN = 3;
const int ROW1_PIN = 4;
const int ROW2_PIN = 5;
const int ROW3_PIN = 6;
const int RED_LED = 7;     // Emergency
const int YELLOW_LED = 10; // Presentation
const int BLUE_LED = 11;   // Focus
const int GREEN_LED = 16;  // Energy-saving
const int BUZZER_PIN = 17;
const int WHITE_LED = 18;  // Teaching/Normal

// --- System Variables ---
int currentMode = 0; // 0:Off, 1:Teaching, 2:Energy-saving, 3:Presentation, 4:Focus, 5:Emergency
bool emergencyOverride = false;
bool manualOverride = false; 

// LDR Thresholds (0-4095 for ESP32 ADC)
const int LDR_DARK = 1000;
const int LDR_BRIGHT = 3000;

unsigned long lastPrintTime = 0;

void setup() {
  Serial.begin(115200);
  
  // --- NATIVE USB FIX ---
  // Wait for the ESP32-C6 native USB port to initialize before printing
  while (!Serial) {
    delay(10); 
  }
  delay(1000); // Give it one extra second to settle
  
  Serial.println("\n====================================================");
  Serial.println("   Smart Classroom Lighting System (Local Mode)     ");
  Serial.println("====================================================");
  Serial.println("Serial Commands Available:");
  Serial.println(" 'A' - Automatic Mode (Sensor Based)");
  Serial.println(" 'T' - Manual Override: Teaching Mode");
  Serial.println(" 'P' - Manual Override: Presentation Mode");
  Serial.println(" 'F' - Manual Override: Focus Mode");
  Serial.println(" 'E' - Toggle Emergency Override");
  Serial.println("----------------------------------------------------\n");

  // Initialize Output Pins
  pinMode(ROW1_PIN, OUTPUT);
  pinMode(ROW2_PIN, OUTPUT);
  pinMode(ROW3_PIN, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(BLUE_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(WHITE_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Initialize Input Pins
  pinMode(PIR_PIN, INPUT);
  
  turnOffAll();
}

void loop() {
  int pirState = digitalRead(PIR_PIN);
  int ldrValue = analogRead(LDR_PIN);
  
  // 1. Check for incoming Serial commands
  checkSerialCommands();

  // 2. Process System Logic
  if (!manualOverride) {
    if (emergencyOverride) {
      setEmergencyMode();
    } 
    else if (pirState == HIGH) { // Room Occupied
      if (ldrValue > LDR_BRIGHT) {
        setEnergySavingMode(ldrValue);
      } else {
        setTeachingMode();
      }
    } 
    else { // Room Empty
      if (currentMode != 0) {
        Serial.println("[AUTO] Room empty. Turning off all lights.");
      }
      turnOffAll();
      currentMode = 0;
    }
  } else if (emergencyOverride) {
     // Emergency still overrides manual modes
     setEmergencyMode();
  }

  // 3. Print telemetry to Serial Monitor every 2 seconds
  if (millis() - lastPrintTime > 2000) {
    Serial.print("Sensors -> PIR: ");
    Serial.print(pirState == HIGH ? "MOTION " : "EMPTY  ");
    Serial.print("| LDR: ");
    Serial.print(ldrValue);
    Serial.print("\t| Buzzer: ");
    Serial.print(digitalRead(BUZZER_PIN) == HIGH ? "ON " : "OFF");
    Serial.print("\t| Active Mode: ");
    Serial.println(getModeName(currentMode));
    lastPrintTime = millis();
  }
}

// --- Mode Functions ---

void setTeachingMode() {
  if (currentMode != 1) Serial.println("[MODE] Switching to TEACHING Mode");
  currentMode = 1;
  resetIndicators();
  digitalWrite(WHITE_LED, HIGH);
  
  // All rows ON full brightness
  analogWrite(ROW1_PIN, 255);
  analogWrite(ROW2_PIN, 255);
  analogWrite(ROW3_PIN, 255);
}

void setEnergySavingMode(int ldrValue) {
  if (currentMode != 2) Serial.println("[MODE] Switching to ENERGY-SAVING Mode");
  currentMode = 2;
  resetIndicators();
  digitalWrite(GREEN_LED, HIGH);
  
  // Calculate dimming based on ambient light
  int brightness = map(ldrValue, LDR_DARK, 4095, 255, 50);
  brightness = constrain(brightness, 50, 255);
  
  analogWrite(ROW1_PIN, brightness);
  analogWrite(ROW2_PIN, brightness);
  analogWrite(ROW3_PIN, brightness);
}

void setPresentationMode() {
  if (currentMode != 3) Serial.println("[MODE] Switching to PRESENTATION Mode");
  currentMode = 3;
  resetIndicators();
  digitalWrite(YELLOW_LED, HIGH);
  
  analogWrite(ROW1_PIN, 0);   // Front row OFF for projector
  analogWrite(ROW2_PIN, 100); // Middle dimmed
  analogWrite(ROW3_PIN, 100); // Back dimmed
}

void setFocusMode() {
  if (currentMode != 4) Serial.println("[MODE] Switching to FOCUS Mode");
  currentMode = 4;
  resetIndicators();
  digitalWrite(BLUE_LED, HIGH);
  
  analogWrite(ROW1_PIN, 150);
  analogWrite(ROW2_PIN, 150);
  analogWrite(ROW3_PIN, 150);
}

void setEmergencyMode() {
  if (currentMode != 5) Serial.println("!!! EMERGENCY MODE ACTIVATED !!!");
  currentMode = 5;
  
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(BLUE_LED, LOW);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(WHITE_LED, LOW);
  
  // Blink Red LED, Buzzer, and All Rows
  unsigned long currentMillis = millis();
  if ((currentMillis / 500) % 2 == 0) {
    digitalWrite(RED_LED, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
    analogWrite(ROW1_PIN, 255);
    analogWrite(ROW2_PIN, 255);
    analogWrite(ROW3_PIN, 255);
  } else {
    digitalWrite(RED_LED, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    analogWrite(ROW1_PIN, 0);
    analogWrite(ROW2_PIN, 0);
    analogWrite(ROW3_PIN, 0);
  }
}

void turnOffAll() {
  analogWrite(ROW1_PIN, 0);
  analogWrite(ROW2_PIN, 0);
  analogWrite(ROW3_PIN, 0);
  resetIndicators();
}

void resetIndicators() {
  digitalWrite(RED_LED, LOW);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(BLUE_LED, LOW);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(WHITE_LED, LOW);
  digitalWrite(BUZZER_PIN, LOW);
}

// --- Utility Functions ---

void checkSerialCommands() {
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    cmd = toupper(cmd); // Handle lowercase inputs
    
    if (cmd == 'E') { 
      emergencyOverride = !emergencyOverride; 
      if (!emergencyOverride) {
        Serial.println("[CMD] Emergency Disabled");
        resetIndicators(); // Ensure buzzer turns off immediately
      }
    }
    else if (cmd == 'A') { 
      manualOverride = false; 
      emergencyOverride = false; 
      Serial.println("[CMD] Manual Override Disabled -> Returning to AUTOMATIC MODE"); 
    }
    else if (cmd == 'P') { 
      manualOverride = true; 
      emergencyOverride = false;
      Serial.println("[CMD] Manual Override -> PRESENTATION"); 
      setPresentationMode(); 
    }
    else if (cmd == 'F') { 
      manualOverride = true; 
      emergencyOverride = false;
      Serial.println("[CMD] Manual Override -> FOCUS"); 
      setFocusMode(); 
    }
    else if (cmd == 'T') { 
      manualOverride = true; 
      emergencyOverride = false;
      Serial.println("[CMD] Manual Override -> TEACHING"); 
      setTeachingMode(); 
    }
  }
}

String getModeName(int mode) {
  switch(mode) {
    case 0: return "OFF";
    case 1: return "TEACHING";
    case 2: return "ENERGY-SAVING";
    case 3: return "PRESENTATION";
    case 4: return "FOCUS";
    case 5: return "EMERGENCY";
    default: return "UNKNOWN";
  }
}