import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Tooltip, Badge, Statistic, Row, Col, DatePicker, Modal, Tabs, Avatar, Progress, Spin, Empty } from 'antd';
import {
    DollarOutlined,
    CreditCardOutlined,
    BankOutlined,
    WalletOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    DesktopOutlined,
    PrinterOutlined,
    CopyOutlined,
    ScanOutlined,
    ClockCircleOutlined,
    CalendarOutlined,
    DownloadOutlined,
    FilterOutlined,
    PieChartOutlined,
    BarChartOutlined,
    RiseOutlined,
    MobileOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getTransactions, getTransactionSummary, getSessions, getComputers } from '../services/api';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// Currency formatter for KSH
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

function Finance() {
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({ today: 0, week: 0, month: 0 });
    const [sessions, setSessions] = useState([]);
    const [computers, setComputers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all');
    const [searchText, setSearchText] = useState('');

    // Fetch all data
    const fetchData = async () => {
        setLoading(true);
        try {
            const [txnData, summaryData, sessionData, computerData] = await Promise.all([
                getTransactions({ limit: 100 }).catch(() => []),
                getTransactionSummary().catch(() => ({ today: 0, week: 0, month: 0 })),
                getSessions({ limit: 50, type: 'LOGOUT' }).catch(() => []),
                getComputers().catch(() => []),
            ]);

            setTransactions(txnData || []);
            setSummary(summaryData || { today: 0, week: 0, month: 0 });
            setSessions(sessionData || []);
            setComputers(computerData || []);
        } catch (error) {
            console.error('Failed to fetch finance data:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
        // Refresh every 30 seconds
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    // Calculate stats from real data
    const stats = {
        totalRevenue: summary.today || 0,
        weeklyRevenue: summary.week || 0,
        monthlyRevenue: summary.month || 0,
        transactionCount: transactions.filter(t =>
            dayjs(t.createdAt).isAfter(dayjs().startOf('day'))
        ).length,
    };

    // Calculate revenue by type
    const revenueByType = {
        sessions: transactions.filter(t => t.type === 'session').reduce((sum, t) => sum + (t.amount || 0), 0),
        tasks: transactions.filter(t => t.type === 'task_completion').reduce((sum, t) => sum + (t.amount || 0), 0),
    };

    // Calculate revenue by computer from transactions
    const computerRevenue = {};
    transactions.forEach(t => {
        if (t.hostname) {
            if (!computerRevenue[t.hostname]) {
                computerRevenue[t.hostname] = { hostname: t.hostname, usage: 0, printing: 0, tasks: 0, total: 0 };
            }
            if (t.type === 'session') {
                computerRevenue[t.hostname].usage += t.breakdown?.usage || t.amount || 0;
                computerRevenue[t.hostname].printing += (t.breakdown?.printBW || 0) + (t.breakdown?.printColor || 0);
            } else if (t.type === 'task_completion') {
                computerRevenue[t.hostname].tasks += t.amount || 0;
            }
            computerRevenue[t.hostname].total = computerRevenue[t.hostname].usage +
                computerRevenue[t.hostname].printing + computerRevenue[t.hostname].tasks;
        }
    });
    const computerRevenueList = Object.values(computerRevenue).sort((a, b) => b.total - a.total);

    // Get daily revenue for the past 7 days
    const dailyRevenue = [];
    for (let i = 6; i >= 0; i--) {
        const day = dayjs().subtract(i, 'day');
        const dayTransactions = transactions.filter(t =>
            dayjs(t.createdAt).isSame(day, 'day')
        );
        const amount = dayTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        dailyRevenue.push({
            day: day.format('ddd'),
            date: day.format('MMM DD'),
            amount,
        });
    }
    const maxDailyRevenue = Math.max(...dailyRevenue.map(d => d.amount), 1);

    const getTypeIcon = (type) => {
        switch (type) {
            case 'session': return <DesktopOutlined style={{ color: '#00B4D8' }} />;
            case 'task_completion': return <CheckCircleOutlined style={{ color: '#00C853' }} />;
            default: return <DollarOutlined />;
        }
    };

    const filteredTransactions = transactions.filter(t => {
        const matchesType = filterType === 'all' || t.type === filterType;
        const matchesSearch = !searchText ||
            t.hostname?.toLowerCase().includes(searchText.toLowerCase()) ||
            t.description?.toLowerCase().includes(searchText.toLowerCase()) ||
            t.userId?.toLowerCase().includes(searchText.toLowerCase());
        return matchesType && matchesSearch;
    });

    const transactionColumns = [
        {
            title: 'Time',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (time) => (
                <Text type="secondary" style={{ fontSize: 12, fontFamily: 'JetBrains Mono' }}>
                    {dayjs(time).format('HH:mm')}
                </Text>
            ),
            width: 70,
        },
        {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            render: (type) => (
                <Tag icon={getTypeIcon(type)} style={{ textTransform: 'capitalize' }}>
                    {type === 'task_completion' ? 'Task' : type}
                </Tag>
            ),
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (desc, record) => (
                <Space>
                    <DesktopOutlined style={{ color: '#00B4D8' }} />
                    <div>
                        <Text strong>{desc || 'Transaction'}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{record.hostname || 'N/A'}</Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'User',
            dataIndex: 'userId',
            key: 'userId',
            render: (user) => <Text>{user || 'Guest'}</Text>,
        },
        {
            title: 'Amount',
            dataIndex: 'amount',
            key: 'amount',
            render: (amount) => (
                <Text style={{ fontFamily: 'JetBrains Mono', color: '#00C853', fontWeight: 600, fontSize: 14 }}>
                    {formatKSH(amount)}
                </Text>
            ),
            align: 'right',
        },
    ];

    const computerRevenueColumns = [
        {
            title: 'Computer',
            dataIndex: 'hostname',
            key: 'hostname',
            render: (hostname) => (
                <Space>
                    <DesktopOutlined style={{ color: '#00B4D8' }} />
                    <Text strong>{hostname}</Text>
                </Space>
            ),
        },
        {
            title: 'Usage',
            dataIndex: 'usage',
            key: 'usage',
            render: (amount) => <Text style={{ color: amount > 0 ? '#00B4D8' : '#64748B' }}>{formatKSH(amount)}</Text>,
            align: 'right',
        },
        {
            title: 'Printing',
            dataIndex: 'printing',
            key: 'printing',
            render: (amount) => <Text style={{ color: amount > 0 ? '#FFB703' : '#64748B' }}>{formatKSH(amount)}</Text>,
            align: 'right',
        },
        {
            title: 'Tasks',
            dataIndex: 'tasks',
            key: 'tasks',
            render: (amount) => <Text style={{ color: amount > 0 ? '#00C853' : '#64748B' }}>{formatKSH(amount)}</Text>,
            align: 'right',
        },
        {
            title: 'Total',
            dataIndex: 'total',
            key: 'total',
            render: (amount) => (
                <Text style={{ fontFamily: 'JetBrains Mono', color: '#00C853', fontWeight: 700 }}>
                    {formatKSH(amount)}
                </Text>
            ),
            align: 'right',
        },
    ];

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <DollarOutlined className="icon" />
                    <h1>Finance</h1>
                </div>
                <p className="page-subtitle">Track revenue, transactions, and earnings by computer</p>
            </div>

            {/* Revenue Stats */}
            <Spin spinning={loading}>
                <div className="stats-row">
                    <div className="stat-card green">
                        <div className="stat-header">
                            <div className="stat-icon green">
                                <DollarOutlined />
                            </div>
                            <Button
                                icon={<ReloadOutlined />}
                                size="small"
                                type="text"
                                onClick={fetchData}
                                loading={loading}
                            />
                        </div>
                        <div className="stat-value">{formatKSH(stats.totalRevenue)}</div>
                        <div className="stat-label">Today's Revenue</div>
                    </div>

                    <div className="stat-card teal">
                        <div className="stat-header">
                            <div className="stat-icon teal">
                                <CalendarOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{formatKSH(stats.weeklyRevenue)}</div>
                        <div className="stat-label">This Week</div>
                    </div>

                    <div className="stat-card yellow">
                        <div className="stat-header">
                            <div className="stat-icon yellow">
                                <BarChartOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{formatKSH(stats.monthlyRevenue)}</div>
                        <div className="stat-label">This Month</div>
                    </div>

                    <div className="stat-card orange">
                        <div className="stat-header">
                            <div className="stat-icon orange">
                                <ClockCircleOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{stats.transactionCount}</div>
                        <div className="stat-label">Today's Transactions</div>
                    </div>
                </div>
            </Spin>

            <Row gutter={[24, 24]}>
                {/* Revenue Chart */}
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <BarChartOutlined style={{ color: '#00C853' }} />
                                <span>Weekly Revenue</span>
                            </Space>
                        }
                        extra={
                            <Space>
                                <Button icon={<DownloadOutlined />} size="small">Export</Button>
                            </Space>
                        }
                    >
                        {dailyRevenue.length === 0 || maxDailyRevenue === 0 ? (
                            <Empty description="No revenue data yet" />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'flex-end', height: 180, gap: 16, marginBottom: 24 }}>
                                {dailyRevenue.map((item) => (
                                    <Tooltip key={item.day} title={`${item.date}: ${formatKSH(item.amount)}`}>
                                        <div style={{ flex: 1, textAlign: 'center' }}>
                                            <div
                                                style={{
                                                    height: `${Math.max((item.amount / maxDailyRevenue) * 140, 4)}px`,
                                                    background: 'linear-gradient(180deg, #00C853, #00B4D8)',
                                                    borderRadius: '8px 8px 0 0',
                                                    transition: 'all 0.3s ease',
                                                    cursor: 'pointer',
                                                    marginBottom: 8,
                                                }}
                                            />
                                            <Text type="secondary" style={{ fontSize: 12 }}>{item.day}</Text>
                                        </div>
                                    </Tooltip>
                                ))}
                            </div>
                        )}

                        {/* Revenue by Type */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <div style={{ padding: 16, background: 'rgba(0, 180, 216, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                                <DesktopOutlined style={{ fontSize: 24, color: '#00B4D8', marginBottom: 8 }} />
                                <Title level={5} style={{ margin: 0, color: '#00B4D8' }}>{formatKSH(revenueByType.sessions)}</Title>
                                <Text type="secondary" style={{ fontSize: 12 }}>Session Revenue</Text>
                            </div>
                            <div style={{ padding: 16, background: 'rgba(0, 200, 83, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                                <CheckCircleOutlined style={{ fontSize: 24, color: '#00C853', marginBottom: 8 }} />
                                <Title level={5} style={{ margin: 0, color: '#00C853' }}>{formatKSH(revenueByType.tasks)}</Title>
                                <Text type="secondary" style={{ fontSize: 12 }}>Task Revenue</Text>
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* Summary */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <RiseOutlined style={{ color: '#FFB703' }} />
                                <span>Revenue Summary</span>
                            </Space>
                        }
                    >
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Space>
                                    <DesktopOutlined style={{ color: '#00B4D8' }} />
                                    <Text>Sessions</Text>
                                </Space>
                                <Text strong style={{ color: '#00B4D8' }}>{formatKSH(revenueByType.sessions)}</Text>
                            </div>
                            <Progress
                                percent={stats.totalRevenue > 0 ? Math.round((revenueByType.sessions / stats.totalRevenue) * 100) : 0}
                                showInfo={false}
                                strokeColor="#00B4D8"
                            />
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Space>
                                    <CheckCircleOutlined style={{ color: '#00C853' }} />
                                    <Text>Tasks</Text>
                                </Space>
                                <Text strong style={{ color: '#00C853' }}>{formatKSH(revenueByType.tasks)}</Text>
                            </div>
                            <Progress
                                percent={stats.totalRevenue > 0 ? Math.round((revenueByType.tasks / stats.totalRevenue) * 100) : 0}
                                showInfo={false}
                                strokeColor="#00C853"
                            />
                        </div>
                    </Card>

                    {/* Top Earning Computer */}
                    <Card
                        title={
                            <Space>
                                <RiseOutlined style={{ color: '#FFB703' }} />
                                <span>Top Earner</span>
                            </Space>
                        }
                        style={{ marginTop: 24 }}
                    >
                        {computerRevenueList.length === 0 ? (
                            <Empty description="No data yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #00B4D8, #023047)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 16px',
                                    boxShadow: '0 0 30px rgba(0, 180, 216, 0.3)'
                                }}>
                                    <DesktopOutlined style={{ fontSize: 32, color: '#fff' }} />
                                </div>
                                <Title level={3} style={{ margin: 0 }}>{computerRevenueList[0]?.hostname || 'N/A'}</Title>
                                <Title level={2} style={{ margin: '16px 0 0', color: '#00C853' }}>
                                    {formatKSH(computerRevenueList[0]?.total || 0)}
                                </Title>
                                <Text type="secondary">top earner</Text>
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* Computer Revenue Table */}
            <Card
                title={
                    <Space>
                        <DesktopOutlined style={{ color: '#00B4D8' }} />
                        <span>Revenue by Computer</span>
                    </Space>
                }
                style={{ marginTop: 24 }}
            >
                {computerRevenueList.length === 0 ? (
                    <Empty description="No revenue data by computer yet" />
                ) : (
                    <Table
                        columns={computerRevenueColumns}
                        dataSource={computerRevenueList}
                        rowKey="hostname"
                        pagination={false}
                        summary={(pageData) => {
                            const totalUsage = pageData.reduce((sum, row) => sum + row.usage, 0);
                            const totalPrinting = pageData.reduce((sum, row) => sum + row.printing, 0);
                            const totalTasks = pageData.reduce((sum, row) => sum + row.tasks, 0);
                            const grandTotal = pageData.reduce((sum, row) => sum + row.total, 0);

                            return (
                                <Table.Summary.Row style={{ background: 'rgba(0, 200, 83, 0.1)' }}>
                                    <Table.Summary.Cell><Text strong>TOTAL</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ color: '#00B4D8' }}>{formatKSH(totalUsage)}</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ color: '#FFB703' }}>{formatKSH(totalPrinting)}</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ color: '#00C853' }}>{formatKSH(totalTasks)}</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ fontSize: 16, color: '#00C853' }}>{formatKSH(grandTotal)}</Text></Table.Summary.Cell>
                                </Table.Summary.Row>
                            );
                        }}
                    />
                )}
            </Card>

            {/* Recent Transactions */}
            <Card
                title={
                    <Space>
                        <ClockCircleOutlined style={{ color: '#FFB703' }} />
                        <span>Recent Transactions</span>
                        <Badge count={transactions.length} style={{ backgroundColor: '#00B4D8' }} />
                    </Space>
                }
                extra={
                    <Space>
                        <Input.Search
                            placeholder="Search..."
                            style={{ width: 200 }}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                        <Select
                            value={filterType}
                            onChange={setFilterType}
                            style={{ width: 130 }}
                            options={[
                                { value: 'all', label: 'All Types' },
                                { value: 'session', label: 'Sessions' },
                                { value: 'task_completion', label: 'Tasks' },
                            ]}
                        />
                    </Space>
                }
                style={{ marginTop: 24 }}
            >
                {filteredTransactions.length === 0 ? (
                    <Empty description="No transactions yet. Complete sessions or tasks to see revenue here." />
                ) : (
                    <Table
                        columns={transactionColumns}
                        dataSource={filteredTransactions}
                        rowKey="id"
                        pagination={{ pageSize: 10 }}
                    />
                )}
            </Card>
        </div>
    );
}

export default Finance;
