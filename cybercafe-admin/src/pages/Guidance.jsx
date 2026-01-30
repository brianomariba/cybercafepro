import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, CompassOutlined } from '@ant-design/icons';
import { getGuides, createGuide, deleteGuide } from '../services/api';

function Guidance() {
    const [guides, setGuides] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
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
        try {
            await createGuide(values);
            message.success('Guide created');
            setModalVisible(false);
            form.resetFields();
            loadData();
        } catch (e) {
            message.error('Failed to create guide');
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

    const columns = [
        { title: 'Title', dataIndex: 'title', key: 'title' },
        { title: 'Objective', dataIndex: 'objective', key: 'objective', render: o => <Tag>{o}</Tag> },
        { title: 'Type', dataIndex: 'type', key: 'type' },
        { title: 'Duration', dataIndex: 'duration', key: 'duration' },
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
                    <Form.Item name="objective" label="Objective" rules={[{ required: true }]}>
                        <Select options={[
                            { value: 'getting-started', label: 'Getting Started' },
                            { value: 'printing', label: 'Printing' },
                            { value: 'payments', label: 'Payments' },
                            { value: 'safety', label: 'Safety' }
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
                    <Button type="primary" htmlType="submit" block>Create Guide</Button>
                </Form>
            </Modal>
        </div>
    );
}

export default Guidance;
