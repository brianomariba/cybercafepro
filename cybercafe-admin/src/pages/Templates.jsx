import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, FileOutlined } from '@ant-design/icons';
import { getTemplates, createTemplate, deleteTemplate } from '../services/api';

function Templates() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
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
        try {
            await createTemplate(values);
            message.success('Template created');
            setModalVisible(false);
            form.resetFields();
            loadData();
        } catch (e) {
            message.error('Failed to create template');
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

    const columns = [
        { title: 'Title', dataIndex: 'title', key: 'title' },
        { title: 'Category', dataIndex: 'category', key: 'category', render: c => <Tag>{c}</Tag> },
        { title: 'Type', dataIndex: 'type', key: 'type' },
        { title: 'Downloads', dataIndex: 'downloads', key: 'downloads' },
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
                onCancel={() => setModalVisible(false)}
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
                            { value: 'Image', label: 'Image' }
                        ]} />
                    </Form.Item>
                    <Form.Item name="fileUrl" label="File URL (Optional)">
                        <Input placeholder="https://..." />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block>Create Template</Button>
                </Form>
            </Modal>
        </div>
    );
}

export default Templates;
