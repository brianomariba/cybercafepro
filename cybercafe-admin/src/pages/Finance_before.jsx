import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Tooltip, Badge, Statistic, Row, Col, DatePicker, Modal, Tabs, Avatar, Progress, Spin, Empty, Popconfirm, message } from 'antd';
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
    DeleteOutlined,
} from '@ant-design/icons';
import { Area, Pie, Column } from '@ant-design/charts';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { getTransactions, getTransactionSummary, getSessions, getComputers, getPrintJobs, getActivityRecords, deletePaymentRecord } from '../services/api';

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

    // Service records from activity records
    const serviceRecords = useMemo(() => {
        const photocopies = [];
        const lamination = [];
        const internet = [];
        const other = [];
        activityRecords.forEach(r => {
            const n = (r.serviceName || '').toLowerCase();
            if (n.includes('copy') || n.includes('photocopy')) photocopies.push(r);
            else if (n.includes('laminat')) lamination.push(r);
            else if (n.includes('internet')) internet.push(r);
            else other.push(r);
        });
        return { photocopies, lamination, internet, other };
    }, [activityRecords]);

    const serviceRevenue = useMemo(() => {
        const sum = (arr) => arr.reduce((s, r) => s + (r.totalAmount || 0), 0);
        return {
            photocopies: sum(serviceRecords.photocopies),
            lamination: sum(serviceRecords.lamination),
            internet: sum(serviceRecords.internet),
            other: sum(serviceRecords.other)
        };
    }, [serviceRecords]);

    const photocopySheets = useMemo(() => {
        return serviceRecords.photocopies.reduce((sum, r) => sum + (r.quantity || 0), 0);
    }, [serviceRecords]);

    // Revenue stats
    const revenueByType = useMemo(() => {
        const txns = transactions;
        return {
            inventory: txns.filter(t => t.type === 'inventory-sale').reduce((sum, t) => sum + (t.amount || 0), 0),
            printing: printTotals.totalRevenue || 0,
            photocopies: serviceRevenue.photocopies,
            lamination: serviceRevenue.lamination,
            internet: serviceRevenue.internet,
            other: serviceRevenue.other
        };
    }, [transactions, printTotals, serviceRevenue]);

    const totalRevenue = useMemo(() => {
        return revenueByType.inventory + revenueByType.printing + revenueByType.photocopies + revenueByType.lamination + revenueByType.internet + revenueByType.other;
    }, [revenueByType]);

    const transactionCount = transactions.length + printJobs.length + activityRecords.length;

    // Revenue by computer
    const computerRevenue = useMemo(() => {
        const map = {};
        transactions.forEach(t => {
            if (t.hostname) {
                if (!map[t.hostname]) map[t.hostname] = { hostname: t.hostname, usage: 0, printing: 0, tasks: 0, inventory: 0, photocopies: 0, total: 0 };
                if (t.type === 'inventory-sale') {
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
        serviceRecords.photocopies.forEach(r => {
            const h = r.hostname;
            if (h) {
                if (!map[h]) map[h] = { hostname: h, usage: 0, printing: 0, tasks: 0, inventory: 0, photocopies: 0, total: 0 };
                map[h].photocopies += r.totalAmount || 0;
            }
        });
        // Calculate totals
        Object.values(map).forEach(c => {
            c.total = c.inventory + c.printing + c.photocopies;
        });
        return Object.values(map).sort((a, b) => b.total - a.total);
    }, [transactions, printJobs, serviceRecords]);

    // Revenue by shop
    const shopRevenue = useMemo(() => {
        const map = {};
        const getShop = (host) => {
            if (!host) return 'Main Shop';
            const parts = host.split('-');
            return parts.length > 1 ? parts[0].toUpperCase() : 'Main Shop';
        };

        transactions.forEach(t => {
            if (t.type === 'inventory-sale') {
                const shop = getShop(t.hostname);
                if (!map[shop]) map[shop] = { shop, printing: 0, photocopies: 0, internet: 0, sales: 0, lamination: 0, other: 0, total: 0 };
                map[shop].sales += t.amount || 0;
            }
        });
        printJobs.forEach(j => {
            const shop = getShop(j.hostname || j.computer);
            if (!map[shop]) map[shop] = { shop, printing: 0, photocopies: 0, internet: 0, sales: 0, lamination: 0, other: 0, total: 0 };
            map[shop].printing += j.totalPrice || 0;
        });
        activityRecords.forEach(r => {
            const shop = getShop(r.hostname || r.agentUser || '');
            if (!map[shop]) map[shop] = { shop, printing: 0, photocopies: 0, internet: 0, sales: 0, lamination: 0, other: 0, total: 0 };
            const n = (r.serviceName || '').toLowerCase();
            const amt = r.totalAmount || 0;
            if (n.includes('copy') || n.includes('photocopy')) map[shop].photocopies += amt;
            else if (n.includes('laminat')) map[shop].lamination += amt;
            else if (n.includes('internet')) map[shop].internet += amt;
            else map[shop].other += amt;
        });

        Object.values(map).forEach(s => {
            s.total = s.printing + s.photocopies + s.internet + s.sales + s.lamination + s.other;
        });
        return Object.values(map).sort((a, b) => b.total - a.total);
    }, [transactions, printJobs, activityRecords]);

    // Agent Performance
    const agentPerformance = useMemo(() => {
        const map = {};
        
        // Track collected revenue (hardware counters / system recorded)
        printJobs.forEach(j => {
            const agent = j.agentUser || j.user || 'Unknown';
            if (!map[agent]) map[agent] = { agent, collected: 0, submitted: 0 };
            map[agent].collected += j.totalPrice || 0;
        });

        // Add sales as collected
        transactions.forEach(t => {
            if (t.type === 'inventory-sale') {
                const agent = t.seller || t.userId || 'Unknown';
                if (!map[agent]) map[agent] = { agent, collected: 0, submitted: 0 };
                map[agent].collected += t.amount || 0;
            }
        });

        // Add activity records as collected and submitted depending on logic
        // We assume activity records represent what the agent MANUALLY logged.
        // If there's an actual 'cash drop' transaction type, we'd use that for submitted.
        // For now, we will treat activity records as what they report, but wait: 
        // "Revenue collected (what the system tracked they should have collected), 
        // Revenue submitted (what they actually submitted/reported)."
        // We will assume activity records are "submitted" (reported) tasks if they manually log them.
        // Alternatively, if they submit cash drops, we could sum those. Since we don't have a specific
        // cash drop type, let's treat activity logs as what they reported/submitted.
        activityRecords.forEach(r => {
            const agent = r.agentUser || r.submittedBy || r.user || 'Unknown';
            if (!map[agent]) map[agent] = { agent, collected: 0, submitted: 0 };
            map[agent].submitted += r.totalAmount || 0;
            // For services not automatically tracked, we also add to collected so they balance out
            // unless they are photocopies, which might have hardware counters.
            const isPhotocopy = (r.serviceName || '').toLowerCase().includes('copy');
            if (!isPhotocopy) {
                map[agent].collected += r.totalAmount || 0;
            }
        });

        const list = Object.values(map).map(a => ({
            ...a,
            difference: a.submitted - a.collected
        }));
        return list.sort((a, b) => b.collected - a.collected);
    }, [transactions, printJobs, activityRecords]);

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
                .filter(t => t.type === 'inventory-sale' && dayjs(t.createdAt).format('YYYY-MM-DD') === dayStr)
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            
            const printAmount = printJobs
                .filter(j => dayjs(j.receivedAt || j.timestamp).format('YYYY-MM-DD') === dayStr)
                .reduce((sum, j) => sum + (j.totalPrice || 0), 0);
            
            const copyAmount = serviceRecords.photocopies
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
    }, [transactions, printJobs, serviceRecords, dateRange]);

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

        activityRecords.forEach(r => {
            feed.push({
                _key: r._id || `cp-${r.submittedAt}-${Math.random()}`,
                _type: 'photocopy',
                _time: r.submittedAt || r.createdAt,
                _amount: r.totalAmount || 0,
                _desc: `${r.serviceName}: ${r.quantity} @ ${formatKSH(r.unitPrice)}`,
                _user: r.agentUser || 'Agent',
                _host: r.hostname || 'Self',
            });
        });

        feed.sort((a, b) => new Date(b._time) - new Date(a._time));
        return feed;
    }, [transactions, printJobs, activityRecords]);

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
        {
            title: 'Action',
            key: 'action',
            width: 80,
            align: 'center',
            render: (_, record) => {
                // Only show delete for mpesa/payment type transactions
                if (!record._id && !record.id) return null;
                return (
                    <Popconfirm
                        title="Delete this payment record?"
                        description="This action cannot be undone."
                        onConfirm={async () => {
                            try {
                                await deletePaymentRecord(record._id || record.id);
                                message.success('Payment record deleted');
                                fetchData();
                            } catch (err) {
                                message.error('Failed to delete record');
                            }
                        }}
                        okText="Delete"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true }}
                    >
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                    </Popconfirm>
                );
            },
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

    const shopRevenueColumns = [
        {
            title: 'Shop',
            dataIndex: 'shop',
            key: 'shop',
            render: (shop) => (
                <Space>
                    <ShopOutlined style={{ color: '#FFB703' }} />
                    <Text strong>{shop}</Text>
                </Space>
            ),
        },
        { title: 'Printing', dataIndex: 'printing', align: 'right', render: (amount) => formatKSH(amount) },
        { title: 'Photocopy', dataIndex: 'photocopies', align: 'right', render: (amount) => formatKSH(amount) },
        { title: 'Internet', dataIndex: 'internet', align: 'right', render: (amount) => formatKSH(amount) },
        { title: 'Sales', dataIndex: 'sales', align: 'right', render: (amount) => formatKSH(amount) },
        { title: 'Lamination', dataIndex: 'lamination', align: 'right', render: (amount) => formatKSH(amount) },
        { title: 'Other Services', dataIndex: 'other', align: 'right', render: (amount) => formatKSH(amount) },
        { title: 'Total', dataIndex: 'total', align: 'right', render: (amount) => <Text strong style={{ color: '#00C853' }}>{formatKSH(amount)}</Text> },
    ];

    const agentPerformanceColumns = [
        {
            title: 'Agent',
            dataIndex: 'agent',
            key: 'agent',
            render: (agent) => (
                <Space>
                    <UserOutlined style={{ color: '#00B4D8' }} />
                    <Text strong>{agent}</Text>
                </Space>
            ),
        },
        {
            title: 'Revenue Collected',
            dataIndex: 'collected',
            key: 'collected',
            align: 'right',
            render: (amount) => <Text>{formatKSH(amount)}</Text>
        },
        {
            title: 'Revenue Submitted',
            dataIndex: 'submitted',
            key: 'submitted',
            align: 'right',
            render: (amount) => <Text>{formatKSH(amount)}</Text>
        },
        {
            title: 'Underreported Amount',
            key: 'underreported',
            align: 'right',
            render: (_, record) => {
                const diff = record.collected - record.submitted;
                return diff > 0 ? <Text type="danger">{formatKSH(diff)}</Text> : <Text type="secondary">-</Text>;
            }
        },
        {
            title: 'Overreported Amount',
            key: 'overreported',
            align: 'right',
            render: (_, record) => {
                const diff = record.submitted - record.collected;
                return diff > 0 ? <Text type="success">{formatKSH(diff)}</Text> : <Text type="secondary">-</Text>;
            }
        }
    ];

    // Revenue breakdown cards data
    const revenueCards = [
        { label: 'Print Revenue', icon: <PrinterOutlined />, amount: revenueByType.printing, color: '#7b2cbf', bg: 'rgba(123, 44, 191, 0.1)', extra: `${printTotals.bwPages || 0} BW + ${printTotals.colorPages || 0} Color sheets` },
        { label: 'Photocopy', icon: <CopyOutlined />, amount: revenueByType.photocopies, color: '#e040fb', bg: 'rgba(224, 64, 251, 0.1)', extra: `${photocopySheets} sheets` },
        { label: 'Sales Revenue', icon: <ShopOutlined />, amount: revenueByType.inventory, color: '#FFB703', bg: 'rgba(255, 183, 3, 0.1)' },
        { label: 'Internet', icon: <DesktopOutlined />, amount: revenueByType.internet, color: '#00B4D8', bg: 'rgba(0, 180, 216, 0.1)' },
        { label: 'Lamination & Other', icon: <ScanOutlined />, amount: revenueByType.lamination + revenueByType.other, color: '#00C853', bg: 'rgba(0, 200, 83, 0.1)' },
    ];

    const dateLabel = dateRange
        ? (dateRange[0].isSame(dateRange[1], 'day') ? dateRange[0].format('MMM D, YYYY') : `${dateRange[0].format('MMM D')} – ${dateRange[1].format('MMM D, YYYY')}`)
        : 'All Time';

