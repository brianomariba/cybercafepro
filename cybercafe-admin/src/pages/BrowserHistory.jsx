import { useState, useEffect } from 'react';
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
import { getBrowserHistory } from '../services/api';

const { Text, Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

function BrowserHistory() {
    const [history, setHistory] = useState([]);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [detailsVisible, setDetailsVisible] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterComputer, setFilterComputer] = useState('all');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadHistory = async () => {
            setLoading(true);
            try {
                const data = await getBrowserHistory({ limit: 200 });
                // Map backend records to UI-friendly shape
                const mapped = data.map((item, index) => ({
                    id: item.id || index,
                    computer: item.hostname || item.clientId || 'Unknown',
                    user: item.sessionUser || item.user || 'Unknown',
                    url: item.url,
                    title: item.title || item.url,
                    category: item.category || 'other',
                    timestamp: item.timestamp || item.receivedAt || new Date().toISOString(),
                    duration: item.duration || null,
                    blocked: item.blocked || false,
                }));
                setHistory(mapped);
            } catch (e) {
                console.error('Failed to load browser history', e);
            } finally {
                setLoading(false);
            }
        };

        loadHistory();
    }, []);

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
                    <div className="stat-value">{new Set(history.map(h => h.computer)).size}</div>
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
                    <div className="stat-value">-</div>
                    <div className="stat-label">Total Browse Time (coming soon)</div>
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
                            loading={loading}
                            pagination={{ pageSize: 8 }}
                            size="middle"
                        />
                    </Card>
                </Col>

                {/* Sidebar reserved for future real-time analytics */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <SafetyOutlined style={{ color: '#00ff88' }} />
                                <span>Insights</span>
                            </Space>
                        }
                    >
                        <Text type="secondary">
                            Insights and live activity will appear here once enough real browsing data has been collected
                            from agents.
                        </Text>
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
