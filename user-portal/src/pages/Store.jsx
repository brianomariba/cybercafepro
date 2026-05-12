import { useState, useEffect } from 'react';
import { Card, Button, Typography, Tag, Row, Col, message, Spin, Statistic, Empty, Modal, Input, InputNumber, Badge, Space, Divider, Alert, Radio } from 'antd';
import { ShoppingCartOutlined, ShopOutlined, InfoCircleOutlined, MinusOutlined, PlusOutlined, WarningOutlined, DollarOutlined, MobileOutlined } from '@ant-design/icons';
import { getInventory, getInventorySettings, purchaseItem, connectSocket } from '../services/api';

const { Title, Text } = Typography;

function Store({ isDarkMode }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({ showTotalItemsToUser: true });

    // Purchase Modal
    const [activeItem, setActiveItem] = useState(null);
    const [confirmVisible, setConfirmVisible] = useState(false);
    const [reason, setReason] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [purchasing, setPurchasing] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('cash');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [itemsData, settingsData] = await Promise.all([
                getInventory(),
                getInventorySettings()
            ]);
            setItems(itemsData || []);
            if (settingsData) setSettings(settingsData);
        } catch (error) {
            message.error('Failed to load store items');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();

        // Real-time updates when stock changes
        const socket = connectSocket();

        const handleLowStock = () => {
            fetchData(); // Refresh when stock changes
        };

        socket.on('low-stock-alert', handleLowStock);

        return () => {
            if (socket) {
                socket.off('low-stock-alert', handleLowStock);
            }
        };
    }, []);

    const handleBuyClick = (item) => {
        setActiveItem(item);
        setReason('');
        setQuantity(1);
        setPaymentMethod('cash');
        setConfirmVisible(true);
    };

    const handleConfirmPurchase = async () => {
        if (!activeItem) return;
        if (quantity < 1 || quantity > activeItem.stock) {
            message.error('Invalid quantity');
            return;
        }
        setPurchasing(true);
        try {
            const result = await purchaseItem(activeItem._id, quantity, reason, null, paymentMethod);
            message.success(`Successfully sold ${quantity}x ${activeItem.name}`);
            setConfirmVisible(false);
            fetchData(); // Refresh stock

            // Show low stock warning if applicable
            if (result.item?.lowStockAlert) {
                message.warning(`⚠️ ${activeItem.name} is now low on stock (${result.item.currentStock} remaining)`);
            }
        } catch (error) {
            console.error(error);
            message.error(error.response?.data?.error || 'Sale failed. Please try again.');
        }
        setPurchasing(false);
    };

    const cardStyle = {
        background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#f0f0f0',
        borderRadius: 12,
        overflow: 'hidden'
    };

    const headerStyle = {
        background: isDarkMode
            ? 'linear-gradient(135deg, rgba(0, 180, 216, 0.15), rgba(123, 44, 191, 0.15))'
            : 'linear-gradient(135deg, rgba(0, 180, 216, 0.1), rgba(123, 44, 191, 0.1))',
        padding: '12px 16px',
        marginBottom: 12,
        borderRadius: '8px 8px 0 0'
    };

    // Categorize items
    const categories = [...new Set(items.map(item => item.category))];
    const lowStockItems = items.filter(item => item.stock <= (item.lowStockThreshold || 5) && item.stock > 0);
    const outOfStockItems = items.filter(item => item.stock === 0);

    return (
        <div style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <Title level={2} style={{ color: isDarkMode ? '#fff' : '#000', marginBottom: 0 }}>
                        <ShopOutlined /> Store & Supplies
                    </Title>
                    <Text type="secondary">Record sales and manage inventory items</Text>
                </div>
                <Button type="primary" onClick={fetchData} loading={loading}>Refresh</Button>
            </div>

            {/* Stats */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={8}>
                    <Card size="small" style={cardStyle}>
                        <Statistic
                            title="Total Items"
                            value={items.length}
                            prefix={<ShopOutlined style={{ color: '#00B4D8' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8}>
                    <Card size="small" style={cardStyle}>
                        <Statistic
                            title="In Stock"
                            value={items.filter(i => i.stock > 0).length}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8}>
                    <Card size="small" style={cardStyle}>
                        <Statistic
                            title="Low / Out of Stock"
                            value={lowStockItems.length + outOfStockItems.length}
                            valueStyle={{ color: (lowStockItems.length + outOfStockItems.length) > 0 ? '#ff4d4f' : '#52c41a' }}
                            prefix={<WarningOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                    <Spin size="large" />
                </div>
            ) : (
                <>
                    {items.length === 0 ? (
                        <Empty description="No items in stock. Ask admin to add inventory items." />
                    ) : (
                        <>
                            {/* Items by Category */}
                            {categories.map(category => (
                                <div key={category} style={{ marginBottom: 32 }}>
                                    <Title level={4} style={{ color: isDarkMode ? '#fff' : '#000', marginBottom: 16 }}>
                                        {category}
                                    </Title>
                                    <Row gutter={[16, 16]}>
                                        {items.filter(item => item.category === category).map(item => {
                                            const isLowStock = item.stock <= (item.lowStockThreshold || 5) && item.stock > 0;
                                            const isOutOfStock = item.stock === 0;

                                            return (
                                                <Col xs={24} sm={12} md={8} lg={6} key={item._id}>
                                                    <Badge.Ribbon
                                                        text={isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock" : null}
                                                        color={isOutOfStock ? "red" : "orange"}
                                                        style={{ display: isOutOfStock || isLowStock ? 'block' : 'none' }}
                                                    >
                                                        <Card
                                                            style={{
                                                                ...cardStyle,
                                                                opacity: isOutOfStock ? 0.6 : 1
                                                            }}
                                                            hoverable={!isOutOfStock}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                                                                <Title level={5} style={{ color: isDarkMode ? '#fff' : '#000', margin: 0, flex: 1 }}>
                                                                    {item.name}
                                                                </Title>
                                                                <Tag color="#00B4D8" style={{ marginLeft: 8 }}>
                                                                    KSH {item.price?.toLocaleString()}
                                                                </Tag>
                                                            </div>

                                                            <Text type="secondary" style={{ display: 'block', minHeight: 40, fontSize: 13 }}>
                                                                {item.description || "No description available"}
                                                            </Text>

                                                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                {settings.showTotalItemsToUser && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                                        <Tag
                                                                            color={isOutOfStock ? 'red' : isLowStock ? 'volcano' : 'green'}
                                                                            icon={isLowStock || isOutOfStock ? <WarningOutlined /> : <InfoCircleOutlined />}
                                                                        >
                                                                            {item.stock} left
                                                                        </Tag>
                                                                    </div>
                                                                )}

                                                                <Button
                                                                    type="primary"
                                                                    icon={<ShoppingCartOutlined />}
                                                                    onClick={() => handleBuyClick(item)}
                                                                    disabled={isOutOfStock}
                                                                    style={{ marginLeft: 'auto' }}
                                                                >
                                                                    Sell
                                                                </Button>
                                                            </div>
                                                        </Card>
                                                    </Badge.Ribbon>
                                                </Col>
                                            );
                                        })}
                                    </Row>
                                </div>
                            ))}
                        </>
                    )}
                </>
            )}

            {/* Sale Confirmation Modal */}
            <Modal
                title={
                    <Space>
                        <ShoppingCartOutlined style={{ color: '#00B4D8' }} />
                        <span>Confirm Sale: {activeItem?.name}</span>
                    </Space>
                }
                open={confirmVisible}
                onOk={handleConfirmPurchase}
                onCancel={() => setConfirmVisible(false)}
                confirmLoading={purchasing}
                okText={`Confirm Sale (KSH ${((activeItem?.price || 0) * quantity).toLocaleString()})`}
                okButtonProps={{ disabled: quantity < 1 || quantity > (activeItem?.stock || 0) }}
                width={450}
            >
                <div style={{ padding: '16px 0' }}>
                    {/* Item Info */}
                    <div style={{
                        background: isDarkMode ? 'rgba(0, 180, 216, 0.1)' : 'rgba(0, 180, 216, 0.05)',
                        padding: 16,
                        borderRadius: 8,
                        marginBottom: 16
                    }}>
                        <Row gutter={[16, 8]}>
                            <Col span={12}>
                                <Text type="secondary">Unit Price:</Text>
                                <br />
                                <Text strong style={{ fontSize: 18, color: '#00B4D8' }}>
                                    KSH {activeItem?.price?.toLocaleString()}
                                </Text>
                            </Col>
                            <Col span={12}>
                                <Text type="secondary">Available Stock:</Text>
                                <br />
                                <Text strong style={{ fontSize: 18 }}>
                                    {activeItem?.stock} units
                                </Text>
                            </Col>
                        </Row>
                    </div>

                    {/* Quantity Selector */}
                    <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>Quantity:</Text>
                        <Space>
                            <Button
                                icon={<MinusOutlined />}
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                disabled={quantity <= 1}
                            />
                            <InputNumber
                                min={1}
                                max={activeItem?.stock || 1}
                                value={quantity}
                                onChange={(val) => setQuantity(val || 1)}
                                style={{ width: 80, textAlign: 'center' }}
                            />
                            <Button
                                icon={<PlusOutlined />}
                                onClick={() => setQuantity(Math.min(activeItem?.stock || 1, quantity + 1))}
                                disabled={quantity >= (activeItem?.stock || 0)}
                            />
                        </Space>
                    </div>

                    {/* Total */}
                    <Alert
                        message={
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Text>Total Amount:</Text>
                                <Text strong style={{ fontSize: 20, color: '#52c41a' }}>
                                    KSH {((activeItem?.price || 0) * quantity).toLocaleString()}
                                </Text>
                            </Space>
                        }
                        type="success"
                        style={{ marginBottom: 16 }}
                    />

                    {/* Low stock warning */}
                    {activeItem && (activeItem.stock - quantity) <= activeItem.lowStockThreshold && (
                        <Alert
                            message="This sale will put the item at or below low stock level"
                            type="warning"
                            showIcon
                            style={{ marginBottom: 16 }}
                        />
                    )}

                    {/* Payment Method */}
                    <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>Payment Method:</Text>
                        <Radio.Group value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} buttonStyle="solid" style={{ width: '100%' }}>
                            <Radio.Button value="cash" style={{ width: '50%', textAlign: 'center' }}>
                                <DollarOutlined style={{ marginRight: 6 }} />Cash
                            </Radio.Button>
                            <Radio.Button value="mpesa" style={{ width: '50%', textAlign: 'center' }}>
                                <MobileOutlined style={{ marginRight: 6 }} />M-Pesa
                            </Radio.Button>
                        </Radio.Group>
                    </div>

                    {/* Reason/Note */}
                    <div>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>Note (optional):</Text>
                        <Input.TextArea
                            placeholder="e.g. Sold to client at PC-5, Customer name, etc."
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            rows={2}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
}

export default Store;
