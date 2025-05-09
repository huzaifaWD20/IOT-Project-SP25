const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const ngrok = require('@ngrok/ngrok');

// Initialize express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data storage
// In a production app, you would use a database
const dataStore = {
  devices: {},
  sensorData: {},
  settings: {}
};

// Keep limited history of sensor data
const MAX_DATA_POINTS = 100;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Device registration endpoint
app.post('/api/devices/register', (req, res) => {
  const { deviceId, type, ipAddress } = req.body;
  
  if (!deviceId) {
    return res.status(400).json({ error: 'Device ID is required' });
  }
  
  // Store device info
  dataStore.devices[deviceId] = {
    deviceId,
    type,
    ipAddress,
    lastSeen: Date.now()
  };
  
  // Initialize settings if not already set
  if (!dataStore.settings[deviceId]) {
    dataStore.settings[deviceId] = {
      threshold: 800,
      buzzerEnabled: true
    };
  }
  
  console.log(`Device registered: ${deviceId} (${type}) at ${ipAddress}`);
  io.emit('deviceUpdate', { devices: Object.values(dataStore.devices) });
  
  res.status(201).json({ 
    message: 'Device registered successfully',
    settings: dataStore.settings[deviceId]
  });
});

// Receive sensor data
app.post('/api/data', (req, res) => {
  const { deviceId, gasValue, timestamp } = req.body;
  
  if (!deviceId || gasValue === undefined) {
    return res.status(400).json({ error: 'Device ID and gas value are required' });
  }
  
  // Update device last seen time
  if (dataStore.devices[deviceId]) {
    dataStore.devices[deviceId].lastSeen = Date.now();
  }
  
  // Initialize data array if it doesn't exist
  if (!dataStore.sensorData[deviceId]) {
    dataStore.sensorData[deviceId] = [];
  }
  
  // Add data point with server timestamp
  const dataPoint = {
    value: gasValue,
    timestamp: Date.now(),
    deviceTimestamp: timestamp
  };
  
  dataStore.sensorData[deviceId].push(dataPoint);
  
  // Keep only the most recent data points
  if (dataStore.sensorData[deviceId].length > MAX_DATA_POINTS) {
    dataStore.sensorData[deviceId].shift();
  }
  
  // Emit to all connected clients
  io.emit('newData', {
    deviceId,
    data: dataPoint
  });
  
  // Check if value exceeds threshold and emit alert if needed
  if (dataStore.settings[deviceId] && 
      gasValue > dataStore.settings[deviceId].threshold) {
    io.emit('alert', {
      deviceId,
      value: gasValue,
      threshold: dataStore.settings[deviceId].threshold,
      timestamp: dataPoint.timestamp
    });
  }
  
  res.status(200).json({ message: 'Data received' });
});

// Get settings for a device
app.get('/api/settings/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  
  if (!dataStore.settings[deviceId]) {
    return res.status(404).json({ error: 'Device settings not found' });
  }
  
  res.json(dataStore.settings[deviceId]);
});

// Update settings for a device
app.post('/api/settings/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const { threshold, buzzerEnabled } = req.body;
  
  if (!dataStore.settings[deviceId]) {
    dataStore.settings[deviceId] = {};
  }
  
  // Update settings
  if (threshold !== undefined) {
    dataStore.settings[deviceId].threshold = threshold;
  }
  
  if (buzzerEnabled !== undefined) {
    dataStore.settings[deviceId].buzzerEnabled = buzzerEnabled;
  }
  
  console.log(`Updated settings for ${deviceId}:`, dataStore.settings[deviceId]);
  
  // Emit settings update to all clients
  io.emit('settingsUpdate', {
    deviceId,
    settings: dataStore.settings[deviceId]
  });
  
  res.json(dataStore.settings[deviceId]);
});

// Get data for a device
app.get('/api/data/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  
  if (!dataStore.sensorData[deviceId]) {
    return res.status(404).json({ error: 'Device data not found' });
  }
  
  res.json(dataStore.sensorData[deviceId]);
});

// Get list of devices
app.get('/api/devices', (req, res) => {
  res.json(Object.values(dataStore.devices));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Send current device list to new client
  socket.emit('deviceUpdate', { devices: Object.values(dataStore.devices) });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Simple data persistence - save to file every 5 minutes
const saveDataToFile = () => {
  const data = {
    devices: dataStore.devices,
    settings: dataStore.settings
    // We don't save sensorData as it would get too large
  };
  
  fs.writeFile(
    path.join(__dirname, 'data.json'),
    JSON.stringify(data, null, 2),
    (err) => {
      if (err) {
        console.error('Error saving data:', err);
      } else {
        console.log('Data saved to file');
      }
    }
  );
};

// Load data from file on startup
try {
  if (fs.existsSync(path.join(__dirname, 'data.json'))) {
    const data = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8')
    );
    
    dataStore.devices = data.devices || {};
    dataStore.settings = data.settings || {};
    console.log('Data loaded from file');
  }
} catch (err) {
  console.error('Error loading data from file:', err);
}

// Save data every 5 minutes
setInterval(saveDataToFile, 5 * 60 * 1000);

// Start server and ngrok tunnel
const PORT = process.env.PORT || 5000;

// Function to start ngrok tunnel
async function startNgrokTunnel() {
  try {
    // You can set your ngrok auth token here or use environment variables
    ngrok.authtoken('2tN7wAeEEWCkXU9qLexy5JrMXqT_7quY2yyPrq4baCmGmrjaX');
    
    const url = await ngrok.connect({
        addr: PORT,
        domain: "strong-arriving-baboon.ngrok-free.app", // Your static domain
        onStatusChange: status => {
          console.log(`Ngrok Status: ${status}`);
        }
    });
    
    console.log('Ngrok tunnel established at:', url);
    console.log(`You can access your application at this URL from anywhere!`);
    
    // You might want to save this URL somewhere or notify your IoT devices
    return url;
  } catch (error) {
    console.error('Error starting ngrok tunnel:', error);
    throw error;
  }
}

// Start the server and ngrok tunnel
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  try {
    const ngrokUrl = await startNgrokTunnel();
    // You could store this URL for later use
  } catch (err) {
    console.error('Failed to start ngrok tunnel. Running in local mode only.');
  }
});