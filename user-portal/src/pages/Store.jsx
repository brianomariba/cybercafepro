import { useState, useEffect } from 'react';
import { Card, Button, Typography, Tag, Row, Col, message, Spin, Statistic, Empty, Modal, Input } from 'antd';
import { ShoppingCartOutlined, ShopOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { getInventory, getInventorySettings, purchaseItem } from '../services/api';

const { Title, Text } = Typography;
const { Meta } = Card;

function Store({ isDarkMode }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({ showTotalItemsToUser: true });

    // Purchase Modal
    const [activeItem, setActiveItem] = useState(null);
    const [confirmVisible, setConfirmVisible] = useState(false);
    const [reason, setReason] = useState('');
    const [purchasing, setPurchasing] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [itemsData, settingsData] = await Promise.all([
                getInventory(),
                getInventorySettings()
            ]);
            setItems(itemsData);
            if (settingsData) setSettings(settingsData);
        } catch (error) {
            message.error('Failed to load store items');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleBuyClick = (item) => {
        setActiveItem(item);
        setReason('');
        setConfirmVisible(true);
    };

    const handleConfirmPurchase = async () => {
        if (!activeItem) return;
        setPurchasing(true);
        try {
            await purchaseItem(activeItem._id, 1, reason);
            message.success(`Successfully sold 1 ${activeItem.name}`);
            setConfirmVisible(false);
            fetchData(); // Refresh stock
        } catch (error) {
            console.error(error);
            message.error('Purchase failed. Please try again.');
        }
        setPurchasing(false);
    };

    const cardStyle = {
        background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#f0f0f0',
        borderRadius: 8
    };

    return (
        <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <Title level={2} style={{ color: isDarkMode ? '#fff' : '#000', marginBottom: 0 }}>
                        <ShopOutlined /> Store & Supplies
                    </Title>
                    <Text type="secondary">Browse and record sold items for accountability</Text>
                </div>
                <Button type="primary" onClick={fetchData}>Refresh</Button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                    <Spin size="large" />
                </div>
            ) : (
                <>
                    {items.length === 0 ? (
                        <Empty description="No items in stock" />
                    ) : (
                        <Row gutter={[16, 16]}>
                            {items.map(item => (
                                <Col xs={24} sm={12} md={8} lg={6} key={item._id}>
                                    <Card style={cardStyle} hoverable>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                            <Title level={4} style={{ color: isDarkMode ? '#fff' : '#000', margin: 0 }}>
                                                {item.name}
                                            </Title>
                                            <Tag color="#00B4D8">KSH {item.price}</Tag>
                                        </div>
                                        <Text type="secondary" style={{ display: 'block', margin: '8px 0', minHeight: 40 }}>
                                            {item.description || "No description"}
                                        </Text>

                                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            {settings.showTotalItemsToUser && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <InfoCircleOutlined style={{ color: isDarkMode ? '#94A3B8' : '#8c8c8c' }} />
                                                    <Text style={{ color: isDarkMode ? '#94A3B8' : '#8c8c8c' }}>
                                                        {item.stock} left
                                                    </Text>
                                                </div>
                                            )}

                                            <Button
                                                type="primary"
                                                icon={<ShoppingCartOutlined />}
                                                onClick={() => handleBuyClick(item)}
                                                disabled={item.stock <= 0}
                                                style={{ marginLeft: 'auto' }}
                                            >
                                                Sell Item
                                            </Button>
                                        </div>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    )}
                </>
            )}

            <Modal
                title={`Confirm Sale: ${activeItem?.name}`}
                open={confirmVisible}
                onOk={handleConfirmPurchase}
                onCancel={() => setConfirmVisible(false)}
                confirmLoading={purchasing}
                okText="Confirm Sale"
            >
                <p>Price: <strong>KSH {activeItem?.price}</strong></p>
                <p>This will deduct 1 unit from stock and record a transaction.</p>
                <div style={{ marginTop: 16 }}>
                    <Text strong>Optional Reason/Note:</Text>
                    <Input
                        placeholder="e.g. For client sitting at PC-5"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        style={{ marginTop: 8 }}
                    />
                </div>
            </Modal>
        </div>
    );
}

export default Store;
