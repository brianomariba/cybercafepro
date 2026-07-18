const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

// target 1: generateWhatsAppReportMessage
const t1start = 'async function generateWhatsAppReportMessage(settings) {';
const t1end = `    const generalSettings = generalSettingsDoc ? generalSettingsDoc.value : { cafeName: 'CyberCafe Pro' };`;

const idx1 = content.indexOf(t1start);
if (idx1 === -1) process.exit(1);
const idx2 = content.indexOf(t1end, idx1);
const fullBlock1 = content.substring(idx1, idx2 + t1end.length);

const replacement1 = `async function generateWhatsAppReportMessage(settings) {
    const computerDocs = await Computer.find();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [todaySessions, todayPrintJobs, transactions, generalSettingsDoc, inventoryItems] = await Promise.all([
        Session.find({ receivedAt: { $gte: todayStart } }),
        Log.find({ type: 'print', receivedAt: { $gte: todayStart } }),
        Transaction.find({ createdAt: { $gte: todayStart } }),
        Settings.findOne({ key: 'generalSettings' }),
        settings.includeInventoryData ? InventoryItem.find({ isActive: true }) : Promise.resolve([])
    ]);
    
    const generalSettings = generalSettingsDoc ? generalSettingsDoc.value : { cafeName: 'CyberCafe Pro' };`;

content = content.replace(fullBlock1, replacement1);

// target 2: Add to reportMessage
const t2start = '    if (settings.includeStatusDiscrepancy !== false) {';
const t2end = '    reportMessage += `*Powered by HawkNine*`;';

const idxt1 = content.indexOf(t2start, idx2);
if (idxt1 === -1) process.exit(2);
const idxt2 = content.indexOf(t2end, idxt1);
const fullBlock2 = content.substring(idxt1, idxt2 + t2end.length);

const replacement2 = `    if (settings.includeStatusDiscrepancy !== false) {
        reportMessage += \`⚖️ *Status:*\\n\` +
            \`• Discrepancy: KSH 0 (Balanced)\\n\\n\`;
    }

    if (settings.includeInventoryData && inventoryItems && inventoryItems.length > 0) {
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
    }

    reportMessage += \`*Powered by HawkNine*\`;`;

content = content.replace(fullBlock2, replacement2);

fs.writeFileSync('server.js', content, 'utf8');
console.log('Success');
