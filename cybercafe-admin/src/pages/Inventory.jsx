import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Switch, Space, Tag, message, Popconfirm, Row, Col, Statistic } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ShoppingCartOutlined, SettingOutlined } from '@ant-design/icons';
import { getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, getInventorySettings, updateInventorySettings } from '../services/api';

const formatKSH = (val) => `KSH ${val?.toLocaleString()}`;

function Inventory() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [settings, setSettings] = useState({ showTotalItemsToUser: true });

    const [form] = Form.useForm();

    const fetchInventory = async () => {
        setLoading(true);
        try {
            const data = await getInventory();
            setItems(data);
        } catch (error) {
            message.error('Failed to load inventory');
        }
        setLoading(false);
    };

    const fetchSettings = async () => {
        try {
            const data = await getInventorySettings();
            if (data) setSettings(data);
        } catch (error) {
            console.error('Failed to settings');
        }
    };

    useEffect(() => {
        fetchInventory();
        fetchSettings();
    }, []);

    const handleEdit = (item) => {
        setEditingItem(item);
        form.setFieldsValue(item);
        setModalVisible(true);
    };

    const handleDelete = async (id) => {
        try {
            await deleteInventoryItem(id);
            message.success('Item deleted');
            fetchInventory();
        } catch (error) {
            message.error('Failed to delete item');
        }
    };

    const handleCreate = async (values) => {
        try {
            if (editingItem) {
                await updateInventoryItem(editingItem._id, values);
                message.success('Item updated');
            } else {
                await addInventoryItem(values);
                message.success('Item added');
            }
            setModalVisible(false);
            form.resetFields();
            setEditingItem(null);
            fetchInventory();
        } catch (error) {
            message.error('Operation failed');
        }
    };

    const handleUpdateSettings = async (checked) => {
        try {
            const newSettings = { showTotalItemsToUser: checked };
            setSettings(newSettings);
            await updateInventorySettings(newSettings);
            message.success('Settings updated');
        } catch (error) {
            message.error('Failed to update settings');
        }
    };

    const columns = [
        {
            title: 'Item Name',
            dataIndex: 'name',
            key: 'name',
            render: (text) => <strong>{text}</strong>
        },
        {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            render: (cat) => <Tag color="blue">{cat}</Tag>
        },
        {
            title: 'Price',
            dataIndex: 'price',
            key: 'price',
            render: (price) => formatKSH(price)
        },
        {
            title: 'Stock',
            dataIndex: 'stock',
            key: 'stock',
            render: (stock, record) => (
                <Tag color={stock <= (record.lowStockThreshold || 5) ? 'volcano' : 'green'}>
                    {stock} remaining
                </Tag>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm title="Delete item?" onConfirm={() => handleDelete(record._id)}>
                        <Button icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const totalStockValue = items.reduce((acc, item) => acc + (item.price * item.stock), 0);
    const lowStockCount = items.filter(item => item.stock <= (item.lowStockThreshold || 5)).length;

    return (
        <div>
            <div className="page-header">
                <div className="page-title">
                    <ShoppingCartOutlined className="icon" />
                    <h1>Inventory Management</h1>
                </div>
                <Space>
                    <Button icon={<SettingOutlined />} onClick={() => setSettingsVisible(true)}>Settings</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                        setEditingItem(null);
                        form.resetFields();
                        setModalVisible(true);
                    }}>
                        Add Item
                    </Button>
                </Space>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col span={6}>
                    <Card size="small">
                        <Statistic title="Total Items" value={items.length} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small">
                        <Statistic title="Total Stock Value" value={totalStockValue} prefix="KSH" />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small">
                        <Statistic title="Low Stock Items" value={lowStockCount} valueStyle={{ color: lowStockCount > 0 ? '#cf1322' : '#3f8600' }} />
                    </Card>
                </Col>
            </Row>

            <Card>
                <Table
                    columns={columns}
                    dataSource={items}
                    rowKey="_id"
                    loading={loading}
                />
            </Card>

            {/* Add/Edit Item Modal */}
            <Modal
                title={editingItem ? "Edit Item" : "Add New Item"}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={() => form.submit()}
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item name="name" label="Item Name" rules={[{ required: true }]}>
                        <Input placeholder="e.g. A4 Envelope" />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="category" label="Category" initialValue="General">
                                <Input placeholder="e.g. Stationery" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="price" label="Price (KSH)" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="stock" label="Opening Stock" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="lowStockThreshold" label="Low Stock Alert Level" initialValue={5}>
                                <InputNumber style={{ width: '100%' }} min={1} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="description" label="Description">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Settings Modal */}
            <Modal
                title="Inventory Settings"
                open={settingsVisible}
                footer={null}
                onCancel={() => setSettingsVisible(false)}
            >
                <Form layout="vertical">
                    <Form.Item label="User Visibility">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Show total items/stock to users</span>
                            <Switch
                                checked={settings.showTotalItemsToUser}
                                onChange={handleUpdateSettings}
                            />
                        </div>
                        <p style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
                            If enabled, users can see the available quantity of items in their portal.
                        </p>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default Inventory;
