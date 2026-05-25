const mongoose = require('mongoose');
const path = require('path');
const https = require('https');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hawknine';

// Load models
const Settings = require('./models/Settings');
const Computer = require('./models/Computer');
const Session = require('./models/Session');
const Log = require('./models/Log');
const Transaction = require('./models/Transaction');
const PageCounterReading = require('./models/PageCounterReading');
const Service = require('./models/Service');

function formatWhatsAppPhone(phone) {
    if (!phone) return '';
    let formatted = phone.trim().replace(/[\s\-()]/g, '');
    
    if (formatted.startsWith('0') && formatted.length === 10) {
        formatted = '+254' + formatted.substring(1);
    }
    if (!formatted.startsWith('+') && !formatted.startsWith('00')) {
        formatted = '+' + formatted;
    }
    if (formatted.startsWith('00')) {
        formatted = '+' + formatted.substring(2);
    }
    return formatted;
}

async function getPricing() {
    const defaultPricing = {
        computerUsage: 200,
        printBW: 10,
        printColor: 50,
        scanning: 20,
        photocopyBW: 8,
        photocopyColor: 40
    };
    try {
        let pricing = { ...defaultPricing };
        const settings = await Settings.findOne({ key: 'pricing' });
        if (settings && settings.value) {
            pricing = { ...pricing, ...settings.value };
        }
        const services = await Service.find({ isActive: true });
        for (const svc of services) {
            const cat = (svc.category || '').toLowerCase();
            const name = (svc.name || '').toLowerCase();
            if (cat === 'printing' && name.includes('b&w')) {
                pricing.printBW = svc.price;
            } else if (cat === 'printing' && name.includes('color')) {
                pricing.printColor = svc.price;
            } else if (cat === 'photocopy' && (name.includes('b&w') || name.includes('b\u0026w'))) {
                pricing.photocopyBW = svc.price;
            } else if (cat === 'photocopy' && name.includes('color')) {
                pricing.photocopyColor = svc.price;
            } else if (cat === 'scanning') {
                pricing.scanning = svc.price;
            } else if (cat === 'usage' && name.includes('computer')) {
                pricing.computerUsage = svc.price;
            }
        }
        return pricing;
    } catch (e) {
        console.error('[PRICING] Failed to get pricing:', e.message);
        return defaultPricing;
    }
}

