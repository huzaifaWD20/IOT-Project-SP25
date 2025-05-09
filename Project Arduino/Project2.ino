#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Network credentials
const char* ssid = "Infinix SMART 6";      // Replace with your WiFi name
const char* password = "hello101";   // Replace with your WiFi password

// Server details
const char* serverUrl = "https://strong-arriving-baboon.ngrok-free.app"; // Replace with your server IP/domain
const int dataPostInterval = 5000;       // Send data every 5 seconds
const int settingsCheckInterval = 10000; // Check for new settings every 10 seconds

// Pin definitions
#define MQ2_PIN 34       // Analog input pin for MQ-2 sensor
#define BUZZER_PIN 26    // Digital output pin for buzzer

// Variables
int threshold = 800;     // Default threshold value
bool buzzerEnabled = true; // Control whether buzzer should sound
unsigned long lastDataPostTime = 0;
unsigned long lastSettingsCheckTime = 0;
String deviceId = ""; // Will store MAC address

LiquidCrystal_I2C lcd(0x27, 16, 2);  // I2C address 0x27, 16 columns, 2 rows

void setup() {
  Serial.begin(115200);
  
  // Initialize pins
  pinMode(MQ2_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Initialize LCD
  lcd.init();
  lcd.clear();
  lcd.backlight();
  
  lcd.setCursor(2, 0);
  lcd.print("Gas Detector");
  lcd.setCursor(0, 1);
  lcd.print("Connecting WiFi");
  
  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  
  // Generate device ID from MAC address
  deviceId = WiFi.macAddress();
  deviceId.replace(":", ""); // Remove colons for cleaner ID
  
  // Print ESP32 IP address
  Serial.print("Connected! IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Device ID: ");
  Serial.println(deviceId);
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("IP:");
  lcd.print(WiFi.localIP());
  delay(3000);
  
  // Register device with server
  registerDevice();
}

void loop() {
  int gasValue = analogRead(MQ2_PIN);
  
  // Update LCD with current values
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Gas: ");
  lcd.print(gasValue);
  
  lcd.setCursor(0, 1);
  lcd.print("Thres: ");
  lcd.print(threshold);

  // Handle buzzer based on gas value and buzzer enabled status
  if (gasValue > threshold && buzzerEnabled) {
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
  
  // Post data to server at regular intervals
  unsigned long currentTime = millis();
  if (currentTime - lastDataPostTime >= dataPostInterval) {
    lastDataPostTime = currentTime;
    sendSensorData(gasValue);
  }
  
  // Check for settings updates at regular intervals
  if (currentTime - lastSettingsCheckTime >= settingsCheckInterval) {
    lastSettingsCheckTime = currentTime;
    checkSettings();
  }
  
  delay(1000);
}

// Register this device with the server
void registerDevice() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Prepare the URL
    String url = String(serverUrl) + "/api/devices/register";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // Prepare JSON data
    DynamicJsonDocument doc(200);
    doc["deviceId"] = deviceId;
    doc["type"] = "gas_detector";
    doc["ipAddress"] = WiFi.localIP().toString();
    
    String requestBody;
    serializeJson(doc, requestBody);
    
    // Send POST request
    int httpResponseCode = http.POST(requestBody);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Device registered successfully");
      Serial.println(response);
    } else {
      Serial.print("Error registering device. Error code: ");
      Serial.println(httpResponseCode);
    }
    
    http.end();
  }
}

// Send sensor data to server
void sendSensorData(int gasValue) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Prepare the URL
    String url = String(serverUrl) + "/api/data";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // Prepare JSON data
    DynamicJsonDocument doc(200);
    doc["deviceId"] = deviceId;
    doc["timestamp"] = millis(); // In a real app, you might want a real timestamp
    doc["gasValue"] = gasValue;
    
    String requestBody;
    serializeJson(doc, requestBody);
    
    // Send POST request
    int httpResponseCode = http.POST(requestBody);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Data sent successfully");
    } else {
      Serial.print("Error sending data. Error code: ");
      Serial.println(httpResponseCode);
    }
    
    http.end();
  }
}

// Check for settings updates from server
void checkSettings() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Prepare the URL
    String url = String(serverUrl) + "/api/settings/" + deviceId;
    http.begin(url);
    
    // Send GET request
    int httpResponseCode = http.GET();
    
    if (httpResponseCode > 0) {
      String payload = http.getString();
      
      // Parse JSON response
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, payload);
      
      if (!error) {
        // Update settings if available
        if (doc.containsKey("threshold")) {
          int newThreshold = doc["threshold"];
          if (newThreshold != threshold) {
            threshold = newThreshold;
            Serial.print("Threshold updated to: ");
            Serial.println(threshold);
          }
        }
        
        if (doc.containsKey("buzzerEnabled")) {
          bool newBuzzerEnabled = doc["buzzerEnabled"];
          if (newBuzzerEnabled != buzzerEnabled) {
            buzzerEnabled = newBuzzerEnabled;
            Serial.print("Buzzer ");
            Serial.println(buzzerEnabled ? "enabled" : "disabled");
          }
        }
      } else {
        Serial.print("JSON parsing error: ");
        Serial.println(error.c_str());
      }
    } else {
      Serial.print("Error checking settings. Error code: ");
      Serial.println(httpResponseCode);
    }
    
    http.end();
  }
}