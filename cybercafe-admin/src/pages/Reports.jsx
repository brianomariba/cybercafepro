import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Select, Tooltip, Row, Col, DatePicker, Progress, Spin, Empty } from 'antd';
import {
    BarChartOutlined,
    PieChartOutlined,
    LineChartOutlined,
    DesktopOutlined,
    DollarOutlined,
    PrinterOutlined,
    TeamOutlined,
    ClockCircleOutlined,
    CalendarOutlined,
    DownloadOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getTransactions, getTransactionSummary, getSessions, getComputers, getPrintJobs, getTasks } from '../services/api';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// Format KSH
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

function Reports() {
    const [dateRange, setDateRange] = useState([dayjs().subtract(7, 'day'), dayjs()]);
    const [reportType, setReportType] = useState('overview');
    const [loading, setLoading] = useState(true);

    // Data states
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({ today: 0, week: 0, month: 0 });
    const [sessions, setSessions] = useState([]);
    const [computers, setComputers] = useState([]);
    const [printJobs, setPrintJobs] = useState([]);
    const [tasks, setTasks] = useState([]);

    // Fetch all data
    const fetchData = async () => {
        setLoading(true);
        try {
            const [txnData, summaryData, sessionData, computerData, printData, taskData] = await Promise.all([
                getTransactions({ limit: 200 }).catch(() => []),
                getTransactionSummary().catch(() => ({ today: 0, week: 0, month: 0 })),
                getSessions({ limit: 200 }).catch(() => []),
                getComputers().catch(() => []),
                getPrintJobs({ limit: 100 }).catch(() => []),
                getTasks().catch(() => []),
            ]);

            setTransactions(txnData || []);
            setSummary(summaryData || { today: 0, week: 0, month: 0 });
            setSessions(sessionData || []);
            setComputers(computerData || []);
            setPrintJobs(printData || []);
            setTasks(taskData || []);
        } catch (error) {
            console.error('Failed to fetch report data:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter data by date range
    const filterByDateRange = (items, dateField = 'createdAt') => {
        if (!dateRange[0] || !dateRange[1]) return items;
        return items.filter(item => {
            const itemDate = dayjs(item[dateField] || item.receivedAt || item.timestamp);
            return itemDate.isAfter(dateRange[0].startOf('day')) && itemDate.isBefore(dateRange[1].endOf('day'));
        });
    };

    // Calculate stats
    const filteredTransactions = filterByDateRange(transactions);
    const filteredSessions = filterByDateRange(sessions.filter(s => s.type === 'LOGOUT'), 'receivedAt');
    const filteredPrintJobs = filterByDateRange(printJobs, 'receivedAt');
    const completedTasks = filterByDateRange(tasks.filter(t => t.status === 'completed'), 'completedAt');

    const totalRevenue = filteredTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalSessions = filteredSessions.length;
    const totalPages = filteredPrintJobs.reduce((sum, p) => sum + (p.totalPages || p.pages || 1), 0);
    const totalHours = filteredSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / 60;

    // Calculate weekly data for chart
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
        const day = dayjs().subtract(i, 'day');
        const dayTransactions = transactions.filter(t =>
            dayjs(t.createdAt).isSame(day, 'day')
        );
        const daySessions = sessions.filter(s =>
            s.type === 'LOGOUT' && dayjs(s.receivedAt || s.endTime).isSame(day, 'day')
        );
        const dayPrinting = printJobs.filter(p =>
            dayjs(p.receivedAt || p.timestamp).isSame(day, 'day')
        );

        weeklyData.push({
            day: day.format('ddd'),
            date: day.format('MMM DD'),
            revenue: dayTransactions.reduce((sum, t) => sum + (t.amount || 0), 0),
            sessions: daySessions.length,
            printing: dayPrinting.reduce((sum, p) => sum + (p.totalPages || p.pages || 1), 0),
            hours: Math.round(daySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / 60),
        });
    }
    const maxRevenue = Math.max(...weeklyData.map(d => d.revenue), 1);

    // Calculate computer performance
    const computerPerformance = computers.map(computer => {
        const computerSessions = sessions.filter(s =>
            s.type === 'LOGOUT' && s.clientId === computer.clientId
        );
        const computerTxns = transactions.filter(t => t.clientId === computer.clientId);

        const totalSessions = computerSessions.length;
        const totalHours = computerSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / 60;
        const totalRevenue = computerTxns.reduce((sum, t) => sum + (t.amount || 0), 0);

        // Utilization based on hours worked vs potential (14 hours/day for 7 days = 98 hours)
        const utilization = Math.min(100, Math.round((totalHours / 98) * 100));

        return {
            computer: computer.hostname,
            clientId: computer.clientId,
            sessions: totalSessions,
            hours: Math.round(totalHours),
            revenue: totalRevenue,
            utilization,
        };
    }).sort((a, b) => b.revenue - a.revenue);

    // Service breakdown
    const sessionRevenue = transactions.filter(t => t.type === 'session').reduce((sum, t) => sum + (t.amount || 0), 0);
    const taskRevenue = transactions.filter(t => t.type === 'task_completion').reduce((sum, t) => sum + (t.amount || 0), 0);
    const printingRevenue = transactions.reduce((sum, t) => {
        if (t.breakdown) {
            return sum + (t.breakdown.printBW || 0) + (t.breakdown.printColor || 0);
        }
        return sum;
    }, 0);

    const totalRevenueAll = sessionRevenue + taskRevenue;
    const serviceBreakdown = [
        {
            service: 'Computer Usage',
            revenue: sessionRevenue - printingRevenue,
            percentage: totalRevenueAll > 0 ? Math.round(((sessionRevenue - printingRevenue) / totalRevenueAll) * 100) : 0,
            icon: <DesktopOutlined />,
            color: '#00B4D8'
        },
        {
            service: 'Printing',
            revenue: printingRevenue,
            percentage: totalRevenueAll > 0 ? Math.round((printingRevenue / totalRevenueAll) * 100) : 0,
            icon: <PrinterOutlined />,
            color: '#FFB703'
        },
        {
            service: 'Tasks Completed',
            revenue: taskRevenue,
            percentage: totalRevenueAll > 0 ? Math.round((taskRevenue / totalRevenueAll) * 100) : 0,
            icon: <CheckCircleOutlined />,
            color: '#00C853'
        },
    ];

    // Peak hours calculation from sessions
    const hourlyActivity = {};
    sessions.filter(s => s.type === 'LOGIN').forEach(session => {
        const hour = dayjs(session.timestamp || session.startTime).hour();
        hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
    });

    const peakHours = [];
    for (let hour = 8; hour <= 21; hour++) {
        const count = hourlyActivity[hour] || 0;
        peakHours.push({
            hour: `${hour.toString().padStart(2, '0')}:00`,
            value: count,
        });
    }
    const maxPeakHour = Math.max(...peakHours.map(h => h.value), 1);

    // Top users from sessions
    const userStats = {};
    sessions.filter(s => s.type === 'LOGOUT' && s.user).forEach(session => {
        if (!userStats[session.user]) {
            userStats[session.user] = { name: session.user, sessions: 0, spent: 0, hours: 0 };
        }
        userStats[session.user].sessions += 1;
        userStats[session.user].spent += session.charges?.grandTotal || 0;
        userStats[session.user].hours += (session.durationMinutes || 0) / 60;
    });
    const topUsers = Object.values(userStats)
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 5)
        .map(u => ({ ...u, hours: Math.round(u.hours) }));

    const computerColumns = [
        {
            title: 'Computer',
            dataIndex: 'computer',
            key: 'computer',
            render: (name) => (
                <Space>
                    <DesktopOutlined style={{ color: '#00B4D8' }} />
                    <Text strong>{name}</Text>
                </Space>
            ),
        },
        {
            title: 'Sessions',
            dataIndex: 'sessions',
            key: 'sessions',
            sorter: (a, b) => a.sessions - b.sessions,
        },
        {
            title: 'Hours',
            dataIndex: 'hours',
            key: 'hours',
            render: (hours) => <Text>{hours}h</Text>,
            sorter: (a, b) => a.hours - b.hours,
        },
        {
            title: 'Revenue',
            dataIndex: 'revenue',
            key: 'revenue',
            render: (revenue) => (
                <Text style={{ fontFamily: 'JetBrains Mono', color: '#00C853' }}>
                    {formatKSH(revenue)}
                </Text>
            ),
            sorter: (a, b) => a.revenue - b.revenue,
        },
        {
            title: 'Utilization',
            dataIndex: 'utilization',
            key: 'utilization',
            render: (util) => (
                <div style={{ width: 120 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{util}%</Text>
                    </div>
                    <Progress
                        percent={util}
                        size="small"
                        showInfo={false}
                        strokeColor={util > 80 ? '#00C853' : util > 50 ? '#FF9500' : '#ff3b5c'}
                    />
                </div>
            ),
            sorter: (a, b) => a.utilization - b.utilization,
        },
    ];

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <BarChartOutlined className="icon" />
                    <h1>Reports</h1>
                </div>
                <p className="page-subtitle">Analyze performance metrics and business insights</p>
            </div>

            {/* Filters */}
            <Card style={{ marginBottom: 24 }}>
                <Space size="large" wrap>
                    <RangePicker
                        value={dateRange}
                        onChange={setDateRange}
                        presets={[
                            { label: 'Today', value: [dayjs(), dayjs()] },
                            { label: 'Last 7 Days', value: [dayjs().subtract(7, 'day'), dayjs()] },
                            { label: 'Last 30 Days', value: [dayjs().subtract(30, 'day'), dayjs()] },
                            { label: 'This Month', value: [dayjs().startOf('month'), dayjs()] },
                        ]}
                    />
                    <Select
                        value={reportType}
                        onChange={setReportType}
                        style={{ width: 150 }}
                        options={[
                            { value: 'overview', label: 'Overview' },
                            { value: 'revenue', label: 'Revenue' },
                            { value: 'computers', label: 'Computers' },
                            { value: 'services', label: 'Services' },
                        ]}
                    />
                    <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                        Refresh
                    </Button>
                    <Button icon={<DownloadOutlined />} type="primary">
                        Export Report
                    </Button>
                </Space>
            </Card>

            {/* Summary Stats */}
            <Spin spinning={loading}>
                <div className="stats-row">
                    <div className="stat-card green">
                        <div className="stat-header">
                            <div className="stat-icon green">
                                <DollarOutlined />
                            </div>
                            {summary.week > 0 && summary.today > 0 && (
                                <div className="stat-trend up">
                                    <ArrowUpOutlined /> {Math.round((summary.today / (summary.week / 7)) * 100 - 100)}%
                                </div>
                            )}
                        </div>
                        <div className="stat-value">{formatKSH(totalRevenue)}</div>
                        <div className="stat-label">Period Revenue</div>
                    </div>

                    <div className="stat-card blue">
                        <div className="stat-header">
                            <div className="stat-icon blue">
                                <ClockCircleOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{totalSessions}</div>
                        <div className="stat-label">Total Sessions</div>
                    </div>

                    <div className="stat-card purple">
                        <div className="stat-header">
                            <div className="stat-icon purple">
                                <PrinterOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{totalPages}</div>
                        <div className="stat-label">Pages Printed</div>
                    </div>

                    <div className="stat-card orange">
                        <div className="stat-header">
                            <div className="stat-icon orange">
                                <DesktopOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{Math.round(totalHours)}h</div>
                        <div className="stat-label">Usage Hours</div>
                    </div>
                </div>
            </Spin>

            <Row gutter={[24, 24]}>
                {/* Weekly Revenue Chart */}
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <LineChartOutlined style={{ color: '#00C853' }} />
                                <span>Weekly Performance</span>
                            </Space>
                        }
                    >
                        {weeklyData.length === 0 || maxRevenue === 0 ? (
                            <Empty description="No revenue data yet" />
                        ) : (
                            <>
                                <div style={{ display: 'flex', alignItems: 'flex-end', height: 200, gap: 16, marginBottom: 24, overflow: 'hidden', paddingTop: 30 }}>
                                    {weeklyData.map((item, index) => (
                                        <Tooltip
                                            key={item.day}
                                            title={
                                                <div>
                                                    <div>Revenue: {formatKSH(item.revenue)}</div>
                                                    <div>Sessions: {item.sessions}</div>
                                                    <div>Hours: {item.hours}h</div>
                                                </div>
                                            }
                                        >
                                            <div style={{ flex: 1, textAlign: 'center' }}>
                                                <div
                                                    style={{
                                                        height: `${Math.max((item.revenue / maxRevenue) * 160, 4)}px`,
                                                        maxHeight: '160px',
                                                        background: `linear-gradient(180deg, ${index === 6 ? '#00C853' : '#00B4D8'}, ${index === 6 ? '#00a844' : '#023047'})`,
                                                        borderRadius: '8px 8px 0 0',
                                                        transition: 'all 0.3s ease',
                                                        cursor: 'pointer',
                                                        marginBottom: 8,
                                                        position: 'relative',
                                                    }}
                                                >
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: -24,
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        fontFamily: 'JetBrains Mono',
                                                        fontSize: 10,
                                                        color: '#b0b0c0',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {item.revenue >= 1000 ? `${(item.revenue / 1000).toFixed(0)}K` : item.revenue}
                                                    </div>
                                                </div>
                                                <Text type="secondary" style={{ fontSize: 12 }}>{item.day}</Text>
                                            </div>
                                        </Tooltip>
                                    ))}
                                </div>

                                {/* Comparison Stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <Text type="secondary">Avg Daily</Text>
                                        <Title level={4} style={{ margin: 0, color: '#00B4D8' }}>
                                            {formatKSH(Math.round(weeklyData.reduce((s, d) => s + d.revenue, 0) / 7))}
                                        </Title>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <Text type="secondary">Best Day</Text>
                                        <Title level={4} style={{ margin: 0, color: '#00C853' }}>
                                            {weeklyData.reduce((best, d) => d.revenue > best.revenue ? d : best, weeklyData[0])?.day || 'N/A'}
                                        </Title>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <Text type="secondary">Avg Sessions</Text>
                                        <Title level={4} style={{ margin: 0, color: '#7b2cbf' }}>
                                            {Math.round(weeklyData.reduce((s, d) => s + d.sessions, 0) / 7)}
                                        </Title>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <Text type="secondary">Peak Hour</Text>
                                        <Title level={4} style={{ margin: 0, color: '#FF9500' }}>
                                            {peakHours.reduce((best, h) => h.value > best.value ? h : best, peakHours[0])?.hour || 'N/A'}
                                        </Title>
                                    </div>
                                </div>
                            </>
                        )}
                    </Card>
                </Col>

                {/* Service Breakdown */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <PieChartOutlined style={{ color: '#7b2cbf' }} />
                                <span>Revenue by Service</span>
                            </Space>
                        }
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {serviceBreakdown.map(service => (
                                <div key={service.service}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Space>
                                            <span style={{ color: service.color, fontSize: 16 }}>{service.icon}</span>
                                            <Text>{service.service}</Text>
                                        </Space>
                                        <Text strong style={{ color: service.color }}>{formatKSH(service.revenue)}</Text>
                                    </div>
                                    <Progress
                                        percent={service.percentage}
                                        size="small"
                                        strokeColor={service.color}
                                        format={(p) => `${p}%`}
                                    />
                                </div>
                            ))}
                        </div>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
                {/* Peak Hours */}
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <ClockCircleOutlined style={{ color: '#FF9500' }} />
                                <span>Peak Hours</span>
                            </Space>
                        }
                    >
                        {peakHours.every(h => h.value === 0) ? (
                            <Empty description="No peak hours data yet" />
                        ) : (
                            <>
                                <div style={{ display: 'flex', alignItems: 'flex-end', height: 150, gap: 8 }}>
                                    {peakHours.map((hour) => (
                                        <Tooltip key={hour.hour} title={`${hour.hour}: ${hour.value} sessions`}>
                                            <div style={{ flex: 1, textAlign: 'center' }}>
                                                <div
                                                    style={{
                                                        height: `${Math.max((hour.value / maxPeakHour) * 120, 4)}px`,
                                                        background: hour.value === maxPeakHour ? '#FF9500' : hour.value > maxPeakHour / 2 ? '#00B4D8' : '#6b6b80',
                                                        borderRadius: '4px 4px 0 0',
                                                        transition: 'all 0.3s ease',
                                                        cursor: 'pointer',
                                                    }}
                                                />
                                            </div>
                                        </Tooltip>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>8AM</Text>
                                    <Text type="secondary" style={{ fontSize: 11 }}>12PM</Text>
                                    <Text type="secondary" style={{ fontSize: 11 }}>4PM</Text>
                                    <Text type="secondary" style={{ fontSize: 11 }}>8PM</Text>
                                </div>
                            </>
                        )}
                    </Card>
                </Col>

                {/* Top Users */}
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <TeamOutlined style={{ color: '#ff006e' }} />
                                <span>Top Users</span>
                            </Space>
                        }
                    >
                        {topUsers.length === 0 ? (
                            <Empty description="No user data yet" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {topUsers.map((user, index) => (
                                    <div
                                        key={user.name}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: 12,
                                            background: index === 0 ? 'rgba(0, 200, 83, 0.1)' : 'rgba(255,255,255,0.03)',
                                            borderRadius: 8,
                                            border: index === 0 ? '1px solid rgba(0, 200, 83, 0.3)' : 'none'
                                        }}
                                    >
                                        <div style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: '50%',
                                            background: index === 0 ? '#00C853' : index === 1 ? '#00B4D8' : index === 2 ? '#7b2cbf' : 'rgba(255,255,255,0.1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 700,
                                            fontSize: 12,
                                            color: index < 3 ? '#000' : '#fff'
                                        }}>
                                            {index + 1}
                                        </div>
                                        <Text strong style={{ flex: 1 }}>{user.name}</Text>
                                        <div style={{ textAlign: 'right', marginRight: 12 }}>
                                            <Text type="secondary" style={{ fontSize: 11 }}>{user.sessions} sessions</Text>
                                            <br />
                                            <Text type="secondary" style={{ fontSize: 11 }}>{user.hours}h</Text>
                                        </div>
                                        <Text style={{ fontFamily: 'JetBrains Mono', color: '#00C853', fontWeight: 600 }}>
                                            {formatKSH(user.spent)}
                                        </Text>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* Computer Performance */}
            <Card
                title={
                    <Space>
                        <DesktopOutlined style={{ color: '#00B4D8' }} />
                        <span>Computer Performance</span>
                    </Space>
                }
                style={{ marginTop: 24 }}
            >
                {computerPerformance.length === 0 ? (
                    <Empty description="No computer performance data yet" />
                ) : (
                    <Table
                        columns={computerColumns}
                        dataSource={computerPerformance}
                        rowKey="clientId"
                        pagination={false}
                    />
                )}
            </Card>
        </div>
    );
}

export default Reports;
