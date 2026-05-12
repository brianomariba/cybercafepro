import { useState, useEffect } from 'react';
import { Card, Button, Modal, Form, Input, Select, Upload, Table, Tag, Space, Typography, message, Empty, Popconfirm, Tooltip } from 'antd';
import {
    UploadOutlined,
    FileOutlined,
    FileWordOutlined,
    FilePdfOutlined,
    FileExcelOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    PlusOutlined,
    InboxOutlined,
    BookOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import { submitDocument, getUserSubmissions, deleteSubmission, connectSocket } from '../services/api';
import dayjs from 'dayjs';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

// File type icon helper
const getFileIcon = (mimeType) => {
    if (mimeType?.includes('pdf')) return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
    if (mimeType?.includes('word') || mimeType?.includes('document')) return <FileWordOutlined style={{ color: '#1890ff' }} />;
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return <FileExcelOutlined style={{ color: '#52c41a' }} />;
    return <FileOutlined style={{ color: '#8c8c8c' }} />;
};

// Format file size
const formatFileSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function Submissions({ user }) {
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [form] = Form.useForm();
    const [fileList, setFileList] = useState([]);

    // Fetch submissions
    const fetchSubmissions = async () => {
        setLoading(true);
        try {
            const data = await getUserSubmissions();
            setSubmissions(data || []);
        } catch (error) {
            console.error('Failed to fetch submissions:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchSubmissions();

        // Listen for real-time updates
        const socket = connectSocket();

        // Listen for submission review events
        const handleReview = (data) => {
            if (data.submittedBy === user?.username) {
                if (data.status === 'approved') {
                    message.success(`Your submission "${data.title}" has been approved! 🎉`);
                } else {
                    message.info(`Your submission "${data.title}" was reviewed.`);
                }
                fetchSubmissions();
            }
        };

        socket.on('submission-reviewed', handleReview);

        return () => {
            if (socket) {
                socket.off('submission-reviewed', handleReview);
            }
        };
    }, [user]);

    // Handle form submission
    const handleSubmit = async (values) => {
        if (fileList.length === 0) {
            message.error('Please upload a file');
            return;
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('file', fileList[0].originFileObj || fileList[0]);
            formData.append('title', values.title);
            formData.append('description', values.description || '');
            formData.append('category', values.category || 'general');
            formData.append('targetType', values.targetType);

            await submitDocument(formData);
            message.success('Document submitted successfully! It will be reviewed by admin.');
            setModalVisible(false);
            form.resetFields();
            setFileList([]);
            fetchSubmissions();
        } catch (error) {
            console.error('Submit failed:', error);
            message.error(error.response?.data?.error || 'Failed to submit document');
        }
        setSubmitting(false);
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
                return <Tag icon={<ClockCircleOutlined />} color="processing">Pending Review</Tag>;
        }
    };

    // Table columns
    const columns = [
        {
            title: 'Document',
            key: 'document',
            render: (_, record) => (
                <Space>
                    {getFileIcon(record.fileMimeType)}
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
            title: 'Target',
            dataIndex: 'targetType',
            key: 'targetType',
            render: (type) => (
                <Tag color={type === 'template' ? 'blue' : 'green'} icon={type === 'template' ? <FileTextOutlined /> : <BookOutlined />}>
                    {type === 'template' ? 'Template' : 'Guidance'}
                </Tag>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => getStatusTag(status),
        },
        {
            title: 'Submitted',
            dataIndex: 'submittedAt',
            key: 'submittedAt',
            render: (date) => dayjs(date).format('MMM D, YYYY'),
        },
        {
            title: 'Review Notes',
            dataIndex: 'reviewNotes',
            key: 'reviewNotes',
            render: (notes, record) => (
                record.status !== 'pending' && notes ? (
                    <Tooltip title={notes}>
                        <Text type="secondary" ellipsis style={{ maxWidth: 150 }}>{notes}</Text>
                    </Tooltip>
                ) : '—'
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                record.status === 'pending' ? (
                    <Popconfirm
                        title="Delete submission?"
                        description="This action cannot be undone."
                        onConfirm={() => handleDelete(record._id)}
                        okText="Delete"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true }}
                    >
                        <Button danger size="small" icon={<DeleteOutlined />}>
                            Delete
                        </Button>
                    </Popconfirm>
                ) : null
            ),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <Title level={3} style={{ margin: 0 }}>
                    <UploadOutlined style={{ marginRight: 12, color: '#00B4D8' }} />
                    Document Submissions
                </Title>
                <Paragraph type="secondary" style={{ marginTop: 8 }}>
                    Submit your documents to be reviewed and added as Templates or Guidance materials for all users.
                </Paragraph>
            </div>

            {/* Info Card */}
            <Card
                style={{
                    marginBottom: 24,
                    background: 'linear-gradient(135deg, rgba(0, 180, 216, 0.1), rgba(123, 44, 191, 0.1))',
                    border: '1px solid rgba(0, 180, 216, 0.3)'
                }}
            >
                <Space direction="vertical" size={8}>
                    <Text strong style={{ fontSize: 16 }}>📝 How it works:</Text>
                    <Text type="secondary">
                        1. Upload a document you think would be helpful for others
                    </Text>
                    <Text type="secondary">
                        2. Choose whether it should be a <Tag color="blue">Template</Tag> (downloadable documents like CVs, letters) or <Tag color="green">Guidance</Tag> (how-to guides, tutorials)
                    </Text>
                    <Text type="secondary">
                        3. Admin reviews your submission and approves it to be available for all users
                    </Text>
                </Space>
            </Card>

            {/* Submit Button */}
            <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setModalVisible(true)}
                style={{ marginBottom: 24 }}
            >
                Submit a Document
            </Button>

            {/* Submissions Table */}
            <Card title="Your Submissions" loading={loading}>
                {submissions.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No submissions yet. Submit your first document!"
                    />
                ) : (
                    <Table
                        columns={columns}
                        dataSource={submissions}
                        rowKey="_id"
                        pagination={{ pageSize: 10 }}
                    />
                )}
            </Card>

            {/* Submit Modal */}
            <Modal
                title={<><UploadOutlined /> Submit Document for Review</>}
                open={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    form.resetFields();
                    setFileList([]);
                }}
                footer={null}
                width={600}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Form.Item
                        name="title"
                        label="Document Title"
                        rules={[{ required: true, message: 'Please enter a title' }]}
                    >
                        <Input placeholder="e.g., Professional CV Template" />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Description"
                    >
                        <TextArea
                            rows={3}
                            placeholder="Briefly describe what this document is useful for..."
                        />
                    </Form.Item>

                    <Form.Item
                        name="targetType"
                        label="What should this become?"
                        rules={[{ required: true, message: 'Please select a type' }]}
                    >
                        <Select placeholder="Select type">
                            <Select.Option value="template">
                                <Space>
                                    <FileTextOutlined style={{ color: '#1890ff' }} />
                                    Template (Downloadable document like CV, Letter, Report)
                                </Space>
                            </Select.Option>
                            <Select.Option value="guidance">
                                <Space>
                                    <BookOutlined style={{ color: '#52c41a' }} />
                                    Guidance (How-to guide, Tutorial, Reference)
                                </Space>
                            </Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="category"
                        label="Category"
                    >
                        <Select placeholder="Select category (optional)">
                            <Select.Option value="resume">Resume / CV</Select.Option>
                            <Select.Option value="business">Business</Select.Option>
                            <Select.Option value="academic">Academic</Select.Option>
                            <Select.Option value="legal">Legal</Select.Option>
                            <Select.Option value="creative">Creative</Select.Option>
                            <Select.Option value="general">General</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        label="Upload File"
                        required
                    >
                        <Dragger
                            fileList={fileList}
                            onChange={({ fileList }) => setFileList(fileList.slice(-1))}
                            beforeUpload={() => false}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined style={{ color: '#00B4D8' }} />
                            </p>
                            <p className="ant-upload-text">Click or drag file to upload</p>
                            <p className="ant-upload-hint">
                                Supported: PDF, Word, Excel, PowerPoint, Images (max 50MB)
                            </p>
                        </Dragger>
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setModalVisible(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={submitting}
                                icon={<UploadOutlined />}
                            >
                                Submit for Review
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default Submissions;
