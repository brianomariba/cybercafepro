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
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <div className="page-title">
                        <ThunderboltOutlined className="icon" />
                        <h1>Dashboard</h1>
                        <Badge
                            status={connected ? 'success' : 'error'}
                            text={<Text type="secondary" style={{ fontSize: 12 }}>{connected ? 'Live' : 'Offline'}</Text>}
                            style={{ marginLeft: 8 }}
                        />
                    </div>
                </div>
                <Button icon={<ReloadOutlined />} size="small" onClick={fetchData} loading={loading}>Refresh</Button>
            </div>

            {/* Stats Row */}
            <div className="stats-row">
                <div className="stat-card blue">
                    <div className="stat-header">
                        <div className="stat-icon blue"><DesktopOutlined /></div>
                    </div>
                    <div className="stat-value">{computedStats.onlineComputers} / {computedStats.totalComputers}</div>
                    <div className="stat-label">Computers Online</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green"><PlayCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{computedStats.activeSessionsCount}</div>
                    <div className="stat-label">Active Sessions</div>
                </div>

                <div className="stat-card yellow">
                    <div className="stat-header">
                        <div className="stat-icon yellow"><DollarOutlined /></div>
                    </div>
                    <div className="stat-value">{formatKSH(computedStats.todayRevenue)}</div>
                    <div className="stat-label">Today's Revenue</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-header">
                        <div className="stat-icon purple"><CheckCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{computedStats.pendingTasks}</div>
                    <div className="stat-label">Pending Tasks</div>
                </div>
            </div>

            <Spin spinning={loading}>
                <Row gutter={[20, 20]}>
                    {/* Computer Status Grid */}
                    <Col xs={24} lg={14}>
                        <Card
                            size="small"
                            title={
                                <Space>
                                    <DesktopOutlined style={{ color: '#00B4D8' }} />
                                    <span>Computers</span>
                                    <Badge count={computedStats.onlineComputers} style={{ backgroundColor: '#00C853' }} />
                                </Space>
                            }
                            extra={<Text type="secondary" style={{ fontSize: 12 }}>{computers.length} total</Text>}
                        >
                            {computers.length === 0 ? (
                                <Empty description="No computers connected" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                                    {computers.slice(0, 12).map(c => (
                                        <div
                                            key={c.clientId}
                                            style={{
                                                padding: '10px 12px',
                                                background: c.isOnline
                                                    ? (c.status === 'active' ? 'rgba(0,200,83,0.08)' : 'rgba(0,180,216,0.06)')
                                                    : 'rgba(100,116,139,0.06)',
                                                border: `1px solid ${c.isOnline ? (c.status === 'active' ? 'rgba(0,200,83,0.2)' : 'rgba(0,180,216,0.12)') : 'rgba(100,116,139,0.1)'}`,
                                                borderRadius: 8,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                        >
                                            <Badge status={c.isOnline ? (c.status === 'active' ? 'success' : 'processing') : 'default'} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Text strong style={{ fontSize: 12, display: 'block' }} ellipsis>{c.hostname}</Text>
                                                <Text type="secondary" style={{ fontSize: 10 }}>
                                                    {c.isOnline ? (c.sessionUser || (c.status === 'active' ? 'Active' : 'Idle')) : 'Offline'}
                                                </Text>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </Col>

                    {/* Revenue + Tasks */}
                    <Col xs={24} lg={10}>
                        <Card
                            size="small"
                            title={
                                <Space>
                                    <DollarOutlined style={{ color: '#00C853' }} />
                                    <span>Revenue</span>
                                </Space>
                            }
                        >
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                <div style={{ textAlign: 'center', padding: '10px 8px', background: 'rgba(0,200,83,0.08)', borderRadius: 10 }}>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Today</Text>
                                    <Text strong style={{ fontSize: 16, color: '#00C853', fontFamily: 'JetBrains Mono' }}>
                                        {formatKSH(computedStats.todayRevenue)}
                                    </Text>
                                </div>
                                <div style={{ textAlign: 'center', padding: '10px 8px', background: 'rgba(0,180,216,0.08)', borderRadius: 10 }}>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>This Week</Text>
                                    <Text strong style={{ fontSize: 16, color: '#00B4D8', fontFamily: 'JetBrains Mono' }}>
                                        {formatKSH(computedStats.weekRevenue)}
                                    </Text>
                                </div>
                                <div style={{ textAlign: 'center', padding: '10px 8px', background: 'rgba(255,183,3,0.08)', borderRadius: 10 }}>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>This Month</Text>
                                    <Text strong style={{ fontSize: 16, color: '#FFB703', fontFamily: 'JetBrains Mono' }}>
                                        {formatKSH(computedStats.monthRevenue)}
                                    </Text>
                                </div>
                            </div>
                            <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 12 }}>
                                <Text type="secondary">{computedStats.todaySessions} sessions today</Text>
                                <Text type="secondary">•</Text>
                                <Text type="secondary">{computedStats.completedTasks} tasks done</Text>
                            </div>
                        </Card>

                        {/* Pending Tasks */}
                        <Card
                            size="small"
                            title={
                                <Space>
                                    <FileTextOutlined style={{ color: '#FFB703' }} />
                                    <span>Active Tasks</span>
                                    {computedStats.pendingTasks > 0 && <Badge count={computedStats.pendingTasks} style={{ backgroundColor: '#FFB703' }} />}
                                </Space>
                            }
                            style={{ marginTop: 16 }}
                            bodyStyle={{ maxHeight: 180, overflowY: 'auto' }}
                        >
                            {tasks.length === 0 ? (
                                <Empty description="No tasks" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
                            ) : (
                                <List
                                    size="small"
                                    dataSource={tasks.slice(0, 4)}
                                    renderItem={task => (
                                        <List.Item style={{ padding: '6px 0' }}>
                                            <List.Item.Meta
                                                avatar={
                                                    <Avatar
                                                        size="small"
                                                        style={{
                                                            background: task.status === 'completed' ? '#00C853' :
                                                                task.status === 'in-progress' ? '#00B4D8' : '#FFB703',
                                                            width: 28, height: 28
                                                        }}
                                                    >
                                                        {task.status === 'completed' ? <CheckCircleOutlined /> : <SyncOutlined />}
                                                    </Avatar>
                                                }
                                                title={<Text ellipsis style={{ maxWidth: 180, fontSize: 13 }}>{task.title}</Text>}
                                                description={
                                                    <Space size={4}>
                                                        <Tag size="small" style={{ fontSize: 10 }} color={
                                                            task.status === 'completed' ? 'success' :
                                                                task.status === 'in-progress' ? 'processing' : 'warning'
                                                        }>{task.status}</Tag>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>{formatKSH(task.price)}</Text>
                                                    </Space>
                                                }
                                            />
                                        </List.Item>
                                    )}
                                />
                            )}
                        </Card>
                    </Col>
                </Row>

                {/* Activity Feed */}
                <Card
                    size="small"
                    title={
                        <Space>
                            <ClockCircleOutlined style={{ color: '#00B4D8' }} />
                            <span>Recent Activity</span>
                        </Space>
                    }
                    style={{ marginTop: 16 }}
                    bodyStyle={{ maxHeight: 280, overflowY: 'auto' }}
                >
                    {activityFeed.length === 0 ? (
                        <Empty description="No recent activity" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '16px 0' }} />
                    ) : (
                        <List
                            size="small"
                            dataSource={activityFeed.slice(0, 8)}
                            renderItem={item => (
                                <List.Item style={{ padding: '8px 0' }}>
                                    <List.Item.Meta
                                        avatar={
                                            <Avatar size={32} style={{ background: item.iconBg, fontSize: 14 }}>
                                                {item.icon}
                                            </Avatar>
                                        }
                                        title={<Text style={{ fontSize: 13 }}>{item.title}</Text>}
                                        description={<Text type="secondary" style={{ fontSize: 11 }}>{item.desc}</Text>}
                                    />
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        {item.extra && (
                                            <Text style={{ color: '#00C853', fontSize: 13, fontFamily: 'JetBrains Mono', display: 'block' }}>
                                                {item.extra}
                                            </Text>
                                        )}
                                        <Text type="secondary" style={{ fontSize: 10 }}>
                                            {dayjs(item.time).fromNow()}
                                        </Text>
                                    </div>
                                </List.Item>
                            )}
                        />
                    )}
                </Card>
            </Spin>
        </div>
    );
}

export default Dashboard;
