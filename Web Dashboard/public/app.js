// Connect to socket.io server
const socket = io();

// DOM elements
const deviceSelect = document.getElementById('device-select');
const currentGasValue = document.getElementById('current-gas-value');
const gasStatus = document.getElementById('gas-status');
const lastUpdateTime = document.getElementById('last-update-time');
const thresholdValue = document.getElementById('threshold-value');
const thresholdSlider = document.getElementById('threshold-slider');
const updateThresholdBtn = document.getElementById('update-threshold-btn');
const buzzerToggle = document.getElementById('buzzer-toggle');
const buzzerStatus = document.getElementById('buzzer-status');
const alertList = document.getElementById('alert-list');
const deviceId = document.getElementById('device-id');
const deviceIp = document.getElementById('device-ip');
const deviceType = document.getElementById('device-type');
const deviceLastSeen = document.getElementById('device-last-seen');
const deviceStatus = document.getElementById('device-status');
const timeRangeButtons = document.querySelectorAll('.time-range-btn');
const alertsContainer = document.getElementById('alerts-container');

// Global variables
let selectedDeviceId = null;
let gasChart = null;
let chartData = [];
let currentTimeRange = '1h'; // Default time range
let isFirstLoad = true; // Flag to track if this is the first load

// Initialize the chart
function initChart() {
  const ctx = document.getElementById('gas-history-chart').getContext('2d');
  
  // Make sure we have the chart container
  if (!ctx) {
    console.error('Could not find chart context');
    return;
  }
  
  gasChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Gas Level',
        data: [],
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        borderWidth: 2,
        pointRadius: 1,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: function(tooltipItems) {
              return moment(tooltipItems[0].parsed.x).format('YYYY-MM-DD HH:mm:ss');
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'minute',
            displayFormats: {
              minute: 'HH:mm'
            }
          },
          title: {
            display: true,
            text: 'Time'
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Gas Level'
          }
        }
      },
      animation: false,
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
  
  console.log('Chart initialized successfully');
}

// Format timestamp
function formatTime(timestamp) {
  return moment(timestamp).format('YYYY-MM-DD HH:mm:ss');
}

// Update time since last seen
function updateTimeSince(timestamp) {
  return moment(timestamp).fromNow();
}

// Update gas status indicator
function updateGasStatus(gasValue, threshold) {
  if (gasValue > threshold) {
    gasStatus.className = 'status-indicator status-danger';
    gasStatus.textContent = 'ALERT: Gas Level High!';
  } else if (gasValue > threshold * 0.8) {
    gasStatus.className = 'status-indicator status-warning';
    gasStatus.textContent = 'WARNING: Gas Level Rising';
  } else {
    gasStatus.className = 'status-indicator status-normal';
    gasStatus.textContent = 'NORMAL: Gas Level Safe';
  }
}

// Update device status indicator
function updateDeviceStatus(lastSeen) {
  const now = Date.now();
  const diff = now - lastSeen;
  
  if (diff < 2 * 60 * 1000) { // Less than 2 minutes
    deviceStatus.textContent = 'Online';
    deviceStatus.style.color = '#27ae60';
  } else if (diff < 10 * 60 * 1000) { // Less than 10 minutes
    deviceStatus.textContent = 'Idle';
    deviceStatus.style.color = '#f39c12';
  } else {
    deviceStatus.textContent = 'Offline';
    deviceStatus.style.color = '#e74c3c';
  }
}

// Filter chart data based on time range
function filterDataByTimeRange(data, range) {
  if (range === 'all') {
    return data;
  }
  
  const now = Date.now();
  let timeAgo;
  
  switch (range) {
    case '1h':
      timeAgo = now - 60 * 60 * 1000;
      break;
    case '3h':
      timeAgo = now - 3 * 60 * 60 * 1000;
      break;
    case '6h':
      timeAgo = now - 6 * 60 * 60 * 1000;
      break;
    case '24h':
      timeAgo = now - 24 * 60 * 60 * 1000;
      break;
    default:
      timeAgo = now - 60 * 60 * 1000; // Default to 1 hour
  }
  
  return data.filter(point => point.timestamp > timeAgo);
}

