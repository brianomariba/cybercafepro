import React, { useState, useEffect } from 'react';
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
    SearchOutlined,
    BellOutlined,
    MoreOutlined,
    EyeOutlined,
    CarryOutOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getTasks, createTask, updateTask, deleteTask, assignTask, getServices, getComputers } from '../services/api';
import './Tasks.css';

const { Text } = Typography;
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
    const [searchQuery, setSearchQuery] = useState('');
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
    const filteredTasks = tasks.filter(t => {
        const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
        const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

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
            title: 'TASK',
            dataIndex: 'title',
            key: 'title',
            render: (title, record) => (
                <div className="task-name-cell">
                    <span className="task-name">{title}</span>
                    <span className="task-type">{record.serviceName || record.description || 'General'}</span>
                </div>
            )
        },
        {
            title: 'ASSIGNED TO',
            dataIndex: 'assignedTo',
            key: 'assignedTo',
            render: (assignedTo) => assignedTo ? (
                <div className="assigned-cell">
                    <DesktopOutlined />
                    <span>{assignedTo.hostname || assignedTo.clientId}</span>
                </div>
            ) : <span style={{ color: '#64748b' }}>—</span>
        },
        {
            title: 'PRIORITY',
            dataIndex: 'priority',
            key: 'priority',
            render: (priority) => {
                const p = priority?.toLowerCase() || 'normal';
                let className = 'normal';
                if (p === 'high' || p === 'urgent') className = 'high';
                if (p === 'low') className = 'low';
                return <span className={`priority-badge ${className}`}>{p.charAt(0).toUpperCase() + p.slice(1)}</span>;
            }
        },
        {
            title: 'STATUS',
            dataIndex: 'status',
            key: 'status',
            render: (status) => {
                const s = status?.toLowerCase() || 'available';
                let className = 'available';
                if (s === 'assigned') className = 'assigned';
                if (s === 'in-progress') className = 'in-progress';
                if (s === 'completed') className = 'completed';
                if (s === 'cancelled') className = 'cancelled';
                const formattedStatus = s === 'in-progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1);
                return <span className={`status-badge ${className}`}>{formattedStatus}</span>;
            }
        },
        {
            title: 'CREATED',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date) => (
                <div className="date-cell">
                    <span className="date-text">{dayjs(date).format('MMM DD, YYYY')}</span>
                    <span className="time-text">{dayjs(date).format('hh:mm A')}</span>
                </div>
            )
        },
        {
            title: 'ACTIONS',
            key: 'actions',
            render: (_, record) => (
                <div className="actions-cell">
                    <Tooltip title="View/Edit">
                        <button className="action-btn" onClick={() => openEditModal(record)}>
                            <EyeOutlined />
                        </button>
                    </Tooltip>
                    {record.status === 'available' && (
                        <Tooltip title="Assign">
                            <button className="action-btn" onClick={() => openAssignModal(record)}>
                                <SendOutlined />
                            </button>
                        </Tooltip>
                    )}
                    {(record.status === 'assigned' || record.status === 'in-progress') && (
                        <Tooltip title="Complete">
                            <button className="action-btn" onClick={() => handleStatusChange(record.id, 'completed')}>
                                <CheckCircleOutlined />
                            </button>
                        </Tooltip>
                    )}
                    <Popconfirm
                        title="Delete task?"
                        onConfirm={() => handleDeleteTask(record.id)}
                        okText="Yes"
                        cancelText="No"
                    >
                        <button className="action-btn">
                            <DeleteOutlined />
                        </button>
                    </Popconfirm>
                </div>
            )
        }
    ];

    return (
        <div className="tasks-container">
            {/* Header */}
            <div className="tasks-header-wrapper">
                <div className="tasks-title-section">
                    <h1 className="tasks-title">Tasks</h1>
                    <p className="tasks-subtitle">Manage and monitor all tasks</p>
                </div>
                <div className="tasks-top-controls">
                    <Input 
                        className="tasks-search" 
                        placeholder="Search tasks..." 
                        prefix={<SearchOutlined />} 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button className="notification-btn">
                        <BellOutlined />
                    </button>
                    <div className="user-profile">
                        <div className="user-avatar">
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jose" alt="Jose" />
                        </div>
                        <div className="user-info">
                            <span className="user-name">Jose</span>
                            <span className="user-role">Super Admin</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Control Bar */}
            <div className="tasks-control-bar">
                <div className="tasks-segments">
                    <button 
                        className={`segment-btn ${filterStatus === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('all')}
                    >All</button>
                    <button 
                        className={`segment-btn ${filterStatus === 'assigned' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('assigned')}
                    >Assigned</button>
                    <button 
                        className={`segment-btn ${filterStatus === 'in-progress' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('in-progress')}
                    >In Progress</button>
                    <button 
                        className={`segment-btn ${filterStatus === 'completed' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('completed')}
                    >Completed</button>
                </div>
                <Button type="primary" icon={<PlusOutlined />} className="btn-new-task" onClick={() => openEditModal()}>
                    New Task
                </Button>
            </div>

            {/* Metrics */}
            <div className="tasks-metrics-grid">
                <div className="task-metric-card">
                    <div className="tm-icon tm-icon-blue"><FileTextOutlined /></div>
                    <div className="tm-content">
                        <span className="tm-title">Total Tasks</span>
                        <span className="tm-value">{stats.total}</span>
                        <span className="tm-subtitle">All tasks created</span>
                    </div>
                </div>
                <div className="task-metric-card">
                    <div className="tm-icon tm-icon-purple"><UserOutlined /></div>
                    <div className="tm-content">
                        <span className="tm-title">Assigned</span>
                        <span className="tm-value">{stats.assigned}</span>
                        <span className="tm-subtitle">Tasks assigned</span>
                    </div>
                </div>
                <div className="task-metric-card">
                    <div className="tm-icon tm-icon-orange"><SyncOutlined /></div>
                    <div className="tm-content">
                        <span className="tm-title">In Progress</span>
                        <span className="tm-value">{stats.inProgress}</span>
                        <span className="tm-subtitle">Tasks in progress</span>
                    </div>
                </div>
                <div className="task-metric-card">
                    <div className="tm-icon tm-icon-green"><CheckCircleOutlined /></div>
                    <div className="tm-content">
                        <span className="tm-title">Completed</span>
                        <span className="tm-value">{stats.completed}</span>
                        <span className="tm-subtitle">Tasks completed</span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="tasks-table-section">
                <div className="tasks-table">
                    <Table 
                        columns={columns} 
                        dataSource={filteredTasks} 
                        rowKey="id"
                        loading={loading}
                        pagination={{ position: ['bottomRight'], pageSize: 10 }} 
                        locale={{ emptyText: <Empty description="No tasks found" /> }}
                    />
                </div>
            </div>

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
