import { useState, useEffect, useRef } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Upload, Modal, message, Row, Col, Collapse, Badge, Empty, Tooltip, Progress, Tabs, List, Avatar } from 'antd';
import { io } from 'socket.io-client';
import {
    FileOutlined,
    UploadOutlined,
    DownloadOutlined,
    DeleteOutlined,
    SendOutlined,
    DesktopOutlined,
    UserOutlined,
    ClockCircleOutlined,
    SearchOutlined,
    InboxOutlined,
    FilePdfOutlined,
    FileWordOutlined,
    FileExcelOutlined,
    FileImageOutlined,
    FileZipOutlined,
    FileTextOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
    SyncOutlined,
    BarChartOutlined,
    RiseOutlined,
    TeamOutlined,
    CalendarOutlined,
    FundOutlined,
    PhoneOutlined,
    CloudUploadOutlined,
    AppstoreOutlined,
    DatabaseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getDocuments, getDocumentStats, uploadDocument, sendDocumentToComputer, downloadDocument, deleteDocument, getComputers, getDocumentRequestAnalytics } from '../services/api';

const { Text, Title } = Typography;
const { Search } = Input;
const { Dragger } = Upload;
const { Panel } = Collapse;

// Format file size
const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

// Get file icon based on mimetype
const getFileIcon = (mimetype, filename) => {
    if (mimetype?.includes('pdf')) return <FilePdfOutlined style={{ color: '#ff3b5c', fontSize: 24 }} />;
    if (mimetype?.includes('word') || filename?.endsWith('.docx') || filename?.endsWith('.doc')) return <FileWordOutlined style={{ color: '#00d4ff', fontSize: 24 }} />;
    if (mimetype?.includes('excel') || mimetype?.includes('spreadsheet') || filename?.endsWith('.xlsx')) return <FileExcelOutlined style={{ color: '#00ff88', fontSize: 24 }} />;
    if (mimetype?.includes('image')) return <FileImageOutlined style={{ color: '#7b2cbf', fontSize: 24 }} />;
    if (mimetype?.includes('zip') || mimetype?.includes('rar')) return <FileZipOutlined style={{ color: '#ff9500', fontSize: 24 }} />;
    return <FileTextOutlined style={{ color: '#6b6b80', fontSize: 24 }} />;
};

