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
                setSessions(prev => [data, ...prev.slice(0, 9)]);
            },
            onNewLog: (log) => {
                if (log.type === 'print') {
                    setPrintJobs(prev => [log.data, ...prev.slice(0, 9)]);
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

    // Recent activity from sessions
    const recentActivity = sessions.slice(0, 8).map((session, idx) => ({
        id: idx,
        type: session.type,
        hostname: session.hostname,
        user: session.user,
        time: session.receivedAt,
        charges: session.charges,
    }));

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <ThunderboltOutlined className="icon" />
                    <h1>Dashboard</h1>
                </div>
                <p className="page-subtitle">
                    Real-time overview of your cyber cafe operations
                    <Badge
                        status={connected ? 'success' : 'error'}
                        text={connected ? 'Live' : 'Offline'}
                        style={{ marginLeft: 16 }}
                    />
                </p>
            </div>

            {/* Stats Row */}
            <div className="stats-row">
                <div className="stat-card blue">
                    <div className="stat-header">
                        <div className="stat-icon blue"><DesktopOutlined /></div>
                        <Badge status={connected ? 'success' : 'default'} />
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
                        {computedStats.todayRevenue > 0 && <Tag color="success">Today</Tag>}
                    </div>
                    <div className="stat-value">{formatKSH(computedStats.todayRevenue)}</div>
                    <div className="stat-label">Today's Revenue</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-header">
                        <div className="stat-icon purple"><CheckCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{computedStats.completedTasks}</div>
                    <div className="stat-label">Tasks Completed Today</div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="quick-actions">
                <Button type="primary" icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                    Refresh
                </Button>
            </div>

            <Spin spinning={loading}>
                <Row gutter={[24, 24]}>
                    {/* Connected Computers */}
                    <Col xs={24} lg={14}>
                        <Card
                            title={
                                <Space>
                                    <DesktopOutlined style={{ color: '#00B4D8' }} />
                                    <span>Connected Computers</span>
                                    <Badge count={computedStats.onlineComputers} style={{ backgroundColor: '#00C853' }} />
                                </Space>
                            }
                            extra={<Text type="secondary">{computers.length} total</Text>}
                        >
                            {computers.length === 0 ? (
                                <Empty description="No computers connected. Start the Desktop Agent on client PCs." />
                            ) : (
                                <Table
                                    dataSource={computers.slice(0, 8)}
                                    rowKey="clientId"
                                    pagination={false}
                                    size="small"
                                    columns={[
                                        {
                                            title: 'Computer',
                                            dataIndex: 'hostname',
                                            key: 'hostname',
                                            render: (hostname, record) => (
                                                <Space>
                                                    <Badge status={record.isOnline ? 'success' : 'default'} />
                                                    <Text strong>{hostname}</Text>
                                                </Space>
                                            ),
                                        },
                                        {
                                            title: 'IP',
                                            dataIndex: 'ip',
                                            key: 'ip',
                                            render: (ip) => <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{ip}</Text>,
                                        },
                                        {
                                            title: 'Status',
                                            dataIndex: 'status',
                                            key: 'status',
                                            render: (status, record) => (
                                                <Tag color={record.isOnline ? (status === 'active' ? 'success' : 'processing') : 'default'}>
                                                    {status?.toUpperCase() || 'OFFLINE'}
                                                </Tag>
                                            ),
                                        },
                                        {
                                            title: 'User',
                                            dataIndex: 'sessionUser',
                                            key: 'sessionUser',
                                            render: (user) => user || <Text type="secondary">—</Text>,
                                        },
                                    ]}
                                />
                            )}
                        </Card>
                    </Col>

                    {/* Revenue Summary */}
                    <Col xs={24} lg={10}>
                        <Card
                            title={
                                <Space>
                                    <DollarOutlined style={{ color: '#00C853' }} />
                                    <span>Revenue Summary</span>
                                </Space>
                            }
                        >
                            <Row gutter={[16, 16]}>
                                <Col span={8}>
                                    <div style={{ textAlign: 'center', padding: 16, background: 'rgba(0, 200, 83, 0.1)', borderRadius: 12 }}>
                                        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Today</Text>
                                        <Text strong style={{ fontSize: 20, color: '#00C853' }}>
                                            {formatKSH(computedStats.todayRevenue)}
                                        </Text>
                                    </div>
                                </Col>
                                <Col span={8}>
                                    <div style={{ textAlign: 'center', padding: 16, background: 'rgba(0, 180, 216, 0.1)', borderRadius: 12 }}>
                                        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>This Week</Text>
                                        <Text strong style={{ fontSize: 20, color: '#00B4D8' }}>
                                            {formatKSH(computedStats.weekRevenue)}
                                        </Text>
                                    </div>
                                </Col>
                                <Col span={8}>
                                    <div style={{ textAlign: 'center', padding: 16, background: 'rgba(255, 183, 3, 0.1)', borderRadius: 12 }}>
                                        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>This Month</Text>
                                        <Text strong style={{ fontSize: 20, color: '#FFB703' }}>
                                            {formatKSH(computedStats.monthRevenue)}
                                        </Text>
                                    </div>
                                </Col>
                            </Row>

                            <div style={{ marginTop: 24 }}>
                                <Text type="secondary">Sessions Today: {computedStats.todaySessions}</Text>
                            </div>
                        </Card>

                        {/* Active Tasks */}
                        <Card
                            title={
                                <Space>
                                    <FileTextOutlined style={{ color: '#FFB703' }} />
                                    <span>Recent Tasks</span>
                                    <Badge count={computedStats.pendingTasks} style={{ backgroundColor: '#FFB703' }} />
                                </Space>
                            }
                            style={{ marginTop: 24 }}
                        >
                            {tasks.length === 0 ? (
                                <Empty description="No tasks created yet. Create tasks to assign to users." />
                            ) : (
                                <List
                                    size="small"
                                    dataSource={tasks.slice(0, 5)}
                                    renderItem={task => (
                                        <List.Item>
                                            <List.Item.Meta
                                                avatar={
                                                    <Avatar
                                                        size="small"
                                                        style={{
                                                            background: task.status === 'completed' ? '#00C853' :
                                                                task.status === 'in-progress' ? '#00B4D8' : '#FFB703'
                                                        }}
                                                    >
                                                        {task.status === 'completed' ? <CheckCircleOutlined /> : <SyncOutlined />}
                                                    </Avatar>
                                                }
                                                title={<Text ellipsis style={{ maxWidth: 200 }}>{task.title}</Text>}
                                                description={
                                                    <Space>
                                                        <Tag size="small" color={
                                                            task.status === 'completed' ? 'success' :
                                                                task.status === 'in-progress' ? 'processing' : 'warning'
                                                        }>
                                                            {task.status}
                                                        </Tag>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            {formatKSH(task.price)}
                                                        </Text>
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

                <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
                    {/* Recent Sessions */}
                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <ClockCircleOutlined style={{ color: '#00B4D8' }} />
                                    <span>Recent Sessions</span>
                                </Space>
                            }
                        >
                            {sessions.length === 0 ? (
                                <Empty description="No sessions recorded yet. Sessions appear when users log in/out on connected PCs." />
                            ) : (
                                <List
                                    size="small"
                                    dataSource={sessions.slice(0, 6)}
                                    renderItem={session => (
                                        <List.Item>
                                            <List.Item.Meta
                                                avatar={
                                                    <Avatar style={{ background: session.type === 'LOGIN' ? '#00C853' : '#FB8500' }}>
                                                        {session.type === 'LOGIN' ? <PlayCircleOutlined /> : <LockOutlined />}
                                                    </Avatar>
                                                }
                                                title={
                                                    <Space>
                                                        <Text>{session.hostname}</Text>
                                                        <Tag color={session.type === 'LOGIN' ? 'success' : 'warning'}>
                                                            {session.type}
                                                        </Tag>
                                                    </Space>
                                                }
                                                description={
                                                    <Space>
                                                        <Text type="secondary">{session.user || 'Unknown'}</Text>
                                                        {session.charges && (
                                                            <Text style={{ color: '#00C853' }}>
                                                                {formatKSH(session.charges.grandTotal)}
                                                            </Text>
                                                        )}
                                                    </Space>
                                                }
                                            />
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {dayjs(session.receivedAt).fromNow()}
                                            </Text>
                                        </List.Item>
                                    )}
                                />
                            )}
                        </Card>
                    </Col>

                    {/* Recent Print Jobs */}
                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <PrinterOutlined style={{ color: '#7B2CBF' }} />
                                    <span>Recent Print Jobs</span>
                                </Space>
                            }
                        >
                            {printJobs.length === 0 ? (
                                <Empty description="No print jobs recorded yet. Print jobs appear when users print documents." />
                            ) : (
                                <List
                                    size="small"
                                    dataSource={printJobs.slice(0, 6)}
                                    renderItem={job => (
                                        <List.Item>
                                            <List.Item.Meta
                                                avatar={
                                                    <Avatar style={{ background: job.printType === 'color' ? '#7B2CBF' : '#6b6b80' }}>
                                                        <PrinterOutlined />
                                                    </Avatar>
                                                }
                                                title={<Text ellipsis style={{ maxWidth: 200 }}>{job.documentName || 'Print Job'}</Text>}
                                                description={
                                                    <Space>
                                                        <Tag color={job.printType === 'color' ? 'magenta' : 'default'}>
                                                            {job.printType?.toUpperCase() || 'B&W'}
                                                        </Tag>
                                                        <Text type="secondary">{job.totalPages || 1} pages</Text>
                                                    </Space>
                                                }
                                            />
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {job.hostname}
                                            </Text>
                                        </List.Item>
                                    )}
                                />
                            )}
                        </Card>
                    </Col>
                </Row>
            </Spin>
        </div>
    );
}

export default Dashboard;
