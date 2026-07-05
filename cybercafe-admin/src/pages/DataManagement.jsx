import React, { useState, useEffect } from 'react';
import { Tabs, Button, Select, Switch, Popconfirm, message, Progress } from 'antd';
import {
  DatabaseOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
  HeartOutlined,
  PrinterOutlined,
  GlobalOutlined,
  DollarOutlined,
  BarChartOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
  DeleteOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import { Pie } from '@ant-design/charts';
import './DataManagement.css';

// Import actual API functions
import {
  deleteAllPrinterData,
  deleteAllBrowserData,
  clearAllFinanceData,
  clearAllReportsData,
  deleteAllLandingDocumentData
} from '../services/api';

const { TabPane } = Tabs;

function DataManagement() {
  const [cleaningPrinter, setCleaningPrinter] = useState(false);
  const [cleaningBrowser, setCleaningBrowser] = useState(false);
  const [cleaningFinance, setCleaningFinance] = useState(false);
  const [cleaningReports, setCleaningReports] = useState(false);
  
  // Dummy data for the chart to match the image
  const storageData = [
    { type: 'Printer Data', value: 1.20, pct: '48%', color: '#a855f7' },
    { type: 'Browser Data', value: 0.70, pct: '28%', color: '#3b82f6' },
    { type: 'Reports Data', value: 0.30, pct: '12%', color: '#f97316' },
    { type: 'Finance Data', value: 0.15, pct: '6%', color: '#22c55e' },
    { type: 'Others', value: 0.13, pct: '6%', color: '#64748b' },
  ];

  const chartConfig = {
    appendPadding: 10,
    data: storageData,
    angleField: 'value',
    colorField: 'type',
    radius: 1,
    innerRadius: 0.75,
    color: storageData.map(item => item.color),
    label: false,
    legend: false,
    interactions: [{ type: 'element-active' }],
    statistic: {
      title: false,
      content: {
        style: {
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: '#fff',
          fontSize: '14px',
          lineHeight: '1.2'
        },
        content: '2.48 GB\nof 10 GB',
      },
    },
  };

  // Handlers
  const handleCleanPrinter = async () => {
    setCleaningPrinter(true);
    try {
      const res = await deleteAllPrinterData();
      message.success(`Printer data cleared (${res.deleted?.printJobs || 0} jobs)`);
    } catch (err) {
      message.error('Failed to clear printer data');
    } finally {
      setCleaningPrinter(false);
    }
  };

  const handleCleanBrowser = async () => {
    setCleaningBrowser(true);
    try {
      const res = await deleteAllBrowserData();
      message.success(`Browser data cleared (${res.deleted?.browserLogs || 0} logs)`);
    } catch (err) {
      message.error('Failed to clear browser data');
    } finally {
      setCleaningBrowser(false);
    }
  };

  const handleCleanFinance = async () => {
    setCleaningFinance(true);
    try {
      const res = await clearAllFinanceData();
      message.success(`Finance data cleared (${res.deleted?.transactions || 0} transactions)`);
    } catch (err) {
      message.error('Failed to clear finance data');
    } finally {
      setCleaningFinance(false);
    }
  };

  const handleCleanReports = async () => {
    setCleaningReports(true);
    try {
      const res = await clearAllReportsData();
      message.success(`Reports data cleared (${res.deleted?.activityLogs || 0} logs)`);
    } catch (err) {
      message.error('Failed to clear reports data');
    } finally {
      setCleaningReports(false);
    }
  };

  const handleResetSystem = () => {
    message.warning('System reset initiated. (Not implemented in demo)');
  };

  return (
    <div className="data-management-container">
      {/* Header */}
      <div className="dm-header-wrapper">
        <div>
          <h1 className="dm-title">Data Management</h1>
          <p className="dm-subtitle">Maintain your system data and keep everything running smoothly.</p>
        </div>
        <div className="dm-header-stats">
          <div className="dm-stat-card">
            <div className="dm-stat-icon"><DatabaseOutlined /></div>
            <div className="dm-stat-info">
              <span className="dm-stat-label">Database Size</span>
              <span className="dm-stat-value">2.48 GB</span>
            </div>
          </div>
          <div className="dm-stat-card">
            <div className="dm-stat-icon"><SafetyCertificateOutlined /></div>
            <div className="dm-stat-info">
              <span className="dm-stat-label">Last Backup</span>
              <span className="dm-stat-value">Today, 02:15 AM</span>
            </div>
          </div>
          <div className="dm-stat-card">
            <div className="dm-stat-icon"><FileTextOutlined /></div>
            <div className="dm-stat-info">
              <span className="dm-stat-label">Records (Approx.)</span>
              <span className="dm-stat-value">1.2M+</span>
            </div>
          </div>
          <div className="dm-stat-card">
            <div className="dm-stat-icon" style={{ color: '#10b981' }}><HeartOutlined /></div>
            <div className="dm-stat-info">
              <span className="dm-stat-label">System Health</span>
              <span className="dm-stat-value success">Good</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultActiveKey="cleanup" className="dm-tabs">
        <TabPane tab="Data Cleanup" key="cleanup">
          
          <div className="dm-section-title">Data Cleanup</div>
          <p className="dm-section-subtitle">Remove unnecessary data and keep your system fast.</p>

          {/* 4 Cards Grid */}
          <div className="dm-cleanup-grid">
            {/* Printer Data */}
            <div className="dm-cleanup-card">
              <div className="dm-cleanup-icon-title">
                <div className="dm-cleanup-icon printer"><PrinterOutlined /></div>
                <div className="dm-cleanup-header">
                  <h3>Printer Data</h3>
                  <p>Print jobs, history and printer logs</p>
                </div>
              </div>
              <div className="dm-cleanup-records">18,452 <span>Records</span></div>
              <Popconfirm title="Clear all printer data?" onConfirm={handleCleanPrinter}>
                <button className="dm-cleanup-btn printer" disabled={cleaningPrinter}>
                  <DeleteOutlined /> {cleaningPrinter ? 'Cleaning...' : 'Clean Printer Data'}
                </button>
              </Popconfirm>
            </div>

            {/* Browser Data */}
            <div className="dm-cleanup-card">
              <div className="dm-cleanup-icon-title">
                <div className="dm-cleanup-icon browser"><GlobalOutlined /></div>
                <div className="dm-cleanup-header">
                  <h3>Browser Data</h3>
                  <p>Browsing history, URLs and cache logs</p>
                </div>
              </div>
              <div className="dm-cleanup-records">245,672 <span>Records</span></div>
              <Popconfirm title="Clear all browser data?" onConfirm={handleCleanBrowser}>
                <button className="dm-cleanup-btn browser" disabled={cleaningBrowser}>
                  <DeleteOutlined /> {cleaningBrowser ? 'Cleaning...' : 'Clean Browser Data'}
                </button>
              </Popconfirm>
            </div>

            {/* Finance Data */}
            <div className="dm-cleanup-card">
              <div className="dm-cleanup-icon-title">
                <div className="dm-cleanup-icon finance"><DollarOutlined /></div>
                <div className="dm-cleanup-header">
                  <h3>Finance Data</h3>
                  <p>Transactions, sessions and revenue logs</p>
                </div>
              </div>
              <div className="dm-cleanup-records">54,221 <span>Records</span></div>
              <Popconfirm title="Clear all finance data?" onConfirm={handleCleanFinance}>
                <button className="dm-cleanup-btn finance" disabled={cleaningFinance}>
                  <DeleteOutlined /> {cleaningFinance ? 'Cleaning...' : 'Clean Finance Data'}
                </button>
              </Popconfirm>
            </div>

            {/* Reports Data */}
            <div className="dm-cleanup-card">
              <div className="dm-cleanup-icon-title">
                <div className="dm-cleanup-icon reports"><BarChartOutlined /></div>
                <div className="dm-cleanup-header">
                  <h3>Reports Data</h3>
                  <p>Activity logs and report records</p>
                </div>
              </div>
              <div className="dm-cleanup-records">3,251 <span>Records</span></div>
              <Popconfirm title="Clear all reports data?" onConfirm={handleCleanReports}>
                <button className="dm-cleanup-btn reports" disabled={cleaningReports}>
                  <DeleteOutlined /> {cleaningReports ? 'Cleaning...' : 'Clean Reports Data'}
                </button>
              </Popconfirm>
            </div>
          </div>

          {/* Middle Grid */}
          <div className="dm-middle-grid">
            {/* Backup & Restore */}
            <div className="dm-panel">
              <h3 className="dm-section-title">Backup & Restore</h3>
              <p className="dm-section-subtitle" style={{marginBottom: 16}}>Backup your data regularly to prevent data loss.</p>
              
              <div className="dm-backup-info">
                <div className="dm-backup-info-item">
                  <h4>Last Backup</h4>
                  <p>Today, 02:15 AM</p>
                </div>
                <div className="dm-backup-info-item">
                  <h4>Backup Size</h4>
                  <p className="size">248 MB</p>
                </div>
              </div>

              <div className="dm-backup-actions">
                <Button type="primary" icon={<CloudDownloadOutlined />}>Create Backup</Button>
                <Button icon={<CloudDownloadOutlined />}>Download</Button>
                <Button icon={<ReloadOutlined />}>Restore</Button>
              </div>
            </div>

            {/* Storage Usage */}
            <div className="dm-panel">
              <h3 className="dm-section-title">Storage Usage</h3>
              <p className="dm-section-subtitle" style={{marginBottom: 16}}>Monitor your database storage.</p>
              
              <div className="dm-storage-content">
                <div className="dm-storage-chart-container">
                  <Pie {...chartConfig} />
                </div>
                <div className="dm-storage-legend">
                  {storageData.map((item, index) => (
                    <div className="dm-legend-item" key={index}>
                      <div className="dm-legend-name">
                        <span className="dm-legend-dot" style={{ backgroundColor: item.color }}></span>
                        {item.type}
                      </div>
                      <div className="dm-legend-value">{item.value.toFixed(2)} GB</div>
                      <div className="dm-legend-pct">{item.pct}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="dm-storage-bar-container">
                <div className="dm-storage-bar">
                  <div className="dm-storage-bar-fill" style={{ width: '24%' }}></div>
                </div>
                <div className="dm-storage-bar-text">24% used</div>
              </div>
            </div>

            {/* Auto Cleanup */}
            <div className="dm-panel">
              <h3 className="dm-section-title">Auto Cleanup</h3>
              <p className="dm-section-subtitle" style={{marginBottom: 16}}>Automatically clean old records to save space.</p>

              <div className="dm-auto-list">
                <div className="dm-auto-item">
                  <div className="dm-auto-item-left">
                    <HistoryOutlined /> Browser History
                  </div>
                  <div className="dm-auto-item-right">
                    <span>Delete after</span>
                    <Select defaultValue="30 Days" style={{ width: 100 }} bordered={false}>
                      <Select.Option value="30 Days">30 Days</Select.Option>
                      <Select.Option value="60 Days">60 Days</Select.Option>
                    </Select>
                    <Switch defaultChecked />
                  </div>
                </div>
                
                <div className="dm-auto-item">
                  <div className="dm-auto-item-left">
                    <ClockCircleOutlined /> Activity Logs
                  </div>
                  <div className="dm-auto-item-right">
                    <span>Delete after</span>
                    <Select defaultValue="90 Days" style={{ width: 100 }} bordered={false}>
                      <Select.Option value="90 Days">90 Days</Select.Option>
                      <Select.Option value="180 Days">180 Days</Select.Option>
                    </Select>
                    <Switch defaultChecked />
                  </div>
                </div>

                <div className="dm-auto-item">
                  <div className="dm-auto-item-left">
                    <BarChartOutlined /> Old Reports
                  </div>
                  <div className="dm-auto-item-right">
                    <span>Archive after</span>
                    <Select defaultValue="180 Days" style={{ width: 100 }} bordered={false}>
                      <Select.Option value="180 Days">180 Days</Select.Option>
                      <Select.Option value="365 Days">365 Days</Select.Option>
                    </Select>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Grid */}
          <div className="dm-bottom-grid">
            {/* Recent Maintenance */}
            <div className="dm-panel">
              <h3 className="dm-section-title">Recent Maintenance</h3>
              <p className="dm-section-subtitle" style={{marginBottom: 16}}>Latest cleanup and backup activities.</p>
              
              <div className="dm-maintenance-list">
                <div className="dm-maintenance-item">
                  <div className="dm-maintenance-name">
                    <DatabaseOutlined style={{color: '#0ea5e9'}}/> Database Backup
                  </div>
                  <div className="dm-maintenance-date">Today, 02:15 AM</div>
                  <div className="dm-maintenance-status">Success</div>
                </div>
                <div className="dm-maintenance-item">
                  <div className="dm-maintenance-name">
                    <GlobalOutlined style={{color: '#3b82f6'}}/> Browser Data Cleanup
                  </div>
                  <div className="dm-maintenance-date">Yesterday, 11:30 PM</div>
                  <div className="dm-maintenance-status">Success</div>
                </div>
                <div className="dm-maintenance-item">
                  <div className="dm-maintenance-name">
                    <BarChartOutlined style={{color: '#f97316'}}/> Reports Data Cleanup
                  </div>
                  <div className="dm-maintenance-date">Jun 19, 2025, 10:20 PM</div>
                  <div className="dm-maintenance-status">Success</div>
                </div>
                <div className="dm-maintenance-item">
                  <div className="dm-maintenance-name">
                    <PrinterOutlined style={{color: '#a855f7'}}/> Printer Data Cleanup
                  </div>
                  <div className="dm-maintenance-date">Jun 18, 2025, 09:15 PM</div>
                  <div className="dm-maintenance-status">Success</div>
                </div>
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <a href="#" style={{ color: '#0ea5e9', fontSize: 13 }}>View all activities &rarr;</a>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="dm-panel" style={{ border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <h3 className="dm-danger-title">Danger Zone</h3>
              <p className="dm-danger-subtitle">Irreversible actions. Please be careful.</p>

              <div className="dm-danger-item">
                <div className="dm-danger-item-info">
                  <h4><DeleteOutlined /> Delete All Data</h4>
                  <p>Permanently delete all system data. This action cannot be undone.</p>
                </div>
                <Popconfirm title="Are you absolutely sure?">
                  <Button danger icon={<DeleteOutlined />}>Delete All Data</Button>
                </Popconfirm>
              </div>

              <div className="dm-danger-item">
                <div className="dm-danger-item-info">
                  <h4><WarningOutlined /> Reset System</h4>
                  <p>Reset HawkNine to factory settings.</p>
                </div>
                <Popconfirm title="Reset entire system?">
                  <Button danger icon={<WarningOutlined />} onClick={handleResetSystem}>Reset System</Button>
                </Popconfirm>
              </div>
            </div>
          </div>

        </TabPane>
        <TabPane tab="Backup & Restore" key="backup">
          <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>Backup & Restore settings coming soon.</div>
        </TabPane>
        <TabPane tab="Archive" key="archive">
          <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>Archive settings coming soon.</div>
        </TabPane>
        <TabPane tab="Database Info" key="db">
          <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>Database Info coming soon.</div>
        </TabPane>
        <TabPane tab="Activity Logs" key="logs">
          <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>Activity Logs coming soon.</div>
        </TabPane>
      </Tabs>
    </div>
  );
}

export default DataManagement;