// Update the chart with new data
function updateChart(data) {
  if (!gasChart) {
    console.warn('Chart not initialized, attempting to initialize');
    initChart();
    if (!gasChart) return;
  }
  
  const filteredData = filterDataByTimeRange(data, currentTimeRange);
  
  gasChart.data.datasets[0].data = filteredData.map(point => ({
    x: point.timestamp,
    y: point.value
  }));
  
  try {
    gasChart.update();
    console.log(`Chart updated with ${filteredData.length} data points`);
  } catch (error) {
    console.error('Error updating chart:', error);
  }
}

function addAlert(alert) {
    // Update the alert list UI (keep this unchanged)
    const alertItem = createAlertElement(alert);
    
    // Remove "No alerts" message if it exists
    const noAlerts = alertList.querySelector('.no-alerts');
    if (noAlerts) {
      alertList.removeChild(noAlerts);
    }
    
    // Add to the beginning of the list
    if (alertList.firstChild) {
      alertList.insertBefore(alertItem, alertList.firstChild);
    } else {
      alertList.appendChild(alertItem);
    }
    
    // Limit the number of alerts shown
    if (alertList.children.length > 20) {
      alertList.removeChild(alertList.lastChild);
    }
    
    // ONLY save to Firebase if it's from the backend (socket.io alert event)
    if (alert.fromSocket) {
      saveAlertToFirebase(alert);
    }
    
    // Show notification (keep this unchanged)
    if (!alert.fromFirebase) {
      showAlertNotification(alert);
    }
}

// Create alert element
function createAlertElement(alert) {
  const alertItem = document.createElement('div');
  alertItem.className = 'alert-item';
  
  const alertTime = document.createElement('div');
  alertTime.className = 'alert-time';
  alertTime.textContent = formatTime(alert.timestamp);
  
  const alertValue = document.createElement('div');
  alertValue.className = 'alert-value';
  alertValue.textContent = `Gas Level: ${alert.value} (Threshold: ${alert.threshold})`;
  
  alertItem.appendChild(alertTime);
  alertItem.appendChild(alertValue);
  
  return alertItem;
}

// Save alert to Firebase
function saveAlertToFirebase(alert) {
  if (!alert.deviceId) return;
  
  const alertData = {
    timestamp: alert.timestamp,
    value: alert.value,
    threshold: alert.threshold,
    deviceId: alert.deviceId
  };
  
  // Save to Firebase
  dbRefs.alerts.child(alert.deviceId).push(alertData)
    .then(() => {
      console.log('Alert saved to Firebase');
    })
    .catch(error => {
      console.error('Error saving alert to Firebase:', error);
    });
}

// Show alert notification
function showAlertNotification(alert) {
  const notification = document.createElement('div');
  notification.className = 'alert-notification';
  notification.innerHTML = `
    <strong>Gas Alert!</strong>
    <p>Level: ${alert.value}</p>
    <p>Time: ${formatTime(alert.timestamp)}</p>
  `;
  
  alertsContainer.appendChild(notification);
  
  // Remove notification after 5 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => {
      alertsContainer.removeChild(notification);
    }, 500);
  }, 5000);
}

// Load alerts from Firebase
function loadAlertsFromFirebase(deviceId) {
  // Clear existing alerts
  alertList.innerHTML = '';
  
  // Query alerts for this device
  dbRefs.alerts.child(deviceId).limitToLast(20).once('value')
    .then(snapshot => {
      const alerts = snapshot.val();
      
      if (!alerts) {
        // No alerts found
        const noAlertsElement = document.createElement('div');
        noAlertsElement.className = 'no-alerts';
        noAlertsElement.textContent = 'No alerts recorded';
        alertList.appendChild(noAlertsElement);
        return;
      }
      
      // Convert to array and sort by timestamp (latest first)
      const alertsArray = Object.values(alerts).map(alert => ({
        ...alert,
        fromFirebase: true // Mark as loaded from Firebase
      }));
      
      alertsArray.sort((a, b) => b.timestamp - a.timestamp);
      
      // Add each alert to the UI
      alertsArray.forEach(alert => addAlert(alert));
      
      console.log(`Loaded ${alertsArray.length} alerts from Firebase`);
    })
    .catch(error => {
      console.error('Error loading alerts from Firebase:', error);
    });
}

