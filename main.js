const { app, Tray, Menu, BrowserWindow, screen, dialog, nativeImage, ipcMain } = require('electron');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let tray = null;
let mainWindow = null;
let isAdmin = false;

// Disk Space Cache (to avoid spawning PowerShell cmdlets frequently)
let lastDiskStats = { freeGB: '0', totalGB: '0', percent: 0 };

// Check if running as Administrator
function checkAdminPrivileges() {
  return new Promise((resolve) => {
    exec('net session', (err) => {
      isAdmin = !err;
      resolve(isAdmin);
    });
  });
}

// Relaunch Electron with Administrator privileges
function relaunchAsAdmin() {
  const isPackaged = app.isPackaged;
  let cmd = '';
  
  if (isPackaged) {
    cmd = `Start-Process -FilePath '${process.execPath}' -Verb RunAs`;
  } else {
    cmd = `Start-Process -FilePath '${process.execPath}' -ArgumentList '${app.getAppPath()}' -Verb RunAs`;
  }
  
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd}"`, (err) => {
    if (!err) {
      app.quit();
    } else {
      dialog.showErrorBox('Elevation Failed', 'Could not relaunch the application with Administrator privileges.');
    }
  });
}

// Get CPU usage percentage over a 200ms sample
function getCPUUsage() {
  return new Promise((resolve) => {
    const start = getCPUTimes();
    setTimeout(() => {
      const end = getCPUTimes();
      const idleDiff = end.idle - start.idle;
      const totalDiff = end.total - start.total;
      
      if (totalDiff === 0) return resolve(0);
      const usage = 1 - (idleDiff / totalDiff);
      resolve(Math.round(usage * 100));
    }, 200);
  });
}

function getCPUTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

// Get RAM statistics
function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const percent = Math.round((used / total) * 100);
  
  return {
    usedGB: (used / (1024 * 1024 * 1024)).toFixed(1),
    totalGB: (total / (1024 * 1024 * 1024)).toFixed(1),
    percent
  };
}

// Get System Uptime string
function getSystemUptime() {
  const seconds = os.uptime();
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  let uptimeStr = '';
  if (days > 0) uptimeStr += `${days}d `;
  if (hours > 0 || days > 0) uptimeStr += `${hours}h `;
  uptimeStr += `${minutes}m`;
  return uptimeStr;
}

// Query Disk C: space via PowerShell (cached to avoid overhead)
function refreshDiskStats() {
  const cmd = `[System.IO.DriveInfo]::GetDrives() | Where-Object {$_.Name -eq 'C:\\'} | Select-Object TotalSize, TotalFreeSpace | ConvertTo-Json`;
  
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd}"`, (err, stdout) => {
    if (err) {
      console.error('Error fetching disk space:', err.message);
      return;
    }
    
    try {
      const parsed = JSON.parse(stdout.trim());
      const data = Array.isArray(parsed) ? parsed[0] : parsed;
      
      if (data && data.TotalSize && data.TotalFreeSpace) {
        const size = parseInt(data.TotalSize);
        const free = parseInt(data.TotalFreeSpace);
        const used = size - free;
        const percent = Math.round((used / size) * 100);
        
        lastDiskStats = {
          freeGB: (free / (1024 * 1024 * 1024)).toFixed(0),
          totalGB: (size / (1024 * 1024 * 1024)).toFixed(0),
          percent
        };
      }
    } catch (parseError) {
      console.error('Error parsing disk space JSON:', parseError.message);
    }
  });
}

// Query Windows Services raw output
function fetchServicesRaw() {
  return new Promise((resolve) => {
    const cmd = `Get-Service | Select-Object Name, Status, DisplayName, StartType | ConvertTo-Json`;
    
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd}"`, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout) => {
      if (err) {
        console.error('Error fetching services raw:', err.message);
        return resolve([]);
      }
      try {
        const data = JSON.parse(stdout.trim());
        const services = Array.isArray(data) ? data : [data];
        resolve(services.filter(s => s && (s.Name || s.DisplayName)));
      } catch (parseError) {
        console.error('Error parsing services JSON in main:', parseError.message);
        resolve([]);
      }
    });
  });
}

// Fetch process memory usage of running services via local ps1 script
function fetchServiceStats() {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'get-service-stats.ps1');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout) => {
      if (err) {
        console.error('Error running get-service-stats.ps1:', err.message);
        return resolve([]);
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (parseError) {
        console.error('Error parsing service stats JSON:', parseError.message);
        resolve([]);
      }
    });
  });
}

// Create the frameless widget window
function createWidgetWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 560,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Automatically hide when clicking outside the window
  mainWindow.on('blur', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });

  // Notify renderer when window is shown
  mainWindow.on('show', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('window-visibility', true);
    }
  });

  // Notify renderer when window is hidden
  mainWindow.on('hide', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('window-visibility', false);
    }
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Toggle window visibility and position it above the tray
function toggleWindow() {
  if (!mainWindow) {
    createWidgetWindow();
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    positionWindow();
    mainWindow.show();
    mainWindow.focus();
  }
}

