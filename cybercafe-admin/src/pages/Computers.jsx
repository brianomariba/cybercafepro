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
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getComputers, getComputer, getSessions, getBrowserHistory, getFileActivity, getPrintJobs, sendCommand, connectSocket, sendDocumentToComputer } from '../services/api';

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
                if (log.clientId === selectedComputer.clientId) {
                    if (log.type === 'file') {
                        setFileActivity(prev => [log.data, ...prev].slice(0, 50));
                    } else if (log.type === 'browser') {
                        setBrowserHistory(prev => [{ ...log.data, id: log.id || Date.now() }, ...prev].slice(0, 50));
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
        try {
            await sendCommand(selectedComputer.clientId, 'screenshot');
            // message.loading('Capturing screenshot...', 2);
        } catch (error) {
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
                                    dataSource={browserHistory.slice(0, 15)}
                                    locale={{ emptyText: 'No browser history' }}
                                    renderItem={item => (
                                        <List.Item>
                                            <List.Item.Meta
                                                avatar={<Avatar size="small" style={{ background: '#7b2cbf' }}><GlobalOutlined /></Avatar>}
                                                title={<Text ellipsis style={{ maxWidth: 400 }}>{item.title || item.url}</Text>}
                                                description={
                                                    <Text type="secondary" ellipsis style={{ maxWidth: 400, fontSize: 11 }}>
                                                        {item.url}
                                                    </Text>
                                                }
                                            />
                                        </List.Item>
                                    )}
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
                                <List
                                    size="small"
                                    loading={activityLoading}
                                    dataSource={fileActivity.slice(0, 15)}
                                    locale={{ emptyText: 'No file activity' }}
                                    renderItem={file => (
                                        <List.Item>
                                            <List.Item.Meta
                                                avatar={<Avatar size="small" style={{ background: '#ff9500' }}><FileOutlined /></Avatar>}
                                                title={file.name}
                                                description={
                                                    <Space>
                                                        <Tag>{file.category || 'file'}</Tag>
                                                        <Text type="secondary">{file.size || file.sizeFormatted}</Text>
                                                    </Space>
                                                }
                                            />
                                        </List.Item>
                                    )}
                                />
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
                                    dataSource={printJobs.slice(0, 10)}
                                    locale={{ emptyText: 'No print jobs' }}
                                    renderItem={job => (
                                        <List.Item>
                                            <List.Item.Meta
                                                avatar={<Avatar size="small" style={{ background: job.printType === 'color' ? '#7b2cbf' : '#6b6b80' }}><PrinterOutlined /></Avatar>}
                                                title={job.documentName || 'Print Job'}
                                                description={
                                                    <Space>
                                                        <Tag color={job.printType === 'color' ? 'magenta' : 'default'}>
                                                            {job.printType?.toUpperCase() || 'B&W'}
                                                        </Tag>
                                                        <Text type="secondary">{job.totalPages || 1} pages</Text>
                                                    </Space>
                                                }
                                            />
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
