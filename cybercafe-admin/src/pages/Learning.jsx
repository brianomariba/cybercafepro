import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Tag, Popconfirm, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined, ReadOutlined } from '@ant-design/icons';
import { getCourses, createCourse, deleteCourse } from '../services/api';

function Learning() {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [form] = Form.useForm();

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getCourses();
            setCourses(data || []);
        } catch (error) {
            message.error('Failed to load courses');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleCreate = async (values) => {
        try {
            await createCourse(values);
            message.success('Course created');
            setModalVisible(false);
            form.resetFields();
            loadData();
        } catch (e) {
            message.error('Failed to create course');
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteCourse(id);
            message.success('Course deleted');
            loadData();
        } catch (e) {
            message.error('Failed to delete');
        }
    };

    const columns = [
        { title: 'Title', dataIndex: 'title', key: 'title' },
        { title: 'Category', dataIndex: 'category', key: 'category', render: c => <Tag>{c}</Tag> },
        { title: 'Level', dataIndex: 'level', key: 'level' },
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
                    <ReadOutlined className="icon" />
                    <h1>Learning / Courses Manager</h1>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>Add Course</Button>
            </div>

            <Card loading={loading}>
                <Table dataSource={courses} columns={columns} rowKey="_id" />
            </Card>

            <Modal
                title="Add Course"
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
                            { value: 'getting-started', label: 'Getting Started' },
                            { value: 'computer', label: 'Computer Skills' },
                            { value: 'printing', label: 'Printing' },
                            { value: 'office', label: 'Office' }
                        ]} />
                    </Form.Item>
                    <Form.Item name="level" label="Level" rules={[{ required: true }]}>
                        <Select options={[
                            { value: 'Beginner', label: 'Beginner' },
                            { value: 'Intermediate', label: 'Intermediate' },
                            { value: 'Advanced', label: 'Advanced' }
                        ]} />
                    </Form.Item>
                    <Form.Item name="duration" label="Duration (e.g., 30 min)" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="content" label="Content URL / Data">
                        <Input.TextArea placeholder="Link to video or content" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block>Create Course</Button>
                </Form>
            </Modal>
        </div>
    );
}

export default Learning;