// Save sensor data to Firebase
function saveSensorDataToFirebase(deviceId, data) {
  if (!deviceId) return;
  
  // Save to Firebase under device ID
  dbRefs.sensorData.child(deviceId).push({
    timestamp: data.timestamp,
    value: data.value
  })
    .then(() => {
      console.log('Sensor data saved to Firebase');
    })
    .catch(error => {
      console.error('Error saving sensor data to Firebase:', error);
    });
}

// Load sensor data from Firebase
function loadSensorDataFromFirebase(deviceId) {
  // Reset chart data
  chartData = [];
  
  // Query sensor data for this device
  dbRefs.sensorData.child(deviceId).limitToLast(1000).once('value')
    .then(snapshot => {
      const sensorData = snapshot.val();
      
      if (!sensorData) {
        console.log('No sensor data found in Firebase');
        return;
      }
      
      // Convert to array and sort by timestamp
      const dataArray = Object.values(sensorData).map(data => ({
        timestamp: data.timestamp,
        value: data.value
      }));
      
      dataArray.sort((a, b) => a.timestamp - b.timestamp);
      
      // Update chart data
      chartData = dataArray;
      
      // Update chart
      updateChart(chartData);
      
      // Update current gas value with the most recent reading if available
      if (chartData.length > 0) {
        const latestReading = chartData[chartData.length - 1];
        currentGasValue.textContent = latestReading.value;
        lastUpdateTime.textContent = `Last update: ${formatTime(latestReading.timestamp)}`;
        updateGasStatus(latestReading.value, parseInt(thresholdValue.textContent));
      }
      
      console.log(`Loaded ${chartData.length} sensor data points from Firebase`);
    })
    .catch(error => {
      console.error('Error loading sensor data from Firebase:', error);
    });
}

// Save device settings to Firebase
function saveSettingsToFirebase(deviceId, settings) {
  if (!deviceId) return;
  
  dbRefs.settings.child(deviceId).set(settings)
    .then(() => {
      console.log('Settings saved to Firebase');
    })
    .catch(error => {
      console.error('Error saving settings to Firebase:', error);
    });
}

// Load device settings from Firebase
function loadSettingsFromFirebase(deviceId) {
  dbRefs.settings.child(deviceId).once('value')
    .then(snapshot => {
      const settings = snapshot.val();
      
      if (!settings) {
        console.log('No settings found in Firebase');
        return;
      }
      
      // Update UI with settings
      thresholdValue.textContent = settings.threshold;
      thresholdSlider.value = settings.threshold;
      buzzerToggle.checked = settings.buzzerEnabled;
      buzzerStatus.textContent = settings.buzzerEnabled ? 'Enabled' : 'Disabled';
      
      console.log('Settings loaded from Firebase:', settings);
    })
    .catch(error => {
      console.error('Error loading settings from Firebase:', error);
    });
}

// Save device info to Firebase
function saveDeviceToFirebase(device) {
  if (!device || !device.deviceId) return;
  
  dbRefs.devices.child(device.deviceId).set(device)
    .then(() => {
      console.log('Device info saved to Firebase');
    })
    .catch(error => {
      console.error('Error saving device info to Firebase:', error);
    });
}

// Load device data
async function loadDeviceData(deviceId) {
  try {
    // Load device settings
    const settingsResponse = await fetch(`/api/settings/${deviceId}`);
    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();
      thresholdValue.textContent = settings.threshold;
      thresholdSlider.value = settings.threshold;
      buzzerToggle.checked = settings.buzzerEnabled;
      buzzerStatus.textContent = settings.buzzerEnabled ? 'Enabled' : 'Disabled';
      
      // Save settings to Firebase
      saveSettingsToFirebase(deviceId, settings);
      console.log('Loaded device settings:', settings);
    }
    
    // Load historical data
    // First try to load from Firebase
    loadSensorDataFromFirebase(deviceId);
    
    // Load alert history from Firebase
    loadAlertsFromFirebase(deviceId);
    
    // Also load from server for the latest data
    const dataResponse = await fetch(`/api/data/${deviceId}`);
    if (dataResponse.ok) {
      const serverData = await dataResponse.json();
      console.log(`Loaded ${serverData.length} historical data points from server`);
      
      // Merge with data from Firebase if needed
      if (chartData.length === 0) {
        chartData = serverData;
        updateChart(chartData);
      }
      
      // Update current gas value with the most recent reading if available
      if (serverData.length > 0) {
        const latestReading = serverData[serverData.length - 1];
        currentGasValue.textContent = latestReading.value;
        lastUpdateTime.textContent = `Last update: ${formatTime(latestReading.timestamp)}`;
        updateGasStatus(latestReading.value, parseInt(thresholdValue.textContent));
      }
    }
  } catch (error) {
    console.error('Error loading device data:', error);
  }
}

