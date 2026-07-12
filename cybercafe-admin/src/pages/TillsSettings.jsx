import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Switch, Space, Typography, Popconfirm, message, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ShopOutlined, UserOutlined, ApiOutlined } from '@ant-design/icons';
import { getTills, createTill, updateTill, deleteTill, getAgentUsers, registerC2BUrls } from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

export default function TillsSettings() {
    const [tills, setTills] = useState([]);
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingTill, setEditingTill] = useState(null);
    const [form] = Form.useForm();

    const loadData = async () => {
        setLoading(true);
        try {
            const [tillsData, agentsData] = await Promise.all([
                getTills().catch(() => []),
                getAgentUsers().catch(() => [])
            ]);
            setTills(tillsData);
            setAgents(agentsData);
        } catch (error) {
            message.error('Failed to load tills data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleAdd = () => {
        setEditingTill(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (till) => {
        setEditingTill(till);
        form.setFieldsValue({
            ...till,
            agents: till.agents || []
        });
        setModalVisible(true);
    };

    const handleDelete = async (id) => {
        try {
            await deleteTill(id);
            message.success('Till deleted successfully');
            loadData();
        } catch (error) {
            message.error('Failed to delete till');
        }
    };

    const handleSave = async (values) => {
        try {
            if (editingTill) {
                await updateTill(editingTill._id, values);
                message.success('Till updated successfully');
            } else {
                await createTill(values);
                message.success('Till created successfully');
            }
            setModalVisible(false);
            loadData();
        } catch (error) {
            message.error(error.response?.data?.error || 'Failed to save till');
        }
    };

    const columns = [
        {
            title: 'Till Name',
            dataIndex: 'name',
            key: 'name',
            render: (text) => <Text strong>{text}</Text>
        },
        {
            title: 'Till Number',
            dataIndex: 'tillNumber',
            key: 'tillNumber',
            render: (text) => <Tag color="blue">{text}</Tag>
        },
        {
            title: 'Shop',
            dataIndex: 'shop',
            key: 'shop',
            render: (text) => text ? <><ShopOutlined /> {text}</> : <Text type="secondary">N/A</Text>
        },
        {
            title: 'Assigned Agents',
            dataIndex: 'agents',
            key: 'agents',
            render: (agents) => (
                <Space wrap>
                    {agents && agents.length > 0 ? agents.map(a => <Tag key={a} icon={<UserOutlined />}>{a}</Tag>) : <Text type="secondary">None</Text>}
                </Space>
            )
        },
        {
            title: 'Status',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (isActive, record) => (
                <Switch 
                    checked={isActive} 
                    onChange={async (checked) => {
                        try {
                            await updateTill(record._id, { isActive: checked });
                            message.success('Status updated');
                            loadData();
                        } catch (e) {
                            message.error('Failed to update status');
                        }
                    }} 
                />
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm title="Delete this till?" onConfirm={() => handleDelete(record._id)}>
                        <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const handleRegisterC2B = async () => {
        const hide = message.loading('Registering C2B URLs with Safaricom...', 0);
        try {
            await registerC2BUrls();
            hide();
            message.success('C2B Webhook URLs successfully registered with Safaricom!');
        } catch (error) {
            hide();
            message.error(error.response?.data?.error || 'Failed to register C2B URLs');
        }
    };

    return (
        <Card 
            title="Child Tills Management" 
            extra={
                <Space>
                    <Button type="default" icon={<ApiOutlined />} onClick={handleRegisterC2B}>Register C2B URLs</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Add Till</Button>
                </Space>
            }
        >
            <Table 
                columns={columns} 
                dataSource={tills} 
                rowKey="_id" 
                loading={loading}
                pagination={false}
            />

            <Modal
                title={editingTill ? "Edit Till" : "Add New Till"}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={() => form.submit()}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="name" label="Till Name (e.g. Shop A)" rules={[{ required: true, message: 'Please enter till name' }]}>
                        <Input placeholder="Enter till name" />
                    </Form.Item>
                    <Form.Item name="tillNumber" label="Till Number" rules={[{ required: true, message: 'Please enter till number' }]}>
                        <Input placeholder="Enter till shortcode/number" />
                    </Form.Item>
                    <Form.Item name="shop" label="Assign to Shop (Optional)">
                        <Input placeholder="Enter shop name or ID" />
                    </Form.Item>
                    <Form.Item name="agents" label="Assign to Agents">
                        <Select mode="multiple" placeholder="Select agents" allowClear>
                            {agents.map(agent => (
                                <Option key={agent.username} value={agent.username}>
                                    {agent.name} ({agent.username})
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="isActive" label="Active Status" valuePropName="checked" initialValue={true}>
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
}
