import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Switch, Space, Tag, message, Popconfirm, Row, Col, Statistic, Alert, Badge, Tooltip, Typography, Divider } from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ShoppingCartOutlined,
    SettingOutlined,
    WarningOutlined,
    CheckCircleOutlined,
    MailOutlined,
    ReloadOutlined,
    DollarOutlined,
    InboxOutlined
} from '@ant-design/icons';
import { getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, getInventorySettings, updateInventorySettings, connectSocket } from '../services/api';

const { Text, Title } = Typography;
const formatKSH = (val) => `KSH ${val?.toLocaleString()}`;

function Inventory() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [settings, setSettings] = useState({ showTotalItemsToUser: true, lowStockEmailEnabled: true });

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
            if (data) setSettings(prev => ({ ...prev, ...data }));
        } catch (error) {
            console.error('Failed to fetch settings');
        }
    };

    useEffect(() => {
        fetchInventory();
        fetchSettings();

        // Listen for low stock alerts
        const socket = connectSocket({
            onConnect: () => console.log('Connected for inventory alerts'),
        });

        socket.on('low-stock-alert', (data) => {
            message.warning({
                content: `⚠️ Low Stock Alert: ${data.itemName} (${data.currentStock} remaining)`,
                duration: 10
            });
            fetchInventory();
        });

        return () => socket?.disconnect();
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

    const handleUpdateSettings = async (key, value) => {
        try {
            const newSettings = { ...settings, [key]: value };
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
            render: (text, record) => (
                <Space>
                    <strong>{text}</strong>
                    {record.stock === 0 && <Tag color="red">OUT OF STOCK</Tag>}
                </Space>
            )
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
            render: (price) => <Text strong style={{ color: '#00B4D8' }}>{formatKSH(price)}</Text>
        },
        {
            title: 'Stock',
            dataIndex: 'stock',
            key: 'stock',
            sorter: (a, b) => a.stock - b.stock,
            render: (stock, record) => {
                const isLow = stock <= (record.lowStockThreshold || 5);
                const isOut = stock === 0;
                return (
                    <Tooltip title={isLow ? `Alert threshold: ${record.lowStockThreshold}` : ''}>
                        <Tag
                            color={isOut ? 'red' : isLow ? 'volcano' : 'green'}
                            icon={isLow ? <WarningOutlined /> : null}
                        >
                            {stock} units
                        </Tag>
                    </Tooltip>
                );
            }
        },
        {
            title: 'Stock Value',
            key: 'value',
            render: (_, record) => (
                <Text type="secondary">{formatKSH(record.price * record.stock)}</Text>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Tooltip title="Edit">
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    </Tooltip>
                    <Popconfirm title="Delete this item?" onConfirm={() => handleDelete(record._id)} okButtonProps={{ danger: true }}>
                        <Tooltip title="Delete">
                            <Button icon={<DeleteOutlined />} danger />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const totalStockValue = items.reduce((acc, item) => acc + (item.price * item.stock), 0);
    const totalUnits = items.reduce((acc, item) => acc + item.stock, 0);
    const lowStockItems = items.filter(item => item.stock <= (item.lowStockThreshold || 5) && item.stock > 0);
    const outOfStockItems = items.filter(item => item.stock === 0);

    return (
        <div>
            <div className="page-header">
                <div className="page-title">
                    <ShoppingCartOutlined className="icon" />
                    <h1>Inventory Management</h1>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchInventory} loading={loading}>Refresh</Button>
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

            {/* Low Stock Alert Banner */}
            {lowStockItems.length > 0 && (
                <Alert
                    message={`⚠️ ${lowStockItems.length} item(s) running low on stock`}
                    description={
                        <Space wrap>
                            {lowStockItems.map(item => (
                                <Tag key={item._id} color="volcano">
                                    {item.name}: {item.stock} left
                                </Tag>
                            ))}
                        </Space>
                    }
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            {outOfStockItems.length > 0 && (
                <Alert
                    message={`🚫 ${outOfStockItems.length} item(s) out of stock`}
                    description={
                        <Space wrap>
                            {outOfStockItems.map(item => (
                                <Tag key={item._id} color="red">{item.name}</Tag>
                            ))}
                        </Space>
                    }
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            {/* Stats */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic
                            title="Total Items"
                            value={items.length}
                            prefix={<InboxOutlined style={{ color: '#00B4D8' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic
                            title="Total Units"
                            value={totalUnits}
                            suffix="units"
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic
                            title="Total Stock Value"
                            value={totalStockValue}
                            prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
                            formatter={(val) => `KSH ${val?.toLocaleString()}`}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic
                            title="Low Stock Items"
                            value={lowStockItems.length + outOfStockItems.length}
                            valueStyle={{ color: lowStockItems.length + outOfStockItems.length > 0 ? '#cf1322' : '#3f8600' }}
                            prefix={<WarningOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            <Card>
                <Table
                    columns={columns}
                    dataSource={items}
                    rowKey="_id"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    rowClassName={(record) => record.stock <= (record.lowStockThreshold || 5) ? 'low-stock-row' : ''}
                />
            </Card>

            {/* Add/Edit Item Modal */}
            <Modal
                title={editingItem ? "Edit Item" : "Add New Item"}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={() => form.submit()}
                okText={editingItem ? "Update" : "Add Item"}
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item name="name" label="Item Name" rules={[{ required: true, message: 'Please enter item name' }]}>
                        <Input placeholder="e.g. A4 Envelope, USB Drive, etc." />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="category" label="Category" initialValue="General">
                                <Input placeholder="e.g. Stationery, Electronics" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="price" label="Selling Price (KSH)" rules={[{ required: true, message: 'Enter price' }]}>
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={0}
                                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    parser={value => value.replace(/\$\s?|(,*)/g, '')}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="stock" label={editingItem ? "Current Stock" : "Opening Stock"} rules={[{ required: true, message: 'Enter stock quantity' }]}>
                                <InputNumber style={{ width: '100%' }} min={0} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="lowStockThreshold" label="Low Stock Alert Threshold" initialValue={5}>
                                <InputNumber style={{ width: '100%' }} min={1} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="description" label="Description (Optional)">
                        <Input.TextArea rows={2} placeholder="Brief description of the item..." />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Settings Modal */}
            <Modal
                title={<><SettingOutlined /> Inventory Settings</>}
                open={settingsVisible}
                footer={null}
                onCancel={() => setSettingsVisible(false)}
                width={500}
            >
                <Form layout="vertical">
                    <Form.Item label="User Portal Visibility">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span>Show available stock quantity to users</span>
                            <Switch
                                checked={settings.showTotalItemsToUser}
                                onChange={(checked) => handleUpdateSettings('showTotalItemsToUser', checked)}
                            />
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            When enabled, users can see how many units are available in the Store page.
                        </Text>
                    </Form.Item>

                    <Divider />

                    <Form.Item label={<Space><MailOutlined /> Email Notifications</Space>}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span>Send low stock email alerts</span>
                            <Switch
                                checked={settings.lowStockEmailEnabled}
                                onChange={(checked) => handleUpdateSettings('lowStockEmailEnabled', checked)}
                            />
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Receive email notifications when items fall below their low stock threshold.
                        </Text>
                        {settings.lowStockEmailEnabled && (
                            <div style={{ marginTop: 12, padding: 12, background: 'rgba(0, 180, 216, 0.1)', borderRadius: 8 }}>
                                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                                <Text>Alerts will be sent to the admin email configured in the system.</Text>
                            </div>
                        )}
                    </Form.Item>
                </Form>
            </Modal>

            <style>{`
                .low-stock-row {
                    background: rgba(255, 77, 79, 0.05) !important;
                }
                .low-stock-row:hover td {
                    background: rgba(255, 77, 79, 0.1) !important;
                }
            `}</style>
        </div>
    );
}

export default Inventory;
