import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Modal, Form, Input, Select, Space, Typography, message, Empty, Tabs, Badge, Tooltip, Popconfirm, Row, Col, Statistic, Drawer } from 'antd';
import {
    FileOutlined,
    FileWordOutlined,
    FilePdfOutlined,
    FileExcelOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EyeOutlined,
    UserOutlined,
    InboxOutlined,
    FileTextOutlined,
    BookOutlined,
    CheckOutlined,
    StopOutlined,
} from '@ant-design/icons';
import { getSubmissions, getSubmissionStats, approveSubmission, rejectSubmission, deleteSubmission, downloadSubmissionUrl, connectSocket } from '../services/api';
import dayjs from 'dayjs';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

// File type icon helper
const getFileIcon = (mimeType, size = 20) => {
    const style = { fontSize: size };
    if (mimeType?.includes('pdf')) return <FilePdfOutlined style={{ ...style, color: '#ff4d4f' }} />;
    if (mimeType?.includes('word') || mimeType?.includes('document')) return <FileWordOutlined style={{ ...style, color: '#1890ff' }} />;
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return <FileExcelOutlined style={{ ...style, color: '#52c41a' }} />;
    return <FileOutlined style={{ ...style, color: '#8c8c8c' }} />;
};

// Format file size
const formatFileSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function Submissions() {
    const [submissions, setSubmissions] = useState([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [approveModalOpen, setApproveModalOpen] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [approveForm] = Form.useForm();
    const [rejectReason, setRejectReason] = useState('');

    // Fetch submissions
    const fetchSubmissions = async (status = null) => {
        setLoading(true);
        try {
            const [data, statsData] = await Promise.all([
                getSubmissions(status || (activeTab !== 'all' ? activeTab : null)),
                getSubmissionStats()
            ]);
            setSubmissions(data || []);
            setStats(statsData || { total: 0, pending: 0, approved: 0, rejected: 0 });
        } catch (error) {
            console.error('Failed to fetch submissions:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchSubmissions();

        // Listen for real-time updates
        const socket = connectSocket({
            onConnect: () => console.log('Connected to Socket for submission updates'),
        });

        socket.on('new-user-submission', (data) => {
            message.info(`New submission: "${data.title}" by ${data.submittedBy}`);
            fetchSubmissions();
        });

        return () => socket?.disconnect();
    }, []);

    useEffect(() => {
        fetchSubmissions(activeTab !== 'all' ? activeTab : null);
    }, [activeTab]);

    // Handle approve
    const handleApprove = async (values) => {
        if (!selectedSubmission) return;
        setActionLoading(true);
        try {
            await approveSubmission(selectedSubmission._id, values.notes, {
                title: values.title || selectedSubmission.title,
                description: values.description || selectedSubmission.description,
                category: values.category || selectedSubmission.category,
                type: values.type,
            });
            message.success('Submission approved successfully!');
            setApproveModalOpen(false);
            setSelectedSubmission(null);
            approveForm.resetFields();
            fetchSubmissions();
        } catch (error) {
            message.error(error.response?.data?.error || 'Failed to approve submission');
        }
        setActionLoading(false);
    };

    // Handle reject
    const handleReject = async () => {
        if (!selectedSubmission) return;
        setActionLoading(true);
        try {
            await rejectSubmission(selectedSubmission._id, rejectReason);
            message.success('Submission rejected');
            setRejectModalOpen(false);
            setSelectedSubmission(null);
            setRejectReason('');
            fetchSubmissions();
        } catch (error) {
            message.error(error.response?.data?.error || 'Failed to reject submission');
        }
        setActionLoading(false);
    };

    // Handle delete
    const handleDelete = async (id) => {
        try {
            await deleteSubmission(id);
            message.success('Submission deleted');
            fetchSubmissions();
        } catch (error) {
            message.error('Failed to delete submission');
        }
    };

    // Get status tag
    const getStatusTag = (status) => {
        switch (status) {
            case 'approved':
                return <Tag icon={<CheckCircleOutlined />} color="success">Approved</Tag>;
            case 'rejected':
                return <Tag icon={<CloseCircleOutlined />} color="error">Rejected</Tag>;
            default:
                return <Tag icon={<ClockCircleOutlined />} color="processing">Pending</Tag>;
        }
    };

    // Table columns
    const columns = [
        {
            title: 'Document',
            key: 'document',
            render: (_, record) => (
                <Space>
                    {getFileIcon(record.fileMimeType, 24)}
                    <div>
                        <Text strong>{record.title}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.fileOriginalName} • {formatFileSize(record.fileSize)}
                        </Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Submitted By',
            key: 'submittedBy',
            render: (_, record) => (
                <Space>
                    <UserOutlined />
                    <div>
                        <Text strong>{record.submittedByName || record.submittedBy}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(record.submittedAt).format('MMM D, YYYY HH:mm')}
                        </Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Target Type',
            dataIndex: 'targetType',
            key: 'targetType',
            render: (type) => (
                <Tag color={type === 'template' ? 'blue' : 'green'} icon={type === 'template' ? <FileTextOutlined /> : <BookOutlined />}>
                    {type === 'template' ? 'Template' : 'Guidance'}
                </Tag>
            ),
        },
        {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            render: (cat) => <Tag>{cat || 'general'}</Tag>,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => getStatusTag(status),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 250,
            render: (_, record) => (
                <Space wrap>
                    <Tooltip title="Preview">
                        <Button
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => {
                                setSelectedSubmission(record);
                                setPreviewOpen(true);
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Download">
                        <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => window.open(downloadSubmissionUrl(record._id), '_blank')}
                        />
                    </Tooltip>
                    {record.status === 'pending' && (
                        <>
                            <Button
                                type="primary"
                                size="small"
                                icon={<CheckOutlined />}
                                onClick={() => {
                                    setSelectedSubmission(record);
                                    approveForm.setFieldsValue({
                                        title: record.title,
                                        description: record.description,
                                        category: record.category,
                                    });
                                    setApproveModalOpen(true);
                                }}
                            >
                                Approve
                            </Button>
                            <Button
                                danger
                                size="small"
                                icon={<StopOutlined />}
                                onClick={() => {
                                    setSelectedSubmission(record);
                                    setRejectModalOpen(true);
                                }}
                            >
                                Reject
                            </Button>
                        </>
                    )}
                    <Popconfirm
                        title="Delete this submission?"
                        onConfirm={() => handleDelete(record._id)}
                        okText="Delete"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true }}
                    >
                        <Button
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <InboxOutlined className="icon" />
                    <h1>User Submissions</h1>
                </div>
                <p className="page-subtitle">Review and approve user-submitted documents as Templates or Guidance</p>
            </div>

            {/* Stats */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Total Submissions"
                            value={stats.total}
                            prefix={<InboxOutlined style={{ color: '#00B4D8' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Pending Review"
                            value={stats.pending}
                            valueStyle={{ color: '#faad14' }}
                            prefix={<ClockCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Approved"
                            value={stats.approved}
                            valueStyle={{ color: '#52c41a' }}
                            prefix={<CheckCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Rejected"
                            value={stats.rejected}
                            valueStyle={{ color: '#ff4d4f' }}
                            prefix={<CloseCircleOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Tabs & Table */}
            <Card>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        { key: 'pending', label: <Badge count={stats.pending} offset={[10, 0]}>Pending</Badge> },
                        { key: 'approved', label: 'Approved' },
                        { key: 'rejected', label: 'Rejected' },
                        { key: 'all', label: 'All' },
                    ]}
                />
                <Table
                    columns={columns}
                    dataSource={submissions}
                    rowKey="_id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    locale={{
                        emptyText: (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={`No ${activeTab} submissions`}
                            />
                        ),
                    }}
                />
            </Card>

            {/* Preview Drawer */}
            <Drawer
                title="Submission Details"
                open={previewOpen}
                onClose={() => {
                    setPreviewOpen(false);
                    setSelectedSubmission(null);
                }}
                width={500}
            >
                {selectedSubmission && (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div style={{ textAlign: 'center', padding: 24, background: 'rgba(0, 180, 216, 0.05)', borderRadius: 8 }}>
                            {getFileIcon(selectedSubmission.fileMimeType, 48)}
                            <Title level={4} style={{ marginTop: 16, marginBottom: 0 }}>{selectedSubmission.title}</Title>
                        </div>

                        <Card size="small" title="Document Info">
                            <Row gutter={[16, 8]}>
                                <Col span={12}><Text type="secondary">File:</Text></Col>
                                <Col span={12}><Text>{selectedSubmission.fileOriginalName}</Text></Col>
                                <Col span={12}><Text type="secondary">Size:</Text></Col>
                                <Col span={12}><Text>{formatFileSize(selectedSubmission.fileSize)}</Text></Col>
                                <Col span={12}><Text type="secondary">Target:</Text></Col>
                                <Col span={12}>
                                    <Tag color={selectedSubmission.targetType === 'template' ? 'blue' : 'green'}>
                                        {selectedSubmission.targetType}
                                    </Tag>
                                </Col>
                                <Col span={12}><Text type="secondary">Category:</Text></Col>
                                <Col span={12}><Tag>{selectedSubmission.category || 'general'}</Tag></Col>
                                <Col span={12}><Text type="secondary">Status:</Text></Col>
                                <Col span={12}>{getStatusTag(selectedSubmission.status)}</Col>
                            </Row>
                        </Card>

                        <Card size="small" title="Submission Info">
                            <Row gutter={[16, 8]}>
                                <Col span={12}><Text type="secondary">Submitted By:</Text></Col>
                                <Col span={12}><Text strong>{selectedSubmission.submittedByName}</Text></Col>
                                <Col span={12}><Text type="secondary">Username:</Text></Col>
                                <Col span={12}><Text>{selectedSubmission.submittedBy}</Text></Col>
                                <Col span={12}><Text type="secondary">Submitted:</Text></Col>
                                <Col span={12}><Text>{dayjs(selectedSubmission.submittedAt).format('MMMM D, YYYY HH:mm')}</Text></Col>
                            </Row>
                        </Card>

                        {selectedSubmission.description && (
                            <Card size="small" title="Description">
                                <Paragraph>{selectedSubmission.description}</Paragraph>
                            </Card>
                        )}

                        {selectedSubmission.status !== 'pending' && (
                            <Card size="small" title="Review Details">
                                <Row gutter={[16, 8]}>
                                    <Col span={12}><Text type="secondary">Reviewed By:</Text></Col>
                                    <Col span={12}><Text>{selectedSubmission.reviewedBy || '—'}</Text></Col>
                                    <Col span={12}><Text type="secondary">Reviewed At:</Text></Col>
                                    <Col span={12}><Text>{selectedSubmission.reviewedAt ? dayjs(selectedSubmission.reviewedAt).format('MMMM D, YYYY HH:mm') : '—'}</Text></Col>
                                    {selectedSubmission.reviewNotes && (
                                        <>
                                            <Col span={24}><Text type="secondary">Notes:</Text></Col>
                                            <Col span={24}><Text>{selectedSubmission.reviewNotes}</Text></Col>
                                        </>
                                    )}
                                </Row>
                            </Card>
                        )}

                        <Space style={{ width: '100%', justifyContent: 'center' }}>
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() => window.open(downloadSubmissionUrl(selectedSubmission._id), '_blank')}
                            >
                                Download File
                            </Button>
                            {selectedSubmission.status === 'pending' && (
                                <>
                                    <Button
                                        type="primary"
                                        icon={<CheckOutlined />}
                                        onClick={() => {
                                            setPreviewOpen(false);
                                            approveForm.setFieldsValue({
                                                title: selectedSubmission.title,
                                                description: selectedSubmission.description,
                                                category: selectedSubmission.category,
                                            });
                                            setApproveModalOpen(true);
                                        }}
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        danger
                                        icon={<StopOutlined />}
                                        onClick={() => {
                                            setPreviewOpen(false);
                                            setRejectModalOpen(true);
                                        }}
                                    >
                                        Reject
                                    </Button>
                                </>
                            )}
                        </Space>
                    </Space>
                )}
            </Drawer>

            {/* Approve Modal */}
            <Modal
                title={<><CheckCircleOutlined style={{ color: '#52c41a' }} /> Approve Submission</>}
                open={approveModalOpen}
                onCancel={() => {
                    setApproveModalOpen(false);
                    approveForm.resetFields();
                }}
                footer={null}
                width={600}
            >
                <Form
                    form={approveForm}
                    layout="vertical"
                    onFinish={handleApprove}
                >
                    <Form.Item
                        name="title"
                        label="Title (can edit before creating)"
                        rules={[{ required: true }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item name="description" label="Description">
                        <TextArea rows={3} />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="category" label="Category">
                                <Select>
                                    <Select.Option value="resume">Resume / CV</Select.Option>
                                    <Select.Option value="business">Business</Select.Option>
                                    <Select.Option value="academic">Academic</Select.Option>
                                    <Select.Option value="legal">Legal</Select.Option>
                                    <Select.Option value="creative">Creative</Select.Option>
                                    <Select.Option value="general">General</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="type" label="Type">
                                <Select placeholder="Select type">
                                    {selectedSubmission?.targetType === 'template' ? (
                                        <>
                                            <Select.Option value="Word">Word Document</Select.Option>
                                            <Select.Option value="Excel">Excel Spreadsheet</Select.Option>
                                            <Select.Option value="PDF">PDF Document</Select.Option>
                                            <Select.Option value="PowerPoint">PowerPoint</Select.Option>
                                            <Select.Option value="Document">Document</Select.Option>
                                        </>
                                    ) : (
                                        <>
                                            <Select.Option value="Guide">Guide</Select.Option>
                                            <Select.Option value="Tutorial">Tutorial</Select.Option>
                                            <Select.Option value="Reference">Reference</Select.Option>
                                        </>
                                    )}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="notes" label="Review Notes (optional)">
                        <TextArea rows={2} placeholder="Add any notes for the user..." />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setApproveModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={actionLoading} icon={<CheckOutlined />}>
                                Approve & Create {selectedSubmission?.targetType === 'template' ? 'Template' : 'Guide'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Reject Modal */}
            <Modal
                title={<><CloseCircleOutlined style={{ color: '#ff4d4f' }} /> Reject Submission</>}
                open={rejectModalOpen}
                onCancel={() => {
                    setRejectModalOpen(false);
                    setRejectReason('');
                }}
                onOk={handleReject}
                okText="Reject"
                okButtonProps={{ danger: true, loading: actionLoading }}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Text>
                        Are you sure you want to reject "{selectedSubmission?.title}"?
                    </Text>
                    <TextArea
                        rows={3}
                        placeholder="Reason for rejection (will be shown to the user)..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                    />
                </Space>
            </Modal>
        </div>
    );
}

export default Submissions;
