const fs = require('fs');

const filePath = 'backend/server.js';
let content = fs.readFileSync(filePath, 'utf8');

// Target 1: The Promise.all array
const target1Search = `settings.includeInventoryData ? InventoryItem.find({ isActive: true }) : Promise.resolve([])`;
const target1Replace = `settings.includeInventoryData !== false ? InventoryItem.find({ isActive: true }) : Promise.resolve([])`;

content = content.replace(target1Search, target1Replace);

// Target 2: The if block
const target2Search = `    if (settings.includeInventoryData && inventoryItems && inventoryItems.length > 0) {
        reportMessage += \`📦 *Inventory Status:*\\n\`;
        const lowStock = inventoryItems.filter(i => i.stock <= (i.lowStockThreshold || 5));
        if (lowStock.length > 0) {
            reportMessage += \`⚠️ Low Stock Alerts:\\n\`;
            lowStock.slice(0, 10).forEach(i => {
                reportMessage += \`• \${i.name}: \${i.stock} left\\n\`;
            });
            if (lowStock.length > 10) reportMessage += \`• ...and \${lowStock.length - 10} more\\n\`;
        } else {
            reportMessage += \`• All stock levels are healthy.\\n\`;
        }
        reportMessage += \`\\n\`;
    }`;

const target2Replace = `    if (settings.includeInventoryData !== false) {
        reportMessage += \`📦 *Inventory Status:*\\n\`;
        if (inventoryItems && inventoryItems.length > 0) {
            const lowStock = inventoryItems.filter(i => i.stock <= (i.lowStockThreshold || 5));
            if (lowStock.length > 0) {
                reportMessage += \`⚠️ Low Stock Alerts:\\n\`;
                lowStock.slice(0, 10).forEach(i => {
                    reportMessage += \`• \${i.name}: \${i.stock} left\\n\`;
                });
                if (lowStock.length > 10) reportMessage += \`• ...and \${lowStock.length - 10} more\\n\`;
            } else {
                reportMessage += \`• All stock levels are healthy.\\n\`;
            }
        } else {
            reportMessage += \`• No active inventory items.\\n\`;
        }
        reportMessage += \`\\n\`;
    }`;

if (!content.includes(target2Search)) {
    console.error("Target 2 not found! Aborting to prevent corruption.");
    process.exit(1);
}

content = content.replace(target2Search, target2Replace);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Success');
