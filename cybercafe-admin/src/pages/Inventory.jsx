import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Switch, Space, Tag, message, Popconfirm, Row, Col, Statistic, Alert, Badge, Tooltip, Typography, Divider, Tabs } from 'antd';
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
    InboxOutlined,
    HistoryOutlined,
    UserOutlined,
    ArrowRightOutlined,
    ClockCircleOutlined
} from '@ant-design/icons';
import { getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, getInventorySettings, updateInventorySettings, sellInventoryItem, connectSocket, getTransactions } from '../services/api';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const { Text, Title } = Typography;
const formatKSH = (val) => `KSH ${val?.toLocaleString()}`;

function Inventory() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [settings, setSettings] = useState({ showTotalItemsToUser: true, lowStockEmailEnabled: true });

    // Sell Item State
    const [sellModalVisible, setSellModalVisible] = useState(false);
    const [sellingItem, setSellingItem] = useState(null);
    const [lastSaleResult, setLastSaleResult] = useState(null);

    // Sale History State
    const [salesHistory, setSalesHistory] = useState([]);
    const [salesLoading, setSalesLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('inventory');

    const [form] = Form.useForm();
    const [sellForm] = Form.useForm();

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

    const fetchSalesHistory = async () => {
        setSalesLoading(true);
        try {
            const data = await getTransactions({ type: 'inventory-sale', limit: 200 });
            // Ensure data is an array
            const sales = Array.isArray(data) ? data : (data?.transactions || []);
            setSalesHistory(sales);
        } catch (error) {
            console.error('Failed to fetch sales history:', error);
            setSalesHistory([]);
        }
        setSalesLoading(false);
    };

    useEffect(() => {
        fetchInventory();
        fetchSettings();
        fetchSalesHistory();

        // Listen for real-time updates
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

        socket.on('inventory-update', () => {
            fetchInventory();
        });

        socket.on('transaction-created', (txn) => {
            if (txn?.type === 'inventory-sale') {
                setSalesHistory(prev => [txn, ...prev]);
            }
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

    const handleSell = (item) => {
        setSellingItem(item);
        setLastSaleResult(null);
        sellForm.setFieldsValue({ quantity: 1, reason: '' });
        setSellModalVisible(true);
    };

    const submitSell = async (values) => {
        if (!sellingItem) return;
        try {
            const result = await sellInventoryItem(sellingItem._id, {
                quantity: values.quantity,
                reason: values.reason,
                clientId: 'admin' // Indicate this sale was made from the admin panel
            });

            // Show sale result with computation
            setLastSaleResult({
                itemName: sellingItem.name,
                quantity: values.quantity,
                unitPrice: sellingItem.price,
                totalAmount: sellingItem.price * values.quantity,
                previousStock: result.item?.previousStock,
                currentStock: result.item?.currentStock,
                seller: result.transaction?.seller || 'admin',
                reason: values.reason
            });

            message.success(`Sold ${values.quantity}x ${sellingItem.name}`);
            fetchInventory();
            fetchSalesHistory();
        } catch (error) {
            console.error(error);
            message.error(error.response?.data?.error || 'Sale failed');
        }
    };

    // Inventory table columns
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
                    <Tooltip title="Sell Item">
                        <Button
                            type="primary"
                            ghost
                            icon={<DollarOutlined />}
                            onClick={() => handleSell(record)}
                            disabled={record.stock <= 0}
                        />
                    </Tooltip>
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

    // Sale History table columns
    const salesColumns = [
        {
            title: 'Date & Time',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 180,
            render: (date) => (
                <Tooltip title={dayjs(date).format('MMM D, YYYY hh:mm A')}>
                    <Space direction="vertical" size={0}>
                        <Text style={{ fontSize: 13 }}>{dayjs(date).format('MMM D, YYYY')}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(date).format('hh:mm A')} • {dayjs(date).fromNow()}</Text>
                    </Space>
                </Tooltip>
            ),
            sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
            defaultSortOrder: 'descend'
        },
        {
            title: 'Item',
            dataIndex: 'itemName',
            key: 'itemName',
            render: (name) => (
                <Space>
                    <ShoppingCartOutlined style={{ color: '#00B4D8' }} />
                    <Text strong>{name || 'Unknown Item'}</Text>
                </Space>
            ),
            filters: [...new Set(salesHistory.map(s => s.itemName).filter(Boolean))].map(name => ({
                text: name,
                value: name
            })),
            onFilter: (value, record) => record.itemName === value,
        },
        {
            title: 'Sold By',
            dataIndex: 'seller',
            key: 'seller',
            width: 160,
            render: (seller) => (
                <Tag
                    icon={<UserOutlined />}
                    color={seller === 'admin' ? 'blue' : 'purple'}
                    style={{ fontSize: 13 }}
                >
                    {seller || 'Unknown'}
                </Tag>
            ),
            filters: [...new Set(salesHistory.map(s => s.seller).filter(Boolean))].map(seller => ({
                text: seller,
                value: seller
            })),
            onFilter: (value, record) => record.seller === value,
        },
        {
            title: 'Computation',
            key: 'computation',
            width: 320,
            render: (_, record) => {
                const qty = record.quantity || 0;
                const total = record.amount || 0;
                const unitPrice = qty > 0 ? Math.round(total / qty) : 0;
                return (
                    <div style={{
                        background: 'rgba(82, 196, 26, 0.08)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        border: '1px solid rgba(82, 196, 26, 0.2)'
                    }}>
                        <Space size={4} align="center">
                            <Tag color="blue" style={{ margin: 0 }}>{qty}x</Tag>
                            <Text type="secondary">×</Text>
                            <Text>KSH {unitPrice.toLocaleString()}</Text>
                            <ArrowRightOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                            <Text strong style={{ color: '#52c41a', fontSize: 15 }}>
                                KSH {total.toLocaleString()}
                            </Text>
                        </Space>
                    </div>
                );
            }
        },
        {
            title: 'Reason / Buyer',
            dataIndex: 'reason',
            key: 'reason',
            width: 180,
            render: (reason) => (
                <Text type="secondary" style={{ fontSize: 13 }}>
                    {reason || '—'}
                </Text>
            )
        },
    ];

    const totalStockValue = items.reduce((acc, item) => acc + (item.price * item.stock), 0);
    const totalUnits = items.reduce((acc, item) => acc + item.stock, 0);
    const lowStockItems = items.filter(item => item.stock <= (item.lowStockThreshold || 5) && item.stock > 0);
    const outOfStockItems = items.filter(item => item.stock === 0);

    // Sales summary stats
    const todayStart = dayjs().startOf('day');
    const todaySales = salesHistory.filter(s => dayjs(s.createdAt).isAfter(todayStart));
    const todayRevenue = todaySales.reduce((sum, s) => sum + (s.amount || 0), 0);
    const totalSalesRevenue = salesHistory.reduce((sum, s) => sum + (s.amount || 0), 0);

    return (
        <div>
            <div className="page-header">
                <div className="page-title">
                    <ShoppingCartOutlined className="icon" />
                    <h1>Inventory Management</h1>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => { fetchInventory(); fetchSalesHistory(); }} loading={loading}>Refresh</Button>
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

            {/* Tabs: Inventory / Sale History */}
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: 'inventory',
                        label: (
                            <span>
                                <InboxOutlined style={{ marginRight: 6 }} />
                                Inventory Items
                            </span>
                        ),
                        children: (
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
                        )
                    },
                    {
                        key: 'sales',
                        label: (
                            <span>
                                <HistoryOutlined style={{ marginRight: 6 }} />
                                Sale History
                                <Badge count={todaySales.length} style={{ marginLeft: 8, backgroundColor: '#52c41a' }} />
                            </span>
                        ),
                        children: (
                            <div>
                                {/* Sales Summary Stats */}
                                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                                    <Col xs={12} sm={8}>
                                        <Card size="small" style={{ background: 'rgba(82, 196, 26, 0.05)', border: '1px solid rgba(82, 196, 26, 0.2)' }}>
                                            <Statistic
                                                title="Today's Sales"
                                                value={todaySales.length}
                                                prefix={<ShoppingCartOutlined style={{ color: '#52c41a' }} />}
                                                suffix="items"
                                            />
                                        </Card>
                                    </Col>
                                    <Col xs={12} sm={8}>
                                        <Card size="small" style={{ background: 'rgba(0, 180, 216, 0.05)', border: '1px solid rgba(0, 180, 216, 0.2)' }}>
                                            <Statistic
                                                title="Today's Revenue"
                                                value={todayRevenue}
                                                prefix={<DollarOutlined style={{ color: '#00B4D8' }} />}
                                                formatter={(val) => `KSH ${val?.toLocaleString()}`}
                                            />
                                        </Card>
                                    </Col>
                                    <Col xs={12} sm={8}>
                                        <Card size="small" style={{ background: 'rgba(123, 44, 191, 0.05)', border: '1px solid rgba(123, 44, 191, 0.2)' }}>
                                            <Statistic
                                                title="All-Time Sales Revenue"
                                                value={totalSalesRevenue}
                                                prefix={<DollarOutlined style={{ color: '#7B2CBF' }} />}
                                                formatter={(val) => `KSH ${val?.toLocaleString()}`}
                                            />
                                        </Card>
                                    </Col>
                                </Row>

                                <Card
                                    title={
                                        <Space>
                                            <HistoryOutlined />
                                            <span>Recent Sales</span>
                                            <Badge count={salesHistory.length} style={{ backgroundColor: '#00B4D8' }} />
                                        </Space>
                                    }
                                    extra={
                                        <Button
                                            icon={<ReloadOutlined />}
                                            onClick={fetchSalesHistory}
                                            loading={salesLoading}
                                            size="small"
                                        >
                                            Refresh
                                        </Button>
                                    }
                                >
                                    <Table
                                        columns={salesColumns}
                                        dataSource={salesHistory}
                                        rowKey={(record) => record._id || record.id}
                                        loading={salesLoading}
                                        pagination={{ pageSize: 20 }}
                                        scroll={{ x: 900 }}
                                        locale={{ emptyText: 'No sales recorded yet. Sell an item to see history here.' }}
                                    />
                                </Card>
                            </div>
                        )
                    }
                ]}
            />

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

            {/* Sell Item Modal */}
            <Modal
                title={
                    <Space>
                        <DollarOutlined style={{ color: '#52c41a' }} />
                        <span>Sell Item: {sellingItem?.name}</span>
                    </Space>
                }
                open={sellModalVisible}
                onCancel={() => {
                    setSellModalVisible(false);
                    setSellingItem(null);
                    setLastSaleResult(null);
                }}
                footer={lastSaleResult ? [
                    <Button key="close" type="primary" onClick={() => {
                        setSellModalVisible(false);
                        setSellingItem(null);
                        setLastSaleResult(null);
                    }}>
                        Done
                    </Button>
                ] : undefined}
                onOk={lastSaleResult ? undefined : () => sellForm.submit()}
                okText="Complete Sale"
                okButtonProps={{ type: 'primary', style: { background: '#52c41a' } }}
                width={520}
            >
                {lastSaleResult ? (
                    // Show sale result with computation
                    <div>
                        <Alert
                            message="Sale Completed Successfully! ✅"
                            type="success"
                            showIcon
                            style={{ marginBottom: 16 }}
                        />

                        <Card
                            size="small"
                            style={{
                                background: 'linear-gradient(135deg, rgba(82, 196, 26, 0.05), rgba(0, 180, 216, 0.05))',
                                border: '1px solid rgba(82, 196, 26, 0.2)'
                            }}
                        >
                            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                <Title level={4} style={{ margin: 0, color: '#52c41a' }}>
                                    {lastSaleResult.itemName}
                                </Title>
                            </div>

                            {/* Arithmetic Computation */}
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.8)',
                                borderRadius: 12,
                                padding: '16px 20px',
                                textAlign: 'center',
                                marginBottom: 16,
                                border: '1px dashed rgba(0, 180, 216, 0.3)'
                            }}>
                                <Space size={12} align="center" style={{ fontSize: 18 }}>
                                    <span style={{ fontWeight: 600, color: '#1890ff' }}>{lastSaleResult.quantity}</span>
                                    <span style={{ color: '#8c8c8c' }}>×</span>
                                    <span style={{ fontWeight: 500 }}>KSH {lastSaleResult.unitPrice?.toLocaleString()}</span>
                                    <span style={{ color: '#8c8c8c' }}>=</span>
                                    <span style={{ fontWeight: 700, color: '#52c41a', fontSize: 22 }}>
                                        KSH {lastSaleResult.totalAmount?.toLocaleString()}
                                    </span>
                                </Space>
                            </div>

                            {/* Details */}
                            <Row gutter={[16, 12]}>
                                <Col span={12}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Sold By</Text>
                                    <div>
                                        <Tag icon={<UserOutlined />} color="blue" style={{ fontSize: 13 }}>
                                            {lastSaleResult.seller}
                                        </Tag>
                                    </div>
                                </Col>
                                <Col span={12}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Stock Change</Text>
                                    <div>
                                        <Space size={4}>
                                            <Tag color="orange">{lastSaleResult.previousStock}</Tag>
                                            <ArrowRightOutlined style={{ fontSize: 10, color: '#8c8c8c' }} />
                                            <Tag color={lastSaleResult.currentStock <= 5 ? 'red' : 'green'}>
                                                {lastSaleResult.currentStock}
                                            </Tag>
                                        </Space>
                                    </div>
                                </Col>
                                {lastSaleResult.reason && (
                                    <Col span={24}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Buyer / Reason</Text>
                                        <div>
                                            <Text>{lastSaleResult.reason}</Text>
                                        </div>
                                    </Col>
                                )}
                            </Row>
                        </Card>
                    </div>
                ) : (
                    // Show sell form
                    <>
                        <Alert
                            message={`Current Stock: ${sellingItem?.stock} units`}
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                        />
                        <Form form={sellForm} layout="vertical" onFinish={submitSell}>
                            <Form.Item
                                name="quantity"
                                label="Quantity"
                                initialValue={1}
                                rules={[
                                    { required: true, message: 'Enter quantity' },
                                    { type: 'number', min: 1, max: sellingItem?.stock, message: `Max quantity is ${sellingItem?.stock}` }
                                ]}
                            >
                                <InputNumber style={{ width: '100%' }} min={1} max={sellingItem?.stock} autoFocus />
                            </Form.Item>
                            <Form.Item name="reason" label="Buyer / Reason (Optional)">
                                <Input placeholder="e.g. Walk-in Customer" />
                            </Form.Item>

                            <div style={{ marginTop: 16, padding: 12, background: 'rgba(82, 196, 26, 0.1)', borderRadius: 8, textAlign: 'right' }}>
                                <Form.Item shouldUpdate style={{ marginBottom: 0 }}>
                                    {() => {
                                        const qty = sellForm.getFieldValue('quantity') || 0;
                                        const price = sellingItem?.price || 0;
                                        return (
                                            <div>
                                                <Text type="secondary" style={{ marginRight: 8 }}>
                                                    {qty} × KSH {price.toLocaleString()} =
                                                </Text>
                                                <Text strong style={{ fontSize: 18, color: '#52c41a' }}>
                                                    KSH {(qty * price).toLocaleString()}
                                                </Text>
                                            </div>
                                        );
                                    }}
                                </Form.Item>
                            </div>
                        </Form>
                    </>
                )}
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
