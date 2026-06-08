// Cache elements
const cpuRing = document.getElementById('cpu-ring');
const cpuValue = document.getElementById('cpu-value');
const ramRing = document.getElementById('ram-ring');
const ramValue = document.getElementById('ram-value');
const ramDetails = document.getElementById('ram-details');
const diskRing = document.getElementById('disk-ring');
const diskValue = document.getElementById('disk-value');
const diskDetails = document.getElementById('disk-details');
const uptimeText = document.getElementById('uptime-text');

const adminBanner = document.getElementById('admin-banner');
const elevateBtn = document.getElementById('elevate-btn');
const exitBtn = document.getElementById('exit-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const refreshBtn = document.getElementById('refresh-btn');
const pinBtn = document.getElementById('pin-btn');
const logsBtn = document.getElementById('logs-btn');

const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const filterTabs = document.querySelectorAll('.filter-tab');
const servicesList = document.getElementById('services-list');

// Configuration
const RING_CIRCUMFERENCE = 145; // 2 * pi * r (2 * 3.14159 * 23)

// In-Memory Cache
let servicesCache = [];
let activeFilter = 'all';
let searchKeyword = '';
let isAdmin = false;
let statsInterval = null;
let servicesInterval = null;
let isRefreshing = false;

// Show a glassmorphic toast notification
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = document.createElement('i');
  icon.className = type === 'success'
    ? 'fa-solid fa-circle-check toast-icon'
    : 'fa-solid fa-circle-exclamation toast-icon';

  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-message';
  msgSpan.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(msgSpan);
  container.appendChild(toast);

  // Remove toast after animation finishes (4s total)
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Initialize
async function init() {
  // Sync Always on Top state
  try {
    const isAlwaysTop = await window.api.isAlwaysOnTop();
    if (isAlwaysTop) {
      pinBtn.classList.add('active');
    } else {
      pinBtn.classList.remove('active');
    }
  } catch (err) {
    console.error('Failed to sync always on top:', err);
  }

  // Check admin rights
  isAdmin = await window.api.checkAdmin();
  if (!isAdmin) {
    adminBanner.classList.remove('hidden');
  }

  // Setup Event Listeners
  pinBtn.addEventListener('click', async () => {
    const isCurrentlyTop = pinBtn.classList.contains('active');
    const targetState = !isCurrentlyTop;
    const success = await window.api.setAlwaysOnTop(targetState);
    if (success) {
      if (targetState) {
        pinBtn.classList.add('active');
        showToast('Always on Top enabled.', 'success');
      } else {
        pinBtn.classList.remove('active');
        showToast('Always on Top disabled.', 'success');
      }
    } else {
      showToast('Failed to toggle Always on Top.', 'error');
    }
  });

  logsBtn.addEventListener('click', async () => {
    const success = await window.api.openLogFile();
    if (success) {
      showToast('Opened log file.', 'success');
    } else {
      showToast('Failed to open log file.', 'error');
    }
  });

  exitBtn.addEventListener('click', () => {
    window.api.closeApp();
  });

  minimizeBtn.addEventListener('click', () => {
    window.api.minimizeApp();
  });

  elevateBtn.addEventListener('click', () => {
    window.api.relaunchAsAdmin();
  });

  refreshBtn.addEventListener('click', async () => {
    if (isRefreshing) return;
    isRefreshing = true;
    refreshBtn.classList.add('spinning');
    
    await updateAllData();
    
    // Smooth animation duration minimum of 500ms
    setTimeout(() => {
      refreshBtn.classList.remove('spinning');
      isRefreshing = false;
    }, 500);
  });

  searchInput.addEventListener('input', (e) => {
    searchKeyword = e.target.value.toLowerCase().trim();
    if (searchKeyword.length > 0) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
    renderServicesList();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchKeyword = '';
    clearSearchBtn.classList.add('hidden');
    searchInput.focus();
    renderServicesList();
  });

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.getAttribute('data-filter');
      renderServicesList();
    });
  });

  // Listen for window visibility changes from Main Process
  window.api.onVisibilityChange((isVisible) => {
    if (isVisible) {
      updateAllData();
      startPolling();
    } else {
      stopPolling();
    }
  });

  // Initial load
  await updateAllData();
}

// Update all stats and services
async function updateAllData() {
  await Promise.all([
    updateStats(),
    updateServices()
  ]);
}

