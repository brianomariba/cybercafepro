import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Tag, Popconfirm, Upload, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, FileOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { getTemplates, createTemplate, deleteTemplate, downloadTemplateUrl } from '../services/api';

function Templates() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [fileList, setFileList] = useState([]);
    const [form] = Form.useForm();

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getTemplates();
            setTemplates(data || []);
        } catch (error) {
            message.error('Failed to load templates');
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
            formData.append('category', values.category);
            formData.append('type', values.type);
            if (values.featured) formData.append('featured', 'true');

            // Add file if selected
            if (fileList.length > 0) {
                formData.append('file', fileList[0].originFileObj);
            }

            await createTemplate(formData);
            message.success('Template created successfully');
            setModalVisible(false);
            form.resetFields();
            setFileList([]);
            loadData();
        } catch (e) {
            message.error('Failed to create template');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteTemplate(id);
            message.success('Template deleted');
            loadData();
        } catch (e) {
            message.error('Failed to delete');
        }
    };

    const handleFileChange = ({ fileList: newFileList }) => {
        setFileList(newFileList.slice(-1)); // Only keep last file
    };

    const columns = [
        { title: 'Title', dataIndex: 'title', key: 'title' },
        { title: 'Category', dataIndex: 'category', key: 'category', render: c => <Tag>{c}</Tag> },
        { title: 'Type', dataIndex: 'type', key: 'type' },
        { title: 'Downloads', dataIndex: 'downloads', key: 'downloads' },
        {
            title: 'File',
            key: 'file',
            render: (_, record) => record.fileUrl ? (
                <Button
                    type="link"
                    icon={<DownloadOutlined />}
                    href={downloadTemplateUrl(record._id)}
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
                    <FileOutlined className="icon" />
                    <h1>Templates Manager</h1>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>Add Template</Button>
            </div>

            <Card loading={loading}>
                <Table dataSource={templates} columns={columns} rowKey="_id" />
            </Card>

            <Modal
                title="Add Template"
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
                    <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                        <Select options={[
                            { value: 'resume', label: 'Resume' },
                            { value: 'business', label: 'Business' },
                            { value: 'education', label: 'Education' },
                            { value: 'personal', label: 'Personal' }
                        ]} />
                    </Form.Item>
                    <Form.Item name="type" label="Type" rules={[{ required: true }]}>
                        <Select options={[
                            { value: 'Word', label: 'Word' },
                            { value: 'Excel', label: 'Excel' },
                            { value: 'PowerPoint', label: 'PowerPoint' },
                            { value: 'PDF', label: 'PDF' },
                            { value: 'Image', label: 'Image' }
                        ]} />
                    </Form.Item>
                    <Form.Item name="featured" valuePropName="checked" label="Featured">
                        <Select options={[
                            { value: false, label: 'No' },
                            { value: true, label: 'Yes' }
                        ]} defaultValue={false} />
                    </Form.Item>
                    <Form.Item label="Upload File (PDF, Word, Excel, etc.)">
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
                    <Button type="primary" htmlType="submit" block loading={uploading}>Create Template</Button>
                </Form>
            </Modal>
        </div>
    );
}

export default Templates;
