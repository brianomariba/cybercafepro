import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Upload, Modal, message, Row, Col, Collapse, Badge, Empty, Tooltip, Progress, Tabs, List, Avatar } from 'antd';
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
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getDocuments, getDocumentStats, uploadDocument, sendDocumentToComputer, downloadDocument, deleteDocument, getComputers } from '../services/api';

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

function Documents() {
    const [documents, setDocuments] = useState([]);
    const [computers, setComputers] = useState([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, downloaded: 0 });
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

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

    useEffect(() => {
        fetchData();
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

    // Table columns
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

    // Online computers for sending
    const onlineComputers = computers.filter(c => c.isOnline);

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
        </div>
    );
}

export default Documents;
