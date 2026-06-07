# ServicePulse

[![License: MIT](https://img.shields.us/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Windows](https://img.shields.us/badge/Platform-Windows-blue.svg)](#)
[![Framework: Electron](https://img.shields.us/badge/Framework-Electron-brightgreen.svg)](https://www.electronjs.org/)

An elegant, glassmorphic Windows Taskbar Tray Widget that provides real-time system monitoring and comprehensive Windows services control directly from your system tray. 

Built with Electron (Node.js) and powered by highly optimized, non-WMI PowerShell queries, the app runs in a headless state when closed (using exactly **0% CPU** and **30MB RAM**) and reveals itself as a native, Fluent-design overlay panel when the tray icon is clicked.

---

## ✨ Features

- **Real-Time System Monitoring**: Circular dashboard rings display CPU, RAM (Memory), and Disk C:\ usage percentages alongside active system uptime.
- **Service Control Center**: Toggle states (Start/Stop) and restart Windows services instantly.
- **Startup Mode Configuration**: Configure service startup behaviors (`Automatic`, `Manual`, `Disabled`) via inline dropdown selectors.
- **Fast Live Search & Filter**: Search services instantly in-memory as you type. Narrow down results using quick filter tabs (`All`, `Running`, `Stopped`).
- **Resource-Optimized Active Polling**: When the widget is hidden, all statistical and service timers are cleared. Polling only resumes when you open the panel, protecting your system's gaming and compute performance.
- **WMI-Immunity**: Implements pure .NET assembly calls (`[System.IO.DriveInfo]`) and direct Win32 Service Controller queries (`sc.exe queryex`) to query disk space and process PIDs, bypassing common WMI-access restrictions.
- **Automatic Self-Elevation (UAC)**: Service modifications require Administrator rights. The app automatically detects privileges on launch and prompts for elevation via a standard Windows UAC dialog if started in user mode.
- **Sleek Windows 11 Fluent Design**: Frameless transparent window utilizing glassmorphism (`backdrop-filter`) and Font Awesome icons. Dismisses instantly when clicking outside.

---

## 🛠️ Architecture

```
                      +-----------------------------+
                      |      System Tray Icon       |
                      +--------------+--------------+
                                     |
                                 Left Click
                                     v
                      +--------------+--------------+
                      |      main.js (Headless)     |
                      +--------------+--------------+
                                     |
                             Spawns/Positions
                                     v
                      +--------------+--------------+
                      |  Frameless transparent Win  |
                      +--------------+--------------+
                                     |
                                Preload IPC
                                     v
                      +--------------+--------------+
                      |      index.html/css/js      |
                      +--------------+--------------+
                                     |
                        Powershell / .NET cmdlets
                                     v
                      +--------------+--------------+
                      |         Windows OS          |
                      +-----------------------------+
```

---

## 🚀 Getting Started

### Prerequisites

- **OS**: Windows 10 or 11
- **Node.js**: `v18.x` or higher (includes `npm`)

### Developer Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/service-pulse.git
   cd service-pulse
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch in development mode:
   ```bash
   npm start
   ```

---

## 📦 Building Releases

This project uses `electron-builder` to package code into Windows executables.

To compile a production release and automatically open the output `dist/` directory in Windows File Explorer:
```bash
npm run build
```

Alternatively, you can compile without automatically opening File Explorer:
```bash
npm run dist
```

To manually open the `dist/` output directory:
```bash
npm run open:dist
```

These commands package the app as a single standalone executable:
- **`dist/ServicePulse Portable.exe`**: Portable and requires **no installation**.
- **Natively Elevated**: Automatically requests Administrator privileges on startup via a Windows UAC prompt.

---

## 🤝 Contributing

Contributions are welcome! Please review the [CONTRIBUTING.md](CONTRIBUTING.md) guidelines for instructions on raising issues and opening pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
