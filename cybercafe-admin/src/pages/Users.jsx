import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Tooltip, Badge, Avatar, Modal, message, Form, Switch, Popconfirm, Row, Col, Spin, Empty, Tabs } from 'antd';
import {
    TeamOutlined,
    UserOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    LockOutlined,
    UnlockOutlined,
    MailOutlined,
    PhoneOutlined,
    CalendarOutlined,
    DollarOutlined,
    ClockCircleOutlined,
    DesktopOutlined,
    ReloadOutlined,
    EyeOutlined,
    EyeInvisibleOutlined,
    KeyOutlined,
    GlobalOutlined,
    ClearOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAgentUsers, createAgentUser, updateAgentUser, deleteAgentUser, getSessions, getPortalUsers, createPortalUser, updatePortalUser, deletePortalUser, cleanupDemoUsers, getStaff, createStaff, updateStaff, deleteStaff } from '../services/api';

const { Text, Title } = Typography;
const { Search } = Input;

function Users() {
    const [userType, setUserType] = useState(localStorage.getItem('hawknine_user_type') || 'agent'); // 'agent', 'portal', or 'staff'
    const currentUser = JSON.parse(localStorage.getItem('cybercafe_user') || '{}');
    const isSuperAdmin = currentUser.role === 'Super Admin';

    const [showPassword, setShowPassword] = useState(false);
    const [users, setUsers] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [form] = Form.useForm();

    // Fetch users from API
    const fetchData = async () => {
        setLoading(true);
        try {
            let userData = [];
            if (userType === 'agent') {
                userData = await getAgentUsers().catch(() => []);
            } else if (userType === 'portal') {
                userData = await getPortalUsers().catch(() => []);
            } else if (userType === 'staff') {
                userData = await getStaff().catch(() => []);
            }

            const sessionData = await getSessions({ limit: 200, type: 'LOGOUT' }).catch(() => []);

            setUsers(userData || []);
            setSessions(sessionData || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
            message.error('Failed to load users');
        }
        setLoading(false);
        setInitialLoading(false);
    };

    useEffect(() => {
        fetchData();
        localStorage.setItem('hawknine_user_type', userType);
    }, [userType]);

    // Calculate user stats from sessions
    const getUserStats = (username) => {
        const userSessions = sessions.filter(s => s.user === username);
        const totalSessions = userSessions.length;
        const totalSpent = userSessions.reduce((sum, s) => sum + (s.charges?.grandTotal || 0), 0);
        const totalHours = userSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / 60;
        const lastSession = userSessions[0]; // Most recent

        return {
            totalSessions,
            totalSpent,
            totalHours: Math.round(totalHours),
            lastSessionDate: lastSession ? dayjs(lastSession.endTime || lastSession.receivedAt).format('MMM DD, YYYY') : 'Never',
        };
    };

    const handleAddUser = () => {
        setEditingUser(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        form.setFieldsValue({
            username: user.username,
            name: user.name,
            email: user.email,
            active: user.active,
            role: user.role
        });
        setModalVisible(true);
    };

    const handleDeleteUser = async (username) => {
        try {
            if (userType === 'agent') {
                await deleteAgentUser(username);
            } else if (userType === 'portal') {
                await deletePortalUser(username);
            } else if (userType === 'staff') {
                await deleteStaff(username);
            }
            message.success(`User ${username} deleted`);
            fetchData();
        } catch (error) {
            message.error('Failed to delete user');
        }
    };

    const handleToggleStatus = async (username, currentStatus) => {
        try {
            if (userType === 'agent') {
                await updateAgentUser(username, { active: !currentStatus });
            } else if (userType === 'portal') {
                await updatePortalUser(username, { active: !currentStatus });
            } else if (userType === 'staff') {
                await updateStaff(username, { active: !currentStatus });
            }
            message.success(`User ${username} ${currentStatus ? 'disabled' : 'enabled'}`);
            fetchData();
        } catch (error) {
            message.error('Failed to update user status');
        }
    };

    const handleSubmit = async (values) => {
        try {
            if (editingUser) {
                // Update existing user
                const updateData = { name: values.name, active: values.active, email: values.email, role: values.role };
                if (values.password) {
                    updateData.password = values.password;
                }

                if (userType === 'agent') {
                    await updateAgentUser(editingUser.username, updateData);
                } else if (userType === 'portal') {
                    await updatePortalUser(editingUser.username, updateData);
                } else if (userType === 'staff') {
                    await updateStaff(editingUser.username, updateData);
                }
                message.success('User updated successfully');
            } else {
                // Create new user
                if (userType === 'agent') {
                    await createAgentUser({
                        username: values.username,
                        password: values.password,
                        name: values.name,
                        email: values.email,
                    });
                } else if (userType === 'portal') {
                    await createPortalUser({
                        username: values.username,
                        password: values.password,
                        email: values.email,
                        name: values.name,
                    });
                } else if (userType === 'staff') {
                    await createStaff({
                        username: values.username,
                        password: values.password,
                        email: values.email,
                        name: values.name,
                        role: values.role
                    });
                }
                message.success('User created successfully');
            }
            setModalVisible(false);
            fetchData();
        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Operation failed';
            message.error(errorMessage);
        }
    };

    // Cleanup demo users handler
    const handleCleanupDemoUsers = async () => {
        try {
            setLoading(true);
            const result = await cleanupDemoUsers();
            if (result.success) {
                message.success(`Cleaned ${result.deletedUsers} demo users and ${result.deletedSessions} sessions`);
                if (result.deletedUsernames?.length > 0) {
                    console.log('Deleted usernames:', result.deletedUsernames);
                }
                fetchData();
            } else {
                message.warning('No demo users found to cleanup');
            }
        } catch (error) {
            console.error('Cleanup failed:', error);
            message.error('Failed to cleanup demo users');
        } finally {
            setLoading(false);
        }
    };

    // Stats
    const stats = {
        totalUsers: (users || []).length,
        activeUsers: (users || []).filter(u => u && u.active).length,
        inactiveUsers: (users || []).filter(u => u && !u.active).length,
        totalRevenue: (sessions || []).reduce((sum, s) => sum + (s?.charges?.grandTotal || 0), 0),
    };

    // Filter users
    const filteredUsers = (users || []).filter(user => {
        if (!user) return false;
        const usernameMatch = (user.username || '').toLowerCase();
        const nameMatch = (user.name || '').toLowerCase();
        const search = (searchText || '').toLowerCase();

        const matchesSearch = usernameMatch.includes(search) || nameMatch.includes(search);

        const matchesStatus = filterStatus === 'all' ||
            (filterStatus === 'active' && user.active) ||
            (filterStatus === 'inactive' && !user.active);

        return matchesSearch && matchesStatus;
    });

    const columns = [
        {
            title: 'User',
            key: 'user',
            render: (_, record) => (
                <Space>
                    <Avatar
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${record.username}`}
                        size={40}
                    />
                    <div>
                        <Text strong>{record.name || record.username}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            @{record.username} {record.email ? `• ${record.email}` : ''}
                        </Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, record) => (
                <Tag color={record.active ? 'green' : 'red'}>
                    {record.active ? 'Active' : 'Disabled'}
                </Tag>
            ),
            filters: [
                { text: 'Active', value: true },
                { text: 'Disabled', value: false },
            ],
            onFilter: (value, record) => record.active === value,
        },
        {
            title: 'Sessions',
            key: 'sessions',
            render: (_, record) => {
                const stats = getUserStats(record.username);
                return <Text>{stats.totalSessions}</Text>;
            },
            sorter: (a, b) => getUserStats(a.username).totalSessions - getUserStats(b.username).totalSessions,
        },
        {
            title: 'Total Spent',
            key: 'spent',
            render: (_, record) => {
                const stats = getUserStats(record.username);
                return (
                    <Text style={{ fontFamily: 'JetBrains Mono', color: stats.totalSpent > 0 ? '#00C853' : '#64748B' }}>
                        KSH {stats.totalSpent.toLocaleString()}
                    </Text>
                );
            },
            sorter: (a, b) => getUserStats(a.username).totalSpent - getUserStats(b.username).totalSpent,
        },
        {
            title: 'Hours',
            key: 'hours',
            render: (_, record) => {
                const stats = getUserStats(record.username);
                return <Text>{stats.totalHours}h</Text>;
            },
        },
        {
            title: 'Last Session',
            key: 'lastSession',
            render: (_, record) => {
                const stats = getUserStats(record.username);
                return <Text type="secondary">{stats.lastSessionDate}</Text>;
            },
        },
        {
            title: 'Created',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {date ? dayjs(date).format('MMM DD, YYYY') : 'N/A'}
                </Text>
            ),
        },
        ...(userType === 'staff' ? [{
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role) => (
                <Tag color={role === 'Super Admin' ? 'purple' : 'blue'}>
                    {role || 'Admin'}
                </Tag>
            ),
        }] : []),
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Tooltip title={record.active ? 'Disable User' : 'Enable User'}>
                        <Button
                            type="text"
                            icon={record.active ? <LockOutlined style={{ color: '#FF9500' }} /> : <UnlockOutlined style={{ color: '#00C853' }} />}
                            onClick={() => handleToggleStatus(record.username, record.active)}
                        />
                    </Tooltip>
                    <Tooltip title="Edit User">
                        <Button
                            type="text"
                            icon={<EditOutlined style={{ color: '#00B4D8' }} />}
                            onClick={() => handleEditUser(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this user?"
                        description="This action cannot be undone."
                        onConfirm={() => handleDeleteUser(record.username)}
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="Delete User">
                            <Button
                                type="text"
                                icon={<DeleteOutlined style={{ color: '#ff3b5c' }} />}
                            />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (initialLoading) {
        return (
            <div style={{ padding: '100px 0', textAlign: 'center' }}>
                <Spin size="large" tip="Loading users..." />
            </div>
        );
    }

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <TeamOutlined className="icon" />
                    <h1>Users & Staff</h1>
                </div>
                <p className="page-subtitle">Manage agent users, portal customers, and administrative staff</p>
            </div>

            {/* Stats */}
            <Spin spinning={loading}>
                <div className="stats-row">
                    <div className="stat-card blue">
                        <div className="stat-header">
                            <div className="stat-icon blue">
                                <TeamOutlined />
                            </div>
                            <Button
                                icon={<ReloadOutlined />}
                                size="small"
                                type="text"
                                onClick={fetchData}
                                loading={loading}
                            />
                        </div>
                        <div className="stat-value">{stats.totalUsers}</div>
                        <div className="stat-label">Total Users</div>
                    </div>

                    <div className="stat-card green">
                        <div className="stat-header">
                            <div className="stat-icon green">
                                <UserOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{stats.activeUsers}</div>
                        <div className="stat-label">Active Users</div>
                    </div>

                    <div className="stat-card orange">
                        <div className="stat-header">
                            <div className="stat-icon orange">
                                <LockOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{stats.inactiveUsers}</div>
                        <div className="stat-label">Disabled</div>
                    </div>

                    <div className="stat-card purple">
                        <div className="stat-header">
                            <div className="stat-icon purple">
                                <DollarOutlined />
                            </div>
                        </div>
                        <div className="stat-value">KSH {stats.totalRevenue.toLocaleString()}</div>
                        <div className="stat-label">Total Revenue</div>
                    </div>
                </div>
            </Spin>

            {/* Actions */}
            <div className="quick-actions">
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddUser}>
                    Add User
                </Button>
                <Search
                    placeholder="Search users..."
                    style={{ width: 300 }}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
                <Select
                    value={filterStatus}
                    onChange={setFilterStatus}
                    style={{ width: 150 }}
                    options={[
                        { value: 'all', label: 'All Status' },
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Disabled' },
                    ]}
                />
            </div>

            {/* Users Table */}
            <Tabs
                activeKey={userType}
                onChange={setUserType}
                className="user-tabs"
                items={[
                    {
                        key: 'agent',
                        label: (
                            <span>
                                <DesktopOutlined />
                                Agent Users
                            </span>
                        ),
                    },
                    {
                        key: 'portal',
                        label: (
                            <span>
                                <GlobalOutlined />
                                Portal Users
                            </span>
                        ),
                    },
                    ...(isSuperAdmin ? [{
                        key: 'staff',
                        label: (
                            <span>
                                <TeamOutlined />
                                Admin Staff
                            </span>
                        ),
                    }] : []),
                ]}
            />

            <Card
                title={
                    <Space>
                        {userType === 'agent' && <DesktopOutlined style={{ color: '#00B4D8' }} />}
                        {userType === 'portal' && <GlobalOutlined style={{ color: '#FFB703' }} />}
                        {userType === 'staff' && <TeamOutlined style={{ color: '#7209B7' }} />}
                        <span>
                            {userType === 'agent' && 'Agent Users'}
                            {userType === 'portal' && 'Portal Users'}
                            {userType === 'staff' && 'Admin Staff'}
                        </span>
                        <Badge
                            count={users.length}
                            style={{
                                backgroundColor: userType === 'agent' ? '#00B4D8' : userType === 'portal' ? '#FFB703' : '#7209B7'
                            }}
                        />
                    </Space>
                }
            >
                {filteredUsers.length === 0 && !loading ? (
                    <Empty
                        description={
                            <span>
                                No users found
                                <br />
                                <Text type="secondary">Create users to allow them to log in to computers</Text>
                            </span>
                        }
                    >
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddUser}>
                            Add First User
                        </Button>
                    </Empty>
                ) : (
                    <Table
                        columns={columns}
                        dataSource={filteredUsers}
                        rowKey="username"
                        loading={loading}
                        pagination={{ pageSize: 10 }}
                    />
                )}
            </Card>

            {/* Add/Edit User Modal */}
            <Modal
                title={
                    <Space>
                        {editingUser ? <EditOutlined style={{ color: '#00B4D8' }} /> : <PlusOutlined style={{ color: '#00C853' }} />}
                        <span>{editingUser ? 'Edit User' : 'Add New User'}</span>
                    </Space>
                }
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={() => form.submit()}
                okText={editingUser ? 'Update' : 'Create'}
                width={500}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    initialValues={{ active: true }}
                >
                    <Form.Item
                        name="username"
                        label="Username"
                        rules={[
                            { required: true, message: 'Username is required' },
                            { min: 3, message: 'Username must be at least 3 characters' },
                            { pattern: /^[a-zA-Z0-9_]+$/, message: 'Only letters, numbers, and underscores allowed' },
                        ]}
                    >
                        <Input
                            prefix={<UserOutlined />}
                            placeholder="username"
                            disabled={!!editingUser}
                        />
                    </Form.Item>

                    <Form.Item
                        name="name"
                        label="Display Name"
                        rules={[{ required: true, message: 'Display name is required' }]}
                    >
                        <Input prefix={<UserOutlined />} placeholder="John Doe" />
                    </Form.Item>

                    <Form.Item
                        name="email"
                        label="Email Address"
                        rules={[
                            { required: true, message: 'Email is required' },
                            { type: 'email', message: 'Enter a valid email' }
                        ]}
                    >
                        <Input prefix={<MailOutlined />} placeholder="user@example.com" />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        label={editingUser ? "New Password (leave blank to keep current)" : "Password"}
                        rules={editingUser ? [] : [
                            { required: true, message: 'Password is required' },
                            { min: 6, message: 'Password must be at least 6 characters' },
                        ]}
                    >
                        <Input.Password
                            prefix={<KeyOutlined />}
                            placeholder={editingUser ? "••••••••" : "Enter password"}
                        />
                    </Form.Item>

                    {userType === 'staff' && (
                        <Form.Item
                            name="role"
                            label="Staff Role"
                            rules={[{ required: true, message: 'Role is required' }]}
                        >
                            <Select
                                options={[
                                    { value: 'Admin', label: 'Admin (Standard)' },
                                    { value: 'Staff', label: 'Staff (Limited)' },
                                    { value: 'Super Admin', label: 'Super Admin (Full Control)' },
                                ]}
                            />
                        </Form.Item>
                    )}

                    {editingUser && (
                        <Form.Item
                            name="active"
                            label="Status"
                            valuePropName="checked"
                        >
                            <Switch
                                checkedChildren="Active"
                                unCheckedChildren="Disabled"
                            />
                        </Form.Item>
                    )}
                </Form>
            </Modal>
        </div>
    );
}

export default Users;