// Mini bar chart component
const MiniBarChart = ({ data, maxBars = 14 }) => {
    if (!data || data.length === 0) return <Empty description="No data yet" style={{ padding: '20px 0' }} />;

    const displayData = data.slice(-maxBars);
    const maxVal = Math.max(...displayData.map(d => d.count), 1);

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, padding: '0 4px' }}>
            {displayData.map((item, i) => {
                const height = Math.max((item.count / maxVal) * 100, 4);
                const dateLabel = dayjs(item.date).format('D');
                const fullDate = dayjs(item.date).format('MMM D');
                return (
                    <Tooltip key={i} title={`${fullDate}: ${item.count} submission${item.count !== 1 ? 's' : ''}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <div
                                style={{
                                    width: '100%',
                                    height: `${height}px`,
                                    background: 'linear-gradient(180deg, #00d4ff 0%, #0088cc 100%)',
                                    borderRadius: '4px 4px 0 0',
                                    minWidth: 12,
                                    transition: 'height 0.3s ease',
                                    cursor: 'pointer',
                                    opacity: 0.85,
                                }}
                                onMouseEnter={(e) => { e.target.style.opacity = 1; }}
                                onMouseLeave={(e) => { e.target.style.opacity = 0.85; }}
                            />
                            <Text type="secondary" style={{ fontSize: 9, marginTop: 4 }}>{dateLabel}</Text>
                        </div>
                    </Tooltip>
                );
            })}
        </div>
    );
};

// Status info helper
const getStatusInfo = (status) => {
    switch (status) {
        case 'pending': return { color: 'orange', icon: <ClockCircleOutlined />, label: 'Pending' };
        case 'processing': return { color: 'blue', icon: <SyncOutlined spin />, label: 'Processing' };
        case 'ready': return { color: 'purple', icon: <CheckCircleOutlined />, label: 'Ready' };
        case 'completed': return { color: 'green', icon: <CheckCircleOutlined />, label: 'Completed' };
        case 'cancelled': return { color: 'red', label: 'Cancelled' };
        default: return { color: 'default', label: status };
    }
};

function Documents() {
    const [documents, setDocuments] = useState([]);
    const [computers, setComputers] = useState([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, downloaded: 0 });
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [activeTab, setActiveTab] = useState('sharing');

    // Analytics state
    const [analytics, setAnalytics] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    // Send document modal
    const [sendModalVisible, setSendModalVisible] = useState(false);
    const [selectedComputer, setSelectedComputer] = useState(null);
    const [uploadFile, setUploadFile] = useState(null);
    const [sendMessage, setSendMessage] = useState('');
    const [uploading, setUploading] = useState(false);

    // Fetch data
    const fetchData = async () => {
        setLoading(true);
        try {
            const [docsRes, statsRes, computersRes] = await Promise.all([
                getDocuments(),
                getDocumentStats(),
                getComputers()
            ]);
            setDocuments(docsRes || []);
            setStats(statsRes || { total: 0, pending: 0, downloaded: 0 });
            setComputers(computersRes || []);
        } catch (error) {
            console.error('Failed to fetch documents:', error);
        }
        setLoading(false);
    };

    // Fetch analytics
    const fetchAnalytics = async () => {
        setAnalyticsLoading(true);
        try {
            const data = await getDocumentRequestAnalytics();
            setAnalytics(data);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        }
        setAnalyticsLoading(false);
    };

    // Keep track of processed IDs to prevent duplicates even within same render cycle
    const processedIdsRef = useRef(new Set());

    useEffect(() => {
        // Sync ref with current state
        documents.forEach(doc => processedIdsRef.current.add(doc.id));
    }, [documents]);

    useEffect(() => {
        fetchData();
        fetchAnalytics();

        // Connect to socket for real-time updates
        const socket = io(import.meta.env.VITE_SOCKET_URL || 'https://api.hawkninegroup.com', {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('Connected to socket for documents');
        });

        socket.on('document-shared', (newDoc) => {
            // Check against set
            if (processedIdsRef.current.has(newDoc.id)) return;
            processedIdsRef.current.add(newDoc.id);

            setDocuments(prev => [newDoc, ...prev]);
            setStats(prev => ({ ...prev, total: prev.total + 1, pending: prev.pending + 1 }));
            message.info(`New document shared: ${newDoc.filename}`);
        });

        socket.on('document-status-update', (update) => {
            setDocuments(prev => prev.map(doc =>
                doc.id === update.id ? { ...doc, status: update.status, downloadedAt: update.downloadedAt } : doc
            ));
            if (update.status === 'downloaded') {
                setStats(prev => ({
                    ...prev,
                    pending: Math.max(0, prev.pending - 1),
                    downloaded: prev.downloaded + 1
                }));
            }
        });

        // Also listen for new document requests (landing page) to refresh analytics
        socket.on('new-document-request', () => {
            fetchAnalytics();
        });

        socket.on('document-request-updated', () => {
            fetchAnalytics();
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    // Filter documents
    const filteredDocs = documents.filter(doc => {
        const matchesSearch = doc.filename?.toLowerCase().includes(searchText.toLowerCase()) ||
            doc.from?.user?.toLowerCase().includes(searchText.toLowerCase()) ||
            doc.to?.user?.toLowerCase().includes(searchText.toLowerCase());
        const matchesStatus = filterStatus === 'all' || doc.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    // Handle send document to computer
    const handleSendDocument = async () => {
        if (!uploadFile || !selectedComputer) {
            message.warning('Please select a file and target computer');
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('targetClientId', selectedComputer.clientId);
            formData.append('targetHostname', selectedComputer.hostname);
            formData.append('message', sendMessage);

            await sendDocumentToComputer(formData);
            message.success(`Document sent to ${selectedComputer.hostname}`);
            setSendModalVisible(false);
            setUploadFile(null);
            setSendMessage('');
            setSelectedComputer(null);
            fetchData();
        } catch (error) {
            message.error('Failed to send document');
        }
        setUploading(false);
    };

    // Handle download
    const handleDownload = (doc) => {
        window.open(downloadDocument(doc.id), '_blank');
        fetchData(); // Refresh to update status
    };

    // Handle delete
    const handleDelete = async (doc) => {
        try {
            await deleteDocument(doc.id);
            message.success('Document deleted');
            fetchData();
        } catch (error) {
            message.error('Failed to delete document');
        }
    };

    // Table columns for document sharing
    const columns = [
        {
            title: 'Document',
            dataIndex: 'filename',
            key: 'filename',
            render: (filename, record) => (
                <Space>
                    {getFileIcon(record.mimetype, filename)}
                    <div>
                        <Text strong style={{ display: 'block' }}>{filename}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {record.sizeFormatted || formatBytes(record.size)}
                        </Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'From',
            dataIndex: 'from',
            key: 'from',
            render: (from) => (
                <Space>
                    <Avatar size="small" icon={<UserOutlined />} style={{ background: '#00d4ff' }} />
                    <Text>{from?.user || 'Unknown'}</Text>
                </Space>
            ),
        },
        {
            title: 'To',
            dataIndex: 'to',
            key: 'to',
            render: (to) => (
                <Space>
                    <Avatar size="small" icon={to?.clientId === 'admin' ? <UserOutlined /> : <DesktopOutlined />}
                        style={{ background: to?.clientId === 'admin' ? '#7b2cbf' : '#00ff88' }} />
                    <Text>{to?.user === 'all' ? 'All Users' : to?.user || 'Unknown'}</Text>
                </Space>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status) => (
                <Tag
                    icon={status === 'downloaded' ? <CheckCircleOutlined /> : <SyncOutlined spin={status === 'pending'} />}
                    color={status === 'downloaded' ? 'success' : 'processing'}
                >
                    {status?.toUpperCase()}
                </Tag>
            ),
        },
        {
            title: 'Time',
            dataIndex: 'uploadedAt',
            key: 'uploadedAt',
            width: 120,
            render: (time) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(time).format('MMM D, HH:mm')}
                </Text>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, record) => (
                <Space>
                    <Tooltip title="Download">
                        <Button type="text" icon={<DownloadOutlined style={{ color: '#00d4ff' }} />}
                            onClick={() => handleDownload(record)} />
                    </Tooltip>
                    <Tooltip title="Delete">
                        <Button type="text" icon={<DeleteOutlined style={{ color: '#ff3b5c' }} />}
                            onClick={() => Modal.confirm({
                                title: 'Delete Document?',
                                content: `Are you sure you want to delete "${record.filename}"?`,
                                okText: 'Delete',
                                okType: 'danger',
                                onOk: () => handleDelete(record)
                            })} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    // Analytics columns for recent submissions
    const analyticsColumns = [
        {
            title: 'Order ID',
            dataIndex: 'orderId',
            key: 'orderId',
            width: 130,
            render: (id) => (
                <Text strong style={{ fontFamily: 'JetBrains Mono, monospace', color: '#00d4ff', fontSize: 12 }}>{id}</Text>
            ),
        },
        {
            title: 'Customer',
            key: 'customer',
            render: (_, record) => (
                <Space>
                    <Avatar size="small" style={{ background: '#7b2cbf' }}>
                        {record.customerName?.charAt(0).toUpperCase()}
                    </Avatar>
                    <div>
                        <Text strong style={{ display: 'block', fontSize: 13 }}>{record.customerName}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            <PhoneOutlined /> {record.customerPhone}
                        </Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Service',
            dataIndex: 'serviceType',
            key: 'serviceType',
            width: 120,
            render: (type) => (
                <Tag style={{ textTransform: 'capitalize' }}>{type?.replace(/-/g, ' ')}</Tag>
            ),
        },
        {
            title: 'Files',
            dataIndex: 'totalFiles',
            key: 'totalFiles',
            width: 70,
            render: (count) => (
                <Badge count={count || 0} style={{ backgroundColor: '#00d4ff' }} />
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (status) => {
                const info = getStatusInfo(status);
                return <Tag icon={info.icon} color={info.color}>{info.label}</Tag>;
            },
        },
        {
            title: 'Received By',
            dataIndex: 'receivedBy',
            key: 'receivedBy',
            width: 140,
            render: (receivedBy) => receivedBy?.hostname ? (
                <Space>
                    <Avatar size="small" icon={<DesktopOutlined />} style={{ background: '#00ff88' }} />
                    <div>
                        <Text strong style={{ fontSize: 12 }}>{receivedBy.hostname}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 10 }}>
                            {dayjs(receivedBy.receivedAt).format('HH:mm')}
                        </Text>
                    </div>
                </Space>
            ) : (
                <Tag color="default">Not yet</Tag>
            ),
        },
        {
            title: 'Submitted',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 100,
            render: (time) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(time).format('MMM D, HH:mm')}
                </Text>
            ),
        },
    ];

    // Online computers for sending
    const onlineComputers = computers.filter(c => c.isOnline);

    // Render document sharing tab content
    const renderSharingTab = () => (
        <>
            {/* Stats */}
            <div className="stats-row">
                <div className="stat-card blue">
                    <div className="stat-header">
                        <div className="stat-icon blue"><FileOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.total}</div>
                    <div className="stat-label">Total Documents</div>
                </div>

                <div className="stat-card orange">
                    <div className="stat-header">
                        <div className="stat-icon orange"><SyncOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.pending}</div>
                    <div className="stat-label">Pending</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green"><CheckCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.downloaded}</div>
                    <div className="stat-label">Downloaded</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-header">
                        <div className="stat-icon purple"><DesktopOutlined /></div>
                    </div>
                    <div className="stat-value">{onlineComputers.length}</div>
                    <div className="stat-label">Online PCs</div>
                </div>
            </div>

            <Row gutter={[24, 24]}>
                {/* Send Document to Computer */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <SendOutlined style={{ color: '#00d4ff' }} />
                                <span>Send to Computer</span>
                            </Space>
                        }
                    >
                        <Collapse defaultActiveKey={['1']} ghost>
                            <Panel header="Select Target Computer" key="1">
                                {onlineComputers.length === 0 ? (
                                    <Empty description="No computers online" />
                                ) : (
                                    <List
                                        size="small"
                                        dataSource={onlineComputers}
                                        renderItem={computer => (
                                            <List.Item
                                                style={{
                                                    cursor: 'pointer',
                                                    background: selectedComputer?.clientId === computer.clientId
                                                        ? 'rgba(0, 180, 216, 0.15)' : 'transparent',
                                                    borderRadius: 8,
                                                    marginBottom: 4,
                                                    padding: '8px 12px',
                                                    border: selectedComputer?.clientId === computer.clientId
                                                        ? '1px solid rgba(0, 180, 216, 0.5)' : '1px solid transparent'
                                                }}
                                                onClick={() => setSelectedComputer(computer)}
                                            >
                                                <List.Item.Meta
                                                    avatar={<Avatar icon={<DesktopOutlined />} style={{ background: '#00d4ff' }} />}
                                                    title={computer.hostname}
                                                    description={
                                                        <Space>
                                                            <Badge status="success" />
                                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                                {computer.sessionUser || 'Locked'}
                                                            </Text>
                                                        </Space>
                                                    }
                                                />
                                            </List.Item>
                                        )}
                                    />
                                )}
                            </Panel>

                            <Panel header="Upload File" key="2">
                                <Dragger
                                    beforeUpload={(file) => {
                                        setUploadFile(file);
                                        return false;
                                    }}
                                    maxCount={1}
                                    fileList={uploadFile ? [uploadFile] : []}
                                    onRemove={() => setUploadFile(null)}
                                >
                                    <p className="ant-upload-drag-icon">
                                        <InboxOutlined style={{ color: '#00d4ff' }} />
                                    </p>
                                    <p className="ant-upload-text">Click or drag file to upload</p>
                                    <p className="ant-upload-hint">Max 50MB</p>
                                </Dragger>
                            </Panel>

                            <Panel header="Message (Optional)" key="3">
                                <Input.TextArea
                                    rows={2}
                                    placeholder="Add a message..."
                                    value={sendMessage}
                                    onChange={(e) => setSendMessage(e.target.value)}
                                />
                            </Panel>
                        </Collapse>

                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            block
                            size="large"
                            style={{ marginTop: 16 }}
                            loading={uploading}
                            disabled={!uploadFile || !selectedComputer}
                            onClick={handleSendDocument}
                        >
                            Send Document
                        </Button>
                    </Card>
                </Col>

                {/* Documents List */}
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <FileOutlined style={{ color: '#7b2cbf' }} />
                                <span>Shared Documents</span>
                                <Badge count={documents.length} style={{ backgroundColor: '#00d4ff' }} />
                            </Space>
                        }
                        extra={
                            <Space>
                                <Search
                                    placeholder="Search..."
                                    style={{ width: 180 }}
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                />
                                <Select
                                    value={filterStatus}
                                    onChange={setFilterStatus}
                                    style={{ width: 120 }}
                                    options={[
                                        { value: 'all', label: 'All Status' },
                                        { value: 'pending', label: 'Pending' },
                                        { value: 'downloaded', label: 'Downloaded' },
                                    ]}
                                />
                                <Tooltip title="Refresh">
                                    <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} />
                                </Tooltip>
                            </Space>
                        }
                    >
                        <Table
                            columns={columns}
                            dataSource={filteredDocs}
                            rowKey="id"
                            pagination={{ pageSize: 8 }}
                            size="middle"
                            loading={loading}
                            locale={{ emptyText: <Empty description="No documents shared yet" /> }}
                        />
                    </Card>
                </Col>
            </Row>
        </>
    );

    // Render analytics tab content
    const renderAnalyticsTab = () => {
        const ov = analytics?.overview || {};
        const todayData = analytics?.today || {};

        return (
            <>
                {/* Overview Stats */}
                <div className="stats-row">
                    <div className="stat-card blue">
                        <div className="stat-header">
                            <div className="stat-icon blue"><CloudUploadOutlined /></div>
                        </div>
                        <div className="stat-value">{ov.totalSubmissions || 0}</div>
                        <div className="stat-label">Total Submissions</div>
                    </div>

                    <div className="stat-card cyan" style={{ borderTopColor: '#00e5ff' }}>
                        <div className="stat-header">
                            <div className="stat-icon" style={{ background: 'rgba(0, 229, 255, 0.15)', color: '#00e5ff' }}><CalendarOutlined /></div>
                        </div>
                        <div className="stat-value">{todayData.submissions || 0}</div>
                        <div className="stat-label">Today</div>
                    </div>

                    <div className="stat-card orange">
                        <div className="stat-header">
                            <div className="stat-icon orange"><FileOutlined /></div>
                        </div>
                        <div className="stat-value">{ov.totalFiles || 0}</div>
                        <div className="stat-label">Total Files</div>
                    </div>

                    <div className="stat-card green">
                        <div className="stat-header">
                            <div className="stat-icon green"><DesktopOutlined /></div>
                        </div>
                        <div className="stat-value">{ov.receivedCount || 0}</div>
                        <div className="stat-label">Received by Agents</div>
                    </div>

                    <div className="stat-card pink" style={{ borderTopColor: '#ff3b5c' }}>
                        <div className="stat-header">
                            <div className="stat-icon" style={{ background: 'rgba(255, 59, 92, 0.15)', color: '#ff3b5c' }}><ClockCircleOutlined /></div>
                        </div>
                        <div className="stat-value">{ov.pendingCount || 0}</div>
                        <div className="stat-label">Pending</div>
                    </div>
                </div>

                <Row gutter={[24, 24]}>
                    {/* Left Column - Charts & Breakdowns */}
                    <Col xs={24} lg={8}>
                        {/* Submissions Over Time */}
                        <Card
                            title={
                                <Space>
                                    <FundOutlined style={{ color: '#00d4ff' }} />
                                    <span>Submissions Over Time</span>
                                </Space>
                            }
                            extra={<Text type="secondary" style={{ fontSize: 11 }}>Last 30 days</Text>}
                        >
                            <MiniBarChart data={analytics?.byDate || []} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>This Week</Text>
                                    <Title level={4} style={{ margin: 0, color: '#00d4ff' }}>{analytics?.thisWeek || 0}</Title>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>This Month</Text>
                                    <Title level={4} style={{ margin: 0, color: '#7b2cbf' }}>{analytics?.thisMonth || 0}</Title>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>Total Size</Text>
                                    <Title level={4} style={{ margin: 0, color: '#00ff88' }}>{ov.totalSize || '0 B'}</Title>
                                </div>
                            </div>
                        </Card>

                        {/* Agent Reception Breakdown */}
                        <Card
                            title={
                                <Space>
                                    <DesktopOutlined style={{ color: '#00ff88' }} />
                                    <span>Agent Reception</span>
                                </Space>
                            }
                            style={{ marginTop: 24 }}
                        >
                            {(!analytics?.byAgent || analytics.byAgent.length === 0) ? (
                                <Empty description="No agent receptions yet" />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {analytics.byAgent.map((agent, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: 12, background: 'rgba(0, 255, 136, 0.05)', borderRadius: 10,
                                            border: '1px solid rgba(0, 255, 136, 0.1)'
                                        }}>
                                            <Avatar icon={<DesktopOutlined />} style={{
                                                background: idx === 0 ? '#00ff88' : idx === 1 ? '#00d4ff' : '#7b2cbf'
                                            }} />
                                            <div style={{ flex: 1 }}>
                                                <Text strong>{agent.hostname}</Text>
                                                <Progress
                                                    percent={ov.totalSubmissions ? Math.round((agent.count / ov.totalSubmissions) * 100) : 0}
                                                    strokeColor={idx === 0 ? '#00ff88' : idx === 1 ? '#00d4ff' : '#7b2cbf'}
                                                    size="small"
                                                />
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <Text strong style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16 }}>{agent.count}</Text>
                                                <br />
                                                <Text type="secondary" style={{ fontSize: 10 }}>{agent.files} files</Text>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Unreceived indicator */}
                                    {ov.unreceived > 0 && (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: 12, background: 'rgba(255, 149, 0, 0.05)', borderRadius: 10,
                                            border: '1px solid rgba(255, 149, 0, 0.15)'
                                        }}>
                                            <Avatar icon={<ClockCircleOutlined />} style={{ background: '#ff9500' }} />
                                            <div style={{ flex: 1 }}>
                                                <Text type="secondary">Not yet received</Text>
                                            </div>
                                            <Text strong style={{ fontFamily: 'JetBrains Mono, monospace', color: '#ff9500', fontSize: 16 }}>{ov.unreceived}</Text>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>

                        {/* File Type Breakdown */}
                        <Card
                            title={
                                <Space>
                                    <AppstoreOutlined style={{ color: '#7b2cbf' }} />
                                    <span>File Types</span>
                                </Space>
                            }
                            style={{ marginTop: 24 }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {[
                                    { icon: <FilePdfOutlined />, label: 'PDF', count: analytics?.byFileType?.pdf || 0, color: '#ff3b5c' },
                                    { icon: <FileWordOutlined />, label: 'Word', count: analytics?.byFileType?.word || 0, color: '#00d4ff' },
                                    { icon: <FileExcelOutlined />, label: 'Excel', count: analytics?.byFileType?.excel || 0, color: '#00ff88' },
                                    { icon: <FileOutlined />, label: 'Other', count: analytics?.byFileType?.other || 0, color: '#6b6b80' },
                                ].map((ft, idx) => {
                                    const totalFileCount = (analytics?.byFileType?.pdf || 0) + (analytics?.byFileType?.word || 0) + (analytics?.byFileType?.excel || 0) + (analytics?.byFileType?.other || 0);
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: 8,
                                                background: `${ft.color}15`, display: 'flex',
                                                alignItems: 'center', justifyContent: 'center',
                                                color: ft.color, fontSize: 18
                                            }}>
                                                {ft.icon}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <Text strong>{ft.label}</Text>
                                                <Progress
                                                    percent={totalFileCount ? Math.round((ft.count / totalFileCount) * 100) : 0}
                                                    strokeColor={ft.color}
                                                    size="small"
                                                />
                                            </div>
                                            <Text style={{ fontFamily: 'JetBrains Mono, monospace', color: ft.color }}>{ft.count}</Text>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </Col>

                    {/* Right Column - Tables */}
                    <Col xs={24} lg={16}>
                        {/* Service Type Breakdown */}
                        <Card
                            title={
                                <Space>
                                    <BarChartOutlined style={{ color: '#ff9500' }} />
                                    <span>By Service Type</span>
                                </Space>
                            }
                        >
                            {(!analytics?.byServiceType || analytics.byServiceType.length === 0) ? (
                                <Empty description="No service data yet" />
                            ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                    {analytics.byServiceType.map((svc, idx) => {
                                        const colors = ['#00d4ff', '#7b2cbf', '#ff3b5c', '#00ff88', '#ff9500', '#e91e63'];
                                        const color = colors[idx % colors.length];
                                        return (
                                            <div key={idx} style={{
                                                flex: '1 1 calc(33.33% - 12px)', minWidth: 140,
                                                padding: 16, borderRadius: 12,
                                                background: `${color}08`,
                                                border: `1px solid ${color}22`,
                                                textAlign: 'center'
                                            }}>
                                                <Title level={3} style={{ margin: 0, color }}>{svc.count}</Title>
                                                <Text style={{ textTransform: 'capitalize', fontSize: 12 }}>
                                                    {svc.type?.replace(/-/g, ' ')}
                                                </Text>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>

                        {/* Top Customers */}
                        <Card
                            title={
                                <Space>
                                    <TeamOutlined style={{ color: '#7b2cbf' }} />
                                    <span>Top Customers</span>
                                </Space>
                            }
                            style={{ marginTop: 24 }}
                        >
                            {(!analytics?.topCustomers || analytics.topCustomers.length === 0) ? (
                                <Empty description="No customer data yet" />
                            ) : (
                                <List
                                    size="small"
                                    dataSource={analytics.topCustomers}
                                    renderItem={(customer, idx) => (
                                        <List.Item
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: 8,
                                                marginBottom: 4,
                                                background: idx < 3 ? 'rgba(123, 44, 191, 0.05)' : 'transparent'
                                            }}
                                        >
                                            <List.Item.Meta
                                                avatar={
                                                    <Avatar style={{ background: idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : '#7b2cbf' }}>
                                                        {idx < 3 ? (idx + 1) : customer.name?.charAt(0).toUpperCase()}
                                                    </Avatar>
                                                }
                                                title={<Text strong>{customer.name}</Text>}
                                                description={
                                                    <Space>
                                                        <PhoneOutlined />
                                                        <Text type="secondary" style={{ fontSize: 12 }}>{customer.phone}</Text>
                                                    </Space>
                                                }
                                            />
                                            <div style={{ textAlign: 'right' }}>
                                                <Text strong style={{ fontFamily: 'JetBrains Mono, monospace', color: '#00d4ff' }}>{customer.count}</Text>
                                                <Text type="secondary" style={{ fontSize: 11 }}> requests</Text>
                                                <br />
                                                <Text type="secondary" style={{ fontSize: 11 }}>{customer.files} files</Text>
                                            </div>
                                        </List.Item>
                                    )}
                                />
                            )}
                        </Card>

                        {/* Recent Submissions Table */}
                        <Card
                            title={
                                <Space>
                                    <InboxOutlined style={{ color: '#00d4ff' }} />
                                    <span>Recent Landing Page Submissions</span>
                                    <Badge count={analytics?.overview?.totalSubmissions || 0} style={{ backgroundColor: '#00d4ff' }} />
                                </Space>
                            }
                            extra={
                                <Tooltip title="Refresh Analytics">
                                    <Button icon={<ReloadOutlined />} onClick={fetchAnalytics} loading={analyticsLoading} />
                                </Tooltip>
                            }
                            style={{ marginTop: 24 }}
                        >
                            <Table
                                columns={analyticsColumns}
                                dataSource={analytics?.recentSubmissions || []}
                                rowKey="orderId"
                                pagination={false}
                                size="small"
                                loading={analyticsLoading}
                                locale={{ emptyText: <Empty description="No submissions from landing page yet" /> }}
                            />
                        </Card>
                    </Col>
                </Row>
            </>
        );
    };

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <FileOutlined className="icon" />
                    <h1>Document Sharing</h1>
                </div>
                <p className="page-subtitle">Send and receive documents between users and computers</p>
            </div>

            {/* Tabs */}
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                style={{ marginBottom: 24 }}
                items={[
                    {
                        key: 'sharing',
                        label: (
                            <Space>
                                <SendOutlined />
                                <span>Document Sharing</span>
                            </Space>
                        ),
                        children: renderSharingTab(),
                    },
                    {
                        key: 'analytics',
                        label: (
                            <Space>
                                <BarChartOutlined />
                                <span>Landing Page Analytics</span>
                                {analytics?.today?.submissions > 0 && (
                                    <Badge count={analytics.today.submissions} style={{ backgroundColor: '#00d4ff' }} />
                                )}
                            </Space>
                        ),
                        children: renderAnalyticsTab(),
                    },
                ]}
            />
        </div>
    );
}

export default Documents;
