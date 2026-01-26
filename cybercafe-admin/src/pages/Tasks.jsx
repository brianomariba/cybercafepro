import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Modal, Space, Typography, Input, Select, Form, InputNumber, message, Popconfirm, Row, Col, Badge, Empty, Tooltip, DatePicker } from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    SyncOutlined,
    UserOutlined,
    DesktopOutlined,
    DollarOutlined,
    SendOutlined,
    ReloadOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getTasks, createTask, updateTask, deleteTask, assignTask, getServices, getComputers } from '../services/api';

const { Text, Title } = Typography;
const { TextArea } = Input;

// Format KSH
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

function Tasks() {
    const [tasks, setTasks] = useState([]);
    const [services, setServices] = useState([]);
    const [computers, setComputers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [assignModalVisible, setAssignModalVisible] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [form] = Form.useForm();
    const [assignForm] = Form.useForm();

    // Fetch data
    const fetchData = async () => {
        setLoading(true);
        try {
            const [tasksRes, servicesRes, computersRes] = await Promise.all([
                getTasks({ limit: 100 }),
                getServices(),
                getComputers(),
            ]);
            setTasks(tasksRes || []);
            setServices(servicesRes || []);
            setComputers(computersRes || []);
        } catch (error) {
            console.error('Failed to fetch data:', error);
            message.error('Failed to load data');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Create/Update task
    const handleSaveTask = async (values) => {
        try {
            if (selectedTask) {
                await updateTask(selectedTask.id, values);
                message.success('Task updated successfully');
            } else {
                await createTask(values);
                message.success('Task created successfully');
            }
            setModalVisible(false);
            form.resetFields();
            setSelectedTask(null);
            fetchData();
        } catch (error) {
            message.error('Failed to save task');
        }
    };

    // Delete task
    const handleDeleteTask = async (taskId) => {
        try {
            await deleteTask(taskId);
            message.success('Task deleted');
            fetchData();
        } catch (error) {
            message.error('Failed to delete task');
        }
    };

    // Assign task
    const handleAssignTask = async (values) => {
        if (!selectedTask) return;
        try {
            const computer = computers.find(c => c.clientId === values.clientId);
            await assignTask(selectedTask.id, {
                clientId: values.clientId,
                hostname: computer?.hostname,
                userName: values.userName,
            });
            message.success('Task assigned successfully');
            setAssignModalVisible(false);
            assignForm.resetFields();
            setSelectedTask(null);
            fetchData();
        } catch (error) {
            message.error('Failed to assign task');
        }
    };

    // Update task status
    const handleStatusChange = async (taskId, newStatus) => {
        try {
            await updateTask(taskId, { status: newStatus });
            message.success(`Task marked as ${newStatus}`);
            fetchData();
        } catch (error) {
            message.error('Failed to update status');
        }
    };

    // Open edit modal
    const openEditModal = (task = null) => {
        setSelectedTask(task);
        if (task) {
            form.setFieldsValue({
                title: task.title,
                description: task.description,
                serviceId: task.serviceId,
                price: task.price,
                priority: task.priority,
            });
        } else {
            form.resetFields();
        }
        setModalVisible(true);
    };

    // Open assign modal
    const openAssignModal = (task) => {
        setSelectedTask(task);
        assignForm.resetFields();
        setAssignModalVisible(true);
    };

    // Filter tasks
    const filteredTasks = tasks.filter(t =>
        filterStatus === 'all' || t.status === filterStatus
    );

    // Stats
    const stats = {
        total: tasks.length,
        available: tasks.filter(t => t.status === 'available').length,
        assigned: tasks.filter(t => t.status === 'assigned').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
    };

    const columns = [
        {
            title: 'Task',
            dataIndex: 'title',
            key: 'title',
            render: (title, record) => (
                <div>
                    <Text strong>{title}</Text>
                    {record.serviceName && (
                        <Tag size="small" style={{ marginLeft: 8 }}>{record.serviceName}</Tag>
                    )}
                    {record.description && (
                        <div><Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text></div>
                    )}
                </div>
            ),
        },
        {
            title: 'Price',
            dataIndex: 'price',
            key: 'price',
            render: (price) => (
                <Text strong style={{ color: '#00C853' }}>{formatKSH(price)}</Text>
            ),
        },
        {
            title: 'Priority',
            dataIndex: 'priority',
            key: 'priority',
            render: (priority) => {
                const colors = { low: 'default', normal: 'blue', high: 'orange', urgent: 'red' };
                return <Tag color={colors[priority] || 'default'}>{priority?.toUpperCase()}</Tag>;
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => {
                const config = {
                    available: { color: 'default', icon: <ClockCircleOutlined /> },
                    assigned: { color: 'blue', icon: <UserOutlined /> },
                    'in-progress': { color: 'processing', icon: <SyncOutlined spin /> },
                    completed: { color: 'success', icon: <CheckCircleOutlined /> },
                    cancelled: { color: 'error', icon: null },
                };
                const c = config[status] || { color: 'default' };
                return <Tag color={c.color} icon={c.icon}>{status?.toUpperCase()}</Tag>;
            },
        },
        {
            title: 'Assigned To',
            dataIndex: 'assignedTo',
            key: 'assignedTo',
            render: (assignedTo) => assignedTo ? (
                <Space>
                    <DesktopOutlined />
                    <Text>{assignedTo.hostname || assignedTo.clientId}</Text>
                </Space>
            ) : <Text type="secondary">—</Text>,
        },
        {
            title: 'Created',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date) => <Text type="secondary">{dayjs(date).format('MMM D, HH:mm')}</Text>,
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    {record.status === 'available' && (
                        <Tooltip title="Assign to Computer">
                            <Button
                                type="primary"
                                size="small"
                                icon={<SendOutlined />}
                                onClick={() => openAssignModal(record)}
                            />
                        </Tooltip>
                    )}
                    {(record.status === 'assigned' || record.status === 'in-progress') && (
                        <Tooltip title="Mark Complete">
                            <Button
                                size="small"
                                icon={<CheckCircleOutlined />}
                                style={{ color: '#00C853' }}
                                onClick={() => handleStatusChange(record.id, 'completed')}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title="Edit">
                        <Button
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openEditModal(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this task?"
                        onConfirm={() => handleDeleteTask(record.id)}
                    >
                        <Tooltip title="Delete">
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Tooltip>
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
                    <FileTextOutlined className="icon" />
                    <h1>Task Management</h1>
                </div>
                <p className="page-subtitle">Create and assign tasks to users with pricing</p>
            </div>

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-card blue">
                    <div className="stat-header">
                        <div className="stat-icon blue"><FileTextOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.total}</div>
                    <div className="stat-label">Total Tasks</div>
                </div>

                <div className="stat-card">
                    <div className="stat-header">
                        <div className="stat-icon" style={{ background: 'rgba(100, 100, 120, 0.15)', color: '#6b6b80' }}>
                            <ClockCircleOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{stats.available}</div>
                    <div className="stat-label">Available</div>
                </div>

                <div className="stat-card orange">
                    <div className="stat-header">
                        <div className="stat-icon orange"><SyncOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.assigned + stats.inProgress}</div>
                    <div className="stat-label">In Progress</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green"><CheckCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{stats.completed}</div>
                    <div className="stat-label">Completed</div>
                </div>
            </div>

            {/* Filters and Actions */}
            <Card style={{ marginBottom: 24 }}>
                <Space size="large" wrap>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditModal()}>
                        Create Task
                    </Button>
                    <Select
                        value={filterStatus}
                        onChange={setFilterStatus}
                        style={{ width: 150 }}
                        options={[
                            { value: 'all', label: 'All Status' },
                            { value: 'available', label: 'Available' },
                            { value: 'assigned', label: 'Assigned' },
                            { value: 'in-progress', label: 'In Progress' },
                            { value: 'completed', label: 'Completed' },
                        ]}
                    />
                    <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                        Refresh
                    </Button>
                </Space>
            </Card>

            {/* Tasks Table */}
            <Card>
                {tasks.length === 0 && !loading ? (
                    <Empty description="No tasks created yet. Click 'Create Task' to get started." />
                ) : (
                    <Table
                        columns={columns}
                        dataSource={filteredTasks}
                        rowKey="id"
                        loading={loading}
                        pagination={{ pageSize: 10 }}
                    />
                )}
            </Card>

            {/* Create/Edit Task Modal */}
            <Modal
                title={selectedTask ? 'Edit Task' : 'Create New Task'}
                open={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    setSelectedTask(null);
                    form.resetFields();
                }}
                footer={null}
                width={600}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSaveTask}
                    initialValues={{ priority: 'normal', price: 0 }}
                >
                    <Form.Item
                        name="title"
                        label="Task Title"
                        rules={[{ required: true, message: 'Please enter task title' }]}
                    >
                        <Input placeholder="e.g., Print 10 color pages" />
                    </Form.Item>

                    <Form.Item name="description" label="Description">
                        <TextArea rows={3} placeholder="Additional details..." />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="serviceId" label="Service Type">
                                <Select
                                    placeholder="Select service"
                                    allowClear
                                    options={services.map(s => ({
                                        value: s.id,
                                        label: `${s.name} (${formatKSH(s.price)})`
                                    }))}
                                    onChange={(serviceId) => {
                                        const service = services.find(s => s.id === serviceId);
                                        if (service) {
                                            form.setFieldValue('price', service.price);
                                        }
                                    }}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="price"
                                label="Price (KSH)"
                                rules={[{ required: true, message: 'Please enter price' }]}
                            >
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={0}
                                    formatter={value => `KSH ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    parser={value => value.replace(/KSH\s?|(,*)/g, '')}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="priority" label="Priority">
                        <Select
                            options={[
                                { value: 'low', label: 'Low' },
                                { value: 'normal', label: 'Normal' },
                                { value: 'high', label: 'High' },
                                { value: 'urgent', label: 'Urgent' },
                            ]}
                        />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setModalVisible(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit">
                                {selectedTask ? 'Update Task' : 'Create Task'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Assign Task Modal */}
            <Modal
                title={`Assign Task: ${selectedTask?.title}`}
                open={assignModalVisible}
                onCancel={() => {
                    setAssignModalVisible(false);
                    setSelectedTask(null);
                }}
                footer={null}
                width={500}
            >
                <Form
                    form={assignForm}
                    layout="vertical"
                    onFinish={handleAssignTask}
                >
                    <Form.Item
                        name="clientId"
                        label="Assign to Computer"
                        rules={[{ required: true, message: 'Select a computer' }]}
                    >
                        <Select
                            placeholder="Select computer"
                            showSearch
                            optionFilterProp="label"
                            options={computers
                                .filter(c => c.isOnline)
                                .map(c => ({
                                    value: c.clientId,
                                    label: (
                                        <Space>
                                            <Badge status="success" />
                                            {c.hostname}
                                            {c.sessionUser && <Text type="secondary">({c.sessionUser})</Text>}
                                        </Space>
                                    )
                                }))
                            }
                        />
                    </Form.Item>

                    <Form.Item name="userName" label="User Name (Optional)">
                        <Input placeholder="Enter user name" />
                    </Form.Item>

                    <div style={{
                        padding: 16,
                        background: 'rgba(0, 200, 83, 0.1)',
                        borderRadius: 12,
                        marginBottom: 16
                    }}>
                        <Space>
                            <DollarOutlined style={{ color: '#00C853' }} />
                            <Text>Task Price:</Text>
                            <Text strong style={{ color: '#00C853' }}>{formatKSH(selectedTask?.price)}</Text>
                        </Space>
                    </div>

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setAssignModalVisible(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit" icon={<SendOutlined />}>
                                Assign Task
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default Tasks;
