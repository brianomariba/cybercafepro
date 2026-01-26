const { exec } = require('child_process');

let previousDevices = [];

/**
 * Fetches connected USB storage devices using PowerShell
 * Compares with previous state to detect new connections
 */
function getUsbDevices() {
    return new Promise((resolve) => {
        const psCommand = `Get-WmiObject Win32_DiskDrive | Where-Object { $_.InterfaceType -eq 'USB' } | Select-Object DeviceID, Caption, Size | ConvertTo-Json`;

        exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve({ current: [], newDevices: [] });
                return;
            }

            try {
                const parsed = JSON.parse(stdout);
                const devices = Array.isArray(parsed) ? parsed : [parsed];

                const normalizedDevices = devices.filter(d => d).map(d => ({
                    id: d.DeviceID,
                    name: d.Caption,
                    size: d.Size ? Math.round(d.Size / (1024 * 1024 * 1024)) + ' GB' : 'Unknown'
                }));

                // Detect new devices
                const previousIds = previousDevices.map(d => d.id);
                const newDevices = normalizedDevices.filter(d => !previousIds.includes(d.id));

                previousDevices = normalizedDevices;

                resolve({
                    current: normalizedDevices,
                    newDevices: newDevices
                });
            } catch (e) {
                resolve({ current: [], newDevices: [] });
            }
        });
    });
}

/**
 * Resets the device tracking state (call on session start)
 */
function resetDeviceTracking() {
    previousDevices = [];
}

module.exports = { getUsbDevices, resetDeviceTracking };