// Update device selection
function updateDeviceSelection(devices) {
  // Clear existing options
  deviceSelect.innerHTML = '';
  
  if (devices.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No devices available';
    option.disabled = true;
    option.selected = true;
    deviceSelect.appendChild(option);
  } else {
    devices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = `${device.type} (${device.deviceId.substring(0, 8)}...)`;
      deviceSelect.appendChild(option);
      
      // Save device info to Firebase
      saveDeviceToFirebase(device);
      
      // Select the first device or previously selected device
      if (selectedDeviceId === device.deviceId || (!selectedDeviceId && device === devices[0])) {
        option.selected = true;
        selectedDeviceId = device.deviceId;
        updateDeviceInfo(device);
      }
    });
    
    // Load data for the selected device
    if (selectedDeviceId) {
      loadDeviceData(selectedDeviceId);
    }
  }
}

// Update device info display
function updateDeviceInfo(device) {
  deviceId.textContent = device.deviceId;
  deviceIp.textContent = device.ipAddress;
  deviceType.textContent = device.type;
  deviceLastSeen.textContent = updateTimeSince(device.lastSeen);
  updateDeviceStatus(device.lastSeen);
  
  // Clear previous interval if any
  if (window.deviceUpdateInterval) {
    clearInterval(window.deviceUpdateInterval);
  }
  
  // Update device last seen and status every minute
  window.deviceUpdateInterval = setInterval(() => {
    deviceLastSeen.textContent = updateTimeSince(device.lastSeen);
    updateDeviceStatus(device.lastSeen);
  }, 60000);
}

// Load devices from Firebase
function loadDevicesFromFirebase() {
  dbRefs.devices.once('value')
    .then(snapshot => {
      const devices = snapshot.val();
      
      if (!devices) {
        console.log('No devices found in Firebase');
        return;
      }
      
      // Convert to array
      const devicesArray = Object.values(devices);
      console.log(`Loaded ${devicesArray.length} devices from Firebase`);
      
      // Update device selection
      updateDeviceSelection(devicesArray);
    })
    .catch(error => {
      console.error('Error loading devices from Firebase:', error);
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing application');
  
  // Initialize chart
  setTimeout(() => {
    initChart(); // Delay chart initialization to ensure DOM is fully loaded
  }, 100);
  
  // Load devices from Firebase first
  loadDevicesFromFirebase();
  
  // Device selection change
  deviceSelect.addEventListener('change', (e) => {
    selectedDeviceId = e.target.value;
    console.log('Selected device:', selectedDeviceId);
    
    // Get the selected device info
    fetch('/api/devices')
      .then(response => response.json())
      .then(devices => {
        const device = devices.find(d => d.deviceId === selectedDeviceId);
        if (device) {
          updateDeviceInfo(device);
          loadDeviceData(selectedDeviceId);
        }
      });
  });
  
  // Update threshold button
  updateThresholdBtn.addEventListener('click', () => {
    if (!selectedDeviceId) return;
    
    const newThreshold = parseInt(thresholdSlider.value);
    console.log('Updating threshold to:', newThreshold);
    
    fetch(`/api/settings/${selectedDeviceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ threshold: newThreshold })
    })
      .then(response => response.json())
      .then(settings => {
        thresholdValue.textContent = settings.threshold;
        
        // Save settings to Firebase
        saveSettingsToFirebase(selectedDeviceId, settings);
        
        console.log('Threshold updated:', settings.threshold);
      })
      .catch(error => {
        console.error('Error updating threshold:', error);
      });
  });
  
  // Toggle buzzer/LED 
  buzzerToggle.addEventListener('change', () => {
    if (!selectedDeviceId) return;
    
    const isEnabled = buzzerToggle.checked;
    console.log('Setting buzzer/LED to:', isEnabled ? 'enabled' : 'disabled');
    
    fetch(`/api/settings/${selectedDeviceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ buzzerEnabled: isEnabled })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to update buzzer settings');
        }
        return response.json();
      })
      .then(settings => {
        buzzerStatus.textContent = settings.buzzerEnabled ? 'Enabled' : 'Disabled';
        
        // Save settings to Firebase
        saveSettingsToFirebase(selectedDeviceId, settings);
        
        console.log('Buzzer/LED:', settings.buzzerEnabled ? 'enabled' : 'disabled');
      })
      .catch(error => {
        console.error('Error toggling buzzer/LED:', error);
        // Revert toggle state on error
        buzzerToggle.checked = !isEnabled;
        buzzerStatus.textContent = !isEnabled ? 'Enabled' : 'Disabled';
      });
  });
  
  // Time range buttons
  timeRangeButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons
      timeRangeButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      button.classList.add('active');
      
      // Update time range and chart
      currentTimeRange = button.dataset.range;
      console.log('Changed time range to:', currentTimeRange);
      updateChart(chartData);
    });
  });
  
  // Load initial devices list from server if needed
  fetch('/api/devices')
    .then(response => response.json())
    .then(devices => {
      console.log(`Loaded ${devices.length} devices from server`);
      updateDeviceSelection(devices);
    })
    .catch(error => {
      console.error('Error loading devices from server:', error);
    });
});