async function testWhatsApp() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    try {
        console.log('🔍 Fetching WhatsApp Settings...');
        const settingsDoc = await Settings.findOne({ key: 'whatsapp_report' });
        if (!settingsDoc) {
            console.log('❌ No "whatsapp_report" settings found in database!');
            process.exit(1);
        }
        console.log('✅ Found WhatsApp Settings:', {
            enabled: settingsDoc.value.enabled,
            phone: settingsDoc.value.phone ? `${settingsDoc.value.phone.substring(0, 4)}...${settingsDoc.value.phone.slice(-3)}` : 'N/A',
            apikey: settingsDoc.value.apikey ? `${settingsDoc.value.apikey.substring(0, 2)}...${settingsDoc.value.apikey.slice(-2)}` : 'N/A',
            time: settingsDoc.value.time
        });

        if (!settingsDoc.value.enabled) {
            console.log('⚠️ WhatsApp reports are disabled in settings.');
        }

        const { phone, apikey } = settingsDoc.value;
        if (!phone || !apikey) {
            console.log('❌ Phone or API Key is missing from settings.');
            process.exit(1);
        }

        const formattedPhone = formatWhatsAppPhone(phone);
        console.log(`📱 Phone: "${phone}" -> Formatted: "${formattedPhone}"`);

        // Load pricing
        console.log('💵 Loading pricing...');
        const pricing = await getPricing();
        console.log('✅ Loaded pricing:', pricing);

        // Fetch today's data
        console.log('📊 Fetching today\'s data...');
        const computerDocs = await Computer.find();
        const now = new Date();
        const allComputers = computerDocs.map(c => ({
            ...c.toObject(),
            isOnline: (now - new Date(c.lastSeen)) < 45000
        }));
        
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        console.log(`   Today starts at: ${todayStart.toISOString()}`);
        
        const [todaySessions, todayPrintJobs, todayTxns, todayReadings] = await Promise.all([
            Session.find({ receivedAt: { $gte: todayStart } }),
            Log.find({ type: 'print', receivedAt: { $gte: todayStart } }),
            Transaction.find({ createdAt: { $gte: todayStart } }),
            PageCounterReading.find({ recordedAt: { $gte: todayStart } }).sort({ recordedAt: 1 })
        ]);

        console.log(`   Fetched:`);
        console.log(`   - ${allComputers.length} computers (${allComputers.filter(c => c.isOnline).length} online)`);
        console.log(`   - ${todaySessions.length} sessions`);
        console.log(`   - ${todayPrintJobs.length} print jobs`);
        console.log(`   - ${todayTxns.length} transactions`);
        console.log(`   - ${todayReadings.length} page counter readings`);

        const todaySessionRevenue = todaySessions
            .filter(s => s.type === 'LOGOUT' && s.charges)
            .reduce((sum, s) => sum + (s.charges.grandTotal || 0), 0);
            
        const todayPrintRevenue = todayPrintJobs.reduce((sum, j) => {
            const data = j.data || {};
            const sheets = data.totalSheets || ((data.totalPages || data.pages || 1) * (data.copies || 1));
            const rate = data.printType === 'color' ? pricing.printColor : pricing.printBW;
            return sum + (sheets * rate);
        }, 0);
        
        let todayPhotocopyRevenue = 0;
        let totalPhotocopies = 0;
        const printerReadings = {};
        todayReadings.forEach(r => {
            if (!printerReadings[r.printerName]) printerReadings[r.printerName] = [];
            printerReadings[r.printerName].push(r);
        });

        for (const pName in printerReadings) {
            const readings = printerReadings[pName];
            if (readings.length >= 2) {
                const first = readings[0];
                const last = readings[readings.length - 1];
                
                let diffBW = (last.withBorderBW || 0) - (first.withBorderBW || 0);
                let diffColor = (last.withBorderColor || 0) - (first.withBorderColor || 0);
                let diffTotal = last.counterValue - first.counterValue;
                
                const pLogs = todayPrintJobs.filter(j => j.hostname === last.hostname || !j.hostname);
                let pBW = 0, pColor = 0;
                pLogs.forEach(j => {
                    const data = j.data || {};
                    const sheets = data.totalSheets || ((data.totalPages || data.pages || 1) * (data.copies || 1));
                    if (data.printType === 'color') pColor += sheets;
                    else pBW += sheets;
                });
                
                let photoBW = Math.max(0, diffBW - pBW);
                let photoColor = Math.max(0, diffColor - pColor);
                
                if (diffBW === 0 && diffColor === 0) {
                    let photoTotal = Math.max(0, diffTotal - (pBW + pColor));
                    photoBW = photoTotal;
                }
                
                totalPhotocopies += (photoBW + photoColor);
                todayPhotocopyRevenue += (photoBW * (pricing.photocopyBW || 8)) + (photoColor * (pricing.photocopyColor || 40));
            }
        }
        
        const todayTaskRevenue = todayTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
        const mpesaRevenue = todayTxns.filter(t => t.paymentMethod === 'mpesa').reduce((sum, t) => sum + (t.amount || 0), 0);
        const cashRevenue = todayTaskRevenue - mpesaRevenue;
        
        const totalRevenue = todaySessionRevenue + todayPrintRevenue + todayTaskRevenue + todayPhotocopyRevenue;
        const onlineCount = allComputers.filter(c => c.isOnline).length;
        const totalSessions = todaySessions.filter(s => s.type === 'LOGIN').length;
        
        // Format report
        let report = `📊 *HawkNine Daily Report*\n`;
        report += `📅 Date: ${now.toLocaleDateString()}\n\n`;
        report += `💻 *Computers Status*\n`;
        report += `Online: ${onlineCount} / ${allComputers.length}\n\n`;
        report += `💰 *Revenue Summary*\n`;
        report += `Total Revenue: KES ${totalRevenue.toLocaleString()}\n`;
        report += `• Sessions: KES ${todaySessionRevenue.toLocaleString()}\n`;
        report += `• Printing: KES ${todayPrintRevenue.toLocaleString()}\n`;
        report += `• Photocopy: KES ${todayPhotocopyRevenue.toLocaleString()}\n`;
        report += `• Tasks/Sales: KES ${todayTaskRevenue.toLocaleString()} (Cash: KES ${cashRevenue.toLocaleString()}, M-Pesa: KES ${mpesaRevenue.toLocaleString()})\n\n`;
        report += `📈 *Usage Stats*\n`;
        report += `Total Sessions: ${totalSessions}\n`;
        report += `Print Jobs: ${todayPrintJobs.length}\n`;
        report += `Photocopies: ${totalPhotocopies}\n`;

        console.log('\n📝 Formatted Report Content:\n------------------------------');
        console.log(report);
        console.log('------------------------------\n');

        const textEncoded = encodeURIComponent(report);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(formattedPhone)}&text=${textEncoded}&apikey=${apikey}`;
        
        console.log(`🌐 Calling CallMeBot API: "https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(formattedPhone)}&text=...&apikey=${apikey.substring(0,2)}...${apikey.slice(-2)}"`);

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log('\n📥 CallMeBot Response Status:', res.statusCode);
                console.log('📥 CallMeBot Response Data:', data);
                
                const lowerData = data.toLowerCase();
                if (data.includes('queued') || data.includes('queued successfully') || data.includes('Success')) {
                    console.log('✅ SUCCESS! Message was successfully queued/sent.');
                } else if (lowerData.includes('invalid') || lowerData.includes('apikey is not valid') || lowerData.includes('api key is not valid')) {
                    console.log('❌ FAILED: CallMeBot API Key is invalid.');
                } else if (lowerData.includes('not authorized') || lowerData.includes('not registered') || lowerData.includes('allow callmebot')) {
                    console.log('❌ FAILED: Phone number not authorized. Must send authorization message first.');
                } else if (lowerData.includes('error') || lowerData.includes('wait') || lowerData.includes('limit')) {
                    console.log('❌ FAILED: CallMeBot returned an error: ' + data.replace(/<[^>]*>/g, '').trim());
                } else if (res.statusCode === 403) {
                    console.log('❌ FAILED: CallMeBot has blocked your server (403 Forbidden). CallMeBot frequently blocks VPS hosting providers (like Contabo) to prevent spam. You may need to use a different WhatsApp API or ask CallMeBot to whitelist your VPS IP.');
                } else {
                    console.log('⚠️ WARNING: Unknown/custom response content. Code: ' + res.statusCode);
                }
                process.exit(0);
            });
        }).on('error', (err) => {
            console.error('❌ HTTP Client Network Error:', err.message);
            process.exit(1);
        });

    } catch (e) {
        console.error('❌ Exception during execution:', e);
        process.exit(1);
    }
}

testWhatsApp();
