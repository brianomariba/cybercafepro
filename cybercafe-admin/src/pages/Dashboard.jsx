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

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

// Currency formatter for KSH
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

    // Fetch all dashboard data
    const fetchData = async () => {
        setLoading(true);
        try {
            const [computersRes, sessionsRes, printRes, statsRes, revenueRes, tasksRes] = await Promise.all([
                getComputers().catch(() => []),
                getSessions({ limit: 10 }).catch(() => []),
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

        // Connect to real-time updates
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
                    return [data, ...prev].slice(0, 9);
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

        // Refresh every 30 seconds
        const interval = setInterval(fetchData, 30000);

        return () => {
            clearInterval(interval);
            if (socket) socket.disconnect();
        };
    }, []);

    // Calculate stats from real data
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

    // Build a unified activity feed
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
                {/* 1. Top Stat Cards Row */}
                <div className="dashboard-grid" style={{ marginTop: 24 }}>
                    <div className="col-span-3 premium-card glow-effect">
                        <div className="premium-stat-card">
                            <div className="stat-icon-wrapper blue">
                                <DesktopOutlined />
                            </div>
                            <div>
                                <div className="stat-main-value">{computedStats.onlineComputers} <span style={{fontSize: 16, color: 'var(--text-muted)'}}>/ {computedStats.totalComputers}</span></div>
                                <div className="stat-label-text">Computers Online</div>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-3 premium-card glow-effect">
                        <div className="premium-stat-card">
                            <div className="stat-icon-wrapper green">
                                <PlayCircleOutlined />
                            </div>
                            <div>
                                <div className="stat-main-value">{computedStats.activeSessionsCount}</div>
                                <div className="stat-label-text">Active Sessions</div>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-3 premium-card glow-effect">
                        <div className="premium-stat-card">
                            <div className="stat-icon-wrapper yellow">
                                <DollarOutlined />
                            </div>
                            <div>
                                <div className="stat-main-value">{formatKSH(computedStats.todayRevenue)}</div>
                                <div className="stat-label-text">Today's Revenue</div>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-3 premium-card glow-effect">
                        <div className="premium-stat-card">
                            <div className="stat-icon-wrapper purple">
                                <CheckCircleOutlined />
                            </div>
                            <div>
                                <div className="stat-main-value">{computedStats.pendingTasks}</div>
                                <div className="stat-label-text">Pending Tasks</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Main Content Grid */}
                <div className="dashboard-grid">
                    {/* Left Column (Revenue & Computers) */}
                    <div className="col-span-8" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        {/* Revenue Overview */}
                        <div className="premium-card">
                            <div className="premium-card-title">
                                <DollarOutlined style={{ color: 'var(--primary-teal)' }} />
                                Financial Overview
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                                <div className="revenue-block today">
                                    <span className="revenue-block-label">Today</span>
                                    <span className="revenue-block-value">{formatKSH(computedStats.todayRevenue)}</span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{computedStats.todaySessions} sessions</span>
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

                        {/* Computers Grid */}
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
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
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
                                                transition: 'transform 0.2s',
                                                cursor: 'pointer'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                        >
                                            <Badge status={c.isOnline ? (c.status === 'active' ? 'success' : 'processing') : 'default'} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Text strong style={{ fontSize: 13, display: 'block', color: 'var(--text-primary)' }} ellipsis>{c.hostname}</Text>
                                                <Text style={{ fontSize: 11, color: c.isOnline && c.status === 'active' ? 'var(--primary-green)' : 'var(--text-muted)' }}>
                                                    {c.isOnline ? (c.sessionUser || (c.status === 'active' ? 'Active' : 'Idle')) : 'Offline'}
                                                </Text>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column (Activity Feed & Tasks) */}
                    <div className="col-span-4" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        {/* Recent Activity */}
                        <div className="premium-card" style={{ flex: 1 }}>
                            <div className="premium-card-title">
                                <ClockCircleOutlined style={{ color: 'var(--primary-yellow)' }} />
                                Recent Activity
                            </div>

                            {activityFeed.length === 0 ? (
                                <Empty description="No recent activity" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '32px 0' }} />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {activityFeed.slice(0, 6).map(item => (
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

                        {/* Active Tasks */}
                        <div className="premium-card">
                            <div className="premium-card-title" style={{ justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <FileTextOutlined style={{ color: 'var(--primary-orange)' }} />
                                    Active Tasks
                                </div>
                            </div>
                            
                            {tasks.length === 0 ? (
                                <Empty description="No pending tasks" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '20px 0' }} />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {tasks.slice(0, 4).map(task => (
                                        <div key={task._id || task.id} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '12px',
                                            background: 'rgba(100, 116, 139, 0.05)',
                                            borderRadius: 8,
                                            border: '1px solid var(--border-primary)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ 
                                                    width: 8, 
                                                    height: 8, 
                                                    borderRadius: '50%', 
                                                    background: task.status === 'completed' ? 'var(--primary-green)' : 'var(--primary-yellow)' 
                                                }} />
                                                <Text style={{ fontSize: 13, color: 'var(--text-primary)', maxWidth: 160 }} ellipsis>{task.title}</Text>
                                            </div>
                                            <Text style={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: 'var(--primary-teal)' }}>
                                                {formatKSH(task.price)}
                                            </Text>
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
