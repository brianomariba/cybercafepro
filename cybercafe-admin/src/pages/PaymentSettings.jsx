import React, { useState, useEffect } from 'react';
import { Card, Form, Select, Button, message, Space, Typography, InputNumber } from 'antd';
import { SaveOutlined, DollarOutlined } from '@ant-design/icons';
import { getSettings, saveSettings } from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

export default function PaymentSettings() {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settingsData = await getSettings();
                form.setFieldsValue({
                    paymentRetentionValue: settingsData.paymentRetentionValue !== undefined ? Number(settingsData.paymentRetentionValue) : 
                        (settingsData.paymentRetentionDays !== undefined ? Number(settingsData.paymentRetentionDays) : 0),
                    paymentRetentionUnit: settingsData.paymentRetentionUnit || 'days',
                    paymentDisplayOption: settingsData.paymentDisplayOption || 'both'
                });
            } catch (error) {
                message.error('Failed to load payment settings');
            }
        };
        loadSettings();
    }, [form]);

    const handleSave = async (values) => {
        setLoading(true);
        try {
            await saveSettings({
                paymentRetentionValue: Number(values.paymentRetentionValue),
                paymentRetentionUnit: values.paymentRetentionUnit,
                paymentDisplayOption: values.paymentDisplayOption
            });
            message.success('Payment settings saved successfully');
        } catch (error) {
            message.error('Failed to save payment settings');
        }
        setLoading(false);
    };

    return (
        <Card title={
            <Space>
                <DollarOutlined style={{ color: '#00C853' }} />
                <span>Payment Management</span>
            </Space>
        }>
            <Form form={form} layout="vertical" onFinish={handleSave}>
                <Form.Item 
                    label="Automatic Deletion (Retention Rules)" 
                    extra="Payment records older than this duration will be automatically deleted. Enter 0 to keep indefinitely."
                >
                    <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="paymentRetentionValue" noStyle>
                            <InputNumber 
                                min={0} 
                                style={{ width: '70%' }} 
                                placeholder="e.g. 30 (0 for indefinitely)"
                            />
                        </Form.Item>
                        <Form.Item name="paymentRetentionUnit" noStyle>
                            <Select style={{ width: '30%' }}>
                                <Option value="minutes">Minutes</Option>
                                <Option value="hours">Hours</Option>
                                <Option value="days">Days</Option>
                                <Option value="weeks">Weeks</Option>
                            </Select>
                        </Form.Item>
                    </Space.Compact>
                </Form.Item>

                <Form.Item 
                    name="paymentDisplayOption" 
                    label="Customer Information Display (During Payment)" 
                    extra="Choose how customer information is displayed to agents when a payment is received."
                >
                    <Select>
                        <Option value="both">Both Name and Number</Option>
                        <Option value="phone">Phone Number Only</Option>
                        <Option value="name">Customer Name Only</Option>
                    </Select>
                </Form.Item>

                <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                        Save Payment Settings
                    </Button>
                </Form.Item>
            </Form>
        </Card>
    );
}