// Start polling timers when widget is active
function startPolling() {
  stopPolling(); // Clear existing to prevent duplicates
  statsInterval = setInterval(updateStats, 2000); // 2 seconds stats
  servicesInterval = setInterval(updateServices, 10000); // 10 seconds services
}

// Stop polling timers when widget is hidden to save CPU/resources
function stopPolling() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
  if (servicesInterval) {
    clearInterval(servicesInterval);
    servicesInterval = null;
  }
}

// Update stats dials
async function updateStats() {
  try {
    const stats = await window.api.getStats();
    
    // CPU
    setProgress(cpuRing, cpuValue, stats.cpu);
    
    // RAM
    setProgress(ramRing, ramValue, stats.memory.percent);
    ramDetails.textContent = `${stats.memory.usedGB}/${stats.memory.totalGB} GB`;
    
    // Disk
    setProgress(diskRing, diskValue, stats.disk.percent);
    diskDetails.textContent = `C: ${stats.disk.freeGB} GB Free`;
    
    // Uptime
    uptimeText.textContent = `Uptime: ${stats.uptime}`;
  } catch (error) {
    console.error('Error fetching stats:', error);
  }
}

// Helper to set progress on rings
function setProgress(circle, textElement, percent) {
  const offset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;
  circle.style.strokeDashoffset = offset;
  textElement.textContent = `${percent}%`;
}

// Fetch services from backend
async function updateServices() {
  try {
    const services = await window.api.getServices();
    if (services && services.length > 0) {
      servicesCache = services;
      renderServicesList();
    }
  } catch (error) {
    console.error('Error fetching services:', error);
  }
}

