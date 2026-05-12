/**
 * Cleanup Script: Delete wrong page counter readings via the Admin API
 * 
 * Usage: node cleanup_page_counters.js YOUR_AUTH_TOKEN
 * 
 * Get your token from browser DevTools console:
 *   localStorage.getItem("token")
 */

const https = require('https');
const AUTH_TOKEN = process.argv[2] || '';

if (!AUTH_TOKEN) {
    console.log('Usage: node cleanup_page_counters.js YOUR_AUTH_TOKEN');
    console.log('Get token: browser DevTools > Console > localStorage.getItem("token")');
    process.exit(1);
}

function apiCall(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL('https://api.hawkninegroup.com/api/v1' + path);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    console.log('=== Fetching current EPSON page counter readings ===\n');
    
    const resp = await apiCall('GET', '/admin/page-counter-readings?printerName=EPSON&limit=50');
    if (resp.status !== 200) {
        console.log('ERROR:', resp.status, resp.data);
        process.exit(1);
    }
    
    const readings = resp.data.readings || [];
    console.log(`Found ${readings.length} readings:\n`);
    
    for (const r of readings) {
        console.log(`  ${r._id} | ${r.printerName} | counter=${r.counterValue} | sheets=${r.totalSheets || 'N/A'} | ${r.source}`);
    }
    
    if (readings.length === 0) {
        console.log('No readings to delete.');
        process.exit(0);
    }
    
    console.log(`\n=== Deleting all ${readings.length} readings ===\n`);
    
    let deleted = 0;
    for (const r of readings) {
        const delResp = await apiCall('DELETE', `/admin/page-counter-readings/${r._id}`);
        if (delResp.status === 200) {
            console.log(`  Deleted: ${r._id} (${r.printerName} = ${r.counterValue})`);
            deleted++;
        } else {
            console.log(`  FAILED to delete ${r._id}: ${delResp.status}`);
        }
    }
    
    console.log(`\n=== Done: Deleted ${deleted}/${readings.length} readings ===`);
    console.log('The agent will create fresh readings with corrected data.');
}

main().catch(e => console.error('Error:', e.message));
