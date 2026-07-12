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
                    paymentRetentionDays: settingsData.paymentRetentionDays !== undefined ? Number(settingsData.paymentRetentionDays) : 0,
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
                paymentRetentionDays: Number(values.paymentRetentionDays),
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
                    name="paymentRetentionDays" 
                    label="Automatic Deletion (Retention Rules)" 
                    extra="Payment records older than this duration will be automatically deleted. Enter 0 to keep indefinitely."
                >
                    <InputNumber 
                        min={0} 
                        style={{ width: '100%' }} 
                        addonAfter="days"
                        placeholder="e.g. 30 (0 for indefinitely)"
                    />
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
