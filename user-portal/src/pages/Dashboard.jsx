import { useState, useEffect } from 'react';
import { Row, Col, Card, Progress, Tag, Avatar, Space, Typography, Button, Badge, Tooltip, List, Empty, Spin, message } from 'antd';
import {
    UserOutlined,
    BookOutlined,
    FileTextOutlined,
    ClockCircleOutlined,
    RocketOutlined,
    TrophyOutlined,
    ThunderboltOutlined,
    CheckCircleOutlined,
    BulbOutlined,
    CalendarOutlined,
    PrinterOutlined,
    FieldTimeOutlined,
    HeartOutlined,
    SmileOutlined,
    CoffeeOutlined,
    SyncOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { getUserTasks, updateTaskStatus, connectSocket } from '../services/api';

const { Text, Title, Paragraph } = Typography;

// Motivational messages
const motivationalMessages = [
    "You're doing great! Keep up the momentum 🚀",
    "Every step forward counts. You've got this! 💪",
    "Learning something new every day makes you unstoppable! ⭐",
    "Your dedication is inspiring. Stay focused! 🎯",
    "Small progress is still progress. Keep going! 🌟",
];

// Quick access features
const quickFeatures = [
    { key: 'print', icon: <PrinterOutlined />, label: 'Print a Document', color: '#00B4D8', desc: 'Quick & easy printing' },
    { key: 'templates', icon: <FileTextOutlined />, label: 'Get Templates', color: '#FFB703', desc: 'CVs, Letters & more' },
    { key: 'guidance', icon: <BulbOutlined />, label: 'Need Help?', color: '#00C853', desc: 'We\'re here for you' },
    { key: 'learning', icon: <BookOutlined />, label: 'Learn Skills', color: '#FB8500', desc: 'Free tutorials' },
];

// Helper tips
const helpfulTips = [
    { icon: '💡', title: 'Quick Print Tip', text: 'Use Ctrl+P to quickly print any document. We\'ll handle the rest!' },
    { icon: '📁', title: 'Save Your Work', text: 'Always save files to the Documents folder - they\'re safely backed up.' },
    { icon: '🔒', title: 'Stay Secure', text: 'Remember to log out when you\'re done. Your session is protected.' },
];

// Format KSH
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

function Dashboard({ user, onNavigate }) {
    const [greeting, setGreeting] = useState('');
    const [motivationalMsg, setMotivationalMsg] = useState('');
    const [activityPeriod, setActivityPeriod] = useState('today');
    const [tasks, setTasks] = useState({ today: [], week: [], month: [] });
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Fetch tasks from API
    const fetchTasks = async () => {
        setLoading(true);
        try {
            const [todayTasks, weekTasks, monthTasks] = await Promise.all([
                getUserTasks({ period: 'today' }).catch(() => []),
                getUserTasks({ period: 'week' }).catch(() => []),
                getUserTasks({ period: 'month' }).catch(() => []),
            ]);
            setTasks({
                today: todayTasks || [],
                week: weekTasks || [],
                month: monthTasks || [],
            });
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        // Set greeting based on time
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 17) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');

        // Random motivational message
        setMotivationalMsg(motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)]);

        // Update time every second
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        // Fetch tasks
        fetchTasks();

        // Connect to real-time updates
        const socket = connectSocket({
            onTaskAssigned: () => fetchTasks(),
            onTaskUpdated: () => fetchTasks(),
        });

        return () => {
            clearInterval(timer);
            if (socket) socket.disconnect();
        };
    }, []);

    // Update task status
    const handleMarkComplete = async (taskId) => {
        try {
            await updateTaskStatus(taskId, 'completed');
            message.success('Task marked as complete!');
            fetchTasks();
        } catch (error) {
            message.error('Failed to update task');
        }
    };

    const handleStartTask = async (taskId) => {
        try {
            await updateTaskStatus(taskId, 'in-progress');
            message.success('Task started!');
            fetchTasks();
        } catch (error) {
            message.error('Failed to start task');
        }
    };

    const currentActivities = tasks[activityPeriod] || [];
    const completedCount = currentActivities.filter(a => a.status === 'completed').length;
    const pendingCount = currentActivities.filter(a => a.status === 'pending' || a.status === 'assigned').length;
    const inProgressCount = currentActivities.filter(a => a.status === 'in-progress').length;

    const getStatusIcon = (status) => {
        switch (status) {
            case 'completed': return <CheckCircleOutlined style={{ color: '#00C853' }} />;
            case 'in-progress': return <SyncOutlined spin style={{ color: '#00B4D8' }} />;
            default: return <ClockCircleOutlined style={{ color: '#FFB703' }} />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'success';
            case 'in-progress': return 'processing';
            default: return 'warning';
        }
    };

    return (
        <div>
            {/* Welcome Banner */}
            <Card
                style={{
                    marginBottom: 24,
                    background: 'linear-gradient(135deg, rgba(0, 180, 216, 0.15) 0%, rgba(255, 183, 3, 0.1) 100%)',
                    border: '1px solid rgba(0, 180, 216, 0.3)',
                    borderRadius: 16,
                }}
            >
                <Row gutter={24} align="middle">
                    <Col xs={24} md={14}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                            <Avatar
                                size={64}
                                style={{ background: 'linear-gradient(135deg, #00B4D8, #FFB703)' }}
                                icon={<SmileOutlined />}
                            />
                            <div>
                                <Title level={3} style={{ margin: 0, color: '#fff' }}>
                                    {greeting}, {user?.name || 'Friend'}! 👋
                                </Title>
                                <Text type="secondary" style={{ fontSize: 15 }}>
                                    {motivationalMsg}
                                </Text>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CalendarOutlined style={{ color: '#00B4D8' }} />
                                <Text type="secondary">{currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ClockCircleOutlined style={{ color: '#FFB703' }} />
                                <Text style={{ fontFamily: 'monospace', color: '#FFB703' }}>
                                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </div>
                        </div>
                    </Col>
                    <Col xs={24} md={10}>
                        <div style={{
                            background: 'rgba(0, 200, 83, 0.1)',
                            padding: 20,
                            borderRadius: 12,
                            border: '1px solid rgba(0, 200, 83, 0.3)',
                            textAlign: 'center'
                        }}>
                            <HeartOutlined style={{ fontSize: 32, color: '#00C853', marginBottom: 8 }} />
                            <Title level={5} style={{ margin: 0, color: '#00C853' }}>We're Here to Help!</Title>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                Need assistance? Click "Need Help?" below or ask our staff.
                            </Text>
                        </div>
                    </Col>
                </Row>
            </Card>

            {/* Quick Actions */}
            <Card
                title={
                    <Space>
                        <RocketOutlined style={{ color: '#00B4D8' }} />
                        <span>What would you like to do today?</span>
                    </Space>
                }
                style={{ marginBottom: 24 }}
            >
                <Row gutter={[16, 16]}>
                    {quickFeatures.map(feature => (
                        <Col xs={12} sm={6} key={feature.key}>
                            <div
                                onClick={() => onNavigate && onNavigate(feature.key === 'print' ? 'services' : feature.key)}
                                style={{
                                    padding: 20,
                                    background: `${feature.color}10`,
                                    border: `1px solid ${feature.color}30`,
                                    borderRadius: 12,
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                }}
                                className="quick-action-card"
                            >
                                <div style={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: '50%',
                                    background: `${feature.color}20`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 12px',
                                    fontSize: 24,
                                    color: feature.color,
                                }}>
                                    {feature.icon}
                                </div>
                                <Text strong style={{ display: 'block', color: '#fff' }}>{feature.label}</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>{feature.desc}</Text>
                            </div>
                        </Col>
                    ))}
                </Row>
            </Card>

            <Row gutter={[24, 24]}>
                {/* Admin Assigned Activities */}
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <ThunderboltOutlined style={{ color: '#00C853' }} />
                                <span>Your Assigned Tasks</span>
                            </Space>
                        }
                        extra={
                            <Space>
                                {['today', 'week', 'month'].map(period => (
                                    <Button
                                        key={period}
                                        type={activityPeriod === period ? 'primary' : 'default'}
                                        size="small"
                                        onClick={() => setActivityPeriod(period)}
                                    >
                                        {period === 'today' ? 'Today' : period === 'week' ? 'This Week' : 'This Month'}
                                    </Button>
                                ))}
                                <Button icon={<ReloadOutlined />} size="small" onClick={fetchTasks} loading={loading} />
                            </Space>
                        }
                    >
                        <Spin spinning={loading}>
                            {/* Activity Stats */}
                            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                                <Col xs={8}>
                                    <div style={{
                                        padding: 16,
                                        background: 'rgba(0, 200, 83, 0.1)',
                                        borderRadius: 12,
                                        textAlign: 'center'
                                    }}>
                                        <CheckCircleOutlined style={{ fontSize: 24, color: '#00C853', marginBottom: 8 }} />
                                        <div style={{ fontSize: 24, fontWeight: 700, color: '#00C853' }}>
                                            {completedCount}
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Completed</Text>
                                    </div>
                                </Col>
                                <Col xs={8}>
                                    <div style={{
                                        padding: 16,
                                        background: 'rgba(0, 180, 216, 0.1)',
                                        borderRadius: 12,
                                        textAlign: 'center'
                                    }}>
                                        <SyncOutlined style={{ fontSize: 24, color: '#00B4D8', marginBottom: 8 }} />
                                        <div style={{ fontSize: 24, fontWeight: 700, color: '#00B4D8' }}>
                                            {inProgressCount}
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>In Progress</Text>
                                    </div>
                                </Col>
                                <Col xs={8}>
                                    <div style={{
                                        padding: 16,
                                        background: 'rgba(255, 183, 3, 0.1)',
                                        borderRadius: 12,
                                        textAlign: 'center'
                                    }}>
                                        <ClockCircleOutlined style={{ fontSize: 24, color: '#FFB703', marginBottom: 8 }} />
                                        <div style={{ fontSize: 24, fontWeight: 700, color: '#FFB703' }}>
                                            {pendingCount}
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Pending</Text>
                                    </div>
                                </Col>
                            </Row>

                            {/* Activity List */}
                            {currentActivities.length === 0 ? (
                                <Empty
                                    description="No tasks assigned yet. Check back later or ask the admin for tasks."
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                />
                            ) : (
                                <List
                                    dataSource={currentActivities}
                                    renderItem={activity => (
                                        <List.Item
                                            style={{
                                                padding: '12px 16px',
                                                background: activity.status === 'completed'
                                                    ? 'rgba(0, 200, 83, 0.05)'
                                                    : activity.status === 'in-progress'
                                                        ? 'rgba(0, 180, 216, 0.05)'
                                                        : 'rgba(255, 183, 3, 0.05)',
                                                borderRadius: 10,
                                                marginBottom: 8,
                                                border: `1px solid ${activity.status === 'completed'
                                                        ? 'rgba(0, 200, 83, 0.2)'
                                                        : activity.status === 'in-progress'
                                                            ? 'rgba(0, 180, 216, 0.2)'
                                                            : 'rgba(255, 183, 3, 0.2)'
                                                    }`
                                            }}
                                            actions={
                                                activity.status !== 'completed' ? [
                                                    activity.status === 'assigned' || activity.status === 'pending' ? (
                                                        <Button
                                                            size="small"
                                                            type="primary"
                                                            onClick={() => handleStartTask(activity.id)}
                                                        >
                                                            Start
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="small"
                                                            style={{ background: '#00C853', borderColor: '#00C853' }}
                                                            type="primary"
                                                            onClick={() => handleMarkComplete(activity.id)}
                                                        >
                                                            Complete
                                                        </Button>
                                                    )
                                                ] : []
                                            }
                                        >
                                            <List.Item.Meta
                                                avatar={
                                                    <Avatar
                                                        style={{
                                                            background: activity.status === 'completed'
                                                                ? 'rgba(0, 200, 83, 0.15)'
                                                                : activity.status === 'in-progress'
                                                                    ? 'rgba(0, 180, 216, 0.15)'
                                                                    : 'rgba(255, 183, 3, 0.15)'
                                                        }}
                                                    >
                                                        {getStatusIcon(activity.status)}
                                                    </Avatar>
                                                }
                                                title={
                                                    <Space>
                                                        <Text
                                                            style={{
                                                                color: '#fff',
                                                                textDecoration: activity.status === 'completed' ? 'line-through' : 'none',
                                                                opacity: activity.status === 'completed' ? 0.7 : 1
                                                            }}
                                                        >
                                                            {activity.title}
                                                        </Text>
                                                        {activity.priority === 'high' && <Tag color="red">High Priority</Tag>}
                                                        {activity.priority === 'urgent' && <Tag color="magenta">Urgent</Tag>}
                                                    </Space>
                                                }
                                                description={
                                                    <Space>
                                                        <Tag color={getStatusColor(activity.status)}>
                                                            {activity.status?.replace('-', ' ').toUpperCase()}
                                                        </Tag>
                                                        <Text strong style={{ color: '#00C853' }}>
                                                            {formatKSH(activity.price)}
                                                        </Text>
                                                    </Space>
                                                }
                                            />
                                        </List.Item>
                                    )}
                                />
                            )}

                            {/* Progress Bar */}
                            {currentActivities.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text type="secondary">Overall Progress</Text>
                                        <Text strong style={{ color: '#00C853' }}>
                                            {Math.round((completedCount / currentActivities.length) * 100)}%
                                        </Text>
                                    </div>
                                    <Progress
                                        percent={Math.round((completedCount / currentActivities.length) * 100)}
                                        strokeColor={{ '0%': '#00B4D8', '100%': '#00C853' }}
                                        showInfo={false}
                                    />
                                </div>
                            )}
                        </Spin>
                    </Card>
                </Col>

                {/* Helpful Tips & Session Info */}
                <Col xs={24} lg={8}>
                    {/* Helpful Tips */}
                    <Card
                        title={
                            <Space>
                                <BulbOutlined style={{ color: '#FFB703' }} />
                                <span>Helpful Tips</span>
                            </Space>
                        }
                        style={{ marginBottom: 24 }}
                    >
                        {helpfulTips.map((tip, idx) => (
                            <div
                                key={idx}
                                style={{
                                    padding: 12,
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: 10,
                                    marginBottom: idx < helpfulTips.length - 1 ? 12 : 0,
                                    border: '1px solid rgba(255, 255, 255, 0.05)'
                                }}
                            >
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ fontSize: 24 }}>{tip.icon}</div>
                                    <div>
                                        <Text strong style={{ color: '#fff', display: 'block', marginBottom: 4 }}>
                                            {tip.title}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 13 }}>{tip.text}</Text>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </Card>

                    {/* Session Info */}
                    <Card
                        title={
                            <Space>
                                <FieldTimeOutlined style={{ color: '#00C853' }} />
                                <span>Your Progress</span>
                            </Space>
                        }
                    >
                        <div style={{ textAlign: 'center' }}>
                            <Progress
                                type="circle"
                                percent={currentActivities.length > 0
                                    ? Math.round((completedCount / currentActivities.length) * 100)
                                    : 0}
                                strokeColor={{ '0%': '#00B4D8', '100%': '#00C853' }}
                                format={() => (
                                    <div>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: '#00C853' }}>
                                            {completedCount}/{currentActivities.length || 0}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748B' }}>tasks done</div>
                                    </div>
                                )}
                                size={100}
                            />
                            <div style={{ marginTop: 16 }}>
                                <Tag color="success" icon={<CheckCircleOutlined />}>Session Active</Tag>
                            </div>
                            <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                                Keep up the great work! Complete your tasks to get things done.
                            </Paragraph>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Encouragement Footer */}
            <Card
                style={{
                    marginTop: 24,
                    background: 'linear-gradient(135deg, rgba(0, 200, 83, 0.1) 0%, rgba(0, 180, 216, 0.1) 100%)',
                    border: '1px solid rgba(0, 200, 83, 0.2)',
                    textAlign: 'center'
                }}
            >
                <CoffeeOutlined style={{ fontSize: 40, color: '#00C853', marginBottom: 12 }} />
                <Title level={4} style={{ margin: 0, color: '#fff' }}>
                    Need a break? That's okay! ☕
                </Title>
                <Text type="secondary">
                    Remember to stretch, rest your eyes, and stay hydrated. We'll be here when you're ready!
                </Text>
            </Card>
        </div>
    );
}

export default Dashboard;
