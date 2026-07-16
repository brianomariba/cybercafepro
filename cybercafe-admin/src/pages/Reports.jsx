import React, { useState, useEffect } from 'react';
import { DatePicker, Select, Button, Table, Tabs, message, Spin } from 'antd';
import {
  LineChartOutlined,
  WalletOutlined,
  MobileOutlined,
  ShoppingOutlined,
  SettingOutlined,
  TeamOutlined,
  DownloadOutlined,
  PieChartOutlined,
  AppstoreOutlined,
  FileDoneOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { Pie } from '@ant-design/charts';
import dayjs from 'dayjs';
import './Reports.css';

import { getTransactions, getTransactionSummary, getSessions, getComputers, getPrintJobs, getTasks, getActivityRecords } from '../services/api';

const { TabPane } = Tabs;

// Format KSH
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

function Reports() {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [loading, setLoading] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [printJobs, setPrintJobs] = useState([]);
  const [activityRecords, setActivityRecords] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
        const [txnData, sessionData, printData, taskData, activityData] = await Promise.all([
            getTransactions({ limit: 500 }).catch(() => []),
            getSessions({ limit: 500 }).catch(() => []),
            getPrintJobs({ limit: 500 }).catch(() => []),
            getTasks().catch(() => []),
            getActivityRecords({ limit: 500 }).catch(() => [])
        ]);

        const ensureArray = (data) => {
            if (Array.isArray(data)) return data;
            if (data && Array.isArray(data.data)) return data.data;
            if (data && Array.isArray(data.transactions)) return data.transactions;
            if (data && Array.isArray(data.sessions)) return data.sessions;
            if (data && Array.isArray(data.printJobs)) return data.printJobs;
            if (data && Array.isArray(data.tasks)) return data.tasks;
            return [];
        };

        setTransactions(ensureArray(txnData));
        setSessions(ensureArray(sessionData));
        setPrintJobs(ensureArray(printData));
        setTasks(ensureArray(taskData));
        setActivityRecords(ensureArray(activityData));
    } catch (error) {
        console.error('Failed to fetch report data:', error);
        message.error('Failed to load real data, using empty sets');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter data by selectedDate
  const filterByDate = (items, dateField = 'createdAt') => {
      if (!Array.isArray(items)) return [];
      return items.filter(item => {
          const itemDate = dayjs(item[dateField] || item.receivedAt || item.timestamp);
          return itemDate.isSame(selectedDate, 'day');
      });
  };

  const filteredTransactions = filterByDate(transactions);
  const filteredSessions = filterByDate(sessions, 'receivedAt');
  const filteredTasks = filterByDate(tasks);
  const filteredActivityRecords = filterByDate(activityRecords, 'submittedAt');
  
  // Aggregate data
  const totalRevenue = 
    filteredTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) +
    filteredActivityRecords.reduce((sum, a) => sum + (a.totalAmount || 0), 0);
  
  // Real data only, no fallback estimates
  const cashCollected = 
    filteredTransactions.filter(t => (t.paymentMethod || '').toLowerCase() === 'cash').reduce((sum, t) => sum + (t.amount || 0), 0) +
    filteredActivityRecords.filter(a => (a.paymentMethod || '').toLowerCase() === 'cash').reduce((sum, a) => sum + (a.totalAmount || 0), 0);
    
  const mpesaCollected = 
    filteredTransactions.filter(t => (t.paymentMethod || '').toLowerCase() === 'mpesa').reduce((sum, t) => sum + (t.amount || 0), 0) +
    filteredActivityRecords.filter(a => (a.paymentMethod || '').toLowerCase() === 'mpesa').reduce((sum, a) => sum + (a.totalAmount || 0), 0);
  
  const servicesRevenue = 
    filteredTransactions.filter(t => t.type === 'session' || t.type === 'task_completion').reduce((sum, t) => sum + (t.amount || 0), 0) +
    filteredActivityRecords.reduce((sum, a) => sum + (a.totalAmount || 0), 0);
    
  const productsRevenue = totalRevenue - servicesRevenue;

  // Group by Agent/User
  const userMap = {};
  filteredTransactions.forEach(t => {
      const u = t.handledBy || t.user || 'System';
      if (!userMap[u]) userMap[u] = { name: u, revenue: 0, cash: 0, mpesa: 0, products: 0, services: 0, txnCount: 0 };
      userMap[u].revenue += (t.amount || 0);
      userMap[u].txnCount += 1;
      const isMpesa = (t.paymentMethod || '').toLowerCase() === 'mpesa';
      if (isMpesa) userMap[u].mpesa += (t.amount || 0);
      else if ((t.paymentMethod || '').toLowerCase() === 'cash') userMap[u].cash += (t.amount || 0);
      // If paymentMethod is something else or missing, it won't be artificially assigned to cash/mpesa
      
      if (t.type === 'session' || t.type === 'task_completion') userMap[u].services += (t.amount || 0);
      else userMap[u].products += (t.amount || 0);
  });
  
  filteredActivityRecords.forEach(a => {
      const u = a.agentUser || 'System';
      if (!userMap[u]) userMap[u] = { name: u, revenue: 0, cash: 0, mpesa: 0, products: 0, services: 0, txnCount: 0 };
      userMap[u].revenue += (a.totalAmount || 0);
      userMap[u].txnCount += 1;
      const isMpesa = (a.paymentMethod || '').toLowerCase() === 'mpesa';
      if (isMpesa) userMap[u].mpesa += (a.totalAmount || 0);
      else if ((a.paymentMethod || '').toLowerCase() === 'cash') userMap[u].cash += (a.totalAmount || 0);
      
      userMap[u].services += (a.totalAmount || 0);
  });

  const employeesData = Object.values(userMap).map((u, i) => ({
      key: i.toString(),
      id: u.name,
      name: u.name,
      role: 'Agent',
      shiftTime: '-',
      shiftDuration: '-',
      status: '-',
      statusTime: '-',
      revenueKsh: u.revenue,
      cashKsh: u.cash,
      mpesaKsh: u.mpesa,
      productsKsh: u.products,
      servicesKsh: u.services,
      revenue: formatKSH(u.revenue),
      cash: formatKSH(u.cash),
      mpesa: formatKSH(u.mpesa),
      products: formatKSH(u.products),
      services: formatKSH(u.services),
      txnCount: u.txnCount,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`
  }));

  const employeesWorked = employeesData.length;

  const globalMetrics = [
    { title: 'Total Revenue', value: formatKSH(totalRevenue), subtext: 'Today', subtextClass: 'neutral', icon: <LineChartOutlined />, iconClass: 'icon-blue' },
    { title: 'Cash Collected', value: formatKSH(cashCollected), subtext: 'Today', subtextClass: 'neutral', icon: <WalletOutlined />, iconClass: 'icon-green' },
    { title: 'Mpesa Collected', value: formatKSH(mpesaCollected), subtext: 'Today', subtextClass: 'neutral', icon: <MobileOutlined />, iconClass: 'icon-purple' },
    { title: 'Products Sold', value: formatKSH(productsRevenue), subtext: 'Today', subtextClass: 'neutral', icon: <ShoppingOutlined />, iconClass: 'icon-orange' },
    { title: 'Services Revenue', value: formatKSH(servicesRevenue), subtext: 'Today', subtextClass: 'neutral', icon: <SettingOutlined />, iconClass: 'icon-teal' },
    { title: 'Employees Worked', value: employeesWorked.toString(), subtext: 'Today', subtextClass: 'neutral', icon: <TeamOutlined />, iconClass: 'icon-blue' },
  ];

  const handleExportAll = () => {
    try {
        let csv = 'Employee,Revenue (KSH),Cash (KSH),M-Pesa (KSH),Products (KSH),Services (KSH),Transactions\n';
        employeesData.forEach(e => {
            csv += `"${e.name}",${e.revenueKsh},${e.cashKsh},${e.mpesaKsh},${e.productsKsh},${e.servicesKsh},${e.txnCount}\n`;
        });
        
        const csvData = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
        const a = document.createElement('a');
        a.href = csvData;
        a.download = `All_Employees_Report_${selectedDate.format('YYYY-MM-DD')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch(err) {
        alert('Download Error: ' + err.message);
        console.error(err);
    }
  };

  const handleDownloadReport = () => {
    if (!selectedEmployee) return;
    try {
        let csv = `Employee,${selectedEmployee.name}\n`;
        csv += `Date,${selectedDate.format('YYYY-MM-DD')}\n`;
        csv += `Shift,${selectedEmployee.shiftTime}\n`;
        csv += `Status,${selectedEmployee.status}\n\n`;
        
        csv += `Summary\n`;
        csv += `Revenue,${selectedEmployee.revenueKsh}\n`;
        csv += `Cash Collected,${selectedEmployee.cashKsh}\n`;
        csv += `Mpesa Collected,${selectedEmployee.mpesaKsh}\n`;
        csv += `Products Sold,${selectedEmployee.productsKsh}\n`;
        csv += `Services Revenue,${selectedEmployee.servicesKsh}\n`;
        csv += `Transactions,${selectedEmployee.txnCount}\n`;
        
        const csvData = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
        const a = document.createElement('a');
        a.href = csvData;
        a.download = `${selectedEmployee.name}_Report_${selectedDate.format('YYYY-MM-DD')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (err) {
        alert('Download Error: ' + err.message);
        console.error(err);
    }
  };

  const columns = [
    {
      title: 'EMPLOYEE',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div className="employee-cell">
          <div className="employee-avatar">
            <img src={record.avatar} alt={text} />
          </div>
          <div>
            <div className="employee-name">{text}</div>
            <div className="employee-role">{record.role}</div>
          </div>
        </div>
      )
    },
    {
      title: 'SHIFT',
      dataIndex: 'shift',
      key: 'shift',
      render: (_, record) => (
        <div>
          <div className="shift-time">{record.shiftTime}</div>
          <div className="shift-duration">{record.shiftDuration}</div>
        </div>
      )
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => {
        const isSubmitted = status === 'Submitted';
        const isPending = status === 'Pending';
        return (
          <div>
            <span className={`status-tag ${isSubmitted ? 'submitted' : (isPending ? 'pending' : '')}`}>{status}</span>
            <div className={`status-time ${isPending ? 'pending-time' : ''}`}>{record.statusTime}</div>
          </div>
        );
      }
    },
    {
      title: 'REVENUE (KSH)',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (text) => <span className="money-text">{text}</span>
    },
    {
      title: 'CASH COLLECTED',
      dataIndex: 'cash',
      key: 'cash',
      render: (text) => <span className="money-text">{text}</span>
    },
    {
      title: 'MPESA COLLECTED',
      dataIndex: 'mpesa',
      key: 'mpesa',
      render: (text) => <span className="money-text">{text}</span>
    },
    {
      title: 'PRODUCTS SOLD',
      dataIndex: 'products',
      key: 'products',
      render: (text) => <span className="money-text">{text}</span>
    },
    {
      title: 'SERVICES REVENUE',
      dataIndex: 'services',
      key: 'services',
      render: (text) => <span className="money-text">{text}</span>
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      render: (_, record) => (
        <Button 
          type="primary" 
          icon={<EyeOutlined />} 
          className="btn-view-report"
          onClick={() => setSelectedEmployee(record)}
        >
          View Report
        </Button>
      )
    }
  ];

  // Specific employee calculations
  const paymentChartData = selectedEmployee ? [
    { type: 'Cash', value: selectedEmployee.cashKsh, color: '#10b981' },
    { type: 'Mpesa', value: selectedEmployee.mpesaKsh, color: '#8b5cf6' },
  ] : [];

  const paymentChartConfig = {
    appendPadding: 0,
    data: paymentChartData,
    angleField: 'value',
    colorField: 'type',
    radius: 1,
    innerRadius: 0.7,
    color: paymentChartData.map(d => d.color),
    label: false,
    legend: false,
    statistic: {
      title: false,
      content: false,
    },
    interactions: [{ type: 'element-active' }],
  };

  return (
    <div className="reports-container">
      <div className="reports-header-wrapper">
        <div>
          <h1 className="reports-title">Reports</h1>
          <p className="reports-subtitle">View employee reports and daily activity summaries</p>
        </div>
        <div className="reports-controls">
          <DatePicker 
            value={selectedDate} 
            onChange={(date) => {
              if (date) {
                setSelectedDate(date);
                setSelectedEmployee(null);
              }
            }}
            format="MMM DD, YYYY" 
            allowClear={false}
          />
          <Select defaultValue="All Employees" style={{ width: 150 }}>
            <Select.Option value="All Employees">All Employees</Select.Option>
            {employeesData.map(e => (
                <Select.Option key={e.id} value={e.id}>{e.name}</Select.Option>
            ))}
          </Select>
          <Button type="primary" icon={<DownloadOutlined />} className="btn-export" onClick={handleExportAll}>
            Refresh
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        <div className="metrics-grid">
          {globalMetrics.map((metric, idx) => (
            <div className="metric-card" key={idx}>
              <div className="metric-card-top">
                <div className={`metric-icon ${metric.iconClass}`}>{metric.icon}</div>
                <span className="metric-title">{metric.title}</span>
              </div>
              <div className="metric-value">{metric.value}</div>
              <div className={`metric-subtext ${metric.subtextClass}`}>{metric.subtext}</div>
            </div>
          ))}
        </div>

        <div className="employee-reports-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Employee Reports</h2>
              <p className="section-subtitle">Daily summary by employee</p>
            </div>
            <div className="status-legend">
              <div className="legend-item"><span className="dot green"></span> Submitted</div>
              <div className="legend-item"><span className="dot orange"></span> Pending</div>
              <div className="legend-item"><span className="dot red"></span> Not Submitted</div>
            </div>
          </div>

          <div className="reports-table">
            <Table 
              columns={columns} 
              dataSource={employeesData} 
              pagination={{ position: ['bottomRight'], pageSize: 5 }} 
              locale={{ emptyText: 'No transactions found for this date.' }}
            />
          </div>
        </div>
      </Spin>

      {/* Detailed Employee View */}
      {selectedEmployee && (
        <div className="detailed-report-section">
          <div className="detail-header">
            <div>
              <div className="detail-title-row">
                <h2 className="detail-title">{selectedEmployee.name}'s Report</h2>
                <span className="status-tag submitted" style={{ margin: 0 }}>Submitted</span>
              </div>
              <div className="detail-subtitle">
                Shift: {selectedEmployee.shiftTime} • Status Time: {selectedEmployee.statusTime}
              </div>
            </div>
            <Button icon={<DownloadOutlined />} className="btn-download" onClick={handleDownloadReport}>
              Download Report
            </Button>
          </div>

          <Tabs defaultActiveKey="summary" className="detail-tabs">
            <TabPane tab="Summary" key="summary">
              
              <div className="summary-cards-grid">
                {/* Revenue Summary */}
                <div className="summary-card">
                  <div className="summary-card-title">
                    <div className="summary-card-icon"><LineChartOutlined /></div>
                    Revenue Summary
                  </div>
                  <div className="summary-list">
                    <div className="summary-list-item">
                      <span className="summary-list-label">Total Revenue</span>
                      <span className="summary-list-value">{selectedEmployee.revenue}</span>
                    </div>
                    <div className="summary-list-item">
                      <span className="summary-list-label">Products Revenue</span>
                      <span className="summary-list-value">{selectedEmployee.products}</span>
                    </div>
                    <div className="summary-list-item">
                      <span className="summary-list-label">Services Revenue</span>
                      <span className="summary-list-value">{selectedEmployee.services}</span>
                    </div>
                    <div className="summary-list-item">
                      <span className="summary-list-label">Total Transactions</span>
                      <span className="summary-list-value">{selectedEmployee.txnCount}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Breakdown */}
                <div className="summary-card">
                  <div className="summary-card-title">
                    <div className="summary-card-icon green"><WalletOutlined /></div>
                    Payment Breakdown
                  </div>
                  <div className="payment-breakdown-content">
                    <div className="payment-list">
                      <div className="payment-item">
                        <span className="payment-label">Cash</span>
                        <span className="payment-amount">{selectedEmployee.cash}</span>
                        <span className="payment-pct">{Math.round((selectedEmployee.cashKsh / selectedEmployee.revenueKsh || 0) * 100)}%</span>
                      </div>
                      <div className="payment-item">
                        <span className="payment-label">Mpesa</span>
                        <span className="payment-amount">{selectedEmployee.mpesa}</span>
                        <span className="payment-pct">{Math.round((selectedEmployee.mpesaKsh / selectedEmployee.revenueKsh || 0) * 100)}%</span>
                      </div>
                      <div className="payment-item" style={{ marginTop: 12 }}>
                        <span className="payment-label" style={{ color: '#fff' }}>Total Collected</span>
                        <span className="payment-amount">{selectedEmployee.revenue}</span>
                        <span className="payment-pct"></span>
                      </div>
                    </div>
                    <div className="payment-chart-wrapper">
                      <Pie {...paymentChartConfig} />
                    </div>
                  </div>
                </div>

                {/* Services Summary */}
                <div className="summary-card">
                  <div className="summary-card-title">
                    <div className="summary-card-icon purple"><AppstoreOutlined /></div>
                    Services Summary
                  </div>
                  <div className="summary-list">
                    <div className="summary-list-item">
                      <span className="summary-list-label">Service Revenue</span>
                      <span className="summary-list-value">{selectedEmployee.services}</span>
                    </div>
                    <div className="summary-list-item">
                      <span className="summary-list-label">Product Revenue</span>
                      <span className="summary-list-value">{selectedEmployee.products}</span>
                    </div>
                  </div>
                </div>

                {/* Reconciliation */}
                <div className="summary-card">
                  <div className="summary-card-title">
                    <div className="summary-card-icon orange"><FileDoneOutlined /></div>
                    Reconciliation
                  </div>
                  <div className="summary-list">
                    <div className="summary-list-item">
                      <span className="summary-list-label">Expected Cash</span>
                      <span className="summary-list-value">{selectedEmployee.cash}</span>
                    </div>
                    <div className="summary-list-item">
                      <span className="summary-list-label">Actual Cash</span>
                      <span className="summary-list-value" style={{ color: '#94a3b8' }}>N/A</span>
                    </div>
                    <div className="summary-list-item" style={{ marginTop: 12 }}>
                      <span className="summary-list-label">Difference</span>
                      <span className="summary-list-value" style={{ color: '#94a3b8' }}>N/A</span>
                    </div>
                    <div className="summary-list-item">
                      <span className="summary-list-label">Status</span>
                      <span className="status-tag" style={{ margin: 0, background: 'transparent', border: '1px solid #475569', color: '#94a3b8' }}>Pending</span>
                    </div>
                  </div>
                </div>

              </div>
            </TabPane>
            <TabPane tab="Transactions" key="transactions">
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Transactions data for {selectedEmployee.name}</div>
            </TabPane>
          </Tabs>
        </div>
      )}

    </div>
  );
}

export default Reports;
