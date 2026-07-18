const fs = require('fs');

const filePath = 'C:/Users/Admin/OneDrive/Desktop/HawkNine/cybercafe-admin/src/pages/Settings.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Target 1: Add to default state
const t1start = `getWhatsAppReportSettings().catch(() => ({ enabled: false, phone: '', time: '18:00', includeShopName: true, includeTotalRevenue: true, includeAgentSubmissions: true, includeRevenueBreakdown: true, includeMachineRevenue: true, includeStatusDiscrepancy: true })),`;
const t1replace = `getWhatsAppReportSettings().catch(() => ({ enabled: false, phone: '', time: '18:00', includeShopName: true, includeTotalRevenue: true, includeAgentSubmissions: true, includeRevenueBreakdown: true, includeMachineRevenue: true, includeStatusDiscrepancy: true, includeInventoryData: true })),`;

if (!content.includes(t1start)) {
    console.error('Target 1 not found');
    process.exit(1);
}
content = content.replace(t1start, t1replace);

// Target 2: Add Switch in UI
const t2start = `                                            <Col xs={24} md={12}>
                                                <div className="settings-item" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div className="settings-label">
                                                        <strong>Discrepancy Status</strong>
                                                    </div>
                                                    <Switch checked={whatsappSettings.includeStatusDiscrepancy !== false} onChange={(val) => setWhatsappSettings(s => ({ ...s, includeStatusDiscrepancy: val }))} disabled={!whatsappSettings.enabled} />
                                                </div>
                                            </Col>`;

const t2replace = t2start + `
                                            <Col xs={24} md={12}>
                                                <div className="settings-item" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div className="settings-label">
                                                        <strong>Inventory Data</strong>
                                                    </div>
                                                    <Switch checked={whatsappSettings.includeInventoryData !== false} onChange={(val) => setWhatsappSettings(s => ({ ...s, includeInventoryData: val }))} disabled={!whatsappSettings.enabled} />
                                                </div>
                                            </Col>`;

if (!content.includes(t2start)) {
    console.error('Target 2 not found');
    process.exit(2);
}
content = content.replace(t2start, t2replace);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Success');
