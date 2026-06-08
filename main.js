const { app, Tray, Menu, BrowserWindow, screen, dialog, nativeImage, ipcMain, shell } = require('electron');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Global Error Handlers
process.on('uncaughtException', (error) => {
  logger.logError('Uncaught Exception in Main Process', error);
});

process.on('unhandledRejection', (reason) => {
  logger.logError('Unhandled Promise Rejection in Main Process', reason);
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

// Disable hardware acceleration to ensure stable transparent window rendering on Windows
app.disableHardwareAcceleration();

// Resolve paths for unpacked assets (get-service-stats.ps1 & tray-icon.png) in production
function getAssetPath(filename) {
  const isPackaged = app.isPackaged;
  if (isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', filename);
  }
  return path.join(__dirname, filename);
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
      logger.logInfo(`Privilege check: isAdmin = ${isAdmin}`);
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
  
  logger.logInfo(`Relaunching application as Admin. Command: ${cmd}`);
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd}"`, (err) => {
    if (!err) {
      logger.logInfo('Relaunch command successful, exiting user-privilege instance.');
      app.quit();
    } else {
      logger.logError('UAC Relaunch failed to start', err);
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
      logger.logError('Error fetching disk space stats', err);
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
      logger.logError('Error parsing disk space JSON', parseError);
    }
  });
}

// Query Windows Services raw output
function fetchServicesRaw() {
  return new Promise((resolve) => {
    const cmd = `Get-Service | Select-Object Name, Status, DisplayName, StartType | ConvertTo-Json`;
    
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd}"`, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout) => {
      if (err) {
        logger.logError('Error fetching raw services list', err);
        return resolve([]);
      }
      try {
        const data = JSON.parse(stdout.trim());
        const services = Array.isArray(data) ? data : [data];
        resolve(services.filter(s => s && (s.Name || s.DisplayName)));
      } catch (parseError) {
        logger.logError('Error parsing services JSON in main', parseError);
        resolve([]);
      }
    });
  });
}

// Fetch process memory usage of running services via local ps1 script
function fetchServiceStats() {
  return new Promise((resolve) => {
    const scriptPath = getAssetPath('get-service-stats.ps1');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout) => {
      if (err) {
        logger.logError('Error running get-service-stats.ps1', err);
        return resolve([]);
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (parseError) {
        logger.logError('Error parsing service stats JSON', parseError);
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
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Mirror renderer logs and capture errors/warnings
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || 'INFO';
    const cleanSource = sourceId ? path.basename(sourceId) : 'unknown';
    if (level === 3) {
      logger.logError(`[RENDERER] ${message} (${cleanSource}:${line})`);
    } else if (level === 2) {
      logger.logWarn(`[RENDERER] ${message} (${cleanSource}:${line})`);
    } else {
      logger.logInfo(`[RENDERER] ${message} (${cleanSource}:${line})`);
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logger.logError(`Renderer failed to load: ${errorDescription} (Code: ${errorCode}, URL: ${validatedURL})`);
  });

  mainWindow.on('unresponsive', () => {
    logger.logWarn('Renderer window became unresponsive.');
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logger.logError(`Renderer process terminated unexpectedly: reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  // Automatically hide when clicking outside the window, unless always on top (pinned) is active
  mainWindow.on('blur', () => {
    if (mainWindow) {
      try {
        if (!mainWindow.isAlwaysOnTop()) {
          mainWindow.hide();
        }
      } catch (err) {
        logger.logError('Error checking always-on-top in blur handler', err);
        mainWindow.hide();
      }
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
ipcMain.handle('is-always-on-top', () => {
  if (mainWindow) {
    return mainWindow.isAlwaysOnTop();
  }
  return true; // Default to true
});

ipcMain.handle('set-always-on-top', (event, flag) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(flag);
    return true;
  }
  return false;
});

ipcMain.handle('open-log-file', () => {
  const logPath = logger.getLogPath();
  if (logPath && fs.existsSync(logPath)) {
    shell.openPath(logPath);
    return true;
  }
  return false;
});

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
  logger.logInfo(`Executing service action: ${action} on service '${name}' (${displayName})${param ? ' with parameter: ' + param : ''}`);
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
        logger.logError(`Service action failed: ${action} on '${name}'`, new Error(errMsg));
        resolve({ success: false, error: errMsg });
      } else {
        logger.logInfo(`Service action succeeded: ${action} on '${name}'`);
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
  logger.logInfo('Application exit requested via UI.');
  app.quit();
});

// App initialization
app.whenReady().then(async () => {
  // Initialize logger
  logger.initLogger();
  logger.logInfo('ServicePulse starting...');

  // Check admin status
  await checkAdminPrivileges();
  
  // Set up tray icon from PNG file (packaged via asarUnpack so Electron can resolve path)
  const trayIconPath = getAssetPath('tray-icon.png');
  tray = new Tray(trayIconPath);
  tray.setToolTip('ServicePulse');
  
  // Toggle window on tray click
  tray.on('click', () => {
    toggleWindow();
  });

  // Create initial window (hidden)
  createWidgetWindow();

  // Show window on launch to let the user know the widget is running
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      toggleWindow();
    }
  }, 1000);

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