// Socket.IO event handlers
socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('deviceUpdate', ({ devices }) => {
  console.log(`Received device update with ${devices.length} devices`);
  updateDeviceSelection(devices);
});

// Complete the Firebase integration code that was cut off

socket.on('newData', ({ deviceId, data }) => {
    if (deviceId !== selectedDeviceId) return;
    
    console.log('Received new data point:', data);
    
    // Update current gas value
    currentGasValue.textContent = data.value;
    lastUpdateTime.textContent = `Last update: ${formatTime(data.timestamp)}`;
    
    // Update status indicator
    updateGasStatus(data.value, parseInt(thresholdValue.textContent));
    
    // Add to chart data
    chartData.push(data);
    
    // Limit data points to prevent memory issues on client
    if (chartData.length > 1000) {
      chartData.shift();
    }
    
    // Update chart
    updateChart(chartData);
    
    // Save data point to Firebase
    saveSensorDataToFirebase(deviceId, data);
    
    // Check if value exceeds threshold and handle alert if needed
    const threshold = parseInt(thresholdValue.textContent);
    if (data.value > threshold) {
        const alert = {
          deviceId,
          value: data.value,
          threshold: threshold,
          timestamp: data.timestamp,
          fromSocket: false // This will prevent Firebase save
        };
        addAlert(alert);
    }
  });
  
  socket.on('settingsUpdate', ({ deviceId, settings }) => {
    if (deviceId !== selectedDeviceId) return;
    
    console.log('Received settings update:', settings);
    
    // Update threshold display
    thresholdValue.textContent = settings.threshold;
    thresholdSlider.value = settings.threshold;
    
    // Update buzzer status
    buzzerToggle.checked = settings.buzzerEnabled;
    buzzerStatus.textContent = settings.buzzerEnabled ? 'Enabled' : 'Disabled';
    
    // Save settings to Firebase
    saveSettingsToFirebase(deviceId, settings);
  });
  
  socket.on('alert', (alert) => {
    if (alert.deviceId !== selectedDeviceId) return;
    
    console.log('Received alert:', alert);
    // Mark this as coming from socket.io to prevent duplicate Firebase saves
    alert.fromSocket = true;
    addAlert(alert);
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
  
  // Initialize Firebase
  // Note: You should replace these with your actual Firebase configuration details
  const firebaseConfig = {
    //your-firebase-project-configuration
  };
  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  
  // Set up database references
  const dbRefs = {
    devices: firebase.database().ref('devices'),
    sensorData: firebase.database().ref('sensorData'),
    settings: firebase.database().ref('settings'),
    alerts: firebase.database().ref('alerts')
  };
  
  // Listen for Firebase auth state changes
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      console.log('User signed in:', user.email);
      // You could add user-specific logic here
    } else {
      console.log('No user signed in');
      // You could redirect to login or use anonymous auth here
      // For simplicity, using anonymous auth
      firebase.auth().signInAnonymously()
        .catch(error => {
          console.error('Error signing in anonymously:', error);
        });
    }
  });
  
  // You may want to add this script tag to your HTML file:
  // <!-- Add Firebase scripts -->
  // <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
  // <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
  // <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>
