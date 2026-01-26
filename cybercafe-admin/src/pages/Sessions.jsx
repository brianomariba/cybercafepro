import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Tooltip, Badge, Avatar, Progress, Modal, message, Popconfirm, Row, Col, Spin, Empty } from 'antd';
import {
    ClockCircleOutlined,
    UserOutlined,
    DesktopOutlined,
    DollarOutlined,
    PlayCircleOutlined,
    StopOutlined,
    PlusOutlined,
    EyeOutlined,
    HistoryOutlined,
    ThunderboltOutlined,
    CalendarOutlined,
    FieldTimeOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getSessions, getComputers, sendCommand, connectSocket, disconnectSocket } from '../services/api';

const { Text, Title } = Typography;
const { Search } = Input;

// Format KSH currency
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

function Sessions() {
    const [sessions, setSessions] = useState([]);
    const [computers, setComputers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSession, setSelectedSession] = useState(null);
    const [detailsVisible, setDetailsVisible] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    // Fetch data from API
    const fetchData = async () => {
        setLoading(true);
        try {
            const [sessionData, computerData] = await Promise.all([
                getSessions({ limit: 100 }).catch(() => []),
                getComputers().catch(() => []),
            ]);

            setSessions(sessionData || []);
            setComputers(computerData || []);
        } catch (error) {
            console.error('Failed to fetch sessions:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();

        // Connect to socket for real-time updates
        const socket = connectSocket();
        socket.on('session-event', (event) => {
            console.log('Session event:', event);
            fetchData(); // Refresh on new session events
        });

        // Auto-refresh every 15 seconds
        const interval = setInterval(fetchData, 15000);

        return () => {
            clearInterval(interval);
            socket.off('session-event');
        };
    }, []);

    // Get active sessions (computers currently in use)
    const activeSessions = computers.filter(c => c.status === 'unlocked' && c.sessionUser);

    // Get recent completed sessions
    const completedSessions = sessions.filter(s => s.type === 'LOGOUT');

    // Calculate stats
    const stats = {
        activeSessions: activeSessions.length,
        totalRevenue: completedSessions
            .filter(s => dayjs(s.receivedAt || s.endTime).isAfter(dayjs().startOf('day')))
            .reduce((sum, s) => sum + (s.charges?.grandTotal || 0), 0),
        avgDuration: completedSessions.length > 0
            ? Math.round(completedSessions.slice(0, 20).reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / Math.min(completedSessions.length, 20))
            : 0,
        endingSoon: activeSessions.filter(c => {
            // Consider ending soon if active for more than 2 hours (placeholder logic)
            return true; // In real implementation, would check remaining time
        }).length,
    };

    const handleEndSession = async (computer) => {
        try {
            await sendCommand(computer.clientId, 'lock');
            message.success(`Session ended for ${computer.hostname}`);
            fetchData();
        } catch (error) {
            message.error('Failed to end session');
        }
    };

    const getStatusColor = (computer) => {
        if (computer.status === 'unlocked' && computer.sessionUser) return '#00C853';
        if (computer.status === 'locked') return '#FF9500';
        return '#64748B';
    };

    // Filter active sessions
    const filteredActiveSessions = activeSessions.filter(c => {
        const matchesSearch = c.hostname?.toLowerCase().includes(searchText.toLowerCase()) ||
            c.sessionUser?.toLowerCase().includes(searchText.toLowerCase());
        return matchesSearch;
    });

    // Calculate session duration
    const getSessionDuration = (computer) => {
        // Find the matching login session
        const loginSession = sessions.find(s =>
            s.type === 'LOGIN' &&
            s.clientId === computer.clientId &&
            s.sessionId === computer.sessionId
        );

        if (loginSession) {
            const startTime = dayjs(loginSession.timestamp || loginSession.startTime);
            const duration = dayjs().diff(startTime, 'minute');
            const hours = Math.floor(duration / 60);
            const mins = duration % 60;
            return { formatted: `${hours}h ${mins}m`, minutes: duration };
        }

        return { formatted: 'N/A', minutes: 0 };
    };

    // Session history columns
    const historyColumns = [
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
            title: 'User',
            dataIndex: 'user',
            key: 'user',
            render: (user) => (
                <Space>
                    <Avatar size={24} src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user}`} />
                    <Text>{user || 'Guest'}</Text>
                </Space>
            ),
        },
        {
            title: 'Duration',
            dataIndex: 'durationMinutes',
            key: 'duration',
            render: (mins) => {
                const hours = Math.floor(mins / 60);
                const minutes = mins % 60;
                return <Text>{hours}h {minutes}m</Text>;
            },
        },
        {
            title: 'End Time',
            dataIndex: 'endTime',
            key: 'endTime',
            render: (time, record) => (
                <Text type="secondary">{dayjs(time || record.receivedAt).format('MMM DD, HH:mm')}</Text>
            ),
        },
        {
            title: 'Amount',
            key: 'amount',
            render: (_, record) => (
                <Text style={{ fontFamily: 'JetBrains Mono', color: '#00C853', fontWeight: 600 }}>
                    {formatKSH(record.charges?.grandTotal || 0)}
                </Text>
            ),
        },
    ];

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <ClockCircleOutlined className="icon" />
                    <h1>Sessions</h1>
                </div>
                <p className="page-subtitle">Monitor active sessions and session history</p>
            </div>

            {/* Stats */}
            <Spin spinning={loading}>
                <div className="stats-row">
                    <div className="stat-card blue">
                        <div className="stat-header">
                            <div className="stat-icon blue">
                                <PlayCircleOutlined />
                            </div>
                            <Button
                                icon={<ReloadOutlined />}
                                size="small"
                                type="text"
                                onClick={fetchData}
                                loading={loading}
                            />
                        </div>
                        <div className="stat-value">{stats.activeSessions}</div>
                        <div className="stat-label">Active Sessions</div>
                    </div>

                    <div className="stat-card green">
                        <div className="stat-header">
                            <div className="stat-icon green">
                                <DollarOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{formatKSH(stats.totalRevenue)}</div>
                        <div className="stat-label">Today's Revenue</div>
                    </div>

                    <div className="stat-card purple">
                        <div className="stat-header">
                            <div className="stat-icon purple">
                                <FieldTimeOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{stats.avgDuration}m</div>
                        <div className="stat-label">Avg Duration</div>
                    </div>

                    <div className="stat-card orange">
                        <div className="stat-header">
                            <div className="stat-icon orange">
                                <ThunderboltOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{computers.filter(c => c.status === 'unlocked').length}</div>
                        <div className="stat-label">In Use</div>
                    </div>
                </div>
            </Spin>

            {/* Quick Actions */}
            <div className="quick-actions">
                <Search
                    placeholder="Search sessions..."
                    style={{ width: 300 }}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
            </div>

            {/* Active Sessions */}
            <Row gutter={[24, 24]}>
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <PlayCircleOutlined style={{ color: '#00C853' }} />
                                <span>Active Sessions</span>
                                <Badge count={activeSessions.length} style={{ backgroundColor: '#00C853' }} />
                            </Space>
                        }
                    >
                        {filteredActiveSessions.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <span>
                                        No active sessions
                                        <br />
                                        <Text type="secondary">Sessions will appear here when users log in</Text>
                                    </span>
                                }
                            />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {filteredActiveSessions.map(computer => {
                                    const duration = getSessionDuration(computer);
                                    return (
                                        <div
                                            key={computer.clientId}
                                            className="session-card"
                                            style={{ borderLeft: `4px solid ${getStatusColor(computer)}` }}
                                        >
                                            <div className="session-avatar">
                                                {(computer.sessionUser || 'G').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="session-info">
                                                <div className="session-user">{computer.sessionUser || 'Guest'}</div>
                                                <div className="session-details">
                                                    <span><DesktopOutlined /> {computer.hostname}</span>
                                                    <span><ClockCircleOutlined /> {duration.formatted}</span>
                                                    <Tag color="green">active</Tag>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'center', padding: '0 16px' }}>
                                                <Text type="secondary" style={{ fontSize: 12 }}>Duration</Text>
                                                <div className="session-duration">{duration.formatted}</div>
                                            </div>
                                            <div style={{ textAlign: 'center', padding: '0 16px', minWidth: 100 }}>
                                                <Text type="secondary" style={{ fontSize: 12 }}>CPU</Text>
                                                <div style={{
                                                    fontFamily: 'JetBrains Mono',
                                                    fontSize: 16,
                                                    fontWeight: 600,
                                                    color: '#00B4D8'
                                                }}>
                                                    {computer.metrics?.cpu?.toFixed(0) || 0}%
                                                </div>
                                            </div>
                                            <Space>
                                                <Tooltip title="View Details">
                                                    <Button
                                                        type="text"
                                                        icon={<EyeOutlined />}
                                                        onClick={() => {
                                                            setSelectedSession({
                                                                ...computer,
                                                                duration: duration.formatted,
                                                                durationMinutes: duration.minutes,
                                                            });
                                                            setDetailsVisible(true);
                                                        }}
                                                    />
                                                </Tooltip>
                                                <Popconfirm
                                                    title="End this session?"
                                                    description="This will lock the computer."
                                                    onConfirm={() => handleEndSession(computer)}
                                                >
                                                    <Tooltip title="End Session">
                                                        <Button
                                                            type="text"
                                                            icon={<StopOutlined style={{ color: '#ff3b5c' }} />}
                                                        />
                                                    </Tooltip>
                                                </Popconfirm>
                                            </Space>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Session History */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <HistoryOutlined style={{ color: '#7b2cbf' }} />
                                <span>Recent History</span>
                            </Space>
                        }
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {completedSessions.slice(0, 5).map(session => (
                                <div
                                    key={session.sessionId}
                                    style={{
                                        padding: 12,
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12
                                    }}
                                >
                                    <Avatar src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${session.user}`} size={36} />
                                    <div style={{ flex: 1 }}>
                                        <Text strong style={{ display: 'block', fontSize: 13 }}>{session.user || 'Guest'}</Text>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            {session.hostname} • {session.durationMinutes || 0}m
                                        </Text>
                                    </div>
                                    <Text style={{ fontFamily: 'JetBrains Mono', color: '#00C853', fontWeight: 600 }}>
                                        {formatKSH(session.charges?.grandTotal || 0)}
                                    </Text>
                                </div>
                            ))}
                            {completedSessions.length === 0 && (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No session history yet" />
                            )}
                        </div>
                    </Card>

                    {/* Today Summary */}
                    <Card
                        title={
                            <Space>
                                <CalendarOutlined style={{ color: '#FF9500' }} />
                                <span>Today's Summary</span>
                            </Space>
                        }
                        style={{ marginTop: 24 }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Text type="secondary">Total Sessions</Text>
                                <Text strong>{completedSessions.filter(s =>
                                    dayjs(s.receivedAt || s.endTime).isAfter(dayjs().startOf('day'))
                                ).length}</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Text type="secondary">Active Now</Text>
                                <Text strong>{stats.activeSessions}</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Text type="secondary">Avg Duration</Text>
                                <Text strong>{stats.avgDuration}m</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: 'rgba(0, 200, 83, 0.1)', borderRadius: 8, marginTop: 8 }}>
                                <Text type="secondary">Session Revenue</Text>
                                <Text strong style={{ color: '#00C853', fontSize: 18 }}>{formatKSH(stats.totalRevenue)}</Text>
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Full Session History Table */}
            <Card
                title={
                    <Space>
                        <HistoryOutlined style={{ color: '#00B4D8' }} />
                        <span>Complete Session History</span>
                        <Badge count={completedSessions.length} style={{ backgroundColor: '#00B4D8' }} />
                    </Space>
                }
                style={{ marginTop: 24 }}
            >
                <Table
                    columns={historyColumns}
                    dataSource={completedSessions}
                    rowKey="sessionId"
                    pagination={{ pageSize: 10 }}
                    locale={{ emptyText: <Empty description="No completed sessions yet" /> }}
                />
            </Card>

            {/* Session Details Modal */}
            <Modal
                title={
                    <Space>
                        <DesktopOutlined style={{ color: '#00B4D8' }} />
                        <span>Session Details - {selectedSession?.hostname}</span>
                    </Space>
                }
                open={detailsVisible}
                onCancel={() => setDetailsVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setDetailsVisible(false)}>
                        Close
                    </Button>,
                    <Button key="end" danger onClick={() => {
                        handleEndSession(selectedSession);
                        setDetailsVisible(false);
                    }}>
                        End Session
                    </Button>,
                ]}
                width={500}
            >
                {selectedSession && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* User Info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: 'rgba(0, 180, 216, 0.1)', borderRadius: 12 }}>
                            <Avatar
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedSession.sessionUser}`}
                                size={56}
                            />
                            <div>
                                <Title level={4} style={{ margin: 0 }}>{selectedSession.sessionUser || 'Guest'}</Title>
                                <Text type="secondary">{selectedSession.hostname}</Text>
                            </div>
                        </div>

                        {/* System Info */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, textAlign: 'center' }}>
                                <Text type="secondary">Duration</Text>
                                <Title level={3} style={{ margin: 0, color: '#00B4D8' }}>{selectedSession.duration}</Title>
                            </div>
                            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, textAlign: 'center' }}>
                                <Text type="secondary">CPU Usage</Text>
                                <Title level={3} style={{ margin: 0, color: '#00C853' }}>
                                    {selectedSession.metrics?.cpu?.toFixed(0) || 0}%
                                </Title>
                            </div>
                        </div>

                        {/* Current Window */}
                        {selectedSession.activity?.window && (
                            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Current Activity</Text>
                                <Text>{selectedSession.activity.window}</Text>
                            </div>
                        )}

                        {/* Estimated Charges */}
                        <div style={{ padding: 16, background: 'rgba(0, 200, 83, 0.1)', borderRadius: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text strong>Estimated Charge</Text>
                                <Title level={2} style={{ margin: 0, color: '#00C853' }}>
                                    {formatKSH(Math.ceil((selectedSession.durationMinutes || 0) / 60) * 200)}
                                </Title>
                            </div>
                            <Text type="secondary" style={{ fontSize: 12 }}>Based on KSH 200/hour</Text>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default Sessions;
