import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Progress, Table, Tag, Avatar, Space, Typography, Button, Tooltip, Badge, List, Empty, Spin, message } from 'antd';
import {
    DesktopOutlined,
    PrinterOutlined,
    DollarOutlined,
    UserOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    ClockCircleOutlined,
    WifiOutlined,
    ThunderboltOutlined,
    ReloadOutlined,
    EyeOutlined,
    FileTextOutlined,
    RiseOutlined,
    TeamOutlined,
    GlobalOutlined,
    CheckCircleOutlined,
    SyncOutlined,
    PlayCircleOutlined,
    LockOutlined,
    ShopOutlined,
    CopyOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getComputers, getSessions, getPrintJobs, getStats, getTransactionSummary, getTasks, connectSocket } from '../services/api';
import { Area, Pie, TinyLine } from '@ant-design/charts';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [computers, setComputers] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [printJobs, setPrintJobs] = useState([]);
    const [stats, setStats] = useState(null);
    const [revenueSummary, setRevenueSummary] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [connected, setConnected] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [computersRes, sessionsRes, printRes, statsRes, revenueRes, tasksRes] = await Promise.all([
                getComputers().catch(() => []),
                getSessions({ limit: 15 }).catch(() => []),
                getPrintJobs({ limit: 10 }).catch(() => ({ jobs: [] })),
                getStats().catch(() => null),
                getTransactionSummary().catch(() => null),
                getTasks({ limit: 10 }).catch(() => []),
            ]);

            setComputers(computersRes || []);
            setSessions(sessionsRes || []);
            setPrintJobs(printRes?.jobs || []);
            setStats(statsRes);
            setRevenueSummary(revenueRes);
            setTasks(tasksRes || []);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
            message.error('Failed to load dashboard data');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();

        const socket = connectSocket({
            onConnect: () => setConnected(true),
            onDisconnect: () => setConnected(false),
            onComputerUpdate: (data) => {
                setComputers(prev => {
                    const existing = prev.find(c => c.clientId === data.clientId);
                    if (existing) {
                        return prev.map(c => c.clientId === data.clientId ? { ...c, ...data } : c);
                    }
                    return [...prev, data];
                });
            },
            onSessionEvent: (data) => {
                setSessions(prev => {
                    const idx = prev.findIndex(s => s.sessionId === data.sessionId);
                    if (idx !== -1) {
                        const newSessions = [...prev];
                        newSessions[idx] = { ...newSessions[idx], ...data };
                        return newSessions;
                    }
                    return [data, ...prev].slice(0, 14);
                });
            },
            onNewLog: (log) => {
                if (log.type === 'print') {
                    setPrintJobs(prev => {
                        const jobData = log.data;
                        if (!jobData) return prev;
                        const idx = prev.findIndex(j => j.id === jobData.id);
                        if (idx !== -1) {
                            const newJobs = [...prev];
                            newJobs[idx] = { ...newJobs[idx], ...jobData };
                            return newJobs;
                        }
                        return [jobData, ...prev].slice(0, 9);
                    });
                }
            },
        });

        const interval = setInterval(fetchData, 30000);
        return () => {
            clearInterval(interval);
            if (socket) socket.disconnect();
        };
    }, []);

    const computedStats = {
        totalComputers: computers.length,
        onlineComputers: computers.filter(c => c.isOnline).length,
        activeSessionsCount: computers.filter(c => c.status === 'active').length,
        lockedComputers: computers.filter(c => c.status === 'locked').length,
        todayRevenue: revenueSummary?.today?.totalRevenue || 0,
        weekRevenue: revenueSummary?.week?.totalRevenue || 0,
        monthRevenue: revenueSummary?.month?.totalRevenue || 0,
        todaySessions: revenueSummary?.today?.sessions || 0,
        pendingTasks: tasks.filter(t => t.status === 'pending' || t.status === 'assigned').length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
    };

    const activityFeed = [];
    sessions.slice(0, 5).forEach((s, idx) => {
        activityFeed.push({
            key: `s-${idx}`,
            icon: s.type === 'LOGIN' ? <PlayCircleOutlined /> : <LockOutlined />,
            iconBg: s.type === 'LOGIN' ? '#00C853' : '#FB8500',
            title: `${s.hostname || 'PC'} — ${s.type}`,
            desc: s.user || 'Guest',
            extra: s.charges ? formatKSH(s.charges.grandTotal) : null,
            time: s.receivedAt,
        });
    });
    printJobs.slice(0, 3).forEach((j, idx) => {
        activityFeed.push({
            key: `p-${idx}`,
            icon: <PrinterOutlined />,
            iconBg: j.printType === 'color' ? '#7B2CBF' : '#6b6b80',
            title: `Print: ${(j.documentName || j.document || 'Document').substring(0, 30)}`,
            desc: `${j.hostname || 'PC'} • ${j.totalPages || 1} pages • ${j.printType?.toUpperCase() || 'B&W'}`,
            extra: null,
            time: j.receivedAt || j.timestamp,
        });
    });
    tasks.filter(t => t.status === 'completed').slice(0, 2).forEach((t, idx) => {
        activityFeed.push({
            key: `t-${idx}`,
            icon: <CheckCircleOutlined />,
            iconBg: '#00C853',
            title: `Task done: ${(t.title || 'Task').substring(0, 30)}`,
            desc: formatKSH(t.price),
            extra: null,
            time: t.completedAt || t.updatedAt,
        });
    });
    activityFeed.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Data for charts
    const pieData = [
        { type: 'Active', value: computedStats.activeSessionsCount },
        { type: 'Locked', value: computedStats.lockedComputers },
        { type: 'Offline', value: computedStats.totalComputers - computedStats.onlineComputers }
    ].filter(item => item.value > 0);

    const pieConfig = {
        data: pieData,
        angleField: 'value',
        colorField: 'type',
        radius: 0.8,
        innerRadius: 0,
        label: { type: 'spider', labelHeight: 28, content: '{name}\n{percentage}' },
        interactions: [{ type: 'element-selected' }, { type: 'element-active' }],
        color: ['#00B4D8', '#FFB703', '#94A3B8'],
        legend: { position: 'bottom' }
    };

    const areaData = [...sessions].reverse().map(s => ({
        time: dayjs(s.receivedAt).format('HH:mm'),
        value: s.charges?.grandTotal || 0,
        category: 'Revenue (KSH)'
    }));

    const areaConfig = {
        data: areaData.length ? areaData : [{ time: 'Now', value: 0, category: 'Revenue (KSH)' }],
        xField: 'time',
        yField: 'value',
        seriesField: 'category',
        smooth: true,
        color: ['#4361EE'],
        areaStyle: () => {
            return { fill: 'l(270) 0:#ffffff 0.5:#7ec2f3 1:#1890ff' };
        },
        yAxis: { grid: { line: { style: { stroke: '#e2e8f0', lineDash: [4, 4] } } } },
        legend: false,
    };

    const sparklineData = sessions.length ? sessions.map(s => s.charges?.grandTotal || 10).reverse() : [10, 20, 15, 25, 20, 30];
    const tinyLineConfig = {
        height: 50,
        autoFit: true,
        data: sparklineData,
        smooth: true,
        color: 'rgba(255,255,255,0.6)',
        lineStyle: { lineWidth: 2 },
    };

    return (
        <div className="dashboard-container">
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: 0 }}>
                <div>
                    <div className="page-title">
                        <ThunderboltOutlined className="icon" style={{ color: '#00B4D8' }} />
                        <h1>Dashboard Overview</h1>
                        <Badge
                            status={connected ? 'success' : 'error'}
                            text={<Text type="secondary" style={{ fontSize: 12 }}>{connected ? 'Live Sync' : 'Offline'}</Text>}
                            style={{ marginLeft: 12 }}
                        />
                    </div>
                </div>
                <Button icon={<ReloadOutlined />} type="primary" onClick={fetchData} loading={loading} style={{ borderRadius: 8 }}>
                    Refresh Data
                </Button>
            </div>

            <Spin spinning={loading}>
                {/* 1. Admindek Style Top Solid Cards */}
                <div className="dashboard-grid" style={{ marginTop: 24 }}>
                    <div className="col-span-3">
                        <div className="solid-card solid-card-blue">
                            <div>
                                <div className="stat-label-text">Total Revenue (Today)</div>
                                <div className="stat-main-value">{formatKSH(computedStats.todayRevenue)}</div>
                                <div className="solid-card-subtext">
                                    <ArrowUpOutlined /> {computedStats.todaySessions} sessions today
                                </div>
                            </div>
                            <div className="chart-background">
                                <TinyLine {...tinyLineConfig} />
                            </div>
                        </div>
                    </div>

                    <div className="col-span-3">
                        <div className="solid-card solid-card-teal">
                            <div>
                                <div className="stat-label-text">Active Computers</div>
                                <div className="stat-main-value">{computedStats.activeSessionsCount}</div>
                                <div className="solid-card-subtext">
                                    <ArrowUpOutlined /> out of {computedStats.totalComputers} total
                                </div>
                            </div>
                            <div className="chart-background">
                                <TinyLine {...tinyLineConfig} />
                            </div>
                        </div>
                    </div>

                    <div className="col-span-3">
                        <div className="solid-card solid-card-green">
                            <div>
                                <div className="stat-label-text">Completed Tasks</div>
                                <div className="stat-main-value">{computedStats.completedTasks}</div>
                                <div className="solid-card-subtext">
                                    <ArrowDownOutlined style={{transform: 'rotate(180deg)'}}/> {computedStats.pendingTasks} pending
                                </div>
                            </div>
                            <div className="chart-background" style={{ opacity: 0.4 }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 40, marginTop: 10 }}>
                                    {[12, 24, 18, 30, 20, 35, 25].map((h, i) => (
                                        <div key={i} style={{ width: 8, height: h, background: 'rgba(255,255,255,0.7)', borderRadius: 2 }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-3">
                        <div className="solid-card solid-card-blue" style={{ background: '#4e73df' }}>
                            <div>
                                <div className="stat-label-text">Online Computers</div>
                                <div className="stat-main-value">
                                    {computedStats.totalComputers ? Math.round((computedStats.onlineComputers / computedStats.totalComputers) * 100) : 0}%
                                </div>
                                <div className="solid-card-subtext">
                                    {computedStats.onlineComputers} online right now
                                </div>
                            </div>
                            <div className="chart-background">
                                <TinyLine {...tinyLineConfig} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Main Analytics Charts Grid */}
                <div className="dashboard-grid">
                    <div className="col-span-8">
                        <div className="premium-card" style={{ height: '100%' }}>
                            <div className="premium-card-title">Real-time Analytics (Recent Sessions)</div>
                            <div style={{ height: 350 }}>
                                {areaData.length > 1 ? (
                                    <Area {...areaConfig} />
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Empty description="Not enough real-time data yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="col-span-4">
                        <div className="premium-card" style={{ height: '100%' }}>
                            <div className="premium-card-title">Device Analytics (Status)</div>
                            <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {pieData.length > 0 ? (
                                    <Pie {...pieConfig} />
                                ) : (
                                    <Empty description="No computers data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Bottom Grid (Activity & Financials) */}
                <div className="dashboard-grid">
                    {/* Left Column (Financials & Computers) */}
                    <div className="col-span-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        <div className="premium-card">
                            <div className="premium-card-title">
                                <DollarOutlined style={{ color: 'var(--primary-teal)', marginRight: 8 }} />
                                Financial Overview
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                                <div className="revenue-block today">
                                    <span className="revenue-block-label">Today</span>
                                    <span className="revenue-block-value">{formatKSH(computedStats.todayRevenue)}</span>
                                </div>
                                <div className="revenue-block week">
                                    <span className="revenue-block-label">This Week</span>
                                    <span className="revenue-block-value">{formatKSH(computedStats.weekRevenue)}</span>
                                </div>
                                <div className="revenue-block month">
                                    <span className="revenue-block-label">This Month</span>
                                    <span className="revenue-block-value">{formatKSH(computedStats.monthRevenue)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="premium-card">
                            <div className="premium-card-title" style={{ justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <DesktopOutlined style={{ color: 'var(--primary-green)' }} />
                                    Active Computers
                                </div>
                                <Badge count={computedStats.onlineComputers} style={{ backgroundColor: 'var(--primary-green)' }} />
                            </div>

                            {computers.length === 0 ? (
                                <Empty description="No computers connected" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                                    {computers.slice(0, 12).map(c => (
                                        <div
                                            key={c.clientId}
                                            style={{
                                                padding: '12px 16px',
                                                background: c.isOnline
                                                    ? (c.status === 'active' ? 'rgba(0,200,83,0.05)' : 'rgba(0,180,216,0.05)')
                                                    : 'rgba(100,116,139,0.05)',
                                                border: `1px solid ${c.isOnline ? (c.status === 'active' ? 'rgba(0,200,83,0.3)' : 'rgba(0,180,216,0.2)') : 'rgba(100,116,139,0.2)'}`,
                                                borderRadius: 12,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 12,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Badge status={c.isOnline ? (c.status === 'active' ? 'success' : 'processing') : 'default'} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Text strong style={{ fontSize: 13, display: 'block', color: 'var(--text-primary)' }} ellipsis>{c.hostname}</Text>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column (Activity Feed) */}
                    <div className="col-span-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div className="premium-card" style={{ flex: 1 }}>
                            <div className="premium-card-title">
                                <ClockCircleOutlined style={{ color: 'var(--primary-yellow)', marginRight: 8 }} />
                                Recent Activity
                            </div>

                            {activityFeed.length === 0 ? (
                                <Empty description="No recent activity" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '32px 0' }} />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {activityFeed.slice(0, 7).map(item => (
                                        <div key={item.key} className="timeline-item">
                                            <div className="timeline-icon" style={{ background: item.iconBg }}>
                                                {item.icon}
                                            </div>
                                            <div className="timeline-content">
                                                <div className="timeline-title">{item.title}</div>
                                                <div className="timeline-desc">{item.desc}</div>
                                            </div>
                                            <div className="timeline-meta">
                                                {item.extra && (
                                                    <div style={{ color: 'var(--primary-green)', fontSize: 13, fontFamily: 'JetBrains Mono', fontWeight: 600 }}>
                                                        {item.extra}
                                                    </div>
                                                )}
                                                <div className="timeline-time">{dayjs(item.time).fromNow()}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Spin>
        </div>
    );
}

export default Dashboard;
