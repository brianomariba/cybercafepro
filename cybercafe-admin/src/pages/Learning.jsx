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
            if (values.batchMode && fileList.length > 0) {
                for (const f of fileList) {
                    const formData = new FormData();
                    const fileName = f.name ? f.name.replace(/\.[^/.]+$/, "") : values.title;
                    formData.append('title', fileName || values.title);
                    formData.append('description', values.description || '');
                    formData.append('category', values.category);
                    formData.append('level', values.level);
                    formData.append('duration', values.duration);
                    if (values.content) formData.append('content', values.content);
                    if (values.lessons) formData.append('lessons', values.lessons);
                    if (values.featured) formData.append('featured', 'true');
                    formData.append('files', f.originFileObj);
                    await createCourse(formData);
                }
            } else {
                const formData = new FormData();
                formData.append('title', values.title);
                formData.append('description', values.description || '');
                formData.append('category', values.category);
                formData.append('level', values.level);
                formData.append('duration', values.duration);
                if (values.content) formData.append('content', values.content);
                if (values.lessons) formData.append('lessons', values.lessons);
                if (values.featured) formData.append('featured', 'true');

                if (fileList.length > 0) {
                    fileList.forEach(f => {
                        formData.append('files', f.originFileObj);
                    });
                }
                await createCourse(formData);
            }

            message.success(values.batchMode ? 'Courses batch created successfully' : 'Course created successfully');
            setModalVisible(false);
            form.resetFields();
            setFileList([]);
            loadData();
        } catch (e) {
            message.error('Failed to create course(s)');
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
        setFileList(newFileList);
    };

    const columns = [
        { title: 'Title', dataIndex: 'title', key: 'title' },
        { title: 'Category', dataIndex: 'category', key: 'category', render: c => <Tag>{c}</Tag> },
        { title: 'Level', dataIndex: 'level', key: 'level' },
        { title: 'Duration', dataIndex: 'duration', key: 'duration' },
        {
            title: 'Resource Files',
            key: 'files',
            render: (_, record) => {
                if (record.files && record.files.length > 0) {
                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {record.files.map((file, index) => (
                                <Button
                                    key={index}
                                    type="link"
                                    icon={<DownloadOutlined />}
                                    href={downloadCourseUrl(record._id, index)}
                                    target="_blank"
                                    size="small"
                                >
                                    {file.fileOriginalName || `File ${index + 1}`}
                                </Button>
                            ))}
                        </div>
                    );
                } else if (record.fileUrl) {
                    // Backward compatibility
                    return (
                        <Button
                            type="link"
                            icon={<DownloadOutlined />}
                            href={downloadCourseUrl(record._id, 0)}
                            target="_blank"
                        >
                            {record.fileOriginalName || 'Download'}
                        </Button>
                    );
                }
                return <Tag color="default">No file</Tag>;
            }
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
                    <Form.Item name="batchMode" label="Upload Mode" tooltip="If batch mode is Yes, each selected file will be created as a separate entry using its filename as the title.">
                        <Select options={[
                            { value: false, label: 'Single Entry (Group all files)' },
                            { value: true, label: 'Batch Mode (One entry per file)' }
                        ]} defaultValue={false} />
                    </Form.Item>
                    <Form.Item label="Upload Resource File(s) (PDF, Word, etc.)">
                        <Upload
                            beforeUpload={() => false}
                            fileList={fileList}
                            onChange={handleFileChange}
                            multiple={true}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                        >
                            <Button icon={<UploadOutlined />}>Select Files</Button>
                        </Upload>
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={uploading}>Create Course</Button>
                </Form>
            </Modal>
        </div>
    );
}

export default Learning;
