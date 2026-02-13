import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Modal, Space, Typography, Input, Select, Tooltip, Badge, Progress, message, Popconfirm, Avatar, Row, Col, Collapse, List, Empty, Tabs, Drawer, Upload, Image, Spin } from 'antd';
import {
    DesktopOutlined,
    UserOutlined,
    ClockCircleOutlined,
    PlayCircleOutlined,
    StopOutlined,
    ReloadOutlined,
    EyeOutlined,
    PoweroffOutlined,
    LockOutlined,
    WarningOutlined,
    CheckCircleOutlined,
    SyncOutlined,
    GlobalOutlined,
    FileOutlined,
    PrinterOutlined,
    UsbOutlined,
    HistoryOutlined,
    DashboardOutlined,
    SendOutlined,
    CaretRightOutlined,
    ExpandAltOutlined,
    InboxOutlined,
    CameraOutlined,
    DisconnectOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getComputers, getComputer, getSessions, getBrowserHistory, getFileActivity, getPrintJobs, sendCommand, connectSocket, sendDocumentToComputer, disconnectComputer } from '../services/api';

const { Text, Title } = Typography;
const { Search } = Input;
const { Panel } = Collapse;

// Format KSH
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()} `;

function Computers() {
    const navigate = useNavigate();
    const [computers, setComputers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedComputer, setSelectedComputer] = useState(null);
    const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchText, setSearchText] = useState('');
    const [hiddenComputers, setHiddenComputers] = useState(new Set());

    // Activity data for selected computer
    const [sessions, setSessions] = useState([]);
    const [browserHistory, setBrowserHistory] = useState([]);
    const [fileActivity, setFileActivity] = useState([]);
    const [printJobs, setPrintJobs] = useState([]);
    const [activityLoading, setActivityLoading] = useState(false);

    // Fetch computers
    const fetchComputers = async () => {
        setLoading(true);
        try {
            const data = await getComputers();
            setComputers(data || []);
        } catch (error) {
            console.error('Failed to fetch computers:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchComputers();
        const interval = setInterval(fetchComputers, 15000); // Refresh every 15s
        return () => clearInterval(interval);
    }, []);

    // Real-time activity updates for selected computer
    useEffect(() => {
        if (!selectedComputer || !activityDrawerOpen) return;

        const socket = connectSocket({
            onNewLog: (log) => {
                // Ensure we only process logs for the currently viewed computer to prevent mixed data
                if (log && String(log.clientId) === String(selectedComputer.clientId)) {
                    const logData = log.data || {};
                    if (log.type === 'file') {
                        setFileActivity(prev => {
                            // Deduplicate based on timestamp and filename/name
                            const isDuplicate = prev.some(f =>
                                (f.timestamp === logData.timestamp || f.receivedAt === logData.timestamp) &&
                                (f.name === logData.name || f.filename === logData.name)
                            );
                            if (isDuplicate) return prev;
                            return [logData, ...prev].slice(0, 50);
                        });
                    } else if (log.type === 'browser') {
                        setBrowserHistory(prev => {
                            const newId = log._id || log.id || Date.now();
                            if (prev.some(item => item.id === newId)) return prev;
                            return [{ ...logData, id: newId }, ...prev].slice(0, 50);
                        });
                    } else if (log.type === 'print') {
                        // Refresh to get full job details formatting
                        getPrintJobs({ clientId: selectedComputer.clientId, limit: 20 })
                            .then(res => setPrintJobs(res.jobs || []));
                    }
                }
            },
            onScreenshot: (data) => {
                if (selectedComputer && data.clientId === selectedComputer.clientId) {
                    setScreenshotData(data.screenshot);
                    setScreenshotTimestamp(data.timestamp);
                    setScreenshotLoading(false);
                    if (!screenshotVisible) {
                        setScreenshotVisible(true);
                        message.success('Screenshot captured');
                    }
                }
            },
            onAgentError: (data) => {
                if (selectedComputer && data.clientId === selectedComputer.clientId) {
                    setScreenshotLoading(false);
                    message.error(`Failed to capture screenshot: ${data.message}`);
                }
            }
        });

        return () => socket.disconnect();
    }, [selectedComputer, activityDrawerOpen]);

    // Fetch activity for selected computer
    const fetchComputerActivity = async (computer) => {
        if (!computer || !computer.clientId) {
            console.warn('Cannot fetch activity: Missing Client ID');
            return;
        }

        setActivityLoading(true);

        // Clear previous data to avoid mixing
        setSessions([]);
        setBrowserHistory([]);
        setFileActivity([]);
        setPrintJobs([]);

        try {
            const [sessionsRes, historyRes, filesRes, printsRes] = await Promise.all([
                getSessions({ clientId: computer.clientId, limit: 20 }),
                getBrowserHistory({ clientId: computer.clientId, limit: 50 }),
                getFileActivity({ clientId: computer.clientId, limit: 50 }),
                getPrintJobs({ clientId: computer.clientId, limit: 20 }),
            ]);
            setSessions(sessionsRes || []);
            setBrowserHistory(historyRes || []);
            setFileActivity(filesRes || []);
            setPrintJobs(printsRes?.jobs || []);
        } catch (error) {
            console.error('Failed to fetch activity:', error);
        }
        setActivityLoading(false);
    };

    // Open activity drawer
    const handleViewActivity = (computer) => {
        setSelectedComputer(computer);
        setActivityDrawerOpen(true);
        fetchComputerActivity(computer);
    };

    // Send command to computer
    const handleCommand = async (computer, command) => {
        try {
            await sendCommand(computer.clientId, command);
            message.success(`Command "${command}" sent to ${computer.hostname} `);
        } catch (error) {
            message.error('Failed to send command');
        }
    };

    // Send File Modal State
    const [sendFileModalVisible, setSendFileModalVisible] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    // Screenshot State
    const [screenshotVisible, setScreenshotVisible] = useState(false);
    const [screenshotData, setScreenshotData] = useState(null);
    const [screenshotTimestamp, setScreenshotTimestamp] = useState(null);
    const [screenshotLoading, setScreenshotLoading] = useState(false);

    const handleSendFileClick = () => {
        setUploadFile(null);
        setSendFileModalVisible(true);
    };

    const handleSendFileSubmit = async () => {
        if (!uploadFile || !selectedComputer) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('targetClientId', selectedComputer.clientId);
            formData.append('targetHostname', selectedComputer.hostname);

            await sendDocumentToComputer(formData);
            message.success(`File sent successfully to ${selectedComputer.hostname}`);
            setSendFileModalVisible(false);
            setUploadFile(null);
        } catch (error) {
            console.error(error);
            message.error('Failed to send file');
        }
        setUploading(false);
    };

    const handleScreenshotRequest = async () => {
        if (!selectedComputer) return;
        setScreenshotLoading(true);
        setScreenshotData(null);
        setScreenshotVisible(true);

        // Timeout handler
        const timer = setTimeout(() => {
            setScreenshotLoading(loading => {
                if (loading) {
                    message.error('Screenshot request timed out. The agent may be unresponsive.');
                    return false;
                }
                return loading;
            });
        }, 15000);

        try {
            await sendCommand(selectedComputer.clientId, 'screenshot');
        } catch (error) {
            clearTimeout(timer);
            message.error('Failed to request screenshot');
            setScreenshotLoading(false);
            setScreenshotVisible(false);
        }
    };

    const getStatusColor = (status) => {
        if (status === 'active') return '#00ff88';
        if (status === 'locked') return '#00d4ff';
        return '#6b6b80';
    };

    const filteredComputers = computers.filter(c => {
        // Persistently filter out hidden (disconnected) computers
        if (hiddenComputers.has(c.clientId)) return false;

        const matchesStatus = filterStatus === 'all' ||
            (filterStatus === 'active' && c.status === 'active') ||
            (filterStatus === 'locked' && c.status === 'locked') ||
            (filterStatus === 'offline' && !c.isOnline);
        const matchesSearch = c.hostname?.toLowerCase().includes(searchText.toLowerCase()) ||
            c.sessionUser?.toLowerCase().includes(searchText.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const stats = {
        total: computers.length,
        online: computers.filter(c => c.isOnline).length,
        active: computers.filter(c => c.status === 'active').length,
        locked: computers.filter(c => c.status === 'locked').length,
    };

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <DesktopOutlined className="icon" />
                    <h1>Computers</h1>
                </div>
                <p className="page-subtitle">Monitor and manage all connected computers</p>
            </div>

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-card blue">
                    <div className="stat-header">
                        <div className="stat-icon blue"><DesktopOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.total}</div>
                    <div className="stat-label">Total Computers</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green"><CheckCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.online}</div>
                    <div className="stat-label">Online</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-header">
                        <div className="stat-icon purple"><PlayCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.active}</div>
                    <div className="stat-label">Active Sessions</div>
                </div>

                <div className="stat-card orange">
                    <div className="stat-header">
                        <div className="stat-icon orange"><LockOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.locked}</div>
                    <div className="stat-label">Locked</div>
                </div>
            </div>

            {/* Filters */}
            <Card style={{ marginBottom: 24 }}>
                <Space size="large" wrap>
                    <Search
                        placeholder="Search computers or users..."
                        style={{ width: 300 }}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                    <Select
                        value={filterStatus}
                        onChange={setFilterStatus}
                        style={{ width: 150 }}
                        options={[
                            { value: 'all', label: 'All Status' },
                            { value: 'active', label: 'Active' },
                            { value: 'locked', label: 'Locked' },
                            { value: 'offline', label: 'Offline' },
                        ]}
                    />
                    <Button
                        type={viewMode === 'grid' ? 'primary' : 'default'}
                        onClick={() => setViewMode('grid')}
                    >
                        Grid View
                    </Button>
                    <Button
                        type={viewMode === 'table' ? 'primary' : 'default'}
                        onClick={() => setViewMode('table')}
                    >
                        Table View
                    </Button>
                    <Button icon={<SyncOutlined />} onClick={fetchComputers} loading={loading}>
                        Refresh
                    </Button>
                </Space>
            </Card>

            {/* Computer Grid */}
            {viewMode === 'grid' ? (
                <div className="computer-grid">
                    {filteredComputers.length === 0 ? (
                        <Card style={{ gridColumn: '1 / -1' }}>
                            <Empty description="No computers connected yet" />
                        </Card>
                    ) : (
                        filteredComputers.map(computer => (
                            <div
                                key={computer.clientId}
                                className={`computer - card ${computer.isOnline ? (computer.status === 'active' ? 'online' : 'busy') : 'offline'} `}
                            >
                                <DesktopOutlined
                                    className="computer-icon"
                                    style={{
                                        color: getStatusColor(computer.status),
                                        filter: computer.isOnline ? `drop - shadow(0 0 10px ${getStatusColor(computer.status)}50)` : 'none'
                                    }}
                                />
                                <div className="computer-name">{computer.hostname}</div>
                                <div className="computer-status">
                                    <Tag color={computer.isOnline ? (computer.status === 'active' ? 'success' : 'processing') : 'default'}>
                                        {computer.isOnline ? computer.status?.toUpperCase() : 'OFFLINE'}
                                    </Tag>
                                </div>
                                {computer.sessionUser && (
                                    <div className="computer-user">
                                        <UserOutlined />
                                        <span>{computer.sessionUser}</span>
                                    </div>
                                )}
                                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                    <Tooltip title="View Activity">
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<EyeOutlined />}
                                            onClick={() => handleViewActivity(computer)}
                                        >
                                            Monitor
                                        </Button>
                                    </Tooltip>
                                    {computer.status === 'active' && (
                                        <Tooltip title="Lock Computer">
                                            <Button
                                                size="small"
                                                icon={<LockOutlined />}
                                                onClick={() => handleCommand(computer, 'lock')}
                                            />
                                        </Tooltip>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <Card>
                    <Table
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
                                render: (ip) => <Text type="secondary" style={{ fontFamily: 'monospace' }}>{ip}</Text>,
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
                            {
                                title: 'Actions',
                                key: 'actions',
                                render: (_, record) => (
                                    <Button
                                        type="primary"
                                        size="small"
                                        icon={<EyeOutlined />}
                                        onClick={() => handleViewActivity(record)}
                                    >
                                        Monitor
                                    </Button>
                                ),
                            },
                        ]}
                        dataSource={filteredComputers}
                        rowKey="clientId"
                        pagination={{ pageSize: 10 }}
                        loading={loading}
                    />
                </Card>
            )}

            {/* Activity Monitoring Drawer */}
            <Drawer
                title={
                    <Space>
                        <DesktopOutlined style={{ color: '#00d4ff' }} />
                        <span>{selectedComputer?.hostname} - Activity Monitor</span>
                        <Badge status={selectedComputer?.isOnline ? 'success' : 'default'} />
                    </Space>
                }
                placement="right"
                width={700}
                open={activityDrawerOpen}
                onClose={() => setActivityDrawerOpen(false)}
                extra={
                    <Button icon={<ReloadOutlined />} onClick={() => fetchComputerActivity(selectedComputer)} loading={activityLoading}>
                        Refresh
                    </Button>
                }
            >
                {selectedComputer && (
                    <>
                        {/* Computer Info Card */}
                        <Card size="small" style={{ marginBottom: 16, background: 'rgba(0, 180, 216, 0.05)' }}>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Text type="secondary">IP Address</Text>
                                    <br />
                                    <Text strong style={{ fontFamily: 'monospace' }}>{selectedComputer.ip}</Text>
                                </Col>
                                <Col span={8}>
                                    <Text type="secondary">Status</Text>
                                    <br />
                                    <Tag color={selectedComputer.status === 'active' ? 'success' : 'processing'}>
                                        {selectedComputer.status?.toUpperCase()}
                                    </Tag>
                                </Col>
                                <Col span={8}>
                                    <Text type="secondary">Current User</Text>
                                    <br />
                                    <Text strong>{selectedComputer.sessionUser || 'None'}</Text>
                                </Col>
                            </Row>
                        </Card>

                        {/* Quick Actions */}
                        <Space style={{ marginBottom: 16 }}>
                            <Button icon={<LockOutlined />} onClick={() => handleCommand(selectedComputer, 'lock')}>
                                Lock
                            </Button>
                            <Button icon={<ReloadOutlined />} onClick={() => handleCommand(selectedComputer, 'restart')}>
                                Restart
                            </Button>
                            <Button icon={<SendOutlined />} onClick={handleSendFileClick}>
                                Send File
                            </Button>
                            <Button icon={<CameraOutlined />} onClick={handleScreenshotRequest}>
                                Screenshot
                            </Button>
                            <Popconfirm
                                title="Disconnect Computer?"
                                description="This will disconnect the computer from the server. The agent will stop sending data until restarted."
                                onConfirm={async () => {
                                    try {
                                        // Send quit=true to ensure agent terminates and doesn't auto-reconnect
                                        await disconnectComputer(selectedComputer.clientId, true);
                                        message.success(`Disconnect command sent to ${selectedComputer.hostname}`);
                                        setActivityDrawerOpen(false);

                                        // Persistently remove from list for this session
                                        setHiddenComputers(prev => new Set(prev).add(selectedComputer.clientId));

                                        // Optimistically update current list as well
                                        setComputers(prev => prev.filter(c => c.clientId !== selectedComputer.clientId));
                                    } catch (error) {
                                        message.error('Failed to disconnect computer');
                                    }
                                }}
                                okText="Disconnect"
                                cancelText="Cancel"
                                okButtonProps={{ danger: true }}
                            >
                                <Button danger icon={<DisconnectOutlined />}>
                                    Disconnect
                                </Button>
                            </Popconfirm>
                        </Space>

                        {/* Collapsible Activity Sections */}
                        <Collapse
                            defaultActiveKey={['sessions', 'browser']}
                            expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
                        >
                            {/* Sessions */}
                            <Panel
                                header={
                                    <Space>
                                        <ClockCircleOutlined style={{ color: '#00d4ff' }} />
                                        <span>Session History</span>
                                        <Badge count={sessions.length} style={{ backgroundColor: '#00d4ff' }} />
                                    </Space>
                                }
                                key="sessions"
                            >
                                <List
                                    size="small"
                                    loading={activityLoading}
                                    dataSource={sessions.slice(0, 10)}
                                    locale={{ emptyText: 'No sessions recorded' }}
                                    renderItem={session => (
                                        <List.Item>
                                            <List.Item.Meta
                                                avatar={<Avatar icon={<UserOutlined />} style={{ background: session.type === 'LOGIN' ? '#00ff88' : '#ff3b5c' }} />}
                                                title={
                                                    <Space>
                                                        <Tag color={session.type === 'LOGIN' ? 'success' : 'error'}>{session.type}</Tag>
                                                        <Text>{session.user}</Text>
                                                    </Space>
                                                }
                                                description={dayjs(session.startTime || session.receivedAt).format('MMM D, HH:mm')}
                                            />
                                            {session.charges && (
                                                <Text strong style={{ color: '#00ff88' }}>{formatKSH(session.charges.grandTotal)}</Text>
                                            )}
                                        </List.Item>
                                    )}
                                />
                            </Panel>

                            {/* Browser History */}
                            <Panel
                                header={
                                    <Space>
                                        <GlobalOutlined style={{ color: '#7b2cbf' }} />
                                        <span>Browser History</span>
                                        <Badge count={browserHistory.length} style={{ backgroundColor: '#7b2cbf' }} />
                                    </Space>
                                }
                                key="browser"
                            >
                                <List
                                    size="small"
                                    loading={activityLoading}
                                    dataSource={browserHistory.slice(0, 20)}
                                    locale={{ emptyText: 'No browser history' }}
                                    renderItem={item => {
                                        const getCategoryColor = (category) => {
                                            const colors = {
                                                search: 'blue',
                                                social: 'magenta',
                                                video: 'red',
                                                education: 'green',
                                                development: 'purple',
                                                productivity: 'cyan',
                                                shopping: 'orange',
                                                entertainment: 'pink',
                                                news: 'geekblue'
                                            };
                                            return colors[category] || 'default';
                                        };

                                        return (
                                            <List.Item>
                                                <List.Item.Meta
                                                    avatar={
                                                        <Avatar size="small" style={{ background: '#7b2cbf' }}>
                                                            <GlobalOutlined />
                                                        </Avatar>
                                                    }
                                                    title={
                                                        <Space size="small">
                                                            <Text ellipsis style={{ maxWidth: 350 }}>
                                                                {item.title || item.url || 'Unknown Page'}
                                                            </Text>
                                                        </Space>
                                                    }
                                                    description={
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            <Space size="small" wrap>
                                                                {item.category && item.category !== 'other' && (
                                                                    <Tag color={getCategoryColor(item.category)} style={{ textTransform: 'capitalize' }}>
                                                                        {item.category}
                                                                    </Tag>
                                                                )}
                                                                {item.browser && (
                                                                    <Text type="secondary" style={{ fontSize: 10 }}>
                                                                        {item.browser.split('.')[0]}
                                                                    </Text>
                                                                )}
                                                                {item.timestamp && (
                                                                    <Text type="secondary" style={{ fontSize: 10 }}>
                                                                        {dayjs(item.timestamp).format('HH:mm')}
                                                                    </Text>
                                                                )}
                                                            </Space>
                                                            <a
                                                                href={item.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{ fontSize: 11, color: '#00b4d8' }}
                                                            >
                                                                <Text type="secondary" ellipsis style={{ maxWidth: 400, fontSize: 11 }}>
                                                                    {item.url}
                                                                </Text>
                                                            </a>
                                                        </div>
                                                    }
                                                />
                                            </List.Item>
                                        );
                                    }}
                                />
                            </Panel>

                            {/* File Activity */}
                            <Panel
                                header={
                                    <Space>
                                        <FileOutlined style={{ color: '#ff9500' }} />
                                        <span>File Activity</span>
                                        <Badge count={fileActivity.length} style={{ backgroundColor: '#ff9500' }} />
                                    </Space>
                                }
                                key="files"
                            >
                                {/* File Summary by Type */}
                                {(() => {
                                    const getFileType = (file) => {
                                        const name = (file.name || file.filename || '').toLowerCase();
                                        const ext = name.split('.').pop();
                                        if (['pdf'].includes(ext)) return 'pdf';
                                        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) return 'image';
                                        if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return 'document';
                                        if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet';
                                        if (['ppt', 'pptx', 'odp'].includes(ext)) return 'presentation';
                                        if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm'].includes(ext)) return 'video';
                                        if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return 'audio';
                                        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
                                        return 'other';
                                    };

                                    const summary = fileActivity.reduce((acc, file) => {
                                        const type = getFileType(file);
                                        acc[type] = (acc[type] || 0) + 1;
                                        return acc;
                                    }, {});

                                    const typeConfig = {
                                        pdf: { color: '#e74c3c', icon: '📄', label: 'PDFs' },
                                        image: { color: '#3498db', icon: '🖼️', label: 'Images' },
                                        document: { color: '#2ecc71', icon: '📝', label: 'Docs' },
                                        spreadsheet: { color: '#27ae60', icon: '📊', label: 'Sheets' },
                                        presentation: { color: '#e67e22', icon: '📽️', label: 'Slides' },
                                        video: { color: '#9b59b6', icon: '🎬', label: 'Videos' },
                                        audio: { color: '#1abc9c', icon: '🎵', label: 'Audio' },
                                        archive: { color: '#f39c12', icon: '📦', label: 'Archives' },
                                        other: { color: '#95a5a6', icon: '📎', label: 'Other' }
                                    };

                                    return (
                                        <>
                                            {fileActivity.length > 0 && (
                                                <div style={{
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: 8,
                                                    marginBottom: 16,
                                                    padding: '12px',
                                                    background: 'rgba(255, 149, 0, 0.1)',
                                                    borderRadius: 8
                                                }}>
                                                    {Object.entries(summary).map(([type, count]) => (
                                                        <Tag
                                                            key={type}
                                                            style={{
                                                                background: typeConfig[type]?.color || '#95a5a6',
                                                                border: 'none',
                                                                color: 'white',
                                                                padding: '4px 10px',
                                                                fontSize: 12
                                                            }}
                                                        >
                                                            {typeConfig[type]?.icon} {typeConfig[type]?.label}: {count}
                                                        </Tag>
                                                    ))}
                                                </div>
                                            )}
                                            <List
                                                size="small"
                                                loading={activityLoading}
                                                dataSource={fileActivity.slice(0, 20)}
                                                locale={{ emptyText: 'No file activity' }}
                                                renderItem={file => {
                                                    const fileType = getFileType(file);
                                                    const config = typeConfig[fileType];
                                                    return (
                                                        <List.Item>
                                                            <List.Item.Meta
                                                                avatar={
                                                                    <Avatar
                                                                        size="small"
                                                                        style={{
                                                                            background: config?.color || '#ff9500',
                                                                            fontSize: 14
                                                                        }}
                                                                    >
                                                                        {config?.icon?.charAt(0) || '📄'}
                                                                    </Avatar>
                                                                }
                                                                title={
                                                                    <Text ellipsis style={{ maxWidth: 250 }}>
                                                                        {file.name || file.filename || 'Unknown File'}
                                                                    </Text>
                                                                }
                                                                description={
                                                                    <Space size="small">
                                                                        <Tag color={config?.color} style={{ fontSize: 10 }}>
                                                                            {config?.label || file.category || 'file'}
                                                                        </Tag>
                                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                                            {file.size || file.sizeFormatted || ''}
                                                                        </Text>
                                                                        {file.action && (
                                                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                                                ({file.action})
                                                                            </Text>
                                                                        )}
                                                                    </Space>
                                                                }
                                                            />
                                                        </List.Item>
                                                    );
                                                }}
                                            />
                                        </>
                                    );
                                })()}
                            </Panel>

                            {/* Print Jobs */}
                            <Panel
                                header={
                                    <Space>
                                        <PrinterOutlined style={{ color: '#00ff88' }} />
                                        <span>Print Jobs</span>
                                        <Badge count={printJobs.length} style={{ backgroundColor: '#00ff88' }} />
                                    </Space>
                                }
                                key="prints"
                            >
                                <List
                                    size="small"
                                    loading={activityLoading}
                                    dataSource={printJobs.slice(0, 15)}
                                    locale={{ emptyText: 'No print jobs' }}
                                    renderItem={job => (
                                        <List.Item>
                                            <List.Item.Meta
                                                avatar={
                                                    <Avatar
                                                        size="small"
                                                        style={{
                                                            background: job.printType === 'color' || job.isColorPrint ? '#7b2cbf' : '#6b6b80'
                                                        }}
                                                    >
                                                        <PrinterOutlined />
                                                    </Avatar>
                                                }
                                                title={
                                                    <Space size="small">
                                                        <Text ellipsis style={{ maxWidth: 250 }}>
                                                            {job.documentName || job.document || 'Print Job'}
                                                        </Text>
                                                    </Space>
                                                }
                                                description={
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <Space size="small" wrap>
                                                            <Tag color={job.printType === 'color' || job.isColorPrint ? 'magenta' : 'default'}>
                                                                {job.printType === 'color' || job.isColorPrint ? 'COLOR' : 'B&W'}
                                                            </Tag>
                                                            <Text type="secondary">{job.totalPages || 1} pages</Text>
                                                            {job.paperSize && job.paperSize !== 'Unknown' && (
                                                                <Tag color="blue">{job.paperSize}</Tag>
                                                            )}
                                                            {job.duplexMode && job.duplexMode !== 'Single-sided' && (
                                                                <Tag color="cyan">{job.duplexMode}</Tag>
                                                            )}
                                                        </Space>
                                                        <Space size="small">
                                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                                Printer: {job.printer || 'Unknown'}
                                                            </Text>
                                                            {job.printQuality && job.printQuality !== 'Normal' && (
                                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                                    • {job.printQuality}
                                                                </Text>
                                                            )}
                                                            {job.sizeKB > 0 && (
                                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                                    • {job.sizeKB > 1024 ? `${(job.sizeKB / 1024).toFixed(1)} MB` : `${job.sizeKB} KB`}
                                                                </Text>
                                                            )}
                                                        </Space>
                                                    </div>
                                                }
                                            />
                                            <div style={{ textAlign: 'right' }}>
                                                <Tag color={
                                                    job.status === 'Printing' ? 'processing' :
                                                        job.status === 'Completed' || job.status === 'completed' ? 'success' :
                                                            job.status === 'Error' ? 'error' : 'default'
                                                }>
                                                    {job.status || 'Pending'}
                                                </Tag>
                                            </div>
                                        </List.Item>
                                    )}
                                />
                            </Panel>
                        </Collapse>
                    </>
                )}
            </Drawer>

            <Modal
                title={`Send File to ${selectedComputer?.hostname}`}
                open={sendFileModalVisible}
                onCancel={() => setSendFileModalVisible(false)}
                footer={[
                    <Button key="cancel" onClick={() => setSendFileModalVisible(false)}>
                        Cancel
                    </Button>,
                    <Button
                        key="send"
                        type="primary"
                        icon={<SendOutlined />}
                        loading={uploading}
                        disabled={!uploadFile}
                        onClick={handleSendFileSubmit}
                    >
                        Send
                    </Button>
                ]}
            >
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">The file will be saved to the user's Documents folder.</Text>
                </div>
                <Upload.Dragger
                    beforeUpload={(file) => {
                        setUploadFile(file);
                        return false;
                    }}
                    maxCount={1}
                    fileList={uploadFile ? [uploadFile] : []}
                    onRemove={() => setUploadFile(null)}
                >
                    <p className="ant-upload-drag-icon">
                        <InboxOutlined style={{ color: '#00B4D8' }} />
                    </p>
                    <p className="ant-upload-text">Click or drag file to upload</p>
                    <p className="ant-upload-hint">Support for single file upload.</p>
                </Upload.Dragger>
            </Modal>

            <Modal
                title={`Screenshot: ${selectedComputer?.hostname}`}
                open={screenshotVisible}
                onCancel={() => setScreenshotVisible(false)}
                footer={null}
                width={800}
                bodyStyle={{ textAlign: 'center', padding: 20 }}
            >
                {screenshotLoading ? (
                    <div style={{ padding: 50 }}>
                        <Spin size="large" tip="Capturing screen..." />
                    </div>
                ) : (
                    screenshotData ? (
                        <>
                            <Image
                                src={`data:image/jpeg;base64,${screenshotData}`}
                                alt="Screen Capture"
                                style={{ maxWidth: '100%', maxHeight: '600px', objectFit: 'contain' }}
                            />
                            <div style={{ marginTop: 10 }}>
                                <Text type="secondary">Captured at {new Date(screenshotTimestamp).toLocaleTimeString()}</Text>
                                <Button type="link" icon={<ReloadOutlined />} onClick={handleScreenshotRequest}>Capture Again</Button>
                            </div>
                        </>
                    ) : (
                        <Empty description="No screenshot data" />
                    )
                )}
            </Modal>
        </div>
    );
}

export default Computers;
