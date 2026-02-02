import { useState, useEffect } from 'react'; // Force HMR update
import { Card, Table, Button, Modal, Form, Input, Select, message, Tag, Popconfirm, Upload } from 'antd';
import { PlusOutlined, DeleteOutlined, ReadOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { getCourses, createCourse, deleteCourse, downloadCourseUrl } from '../services/api';

function Learning() {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [fileList, setFileList] = useState([]);
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
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('title', values.title);
            formData.append('description', values.description);
            formData.append('category', values.category);
            formData.append('level', values.level);
            formData.append('duration', values.duration);
            if (values.content) formData.append('content', values.content);
            if (values.lessons) formData.append('lessons', values.lessons);
            if (values.featured) formData.append('featured', 'true');

            // Add file if selected
            if (fileList.length > 0) {
                formData.append('file', fileList[0].originFileObj);
            }

            await createCourse(formData);
            message.success('Course created successfully');
            setModalVisible(false);
            form.resetFields();
            setFileList([]);
            loadData();
        } catch (e) {
            message.error('Failed to create course');
        } finally {
            setUploading(false);
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

    const handleFileChange = ({ fileList: newFileList }) => {
        setFileList(newFileList.slice(-1));
    };

    const columns = [
        { title: 'Title', dataIndex: 'title', key: 'title' },
        { title: 'Category', dataIndex: 'category', key: 'category', render: c => <Tag>{c}</Tag> },
        { title: 'Level', dataIndex: 'level', key: 'level' },
        { title: 'Duration', dataIndex: 'duration', key: 'duration' },
        {
            title: 'Resource File',
            key: 'file',
            render: (_, record) => record.fileUrl ? (
                <Button
                    type="link"
                    icon={<DownloadOutlined />}
                    href={downloadCourseUrl(record._id)}
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
                    <Form.Item name="lessons" label="Number of Lessons">
                        <Input type="number" />
                    </Form.Item>
                    <Form.Item name="content" label="Content URL / Notes">
                        <Input.TextArea placeholder="Link to video or extra notes" />
                    </Form.Item>
                    <Form.Item name="featured" label="Featured">
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
                    <Button type="primary" htmlType="submit" block loading={uploading}>Create Course</Button>
                </Form>
            </Modal>
        </div>
    );
}

export default Learning;
