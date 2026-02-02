import { useState, useEffect } from 'react'; // Force HMR update
import { Card, Table, Button, Modal, Form, Input, Select, message, Tag, Popconfirm, Upload } from 'antd';
import { PlusOutlined, DeleteOutlined, CompassOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { getGuides, createGuide, deleteGuide, downloadGuideUrl } from '../services/api';

function Guidance() {
    const [guides, setGuides] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [fileList, setFileList] = useState([]);
    const [form] = Form.useForm();

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getGuides();
            setGuides(data || []);
        } catch (error) {
            message.error('Failed to load guides');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleCreate = async (values) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('title', values.title);
            formData.append('description', values.description);
            formData.append('objective', values.objective);
            formData.append('type', values.type);
            formData.append('duration', values.duration);
            if (values.content) formData.append('content', values.content);
            if (values.popular) formData.append('popular', 'true');

            // Add file if selected
            if (fileList.length > 0) {
                formData.append('file', fileList[0].originFileObj);
            }

            await createGuide(formData);
            message.success('Guide created successfully');
            setModalVisible(false);
            form.resetFields();
            setFileList([]);
            loadData();
        } catch (e) {
            message.error('Failed to create guide');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteGuide(id);
            message.success('Guide deleted');
            loadData();
        } catch (e) {
            message.error('Failed to delete');
        }
    };

    const handleFileChange = ({ fileList: newFileList }) => {
        setFileList(newFileList.slice(-1));
    };

    const columns = [
        { title: 'Title', dataIndex: 'title', key: 'title' },
        { title: 'Objective', dataIndex: 'objective', key: 'objective', render: o => <Tag>{o}</Tag> },
        { title: 'Type', dataIndex: 'type', key: 'type' },
        { title: 'Duration', dataIndex: 'duration', key: 'duration' },
        {
            title: 'Resource File',
            key: 'file',
            render: (_, record) => record.fileUrl ? (
                <Button
                    type="link"
                    icon={<DownloadOutlined />}
                    href={downloadGuideUrl(record._id)}
                    target="_blank"
                >
                    {record.fileOriginalName || 'Download'}
                </Button>
            ) : <Tag color="default">No file</Tag>
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Popconfirm title="Delete?" onConfirm={() => handleDelete(record._id)}>
                    <Button danger icon={<DeleteOutlined />} />
                </Popconfirm>
            )
        }
    ];

    return (
        <div>
            <div className="page-header">
                <div className="page-title">
                    <CompassOutlined className="icon" />
                    <h1>Guidance Manager</h1>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>Add Guide</Button>
            </div>

            <Card loading={loading}>
                <Table dataSource={guides} columns={columns} rowKey="_id" />
            </Card>

            <Modal
                title="Add Guide"
                open={modalVisible}
                onCancel={() => { setModalVisible(false); setFileList([]); }}
                footer={null}
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="description" label="Description" rules={[{ required: true }]}>
                        <Input.TextArea />
                    </Form.Item>
                    <Form.Item name="objective" label="Objective" rules={[{ required: true }]}>
                        <Select options={[
                            { value: 'getting-started', label: 'Getting Started' },
                            { value: 'printing', label: 'Printing' },
                            { value: 'payments', label: 'Payments' },
                            { value: 'safety', label: 'Safety' },
                            { value: 'account', label: 'Account Settings' },
                            { value: 'other', label: 'General & Other' }
                        ]} />
                    </Form.Item>
                    <Form.Item name="type" label="Type" rules={[{ required: true }]}>
                        <Select options={[
                            { value: 'Guide', label: 'Guide' },
                            { value: 'Tutorial', label: 'Tutorial' },
                            { value: 'Reference', label: 'Reference' }
                        ]} />
                    </Form.Item>
                    <Form.Item name="duration" label="Duration (e.g., 5 min read)" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="content" label="Content / URL">
                        <Input.TextArea placeholder="Markdown content or URL" />
                    </Form.Item>
                    <Form.Item name="popular" label="Mark as Popular">
                        <Select options={[
                            { value: false, label: 'No' },
                            { value: true, label: 'Yes' }
                        ]} defaultValue={false} />
                    </Form.Item>
                    <Form.Item label="Upload Resource File (PDF, Word, etc.)">
                        <Upload
                            beforeUpload={() => false}
                            fileList={fileList}
                            onChange={handleFileChange}
                            maxCount={1}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                        >
                            <Button icon={<UploadOutlined />}>Select File</Button>
                        </Upload>
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={uploading}>Create Guide</Button>
                </Form>
            </Modal>
        </div>
    );
}

export default Guidance;
