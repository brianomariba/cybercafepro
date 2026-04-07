import React, { useState, useEffect, useMemo } from 'react';
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
    ShopOutlined,
    FileTextOutlined,
    UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { getTransactions, getTransactionSummary, getSessions, getComputers, getPrintJobs, getActivityRecords } from '../services/api';

dayjs.extend(isBetween);

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// Currency formatter for KSH
const formatKSH = (amount) => {
    const num = Number(amount);
    return `KSH ${(!isNaN(num) ? num : 0).toLocaleString()}`;
};

function Finance() {
    const [transactions, setTransactions] = useState([]);
    const [printJobs, setPrintJobs] = useState([]);
    const [printTotals, setPrintTotals] = useState({ totalJobs: 0, bwPages: 0, colorPages: 0, bwRevenue: 0, colorRevenue: 0, totalRevenue: 0 });
    const [activityRecords, setActivityRecords] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [computers, setComputers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all');
    const [searchText, setSearchText] = useState('');
    const [dateRange, setDateRange] = useState([dayjs().startOf('day'), dayjs().endOf('day')]);

    // Fetch all data with date range
    const fetchData = async () => {
        setLoading(true);
        try {
            const params = {};
            if (dateRange && dateRange[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
            if (dateRange && dateRange[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');

            const [txnData, printData, activityData, computerData] = await Promise.all([
                getTransactions({ limit: 500, ...params }).catch(() => []),
                getPrintJobs({ limit: 500, ...params }).catch(() => ({ jobs: [], totals: {} })),
                getActivityRecords(params).catch(() => []),
                getComputers().catch(() => []),
            ]);

            // Helper to ensure arrays
            const ensureArray = (data) => {
                if (Array.isArray(data)) return data;
                if (data && Array.isArray(data.data)) return data.data;
                if (data && Array.isArray(data.transactions)) return data.transactions;
                if (data && Array.isArray(data.sessions)) return data.sessions;
                if (data && Array.isArray(data.computers)) return data.computers;
                return [];
            };

            setTransactions(ensureArray(txnData));
            
            // Print jobs
            const pJobs = printData?.jobs || [];
            setPrintJobs(pJobs);
            setPrintTotals(printData?.totals || { totalJobs: 0, bwPages: 0, colorPages: 0, bwRevenue: 0, colorRevenue: 0, totalRevenue: 0 });

            // Activity records
            setActivityRecords(ensureArray(activityData));

            setComputers(ensureArray(computerData));
        } catch (error) {
            console.error('Failed to fetch finance data:', error);
            setTransactions([]);
            setPrintJobs([]);
            setPrintTotals({ totalJobs: 0, bwPages: 0, colorPages: 0, bwRevenue: 0, colorRevenue: 0, totalRevenue: 0 });
            setActivityRecords([]);
            setComputers([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [dateRange]);

    // Photocopy records from activity records
    const photocopyRecords = useMemo(() => {
        return activityRecords.filter(r => {
            const n = (r.serviceName || '').toLowerCase();
            return n.includes('copy') || n.includes('photocopy');
        });
    }, [activityRecords]);

    const photocopyRevenue = useMemo(() => {
        return photocopyRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    }, [photocopyRecords]);

    const photocopySheets = useMemo(() => {
        return photocopyRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);
    }, [photocopyRecords]);

    // Revenue stats
    const revenueByType = useMemo(() => {
        const txns = transactions;
        return {
            sessions: txns.filter(t => t.type === 'session').reduce((sum, t) => sum + (t.amount || 0), 0),
            tasks: txns.filter(t => t.type === 'task_completion').reduce((sum, t) => sum + (t.amount || 0), 0),
            inventory: txns.filter(t => t.type === 'inventory-sale').reduce((sum, t) => sum + (t.amount || 0), 0),
            printing: printTotals.totalRevenue || 0,
            photocopies: photocopyRevenue,
        };
    }, [transactions, printTotals, photocopyRevenue]);

    const totalRevenue = useMemo(() => {
        return revenueByType.sessions + revenueByType.tasks + revenueByType.inventory + revenueByType.printing + revenueByType.photocopies;
    }, [revenueByType]);

    const transactionCount = transactions.length + printJobs.length + photocopyRecords.length;

    // Revenue by computer
    const computerRevenue = useMemo(() => {
        const map = {};
        transactions.forEach(t => {
            if (t.hostname) {
                if (!map[t.hostname]) map[t.hostname] = { hostname: t.hostname, usage: 0, printing: 0, tasks: 0, inventory: 0, photocopies: 0, total: 0 };
                if (t.type === 'session') {
                    map[t.hostname].usage += t.breakdown?.usage || t.amount || 0;
                } else if (t.type === 'task_completion') {
                    map[t.hostname].tasks += t.amount || 0;
                } else if (t.type === 'inventory-sale') {
                    map[t.hostname].inventory += t.amount || 0;
                }
            }
        });
        // Add print revenue per hostname
        printJobs.forEach(j => {
            const h = j.hostname;
            if (h) {
                if (!map[h]) map[h] = { hostname: h, usage: 0, printing: 0, tasks: 0, inventory: 0, photocopies: 0, total: 0 };
                map[h].printing += j.totalPrice || 0;
            }
        });
        // Add photocopy revenue per hostname
        photocopyRecords.forEach(r => {
            const h = r.hostname;
            if (h) {
                if (!map[h]) map[h] = { hostname: h, usage: 0, printing: 0, tasks: 0, inventory: 0, photocopies: 0, total: 0 };
                map[h].photocopies += r.totalAmount || 0;
            }
        });
        // Calculate totals
        Object.values(map).forEach(c => {
            c.total = c.usage + c.printing + c.tasks + c.inventory + c.photocopies;
        });
        return Object.values(map).sort((a, b) => b.total - a.total);
    }, [transactions, printJobs, photocopyRecords]);

    // Daily revenue chart - last 7 days or within date range
    const dailyRevenue = useMemo(() => {
        const days = [];
        const start = dateRange?.[0] || dayjs().subtract(6, 'day');
        const end = dateRange?.[1] || dayjs();
        const numDays = Math.min(end.diff(start, 'day') + 1, 14); // max 14 days on chart
        
        for (let i = numDays - 1; i >= 0; i--) {
            const day = end.subtract(i, 'day');
            const dayStr = day.format('YYYY-MM-DD');
            
            const txnAmount = transactions
                .filter(t => dayjs(t.createdAt).format('YYYY-MM-DD') === dayStr)
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            
            const printAmount = printJobs
                .filter(j => dayjs(j.receivedAt || j.timestamp).format('YYYY-MM-DD') === dayStr)
                .reduce((sum, j) => sum + (j.totalPrice || 0), 0);
            
            const copyAmount = photocopyRecords
                .filter(r => (r.date || dayjs(r.submittedAt).format('YYYY-MM-DD')) === dayStr)
                .reduce((sum, r) => sum + (r.totalAmount || 0), 0);

            days.push({
                day: day.format('ddd'),
                date: day.format('MMM DD'),
                amount: txnAmount + printAmount + copyAmount,
                txn: txnAmount,
                print: printAmount,
                copy: copyAmount,
            });
        }
        return days;
    }, [transactions, printJobs, photocopyRecords, dateRange]);

    const maxDailyRevenue = Math.max(...dailyRevenue.map(d => d.amount), 1);

    const getTypeIcon = (type) => {
        switch (type) {
            case 'session': return <DesktopOutlined style={{ color: '#00B4D8' }} />;
            case 'task_completion': return <CheckCircleOutlined style={{ color: '#00C853' }} />;
            case 'inventory-sale': return <ShopOutlined style={{ color: '#FFB703' }} />;
            case 'print': return <PrinterOutlined style={{ color: '#7b2cbf' }} />;
            case 'photocopy': return <CopyOutlined style={{ color: '#e040fb' }} />;
            default: return <DollarOutlined />;
        }
    };

    // Unified feed: merge transactions + print jobs + photocopy records
    const unifiedFeed = useMemo(() => {
        const feed = [];
        
        transactions.forEach(t => {
            feed.push({
                ...t,
                _key: t.id || t._id,
                _type: t.type,
                _time: t.createdAt,
                _amount: t.amount || 0,
                _desc: t.description || (t.type === 'session' ? 'Computer Session' : t.type === 'inventory-sale' ? `Sale: ${t.itemName || 'Item'}` : 'Transaction'),
                _user: t.userId || t.seller || 'Guest',
                _host: t.hostname || t.seller || 'N/A',
            });
        });

        printJobs.forEach(j => {
            feed.push({
                _key: j.id || `pj-${j.receivedAt}-${Math.random()}`,
                _type: 'print',
                _time: j.receivedAt || j.timestamp,
                _amount: j.totalPrice || 0,
                _desc: `Print: ${j.document || j.name || 'Document'} (${j.totalSheets || j.totalPages || 1} sheets, ${j.printType === 'color' ? '🎨 Color' : '⬛ B&W'})`,
                _user: j.sessionUser || j.user || 'Guest',
                _host: j.hostname || 'N/A',
            });
        });

        photocopyRecords.forEach(r => {
            feed.push({
                _key: r._id || `cp-${r.submittedAt}-${Math.random()}`,
                _type: 'photocopy',
                _time: r.submittedAt || r.createdAt,
                _amount: r.totalAmount || 0,
                _desc: `${r.serviceName}: ${r.quantity} copies @ ${formatKSH(r.unitPrice)}`,
                _user: r.agentUser || 'Agent',
                _host: r.hostname || 'Self',
            });
        });

        feed.sort((a, b) => new Date(b._time) - new Date(a._time));
        return feed;
    }, [transactions, printJobs, photocopyRecords]);

    const filteredFeed = useMemo(() => {
        return unifiedFeed.filter(item => {
            const matchesType = filterType === 'all' || item._type === filterType;
            const matchesSearch = !searchText ||
                item._desc?.toLowerCase().includes(searchText.toLowerCase()) ||
                item._user?.toLowerCase().includes(searchText.toLowerCase()) ||
                item._host?.toLowerCase().includes(searchText.toLowerCase());
            return matchesType && matchesSearch;
        });
    }, [unifiedFeed, filterType, searchText]);

    const feedColumns = [
        {
            title: 'Time',
            dataIndex: '_time',
            key: '_time',
            render: (time) => (
                <div>
                    <Text style={{ fontSize: 12, fontFamily: 'JetBrains Mono' }}>
                        {dayjs(time).format('HH:mm')}
                    </Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 10 }}>{dayjs(time).format('MMM D')}</Text>
                </div>
            ),
            width: 75,
        },
        {
            title: 'Type',
            dataIndex: '_type',
            key: '_type',
            render: (type) => {
                const labels = { session: 'Session', task_completion: 'Task', 'inventory-sale': 'Sale', print: 'Print', photocopy: 'Photocopy' };
                const colors = { session: 'blue', task_completion: 'green', 'inventory-sale': 'gold', print: 'purple', photocopy: 'magenta' };
                return <Tag icon={getTypeIcon(type)} color={colors[type] || 'default'} style={{ textTransform: 'capitalize' }}>{labels[type] || type}</Tag>;
            },
            width: 120,
        },
        {
            title: 'Description',
            dataIndex: '_desc',
            key: '_desc',
            render: (desc, record) => (
                <div>
                    <Text strong style={{ fontSize: 13 }}>{desc}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{record._host}</Text>
                </div>
            ),
        },
        {
            title: 'User',
            dataIndex: '_user',
            key: '_user',
            render: (user) => <Tag icon={<UserOutlined />} color="cyan">{user}</Tag>,
            width: 130,
        },
        {
            title: 'Amount',
            dataIndex: '_amount',
            key: '_amount',
            render: (amount) => (
                <Text style={{ fontFamily: 'JetBrains Mono', color: '#00C853', fontWeight: 600, fontSize: 14 }}>
                    {formatKSH(amount)}
                </Text>
            ),
            align: 'right',
            width: 130,
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
            render: (amount) => <Text style={{ color: amount > 0 ? '#7b2cbf' : '#64748B' }}>{formatKSH(amount)}</Text>,
            align: 'right',
        },
        {
            title: 'Photocopies',
            dataIndex: 'photocopies',
            key: 'photocopies',
            render: (amount) => <Text style={{ color: amount > 0 ? '#e040fb' : '#64748B' }}>{formatKSH(amount)}</Text>,
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
            title: 'Sales',
            dataIndex: 'inventory',
            key: 'inventory',
            render: (amount) => <Text style={{ color: amount > 0 ? '#FFB703' : '#64748B' }}>{formatKSH(amount)}</Text>,
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

    // Revenue breakdown cards data
    const revenueCards = [
        { label: 'Session Revenue', icon: <DesktopOutlined />, amount: revenueByType.sessions, color: '#00B4D8', bg: 'rgba(0, 180, 216, 0.1)' },
        { label: 'Print Revenue', icon: <PrinterOutlined />, amount: revenueByType.printing, color: '#7b2cbf', bg: 'rgba(123, 44, 191, 0.1)', extra: `${printTotals.bwPages || 0} BW + ${printTotals.colorPages || 0} Color sheets` },
        { label: 'Photocopy Revenue', icon: <CopyOutlined />, amount: revenueByType.photocopies, color: '#e040fb', bg: 'rgba(224, 64, 251, 0.1)', extra: `${photocopySheets} sheets from ${photocopyRecords.length} records` },
        { label: 'Task Revenue', icon: <CheckCircleOutlined />, amount: revenueByType.tasks, color: '#00C853', bg: 'rgba(0, 200, 83, 0.1)' },
        { label: 'Sales Revenue', icon: <ShopOutlined />, amount: revenueByType.inventory, color: '#FFB703', bg: 'rgba(255, 183, 3, 0.1)' },
    ];

    const dateLabel = dateRange
        ? (dateRange[0].isSame(dateRange[1], 'day') ? dateRange[0].format('MMM D, YYYY') : `${dateRange[0].format('MMM D')} – ${dateRange[1].format('MMM D, YYYY')}`)
        : 'All Time';

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <DollarOutlined className="icon" />
                    <h1>Finance</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <RangePicker
                        value={dateRange}
                        onChange={(val) => setDateRange(val || [dayjs().startOf('day'), dayjs().endOf('day')])}
                        presets={[
                            { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                            { label: 'Yesterday', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
                            { label: 'This Week', value: [dayjs().startOf('week'), dayjs().endOf('day')] },
                            { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
                            { label: 'Last 7 Days', value: [dayjs().subtract(7, 'day'), dayjs().endOf('day')] },
                            { label: 'Last 30 Days', value: [dayjs().subtract(30, 'day'), dayjs().endOf('day')] },
                        ]}
                        size="small"
                    />
                    <Button
                        icon={<ReloadOutlined spin={loading} />}
                        size="small"
                        type="primary"
                        ghost
                        onClick={fetchData}
                        loading={loading}
                    >
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Revenue Stats */}
            <Spin spinning={loading}>
                <div className="stats-row">
                    <div className="stat-card green">
                        <div className="stat-header">
                            <div className="stat-icon green">
                                <DollarOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{formatKSH(totalRevenue)}</div>
                        <div className="stat-label">Total Revenue ({dateLabel})</div>
                    </div>

                    <div className="stat-card" style={{ borderLeft: '3px solid #7b2cbf' }}>
                        <div className="stat-header">
                            <div className="stat-icon" style={{ background: 'rgba(123,44,191,0.15)', color: '#7b2cbf' }}>
                                <PrinterOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{formatKSH(revenueByType.printing)}</div>
                        <div className="stat-label">Printing ({printTotals.totalJobs || 0} jobs)</div>
                    </div>

                    <div className="stat-card" style={{ borderLeft: '3px solid #e040fb' }}>
                        <div className="stat-header">
                            <div className="stat-icon" style={{ background: 'rgba(224,64,251,0.15)', color: '#e040fb' }}>
                                <CopyOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{formatKSH(revenueByType.photocopies)}</div>
                        <div className="stat-label">Photocopies ({photocopySheets} sheets)</div>
                    </div>

                    <div className="stat-card orange">
                        <div className="stat-header">
                            <div className="stat-icon orange">
                                <ClockCircleOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{transactionCount}</div>
                        <div className="stat-label">Total Records</div>
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
                                <span style={{ fontFamily: 'Outfit' }}>Revenue ({dateLabel})</span>
                            </Space>
                        }
                    >
                        {dailyRevenue.length === 0 || maxDailyRevenue === 0 ? (
                            <Empty description="No revenue data yet" />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'flex-end', height: 180, gap: dailyRevenue.length > 10 ? 6 : 16, marginBottom: 24 }}>
                                {dailyRevenue.map((item) => (
                                    <Tooltip key={item.date} title={
                                        <div>
                                            <div><strong>{item.date}: {formatKSH(item.amount)}</strong></div>
                                            {item.txn > 0 && <div>Sessions/Tasks/Sales: {formatKSH(item.txn)}</div>}
                                            {item.print > 0 && <div>Printing: {formatKSH(item.print)}</div>}
                                            {item.copy > 0 && <div>Photocopies: {formatKSH(item.copy)}</div>}
                                        </div>
                                    }>
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
                                            <Text type="secondary" style={{ fontSize: dailyRevenue.length > 10 ? 10 : 12 }}>{item.day}</Text>
                                        </div>
                                    </Tooltip>
                                ))}
                            </div>
                        )}

                        {/* Revenue by Type */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                            {revenueCards.map((card) => (
                                <Tooltip key={card.label} title={card.extra || ''}>
                                    <div style={{ padding: 12, background: card.bg, borderRadius: 12, textAlign: 'center', cursor: 'default' }}>
                                        {React.cloneElement(card.icon, { style: { fontSize: 20, color: card.color, marginBottom: 6 } })}
                                        <Title level={5} style={{ margin: 0, color: card.color, fontSize: 14 }}>{formatKSH(card.amount)}</Title>
                                        <Text type="secondary" style={{ fontSize: 11 }}>{card.label}</Text>
                                    </div>
                                </Tooltip>
                            ))}
                        </div>
                    </Card>
                </Col>

                {/* Summary */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <RiseOutlined style={{ color: '#FFB703' }} />
                                <span style={{ fontFamily: 'Outfit' }}>Revenue Breakdown</span>
                            </Space>
                        }
                    >
                        {revenueCards.map((card) => {
                            const pct = totalRevenue > 0 ? Math.round((card.amount / totalRevenue) * 100) : 0;
                            return (
                                <div key={card.label} style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <Space>
                                            {React.cloneElement(card.icon, { style: { color: card.color } })}
                                            <Text style={{ fontSize: 13 }}>{card.label}</Text>
                                        </Space>
                                        <Text strong style={{ color: card.color, fontFamily: 'JetBrains Mono', fontSize: 13 }}>{formatKSH(card.amount)}</Text>
                                    </div>
                                    <Progress
                                        percent={pct}
                                        showInfo={true}
                                        strokeColor={card.color}
                                        size="small"
                                        format={() => `${pct}%`}
                                    />
                                </div>
                            );
                        })}
                    </Card>

                    {/* Top Earning Computer */}
                    <Card
                        title={
                            <Space>
                                <RiseOutlined style={{ color: '#FFB703' }} />
                                <span style={{ fontFamily: 'Outfit' }}>Top Earner</span>
                            </Space>
                        }
                        style={{ marginTop: 24 }}
                    >
                        {computerRevenue.length === 0 ? (
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
                                <Title level={3} style={{ margin: 0 }}>{computerRevenue[0]?.hostname || 'N/A'}</Title>
                                <Title level={2} style={{ margin: '16px 0 0', color: '#00C853' }}>
                                    {formatKSH(computerRevenue[0]?.total || 0)}
                                </Title>
                                <Text type="secondary">top earner</Text>
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* Print Revenue Breakdown */}
            {(printTotals.totalJobs > 0) && (
                <Card
                    title={
                        <Space>
                            <PrinterOutlined style={{ color: '#7b2cbf' }} />
                            <span style={{ fontFamily: 'Outfit' }}>Print Revenue Breakdown</span>
                            <Badge count={printTotals.totalJobs} style={{ backgroundColor: '#7b2cbf' }} />
                        </Space>
                    }
                    style={{ marginTop: 24 }}
                >
                    <Row gutter={[16, 16]}>
                        <Col span={6}>
                            <Statistic
                                title={<Text type="secondary">B&W Sheets</Text>}
                                value={printTotals.bwPages || 0}
                                prefix={<FileTextOutlined style={{ color: '#b0b0c0' }} />}
                                valueStyle={{ color: '#b0b0c0' }}
                            />
                        </Col>
                        <Col span={6}>
                            <Statistic
                                title={<Text type="secondary">B&W Revenue</Text>}
                                value={printTotals.bwRevenue || 0}
                                prefix="KSH"
                                valueStyle={{ color: '#b0b0c0', fontFamily: 'JetBrains Mono' }}
                            />
                        </Col>
                        <Col span={6}>
                            <Statistic
                                title={<Text type="secondary">Color Sheets</Text>}
                                value={printTotals.colorPages || 0}
                                prefix={<FileTextOutlined style={{ color: '#e040fb' }} />}
                                valueStyle={{ color: '#e040fb' }}
                            />
                        </Col>
                        <Col span={6}>
                            <Statistic
                                title={<Text type="secondary">Color Revenue</Text>}
                                value={printTotals.colorRevenue || 0}
                                prefix="KSH"
                                valueStyle={{ color: '#e040fb', fontFamily: 'JetBrains Mono' }}
                            />
                        </Col>
                    </Row>
                </Card>
            )}

            {/* Computer Revenue Table */}
            <Card
                title={
                    <Space>
                        <DesktopOutlined style={{ color: '#00B4D8' }} />
                        <span style={{ fontFamily: 'Outfit' }}>Revenue by Computer</span>
                    </Space>
                }
                style={{ marginTop: 24 }}
            >
                {computerRevenue.length === 0 ? (
                    <Empty description="No revenue data by computer yet" />
                ) : (
                    <Table
                        columns={computerRevenueColumns}
                        dataSource={computerRevenue}
                        rowKey="hostname"
                        pagination={false}
                        size="small"
                        summary={(pageData) => {
                            const t = pageData.reduce((acc, row) => ({
                                usage: acc.usage + row.usage,
                                printing: acc.printing + row.printing,
                                photocopies: acc.photocopies + row.photocopies,
                                tasks: acc.tasks + row.tasks,
                                inventory: acc.inventory + row.inventory,
                                total: acc.total + row.total,
                            }), { usage: 0, printing: 0, photocopies: 0, tasks: 0, inventory: 0, total: 0 });

                            return (
                                <Table.Summary.Row style={{ background: 'rgba(0, 200, 83, 0.1)' }}>
                                    <Table.Summary.Cell><Text strong>TOTAL</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ color: '#00B4D8' }}>{formatKSH(t.usage)}</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ color: '#7b2cbf' }}>{formatKSH(t.printing)}</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ color: '#e040fb' }}>{formatKSH(t.photocopies)}</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ color: '#00C853' }}>{formatKSH(t.tasks)}</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ color: '#FFB703' }}>{formatKSH(t.inventory)}</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell align="right"><Text strong style={{ fontSize: 16, color: '#00C853' }}>{formatKSH(t.total)}</Text></Table.Summary.Cell>
                                </Table.Summary.Row>
                            );
                        }}
                    />
                )}
            </Card>

            {/* All Records Feed */}
            <Card
                title={
                    <Space>
                        <ClockCircleOutlined style={{ color: '#FFB703' }} />
                        <span style={{ fontFamily: 'Outfit' }}>All Financial Records</span>
                        <Badge count={unifiedFeed.length} style={{ backgroundColor: '#00B4D8' }} />
                    </Space>
                }
                extra={
                    <Space>
                        <Input.Search
                            placeholder="Search..."
                            style={{ width: 200 }}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                        <Select
                            value={filterType}
                            onChange={setFilterType}
                            style={{ width: 160 }}
                            options={[
                                { value: 'all', label: '📊 All Types' },
                                { value: 'session', label: '🖥️ Sessions' },
                                { value: 'print', label: '🖨️ Printing' },
                                { value: 'photocopy', label: '📋 Photocopies' },
                                { value: 'task_completion', label: '✅ Tasks' },
                                { value: 'inventory-sale', label: '🛒 Sales' },
                            ]}
                        />
                    </Space>
                }
                style={{ marginTop: 24 }}
            >
                {filteredFeed.length === 0 ? (
                    <Empty description="No records found for the selected filters and date range." />
                ) : (
                    <Table
                        columns={feedColumns}
                        dataSource={filteredFeed}
                        rowKey="_key"
                        pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['10', '15', '25', '50'], showTotal: (t) => `${t} records` }}
                        size="small"
                    />
                )}
            </Card>
        </div>
    );
}

export default Finance;
