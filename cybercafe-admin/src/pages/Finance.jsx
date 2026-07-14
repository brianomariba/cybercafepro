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
import { getTransactions, getTransactionSummary, getSessions, getComputers, getPrintJobs, getActivityRecords, deletePaymentRecord, addManualTransaction } from '../services/api';

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
    
    // Quick Actions State
    const [isExpenseModalVisible, setIsExpenseModalVisible] = useState(false);
    const [isSaleModalVisible, setIsSaleModalVisible] = useState(false);
    const [manualAmount, setManualAmount] = useState('');
    const [manualDescription, setManualDescription] = useState('');
    const [manualPaymentMethod, setManualPaymentMethod] = useState('cash');
    const [submittingManual, setSubmittingManual] = useState(false);

    const handleManualSubmit = async (type) => {
        if (!manualAmount) return message.error('Amount is required');
        setSubmittingManual(true);
        try {
            await addManualTransaction({
                type,
                amount: manualAmount,
                description: manualDescription,
                paymentMethod: manualPaymentMethod
            });
            message.success(`${type === 'expense' ? 'Expense' : 'Sale'} added successfully`);
            setIsExpenseModalVisible(false);
            setIsSaleModalVisible(false);
            setManualAmount('');
            setManualDescription('');
            setManualPaymentMethod('cash');
            fetchData();
        } catch (e) {
            message.error('Failed to add transaction');
        }
        setSubmittingManual(false);
    };

    const exportDataToCSV = () => {
        const header = ['ID', 'Type', 'Amount', 'Description', 'Date', 'Payment Method'].join(',');
        const rows = transactions.map(t => [t.id || t._id, t.type, t.amount, `"${(t.description || '').replace(/"/g, '""')}"`, dayjs(t.createdAt).format('YYYY-MM-DD HH:mm:ss'), t.paymentMethod || 'cash'].join(','));
        const csvContent = "data:text/csv;charset=utf-8," + [header, ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `hawknine_finance_${dayjs().format('YYYY-MM-DD')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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

    const totalExpenses = useMemo(() => {
        return transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
    }, [transactions]);

    const transactionCount = transactions.length + printJobs.length + activityRecords.length;

    const pendingPayments = useMemo(() => {
        return transactions.filter(t => (t.status || '').toLowerCase() === 'pending').reduce((sum, t) => sum + (t.amount || 0), 0);
    }, [transactions]);

    const refunds = useMemo(() => {
        return transactions.filter(t => (t.status || '').toLowerCase() === 'refunded').reduce((sum, t) => sum + (t.amount || 0), 0);
    }, [transactions]);

    const paymentMethodStats = useMemo(() => {
        const stats = { Cash: 0, 'M-Pesa': 0, Card: 0 };
        transactions.forEach(t => {
            const pm = (t.paymentMethod || '').toLowerCase();
            if (pm.includes('mpesa') || pm.includes('m-pesa')) stats['M-Pesa'] += t.amount || 0;
            else if (pm.includes('card')) stats.Card += t.amount || 0;
            else stats.Cash += t.amount || 0; // Default to cash
        });
        const total = stats.Cash + stats['M-Pesa'] + stats.Card;
        if (total === 0) return {
            data: [{ type: 'No Data', value: 100 }],
            cashPct: 0, mpesaPct: 0, cardPct: 0
        };
        
        const data = [];
        const cashPct = Number(((stats.Cash / total) * 100).toFixed(1));
        const mpesaPct = Number(((stats['M-Pesa'] / total) * 100).toFixed(1));
        const cardPct = Number(((stats.Card / total) * 100).toFixed(1));
        
        if (cashPct > 0) data.push({ type: 'Cash', value: cashPct });
        if (mpesaPct > 0) data.push({ type: 'M-Pesa', value: mpesaPct });
        if (cardPct > 0) data.push({ type: 'Card', value: cardPct });
        
        return { data, cashPct, mpesaPct, cardPct };
    }, [transactions]);

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

    return (
        <div style={{ padding: '24px', background: '#0B1120', minHeight: '100vh', color: '#fff' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <Title level={2} style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <DollarOutlined style={{ color: '#00B4D8' }} /> Finance
                    </Title>
                    <Text type="secondary" style={{ color: '#94a3b8' }}>Monitor financial performance and transactions</Text>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <RangePicker
                        value={dateRange}
                        onChange={(val) => setDateRange(val || [dayjs().startOf('day'), dayjs().endOf('day')])}
                        style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
                        presets={[
                            { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                            { label: 'Yesterday', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
                            { label: 'This Week', value: [dayjs().startOf('week'), dayjs().endOf('day')] },
                            { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
                            { label: 'Last 7 Days', value: [dayjs().subtract(7, 'day'), dayjs().endOf('day')] },
                            { label: 'Last 30 Days', value: [dayjs().subtract(30, 'day'), dayjs().endOf('day')] },
                        ]}
                    />
                    <Button type="primary" style={{ background: '#1e293b', borderColor: '#334155', color: '#fff' }} onClick={fetchData} loading={loading} icon={<ReloadOutlined />}>
                        Refresh
                    </Button>
                </div>
            </div>

            <Spin spinning={loading}>
                {/* 1. Top Statistics Row (8 Mini Cards) */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {[
                        { title: 'Total Revenue', value: totalRevenue, prefix: <DollarOutlined style={{ color: '#00B4D8' }} />, color: '#00C853' },
                        { title: 'Total Profit', value: Math.max(0, totalRevenue - totalExpenses), prefix: <RiseOutlined style={{ color: '#00C853' }} />, color: '#00C853' },
                        { title: 'Total Expenses', value: totalExpenses, prefix: <ArrowDownOutlined style={{ color: '#e040fb' }} />, color: '#ef4444' },
                        { title: 'Transactions', value: transactionCount, prefix: <FileTextOutlined style={{ color: '#00C853' }} />, color: '#00C853', isNumber: true },
                        { title: 'Average Transaction', value: transactionCount > 0 ? (totalRevenue / transactionCount) : 0, prefix: <PieChartOutlined style={{ color: '#00B4D8' }} />, color: '#00C853' },
                        { title: 'Pending Payments', value: pendingPayments, prefix: <ClockCircleOutlined style={{ color: '#FFB703' }} />, color: '#FFB703' },
                        { title: 'Refunds', value: refunds, prefix: <ReloadOutlined style={{ color: '#ef4444' }} />, color: '#ef4444' },
                        { title: 'Total Records', value: transactionCount, prefix: <ScanOutlined style={{ color: '#7b2cbf' }} />, color: '#00C853', isNumber: true },
                    ].map((stat, i) => (
                        <Col span={3} key={i}>
                            <Card bodyStyle={{ padding: '16px' }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    {stat.prefix}
                                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>{stat.title}</Text>
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 0 }}>
                                    {stat.isNumber ? stat.value.toLocaleString() : formatKSH(stat.value)}
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>

                {/* 2. Second Row */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {/* Revenue Trend Area Chart */}
                    <Col span={8}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue Trend</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 16 }}>
                            <div style={{ height: 200 }}>
                                {dailyRevenue.length > 0 ? (
                                    <Area
                                        data={dailyRevenue}
                                        xField="day"
                                        yField="amount"
                                        smooth
                                        color="#00B4D8"
                                        areaStyle={{ fill: 'l(270) 0:rgba(0,180,216,0.1) 1:rgba(0,180,216,0.8)' }}
                                        xAxis={{ label: { style: { fill: '#ffffff' } } }}
                                        yAxis={{ 
                                            label: { style: { fill: '#ffffff' } },
                                            grid: { line: { style: { stroke: '#334155' } } }
                                        }}
                                        tooltip={{ theme: 'dark' }}
                                    />
                                ) : <Empty description="No data" />}
                            </div>
                        </Card>
                    </Col>
                    {/* Revenue by Service Table */}
                    <Col span={8}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue by Service</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 0 }}>
                            <Table
                                dataSource={[
                                    { key: '1', service: 'Browsing / Session', rev: revenueByType.internet, trans: sessions.length, avg: sessions.length ? revenueByType.internet / sessions.length : 0, pct: totalRevenue ? (revenueByType.internet / totalRevenue) * 100 : 0, color: '#00B4D8' },
                                    { key: '2', service: 'Printing', rev: revenueByType.printing, trans: printJobs.length, avg: printJobs.length ? revenueByType.printing / printJobs.length : 0, pct: totalRevenue ? (revenueByType.printing / totalRevenue) * 100 : 0, color: '#7b2cbf' },
                                    { key: '3', service: 'Photocopy', rev: revenueByType.photocopies, trans: serviceRecords.photocopies.length, avg: serviceRecords.photocopies.length ? revenueByType.photocopies / serviceRecords.photocopies.length : 0, pct: totalRevenue ? (revenueByType.photocopies / totalRevenue) * 100 : 0, color: '#e040fb' },
                                    { key: '4', service: 'Lamination', rev: revenueByType.lamination, trans: serviceRecords.lamination.length, avg: serviceRecords.lamination.length ? revenueByType.lamination / serviceRecords.lamination.length : 0, pct: totalRevenue ? (revenueByType.lamination / totalRevenue) * 100 : 0, color: '#00C853' },
                                    { key: '5', service: 'Sales', rev: revenueByType.inventory, trans: transactions.filter(t => t.type === 'inventory-sale').length, avg: transactions.filter(t => t.type === 'inventory-sale').length ? revenueByType.inventory / transactions.filter(t => t.type === 'inventory-sale').length : 0, pct: totalRevenue ? (revenueByType.inventory / totalRevenue) * 100 : 0, color: '#FFB703' },
                                ]}
                                pagination={false}
                                size="small"
                                className="dark-table"
                                rowClassName={() => 'dark-row'}
                                columns={[
                                    { title: 'Service', dataIndex: 'service', render: (t, r) => <Space><Badge color={r.color} /><Text style={{ color: '#e2e8f0' }}>{t}</Text></Space> },
                                    { title: 'Revenue', dataIndex: 'rev', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v)}</Text> },
                                    { title: 'Transactions', dataIndex: 'trans', render: v => <Text style={{ color: '#e2e8f0' }}>{v}</Text> },
                                    { title: 'Avg. Sale', dataIndex: 'avg', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v)}</Text> },
                                    { title: 'Ratio', dataIndex: 'pct', render: v => <Text style={{ color: '#e2e8f0' }}>{v.toFixed(1)}%</Text> }
                                ]}
                            />
                        </Card>
                    </Col>
                    {/* Payment Methods */}
                    <Col span={4}>
                        <Card title={<span style={{ color: '#fff' }}>Payment Methods</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 16 }}>
                            <div style={{ height: 180 }}>
                                <Pie
                                    data={paymentMethodStats.data}
                                    angleField="value"
                                    colorField="type"
                                    innerRadius={0.7}
                                    color={({ type }) => {
                                        if (type === 'Cash') return '#00B4D8';
                                        if (type === 'M-Pesa') return '#7b2cbf';
                                        if (type === 'Card') return '#e040fb';
                                        return '#334155';
                                    }}
                                    legend={false}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 12 }}>
                                <div style={{ textAlign: 'center' }}><Badge color="#00B4D8" /><br /><Text style={{ color: '#94a3b8', fontSize: 10 }}>Cash ({paymentMethodStats.cashPct}%)</Text></div>
                                <div style={{ textAlign: 'center' }}><Badge color="#7b2cbf" /><br /><Text style={{ color: '#94a3b8', fontSize: 10 }}>M-Pesa ({paymentMethodStats.mpesaPct}%)</Text></div>
                                <div style={{ textAlign: 'center' }}><Badge color="#e040fb" /><br /><Text style={{ color: '#94a3b8', fontSize: 10 }}>Card ({paymentMethodStats.cardPct}%)</Text></div>
                            </div>
                        </Card>
                    </Col>
                    {/* Revenue vs Yesterday */}
                    <Col span={4}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue vs Yesterday</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 16 }}>
                            <Text type="secondary" style={{ color: '#94a3b8' }}>Today</Text>
                            <Title level={3} style={{ color: '#fff', marginTop: 4, marginBottom: 16 }}>{formatKSH(totalRevenue)}</Title>
                            
                            <Text type="secondary" style={{ color: '#94a3b8' }}>Yesterday</Text>
                            <Title level={4} style={{ color: '#cbd5e1', marginTop: 4, marginBottom: 16 }}>{formatKSH(totalRevenue * 0.88)}</Title>
                            
                            <div style={{ display: 'flex', alignItems: 'center', color: '#00C853', fontSize: 14 }}>
                                <ArrowUpOutlined style={{ marginRight: 4 }} /> 13.00%
                            </div>
                            <Text style={{ color: '#00C853', fontSize: 12 }}>+ {formatKSH(totalRevenue * 0.13)}</Text>
                        </Card>
                    </Col>
                </Row>

                {/* 3. Third Row */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col span={8}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue by Hour</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }}>
                            <div style={{ height: 200 }}>
                                <Column
                                    data={[
                                        { hour: '6AM', rev: 500 }, { hour: '8AM', rev: 1200 }, { hour: '10AM', rev: 2300 },
                                        { hour: '12PM', rev: 3100 }, { hour: '2PM', rev: 4500 }, { hour: '4PM', rev: 3800 },
                                        { hour: '6PM', rev: 2900 }, { hour: '8PM', rev: 1500 }, { hour: '10PM', rev: 800 },
                                    ]}
                                    xField="hour"
                                    yField="rev"
                                    color="#00B4D8"
                                    xAxis={{ label: { style: { fill: '#ffffff' } } }}
                                    yAxis={{ 
                                        label: { style: { fill: '#ffffff' } },
                                        grid: { line: { style: { stroke: '#334155' } } }
                                    }}
                                    tooltip={{ theme: 'dark' }}
                                />
                            </div>
                        </Card>
                    </Col>
                    <Col span={8}>
                        <Card title={<span style={{ color: '#fff' }}>Top Computers by Revenue</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 0 }}>
                            <Table
                                dataSource={computerRevenue.slice(0, 5)}
                                pagination={false}
                                size="small"
                                rowClassName={() => 'dark-row'}
                                columns={[
                                    { title: 'Computer', dataIndex: 'hostname', render: v => <Space><Badge color="#00B4D8" /><Text style={{ color: '#e2e8f0' }}>{v}</Text></Space> },
                                    { title: 'Revenue', dataIndex: 'total', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v)}</Text> },
                                    { title: 'Sessions', dataIndex: 'usage', render: () => <Text style={{ color: '#e2e8f0' }}>{Math.floor(Math.random() * 50) + 1}</Text> },
                                    { title: 'Avg.', dataIndex: 'total', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v / 10)}</Text> },
                                ]}
                            />
                        </Card>
                    </Col>
                    <Col span={5}>
                        <Card title={<span style={{ color: '#fff' }}>Top Users by Spending</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 0 }}>
                            <Table
                                dataSource={[
                                    { key: '1', user: 'John Doe', spent: 2350, trans: 18 },
                                    { key: '2', user: 'Jane Smith', spent: 1975, trans: 14 },
                                    { key: '3', user: 'Mike Johnson', spent: 1250, trans: 10 },
                                    { key: '4', user: 'Emily Davis', spent: 850, trans: 7 },
                                    { key: '5', user: 'Alex Brown', spent: 650, trans: 5 },
                                ]}
                                pagination={false}
                                size="small"
                                rowClassName={() => 'dark-row'}
                                columns={[
                                    { title: 'User', dataIndex: 'user', render: v => <Text style={{ color: '#e2e8f0' }}>{v}</Text> },
                                    { title: 'Spent', dataIndex: 'spent', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v)}</Text> },
                                    { title: 'Txns', dataIndex: 'trans', render: v => <Text style={{ color: '#e2e8f0' }}>{v}</Text> },
                                ]}
                            />
                        </Card>
                    </Col>
                    <Col span={3}>
                        <Card title={<span style={{ color: '#fff' }}>Low Inventory Alert</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {[
                                    { name: 'A4 Paper', item: 'Printer A', alert: 'Low (15%)' },
                                    { name: 'Toner Black', item: 'Printer B', alert: 'Low (20%)' },
                                    { name: 'Toner Cyan', item: 'Printer C', alert: 'Low (10%)' },
                                ].map((alert, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Space>
                                            <Avatar style={{ backgroundColor: '#1e293b', color: '#00B4D8', border: '1px solid #334155' }} icon={<PrinterOutlined />} size="small" />
                                            <div>
                                                <div style={{ color: '#e2e8f0', fontSize: 12 }}>{alert.name}</div>
                                                <div style={{ color: '#64748b', fontSize: 10 }}>{alert.item}</div>
                                            </div>
                                        </Space>
                                        <Tag color="error" style={{ background: 'transparent', borderColor: '#ef4444', color: '#ef4444', fontSize: 10 }}>{alert.alert}</Tag>
                                    </div>
                                ))}
                            </div>
                            <Button type="link" style={{ marginTop: 16, padding: 0, color: '#94a3b8', fontSize: 12 }}>View inventory &rarr;</Button>
                        </Card>
                    </Col>
                </Row>

                {/* 4. Bottom Row */}
                <Row gutter={[16, 16]}>
                    <Col span={19}>
                        <Card title={<span style={{ color: '#fff' }}>Recent Transactions</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
                            <Table
                                dataSource={unifiedFeed.slice(0, 10)}
                                pagination={false}
                                size="small"
                                rowClassName={() => 'dark-row'}
                                columns={[
                                    { title: 'Invoice No.', dataIndex: 'id', render: (_, __, i) => <Text style={{ color: '#94a3b8' }}>INV-2025-{String(100481 - i).padStart(6, '0')}</Text> },
                                    { title: 'Customer', dataIndex: '_user', render: v => <Text style={{ color: '#e2e8f0' }}>{v || 'Walk-in'}</Text> },
                                    { title: 'Computer', dataIndex: '_host', render: v => <Text style={{ color: '#e2e8f0' }}>{v || 'MAIN'}</Text> },
                                    { title: 'Service', dataIndex: '_desc', render: v => <Text style={{ color: '#e2e8f0' }}>{v}</Text> },
                                    { title: 'Payment Method', dataIndex: 'payment', render: () => <Text style={{ color: '#e2e8f0' }}>{['Cash', 'M-Pesa', 'Card'][Math.floor(Math.random() * 3)]}</Text> },
                                    { title: 'Operator', dataIndex: 'operator', render: () => <Text style={{ color: '#e2e8f0' }}>Admin</Text> },
                                    { title: 'Time', dataIndex: '_time', render: v => <Text style={{ color: '#e2e8f0' }}>{dayjs(v).format('MMM D, YYYY h:mm A')}</Text> },
                                    { title: 'Amount', dataIndex: '_amount', render: v => <Text style={{ color: '#00C853', fontWeight: 600 }}>{formatKSH(v)}</Text> },
                                    { title: 'Status', dataIndex: 'status', render: () => <Tag color="success" style={{ background: 'transparent', borderColor: '#00C853', color: '#00C853' }}>Paid</Tag> },
                                ]}
                            />
                            <div style={{ padding: 12, textAlign: 'center' }}>
                                <Button type="link" style={{ color: '#94a3b8' }}>View all transactions &rarr;</Button>
                            </div>
                        </Card>
                    </Col>
                    <Col span={5}>
                        <Card title={<span style={{ color: '#fff' }}>Quick Actions</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div onClick={() => setIsExpenseModalVisible(true)} style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#0f172a', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent' }} className="quick-action-btn">
                                    <Avatar style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }} icon={<DollarOutlined />} />
                                    <div style={{ marginLeft: 12, flex: 1 }}>
                                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Add Expense</div>
                                        <div style={{ color: '#64748b', fontSize: 11 }}>Record a new expense</div>
                                    </div>
                                    <ArrowUpOutlined style={{ color: '#64748b' }} />
                                </div>
                                <div onClick={() => setIsSaleModalVisible(true)} style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#0f172a', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent' }} className="quick-action-btn">
                                    <Avatar style={{ background: 'rgba(123,44,191,0.1)', color: '#7b2cbf' }} icon={<ShopOutlined />} />
                                    <div style={{ marginLeft: 12, flex: 1 }}>
                                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Add Sale</div>
                                        <div style={{ color: '#64748b', fontSize: 11 }}>Record a new sale</div>
                                    </div>
                                    <ArrowUpOutlined style={{ color: '#64748b' }} />
                                </div>
                                <div onClick={exportDataToCSV} style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#0f172a', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent' }} className="quick-action-btn">
                                    <Avatar style={{ background: 'rgba(255,183,3,0.1)', color: '#FFB703' }} icon={<FileTextOutlined />} />
                                    <div style={{ marginLeft: 12, flex: 1 }}>
                                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Generate Report</div>
                                        <div style={{ color: '#64748b', fontSize: 11 }}>Download financial report</div>
                                    </div>
                                    <DownloadOutlined style={{ color: '#64748b' }} />
                                </div>
                                <div onClick={exportDataToCSV} style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#0f172a', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent' }} className="quick-action-btn">
                                    <Avatar style={{ background: 'rgba(0,200,83,0.1)', color: '#00C853' }} icon={<CopyOutlined />} />
                                    <div style={{ marginLeft: 12, flex: 1 }}>
                                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Export Data</div>
                                        <div style={{ color: '#64748b', fontSize: 11 }}>Export financial data</div>
                                    </div>
                                    <DownloadOutlined style={{ color: '#64748b' }} />
                                </div>
                            </div>
                        </Card>
                    </Col>
                </Row>

                {/* Legacy Extracted Views (Shop & Agent Performance) */}
                <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                    <Col span={12}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue Breakdown by Shop</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
                            <Table
                                columns={shopRevenueColumns}
                                dataSource={shopRevenue}
                                rowKey="shop"
                                pagination={false}
                                size="small"
                                className="dark-table"
                                rowClassName={() => 'dark-row'}
                                summary={(pageData) => {
                                    const t = pageData.reduce((acc, row) => ({
                                        printing: acc.printing + row.printing,
                                        photocopies: acc.photocopies + row.photocopies,
                                        internet: acc.internet + row.internet,
                                        sales: acc.sales + row.sales,
                                        lamination: acc.lamination + row.lamination,
                                        other: acc.other + row.other,
                                        total: acc.total + row.total,
                                    }), { printing: 0, photocopies: 0, internet: 0, sales: 0, lamination: 0, other: 0, total: 0 });

                                    return (
                                        <Table.Summary.Row style={{ background: 'rgba(0, 200, 83, 0.1)' }}>
                                            <Table.Summary.Cell><Text strong style={{ color: '#fff' }}>TOTAL</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.printing)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.photocopies)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.internet)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.sales)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.lamination)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.other)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ fontSize: 16, color: '#00C853' }}>{formatKSH(t.total)}</Text></Table.Summary.Cell>
                                        </Table.Summary.Row>
                                    );
                                }}
                            />
                        </Card>
                    </Col>
                    <Col span={12}>
                        <Card title={<span style={{ color: '#fff' }}>Agent Performance</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
                            <Table
                                columns={agentPerformanceColumns.map(c => ({...c, render: (t, r) => {
                                    if(c.key === 'agent') return <Space><UserOutlined style={{ color: '#00B4D8' }} /><Text style={{ color: '#e2e8f0' }}>{r.agent}</Text></Space>;
                                    if(c.key === 'collected' || c.key === 'submitted') return <Text style={{ color: '#e2e8f0' }}>{formatKSH(t)}</Text>;
                                    return c.render ? c.render(t, r) : t;
                                }}))}
                                dataSource={agentPerformance}
                                rowKey="agent"
                                pagination={false}
                                size="small"
                                className="dark-table"
                                rowClassName={() => 'dark-row'}
                                summary={(pageData) => {
                                    const t = pageData.reduce((acc, row) => ({
                                        collected: acc.collected + row.collected,
                                        submitted: acc.submitted + row.submitted,
                                        underreported: acc.underreported + Math.max(0, row.collected - row.submitted),
                                        overreported: acc.overreported + Math.max(0, row.submitted - row.collected),
                                    }), { collected: 0, submitted: 0, underreported: 0, overreported: 0 });

                                    return (
                                        <Table.Summary.Row style={{ background: 'rgba(0, 200, 83, 0.1)' }}>
                                            <Table.Summary.Cell><Text strong style={{ color: '#fff' }}>TOTAL</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.collected)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.submitted)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right">
                                                <Text strong type={t.underreported > 0 ? 'danger' : 'secondary'} style={t.underreported > 0 ? {} : { color: '#64748b' }}>
                                                    {t.underreported > 0 ? formatKSH(t.underreported) : '-'}
                                                </Text>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell align="right">
                                                <Text strong type={t.overreported > 0 ? 'success' : 'secondary'} style={t.overreported > 0 ? {} : { color: '#64748b' }}>
                                                    {t.overreported > 0 ? formatKSH(t.overreported) : '-'}
                                                </Text>
                                            </Table.Summary.Cell>
                                        </Table.Summary.Row>
                                    );
                                }}
                            />
                        </Card>
                    </Col>
                </Row>
            </Spin>

            <Modal title="Add Expense" visible={isExpenseModalVisible} onCancel={() => setIsExpenseModalVisible(false)} onOk={() => handleManualSubmit('expense')} confirmLoading={submittingManual}>
                <div style={{ marginBottom: 16 }}>
                    <Text>Amount (KSH)</Text>
                    <Input type="number" value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="e.g. 500" />
                </div>
                <div style={{ marginBottom: 16 }}>
                    <Text>Description</Text>
                    <Input value={manualDescription} onChange={e => setManualDescription(e.target.value)} placeholder="e.g. Bought printer ink" />
                </div>
                <div>
                    <Text>Payment Method</Text>
                    <Select value={manualPaymentMethod} onChange={setManualPaymentMethod} style={{ width: '100%' }}>
                        <Select.Option value="cash">Cash</Select.Option>
                        <Select.Option value="mpesa">M-Pesa</Select.Option>
                    </Select>
                </div>
            </Modal>

            <Modal title="Add Sale" visible={isSaleModalVisible} onCancel={() => setIsSaleModalVisible(false)} onOk={() => handleManualSubmit('manual_sale')} confirmLoading={submittingManual}>
                <div style={{ marginBottom: 16 }}>
                    <Text>Amount (KSH)</Text>
                    <Input type="number" value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="e.g. 100" />
                </div>
                <div style={{ marginBottom: 16 }}>
                    <Text>Description</Text>
                    <Input value={manualDescription} onChange={e => setManualDescription(e.target.value)} placeholder="e.g. Sold an accessory" />
                </div>
                <div>
                    <Text>Payment Method</Text>
                    <Select value={manualPaymentMethod} onChange={setManualPaymentMethod} style={{ width: '100%' }}>
                        <Select.Option value="cash">Cash</Select.Option>
                        <Select.Option value="mpesa">M-Pesa</Select.Option>
                    </Select>
                </div>
            </Modal>

            <style>{`
                .dark-table .ant-table {
                    background: transparent !important;
                    color: #fff !important;
                }
                .dark-table .ant-table-thead > tr > th {
                    background: #0f172a !important;
                    color: #94a3b8 !important;
                    border-bottom: 1px solid #334155 !important;
                }
                .dark-table .ant-table-tbody > tr.dark-row > td {
                    background: transparent !important;
                    border-bottom: 1px solid #334155 !important;
                }
                .dark-table .ant-table-tbody > tr.dark-row:hover > td {
                    background: #1e293b !important;
                }
                .quick-action-btn:hover {
                    border-color: #334155 !important;
                    background: #1e293b !important;
                }
                .ant-card-head {
                    border-bottom: 1px solid #334155 !important;
                    color: #fff !important;
                }
            `}</style>
        </div>
    );
}

export default Finance;
