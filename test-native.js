const { app, nativeImage } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  try {
    const trayIconPath = path.join(__dirname, 'tray-icon.png');
    console.log('Tray path:', trayIconPath);
    const trayIcon = nativeImage.createFromPath(trayIconPath);
    console.log('Image loaded:', !trayIcon.isEmpty());
    console.log('Image size:', trayIcon.getSize());
    app.quit();
  } catch (err) {
    console.error('Error during test-native:', err);
    app.quit();
  }
});
