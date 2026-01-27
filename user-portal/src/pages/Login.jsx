import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { loginUserStep1, loginUserStep2, setUserToken } from '../services/api';

const { Title } = Typography;

export default function Login() {
  const [step, setStep] = useState(1);
  const [tempToken, setTempToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [step1Form] = Form.useForm();
  const [step2Form] = Form.useForm();

  const onStep1Finish = async (values) => {
    setError(null);
    setLoading(true);
    try {
      const data = await loginUserStep1(values.username, values.password);
      if (data && data.tempToken) {
        setTempToken(data.tempToken);
        setStep(2);
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Step 1 failed.');
    } finally {
      setLoading(false);
    }
  };

  const onStep2Finish = async (values) => {
    setError(null);
    setLoading(true);
    try {
      const data = await loginUserStep2(tempToken, values.otp);
      if (data && data.token) {
        setUserToken(data.token);
        // simple confirmation; in a real app you'd redirect
        Notification.success({ message: 'Logged in', description: 'Welcome to HawkNine.' });
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Step 2 failed.');
    } finally {
      setLoading(false);
    }
  };

  // Simple notification util to avoid extra imports
  const Notification = {
    success: ({ message, description }) => {
      // Fallback to console; in real app, use antd message/notification
      console.log(message + (description ? ': ' + description : ''));
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Card style={{ width: 520 }} loading={loading}>
        <Title level={3} style={{ textAlign: 'center' }}>Sign in to HawkNine</Title>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

        {step === 1 && (
          <Form form={step1Form} layout="vertical" onFinish={onStep1Finish}>
            <Form.Item name="username" label="Username" rules={[{ required: true }] }>
              <Input prefix={<UserOutlined />} placeholder="Username" />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true }] }>
              <Input.Password prefix={<LockOutlined />} placeholder="Password" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block>Login Step 1</Button>
            </Form.Item>
          </Form>
        )}

        {step === 2 && (
          <Form form={step2Form} layout="vertical" onFinish={onStep2Finish}>
            <Form.Item name="otp" label="OTP" rules={[{ required: true }] }>
              <Input placeholder="Enter OTP from email" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block>Verify OTP</Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
}