// Render service cards in the GUI
function renderServicesList() {
  // Filter cache
  const filtered = servicesCache.filter(s => {
    const displayName = (s.DisplayName || '').toLowerCase();
    const realName = (s.Name || '').toLowerCase();
    const pidStr = s.ProcessId ? String(s.ProcessId) : '';
    const matchesSearch = displayName.includes(searchKeyword) || 
                          realName.includes(searchKeyword) || 
                          pidStr.includes(searchKeyword);
    
    if (!matchesSearch) return false;
    
    if (activeFilter === 'running') {
      return s.Status === 4;
    } else if (activeFilter === 'stopped') {
      return s.Status !== 4;
    }
    
    return true;
  });

  if (filtered.length === 0) {
    servicesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
        <span>No services found matching your criteria.</span>
      </div>
    `;
    return;
  }

  // Build list HTML
  servicesList.innerHTML = '';
  filtered.forEach(s => {
    const isRunning = s.Status === 4;
    const startType = s.StartType; // 2=Auto, 3=Manual, 4=Disabled
    
    const card = document.createElement('div');
    card.className = 'service-card';
    
    // Header Row
    const header = document.createElement('div');
    header.className = 'service-card-header';
    
    const titleBlock = document.createElement('div');
    titleBlock.className = 'service-title-block';
    
    const dispName = document.createElement('span');
    dispName.className = 'service-display-name';
    dispName.textContent = s.DisplayName || s.Name;
    dispName.title = s.DisplayName || s.Name;
    
    const rName = document.createElement('span');
    rName.className = 'service-real-name';
    rName.textContent = s.Name;
    
    titleBlock.appendChild(dispName);
    titleBlock.appendChild(rName);
    
    // Status Badge & Usage Stats Container
    const badgeContainer = document.createElement('div');
    badgeContainer.style.display = 'flex';
    badgeContainer.style.alignItems = 'center';
    badgeContainer.style.gap = '6px';
    
    // Display Memory and PID if running and available
    if (isRunning && s.ProcessId > 0) {
      const pidLabel = document.createElement('span');
      pidLabel.className = 'pid-label';
      pidLabel.textContent = `PID: ${s.ProcessId}`;
      badgeContainer.appendChild(pidLabel);
      
      if (s.MemoryBytes > 0) {
        const memMB = (s.MemoryBytes / (1024 * 1024)).toFixed(1);
        const memBadge = document.createElement('span');
        memBadge.className = 'mem-badge';
        memBadge.textContent = `${memMB} MB`;
        badgeContainer.appendChild(memBadge);
      }
    }
    
    const badge = document.createElement('div');
    badge.className = `status-badge ${isRunning ? 'running' : 'stopped'}`;
    
    const dot = document.createElement('div');
    dot.className = 'status-dot';
    
    const stateText = document.createElement('span');
    stateText.textContent = isRunning ? 'Running' : 'Stopped';
    
    badge.appendChild(dot);
    badge.appendChild(stateText);
    
    badgeContainer.appendChild(badge);
    
    header.appendChild(titleBlock);
    header.appendChild(badgeContainer);
    
    // Actions Row
    const actions = document.createElement('div');
    actions.className = 'service-actions';
    
    // Startup dropdown
    const startupWrapper = document.createElement('div');
    startupWrapper.className = 'startup-wrapper';
    
    const select = document.createElement('select');
    select.className = 'startup-select';
    select.title = 'Startup Type';
    select.disabled = !isAdmin;
    
    const optAuto = document.createElement('option');
    optAuto.value = 'Automatic';
    optAuto.textContent = 'Automatic';
    optAuto.selected = startType === 2;
    
    const optManual = document.createElement('option');
    optManual.value = 'Manual';
    optManual.textContent = 'Manual';
    optManual.selected = startType === 3;
    
    const optDisabled = document.createElement('option');
    optDisabled.value = 'Disabled';
    optDisabled.textContent = 'Disabled';
    optDisabled.selected = startType === 4;
    
    select.appendChild(optAuto);
    select.appendChild(optManual);
    select.appendChild(optDisabled);
    startupWrapper.appendChild(select);
    
    // Start/Stop Button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `action-btn ${isRunning ? 'stop-btn' : 'start-btn'}`;
    toggleBtn.innerHTML = isRunning 
      ? '<i class="fa-solid fa-circle-stop"></i> Stop' 
      : '<i class="fa-solid fa-play"></i> Start';
    toggleBtn.disabled = !isAdmin;
    
    // Restart Button
    const restartBtn = document.createElement('button');
    restartBtn.className = 'action-btn restart-btn';
    restartBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Restart';
    restartBtn.disabled = !isAdmin || !isRunning;
    
    // Event handlers
    toggleBtn.addEventListener('click', async () => {
      setLoading(card, true);
      const action = isRunning ? 'Stop' : 'Start';
      const res = await window.api.executeAction(s.Name, s.DisplayName || s.Name, action);
      setLoading(card, false);
      if (res.success) {
        showToast(`${s.DisplayName || s.Name} has been ${action === 'Stop' ? 'stopped' : 'started'}.`, 'success');
        updateServices();
      } else {
        showToast(`Failed to ${action.toLowerCase()} service: ${res.error}`, 'error');
      }
    });

    restartBtn.addEventListener('click', async () => {
      setLoading(card, true);
      const res = await window.api.executeAction(s.Name, s.DisplayName || s.Name, 'Restart');
      setLoading(card, false);
      if (res.success) {
        showToast(`Restarted ${s.DisplayName || s.Name} successfully.`, 'success');
        updateServices();
      } else {
        showToast(`Failed to restart service: ${res.error}`, 'error');
      }
    });

    select.addEventListener('change', async () => {
      setLoading(card, true);
      const res = await window.api.executeAction(s.Name, s.DisplayName || s.Name, 'SetStartupType', select.value);
      setLoading(card, false);
      if (res.success) {
        showToast(`Startup type of ${s.DisplayName || s.Name} set to ${select.value}.`, 'success');
        updateServices();
      } else {
        showToast(`Failed to set startup type: ${res.error}`, 'error');
        // Revert selection if failed
        select.value = startType === 2 ? 'Automatic' : (startType === 3 ? 'Manual' : 'Disabled');
      }
    });

    actions.appendChild(startupWrapper);
    actions.appendChild(toggleBtn);
    actions.appendChild(restartBtn);
    
    card.appendChild(header);
    card.appendChild(actions);
    
    servicesList.appendChild(card);
  });
}

// Toggle loading spinner on action execution
function setLoading(cardElement, isLoading) {
  const buttons = cardElement.querySelectorAll('.action-btn');
  const select = cardElement.querySelector('.startup-select');
  
  if (isLoading) {
    buttons.forEach(btn => {
      btn.disabled = true;
    });
    if (select) select.disabled = true;
  } else {
    // Normal states will be restored by renderServicesList
  }
}

// Run boot sequence
document.addEventListener('DOMContentLoaded', init);
