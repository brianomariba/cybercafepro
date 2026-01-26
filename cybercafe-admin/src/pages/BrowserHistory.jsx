import { useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Tooltip, Badge, Avatar, Row, Col, Tabs, Timeline, Progress, Modal, DatePicker, message } from 'antd';
import {
    GlobalOutlined,
    DesktopOutlined,
    UserOutlined,
    ClockCircleOutlined,
    SearchOutlined,
    FilterOutlined,
    EyeOutlined,
    SafetyOutlined,
    StopOutlined,
    WarningOutlined,
    ChromeOutlined,
    LinkOutlined,
    HistoryOutlined,
    ExportOutlined,
    BlockOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    FireOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

// Mock browser history data from all computers
const mockBrowserHistory = [
    { id: 1, computer: 'PC-01', user: 'John Doe', url: 'https://www.google.com', title: 'Google Search', category: 'search', timestamp: '2024-12-13 10:30:15', duration: '2m 30s', blocked: false },
    { id: 2, computer: 'PC-01', user: 'John Doe', url: 'https://www.youtube.com/watch?v=abc123', title: 'YouTube - Programming Tutorial', category: 'video', timestamp: '2024-12-13 10:33:00', duration: '15m 45s', blocked: false },
    { id: 3, computer: 'PC-03', user: 'Jane Smith', url: 'https://www.facebook.com', title: 'Facebook', category: 'social', timestamp: '2024-12-13 11:00:30', duration: '8m 20s', blocked: false },
    { id: 4, computer: 'PC-05', user: 'Mike Johnson', url: 'https://stackoverflow.com/questions/12345', title: 'Stack Overflow - How to...', category: 'education', timestamp: '2024-12-13 09:20:00', duration: '12m 10s', blocked: false },
    { id: 5, computer: 'PC-02', user: 'Sarah Wilson', url: 'https://www.linkedin.com', title: 'LinkedIn - Professional Network', category: 'social', timestamp: '2024-12-13 11:45:00', duration: '5m 30s', blocked: false },
    { id: 6, computer: 'PC-06', user: 'Tom Brown', url: 'https://gambling-site.com', title: 'Online Casino', category: 'blocked', timestamp: '2024-12-13 08:45:00', duration: '0s', blocked: true },
    { id: 7, computer: 'PC-01', user: 'John Doe', url: 'https://github.com/user/repo', title: 'GitHub - Project Repository', category: 'development', timestamp: '2024-12-13 10:50:00', duration: '25m 00s', blocked: false },
    { id: 8, computer: 'PC-08', user: 'Emma Davis', url: 'https://www.netflix.com', title: 'Netflix - Watch Movies', category: 'entertainment', timestamp: '2024-12-13 12:10:00', duration: '45m 00s', blocked: false },
    { id: 9, computer: 'PC-03', user: 'Jane Smith', url: 'https://mail.google.com', title: 'Gmail - Inbox', category: 'productivity', timestamp: '2024-12-13 11:15:00', duration: '10m 00s', blocked: false },
    { id: 10, computer: 'PC-05', user: 'Mike Johnson', url: 'https://www.wikipedia.org', title: 'Wikipedia', category: 'education', timestamp: '2024-12-13 09:40:00', duration: '7m 30s', blocked: false },
    { id: 11, computer: 'PC-06', user: 'Tom Brown', url: 'https://www.spotify.com', title: 'Spotify - Music Streaming', category: 'entertainment', timestamp: '2024-12-13 08:50:00', duration: '120m 00s', blocked: false },
    { id: 12, computer: 'PC-04', user: 'Guest', url: 'https://adult-content.com', title: 'Adult Content Site', category: 'blocked', timestamp: '2024-12-13 12:30:00', duration: '0s', blocked: true },
    { id: 13, computer: 'PC-08', user: 'Emma Davis', url: 'https://www.amazon.com', title: 'Amazon - Shopping', category: 'shopping', timestamp: '2024-12-13 12:00:00', duration: '8m 45s', blocked: false },
    { id: 14, computer: 'PC-02', user: 'Sarah Wilson', url: 'https://docs.google.com', title: 'Google Docs - Document', category: 'productivity', timestamp: '2024-12-13 11:50:00', duration: '35m 00s', blocked: false },
    { id: 15, computer: 'PC-01', user: 'John Doe', url: 'https://www.twitter.com', title: 'Twitter / X', category: 'social', timestamp: '2024-12-13 11:20:00', duration: '12m 00s', blocked: false },
];

// Website categories summary
const categoryStats = [
    { category: 'Social Media', count: 45, duration: '3h 20m', color: '#ff006e', icon: <UserOutlined /> },
    { category: 'Video/Streaming', count: 32, duration: '5h 45m', color: '#ff3b5c', icon: <FireOutlined /> },
    { category: 'Education', count: 28, duration: '2h 15m', color: '#00ff88', icon: <CheckCircleOutlined /> },
    { category: 'Productivity', count: 25, duration: '4h 30m', color: '#00d4ff', icon: <SafetyOutlined /> },
    { category: 'Entertainment', count: 22, duration: '4h 00m', color: '#7b2cbf', icon: <ChromeOutlined /> },
    { category: 'Shopping', count: 15, duration: '1h 20m', color: '#ff9500', icon: <GlobalOutlined /> },
    { category: 'Blocked Attempts', count: 8, duration: '0m', color: '#ff3b5c', icon: <BlockOutlined /> },
];

// Top visited sites
const topSites = [
    { site: 'youtube.com', visits: 125, totalTime: '8h 30m', icon: '🎬' },
    { site: 'google.com', visits: 98, totalTime: '1h 45m', icon: '🔍' },
    { site: 'facebook.com', visits: 67, totalTime: '2h 20m', icon: '👥' },
    { site: 'github.com', visits: 45, totalTime: '3h 15m', icon: '💻' },
    { site: 'stackoverflow.com', visits: 38, totalTime: '2h 00m', icon: '📚' },
];

// Real-time activity (simulated)
const realtimeActivity = [
    { computer: 'PC-01', user: 'John Doe', site: 'github.com', status: 'active' },
    { computer: 'PC-03', user: 'Jane Smith', site: 'linkedin.com', status: 'active' },
    { computer: 'PC-05', user: 'Mike Johnson', site: 'stackoverflow.com', status: 'active' },
    { computer: 'PC-06', user: 'Tom Brown', site: 'spotify.com', status: 'idle' },
    { computer: 'PC-08', user: 'Emma Davis', site: 'netflix.com', status: 'active' },
];

function BrowserHistory() {
    const [history, setHistory] = useState(mockBrowserHistory);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [detailsVisible, setDetailsVisible] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterComputer, setFilterComputer] = useState('all');

    const getCategoryColor = (category) => {
        switch (category) {
            case 'search': return '#00d4ff';
            case 'social': return '#ff006e';
            case 'video': return '#ff3b5c';
            case 'education': return '#00ff88';
            case 'development': return '#7b2cbf';
            case 'productivity': return '#00d4ff';
            case 'entertainment': return '#ff9500';
            case 'shopping': return '#7b2cbf';
            case 'blocked': return '#ff3b5c';
            default: return '#6b6b80';
        }
    };

    const getCategoryIcon = (category) => {
        switch (category) {
            case 'search': return <SearchOutlined />;
            case 'social': return <UserOutlined />;
            case 'video': return <FireOutlined />;
            case 'education': return <SafetyOutlined />;
            case 'development': return <ChromeOutlined />;
            case 'productivity': return <CheckCircleOutlined />;
            case 'entertainment': return <GlobalOutlined />;
            case 'shopping': return <GlobalOutlined />;
            case 'blocked': return <BlockOutlined />;
            default: return <GlobalOutlined />;
        }
    };

    const filteredHistory = history.filter(h => {
        const matchesSearch = h.url.toLowerCase().includes(searchText.toLowerCase()) ||
            h.title.toLowerCase().includes(searchText.toLowerCase()) ||
            h.user.toLowerCase().includes(searchText.toLowerCase());
        const matchesCategory = filterCategory === 'all' || h.category === filterCategory;
        const matchesComputer = filterComputer === 'all' || h.computer === filterComputer;
        return matchesSearch && matchesCategory && matchesComputer;
    });

    const handleBlockSite = (url) => {
        message.success(`${url} has been added to blocklist`);
    };

    const columns = [
        {
            title: 'Time',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 100,
            render: (time) => (
                <Text type="secondary" style={{ fontSize: 12, fontFamily: 'JetBrains Mono' }}>
                    {dayjs(time).format('HH:mm:ss')}
                </Text>
            ),
        },
        {
            title: 'Computer / User',
            key: 'computer',
            width: 160,
            render: (_, record) => (
                <Space>
                    <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background: 'rgba(0, 212, 255, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#00d4ff'
                    }}>
                        <DesktopOutlined />
                    </div>
                    <div>
                        <Text strong style={{ fontSize: 13 }}>{record.computer}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 11 }}>{record.user}</Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Website',
            dataIndex: 'title',
            key: 'title',
            render: (title, record) => (
                <div style={{ maxWidth: 300 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 24,
                            height: 24,
                            borderRadius: 4,
                            background: record.blocked ? 'rgba(255, 59, 92, 0.15)' : 'rgba(255,255,255,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12
                        }}>
                            {record.blocked ? <BlockOutlined style={{ color: '#ff3b5c' }} /> : '🌐'}
                        </div>
                        <Text
                            strong
                            style={{
                                color: record.blocked ? '#ff3b5c' : '#fff',
                                textDecoration: record.blocked ? 'line-through' : 'none'
                            }}
                        >
                            {title}
                        </Text>
                    </div>
                    <Text
                        type="secondary"
                        style={{ fontSize: 11, display: 'block', marginTop: 2 }}
                        ellipsis
                    >
                        {record.url}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            width: 120,
            render: (category) => (
                <Tag
                    icon={getCategoryIcon(category)}
                    color={getCategoryColor(category)}
                    style={{ textTransform: 'capitalize' }}
                >
                    {category === 'blocked' ? 'BLOCKED' : category}
                </Tag>
            ),
        },
        {
            title: 'Duration',
            dataIndex: 'duration',
            key: 'duration',
            width: 100,
            render: (duration, record) => (
                <Text style={{
                    fontFamily: 'JetBrains Mono',
                    color: record.blocked ? '#ff3b5c' : '#00d4ff'
                }}>
                    {duration}
                </Text>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, record) => (
                <Space>
                    <Tooltip title="View Details">
                        <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => {
                                setSelectedEntry(record);
                                setDetailsVisible(true);
                            }}
                        />
                    </Tooltip>
                    {!record.blocked && (
                        <Tooltip title="Block this site">
                            <Button
                                type="text"
                                size="small"
                                icon={<BlockOutlined style={{ color: '#ff3b5c' }} />}
                                onClick={() => handleBlockSite(record.url)}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title="Open URL">
                        <Button
                            type="text"
                            size="small"
                            icon={<ExportOutlined />}
                            onClick={() => window.open(record.url, '_blank')}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <GlobalOutlined className="icon" />
                    <h1>Browser History</h1>
                </div>
                <p className="page-subtitle">Monitor websites visited across all computers in real-time</p>
            </div>

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-card blue">
                    <div className="stat-header">
                        <div className="stat-icon blue">
                            <GlobalOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{history.length}</div>
                    <div className="stat-label">Sites Visited Today</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green">
                            <CheckCircleOutlined />
                        </div>
                    </div>
                    <div className="stat-value">5</div>
                    <div className="stat-label">Active Browsers</div>
                </div>

                <div className="stat-card pink">
                    <div className="stat-header">
                        <div className="stat-icon pink">
                            <BlockOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{history.filter(h => h.blocked).length}</div>
                    <div className="stat-label">Blocked Attempts</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-header">
                        <div className="stat-icon purple">
                            <ClockCircleOutlined />
                        </div>
                    </div>
                    <div className="stat-value">24h</div>
                    <div className="stat-label">Total Browse Time</div>
                </div>
            </div>

            <Row gutter={[24, 24]}>
                {/* History Table */}
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <HistoryOutlined style={{ color: '#00d4ff' }} />
                                <span>Browsing History</span>
                                <Badge count={filteredHistory.length} style={{ backgroundColor: '#00d4ff' }} />
                            </Space>
                        }
                        extra={
                            <Space>
                                <Search
                                    placeholder="Search sites..."
                                    style={{ width: 200 }}
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                />
                                <Select
                                    value={filterCategory}
                                    onChange={setFilterCategory}
                                    style={{ width: 130 }}
                                    options={[
                                        { value: 'all', label: 'All Categories' },
                                        { value: 'social', label: 'Social Media' },
                                        { value: 'video', label: 'Video' },
                                        { value: 'education', label: 'Education' },
                                        { value: 'entertainment', label: 'Entertainment' },
                                        { value: 'productivity', label: 'Productivity' },
                                        { value: 'blocked', label: 'Blocked' },
                                    ]}
                                />
                                <Select
                                    value={filterComputer}
                                    onChange={setFilterComputer}
                                    style={{ width: 100 }}
                                    options={[
                                        { value: 'all', label: 'All PCs' },
                                        ...['PC-01', 'PC-02', 'PC-03', 'PC-04', 'PC-05', 'PC-06', 'PC-07', 'PC-08'].map(pc => ({
                                            value: pc, label: pc
                                        }))
                                    ]}
                                />
                            </Space>
                        }
                    >
                        <Table
                            columns={columns}
                            dataSource={filteredHistory}
                            rowKey="id"
                            pagination={{ pageSize: 8 }}
                            size="middle"
                        />
                    </Card>
                </Col>

                {/* Sidebar */}
                <Col xs={24} lg={8}>
                    {/* Real-time Activity */}
                    <Card
                        title={
                            <Space>
                                <Badge status="processing" />
                                <span>Live Activity</span>
                            </Space>
                        }
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {realtimeActivity.map((activity, index) => (
                                <div
                                    key={index}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: 12,
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: 8,
                                        borderLeft: `3px solid ${activity.status === 'active' ? '#00ff88' : '#ff9500'}`
                                    }}
                                >
                                    <div style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 6,
                                        background: 'rgba(0, 212, 255, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#00d4ff',
                                        fontSize: 14
                                    }}>
                                        <DesktopOutlined />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <Text strong style={{ fontSize: 13 }}>{activity.computer}</Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 11 }}>{activity.site}</Text>
                                    </div>
                                    <Badge
                                        status={activity.status === 'active' ? 'success' : 'warning'}
                                        text={<Text type="secondary" style={{ fontSize: 11 }}>{activity.status}</Text>}
                                    />
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Top Sites */}
                    <Card
                        title={
                            <Space>
                                <FireOutlined style={{ color: '#ff9500' }} />
                                <span>Top Sites Today</span>
                            </Space>
                        }
                        style={{ marginTop: 24 }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {topSites.map((site, index) => (
                                <div
                                    key={site.site}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: 8
                                    }}
                                >
                                    <div style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        background: index === 0 ? '#ff9500' : index === 1 ? '#00d4ff' : 'rgba(255,255,255,0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12
                                    }}>
                                        {site.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <Text strong style={{ fontSize: 13 }}>{site.site}</Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 11 }}>{site.visits} visits</Text>
                                    </div>
                                    <Text style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#7b2cbf' }}>
                                        {site.totalTime}
                                    </Text>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Category Breakdown */}
                    <Card
                        title={
                            <Space>
                                <SafetyOutlined style={{ color: '#00ff88' }} />
                                <span>Categories</span>
                            </Space>
                        }
                        style={{ marginTop: 24 }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {categoryStats.slice(0, 5).map(cat => (
                                <div key={cat.category}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <Space>
                                            <span style={{ color: cat.color }}>{cat.icon}</span>
                                            <Text style={{ fontSize: 13 }}>{cat.category}</Text>
                                        </Space>
                                        <Text type="secondary" style={{ fontSize: 12 }}>{cat.count} visits</Text>
                                    </div>
                                    <Progress
                                        percent={Math.round((cat.count / 45) * 100)}
                                        size="small"
                                        showInfo={false}
                                        strokeColor={cat.color}
                                    />
                                </div>
                            ))}
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Entry Details Modal */}
            <Modal
                title={
                    <Space>
                        <GlobalOutlined style={{ color: '#00d4ff' }} />
                        <span>Browsing Details</span>
                    </Space>
                }
                open={detailsVisible}
                onCancel={() => setDetailsVisible(false)}
                footer={[
                    <Button key="block" danger icon={<BlockOutlined />} onClick={() => {
                        handleBlockSite(selectedEntry?.url);
                        setDetailsVisible(false);
                    }}>
                        Block Site
                    </Button>,
                    <Button key="close" onClick={() => setDetailsVisible(false)}>Close</Button>,
                ]}
                width={500}
            >
                {selectedEntry && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: 16, background: 'rgba(0, 212, 255, 0.1)', borderRadius: 12 }}>
                            <Text type="secondary">Page Title</Text>
                            <Title level={5} style={{ margin: '4px 0 0' }}>{selectedEntry.title}</Title>
                        </div>

                        <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                            <Text type="secondary">URL</Text>
                            <br />
                            <Text copyable style={{ wordBreak: 'break-all' }}>{selectedEntry.url}</Text>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                <Text type="secondary">Computer</Text>
                                <br />
                                <Text strong>{selectedEntry.computer}</Text>
                            </div>
                            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                <Text type="secondary">User</Text>
                                <br />
                                <Text strong>{selectedEntry.user}</Text>
                            </div>
                            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                <Text type="secondary">Time</Text>
                                <br />
                                <Text strong>{dayjs(selectedEntry.timestamp).format('HH:mm:ss')}</Text>
                            </div>
                            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                <Text type="secondary">Duration</Text>
                                <br />
                                <Text strong style={{ color: '#00d4ff' }}>{selectedEntry.duration}</Text>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text type="secondary">Category</Text>
                            <Tag
                                icon={getCategoryIcon(selectedEntry.category)}
                                color={getCategoryColor(selectedEntry.category)}
                                style={{ textTransform: 'capitalize' }}
                            >
                                {selectedEntry.category}
                            </Tag>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default BrowserHistory;