// Calculate position based on the tray icon bounds
function positionWindow() {
  if (!mainWindow || !tray) return;

  const trayBounds = tray.getBounds();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const windowBounds = mainWindow.getBounds();
  const windowWidth = windowBounds.width;
  const windowHeight = windowBounds.height;

  let x = 0;
  let y = 0;

  // Detect taskbar position relative to screen height/width
  if (trayBounds.y > screenHeight / 2) {
    // Bottom Taskbar
    x = trayBounds.x + (trayBounds.width / 2) - (windowWidth / 2);
    y = trayBounds.y - windowHeight - 8;
  } else if (trayBounds.y < 100) {
    // Top Taskbar
    x = trayBounds.x + (trayBounds.width / 2) - (windowWidth / 2);
    y = trayBounds.y + trayBounds.height + 8;
  } else if (trayBounds.x > screenWidth / 2) {
    // Right Taskbar
    x = trayBounds.x - windowWidth - 8;
    y = trayBounds.y + (trayBounds.height / 2) - (windowHeight / 2);
  } else {
    // Left Taskbar
    x = trayBounds.x + trayBounds.width + 8;
    y = trayBounds.y + (trayBounds.height / 2) - (windowHeight / 2);
  }

  // Constrain inside screen bounds (with padding)
  x = Math.max(10, Math.min(x, screenWidth - windowWidth - 10));
  y = Math.max(10, Math.min(y, screenHeight - windowHeight - 10));

  mainWindow.setPosition(Math.round(x), Math.round(y));
}

// IPC Handlers
ipcMain.handle('get-stats', async () => {
  const cpu = await getCPUUsage();
  const memory = getMemoryUsage();
  const uptime = getSystemUptime();
  return { cpu, memory, disk: lastDiskStats, uptime };
});

ipcMain.handle('get-services', async () => {
  const [services, stats] = await Promise.all([
    fetchServicesRaw(),
    fetchServiceStats()
  ]);

  // Create a map for fast PID and Memory lookup
  const statsMap = {};
  stats.forEach(item => {
    if (item && item.Name) {
      statsMap[item.Name.toLowerCase()] = item;
    }
  });

  // Join data
  services.forEach(s => {
    const key = (s.Name || '').toLowerCase();
    if (statsMap[key]) {
      s.ProcessId = statsMap[key].ProcessId || 0;
      s.MemoryBytes = statsMap[key].MemoryBytes || 0;
    } else {
      s.ProcessId = 0;
      s.MemoryBytes = 0;
    }
  });

  return services;
});

ipcMain.handle('execute-action', async (event, { name, displayName, action, param }) => {
  return new Promise((resolve) => {
    let cmd = '';
    
    if (action === 'Start') {
      cmd = `Start-Service -Name '${name.replace(/'/g, "''")}'`;
    } else if (action === 'Stop') {
      cmd = `Stop-Service -Name '${name.replace(/'/g, "''")}' -Force`;
    } else if (action === 'Restart') {
      cmd = `Restart-Service -Name '${name.replace(/'/g, "''")}' -Force`;
    } else if (action === 'SetStartupType') {
      cmd = `Set-Service -Name '${name.replace(/'/g, "''")}' -StartupType ${param}`;
    }

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd}"`, (err, stdout, stderr) => {
      if (err) {
        const errMsg = stderr ? stderr.trim() : err.message;
        resolve({ success: false, error: errMsg });
      } else {
        resolve({ success: true });
      }
    });
  });
});

ipcMain.handle('check-admin', async () => {
  await checkAdminPrivileges();
  return isAdmin;
});

ipcMain.on('relaunch-as-admin', () => {
  relaunchAsAdmin();
});

ipcMain.on('close-app', () => {
  app.quit();
});

// App initialization
app.whenReady().then(async () => {
  // Check admin status first; auto-elevate if running in user mode
  await checkAdminPrivileges();
  
  if (!isAdmin) {
    relaunchAsAdmin();
    return;
  }
  
  // Set up tray icon from base64 PNG (guarantees compatibility on Windows)
  const base64Icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAi0lEQVQ4T6WTwQ3AIAwDsf9OnasjMEJjQn2qiqo+c1Icx0k1KAYYwFqyN0t5EALi2kt2c1sIAXHtJTugzW0hBMS1l+yANreFEBDXXrID2twWPgTiwkt2QJvbQgiIay/ZAW1uCyEgrr1kB7S5LYSAuPaSHdDmthAC4tpLdkCb20IIiGsv2QEt+U/8J94X8QYx8wPz3yZpSQAAAABJRU5ErkJggg==';
  const trayIcon = nativeImage.createFromDataURL(base64Icon);
  tray = new Tray(trayIcon);
  tray.setToolTip('ServicePulse');
  
  // Toggle window on tray click
  tray.on('click', () => {
    toggleWindow();
  });

  // Create initial window (hidden)
  createWidgetWindow();

  // Disk background polling
  refreshDiskStats();
  setInterval(refreshDiskStats, 30000);
});

// App window cleanup
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
