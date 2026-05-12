const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const Transaction = require('./models/Transaction');

module.exports = function(app, io) {
    // Middleware to generate OAuth Token
    const generateToken = async (req, res, next) => {
        const consumerKey = process.env.MPESA_CONSUMER_KEY;
        const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
        
        if (!consumerKey || !consumerSecret) {
            return res.status(500).json({ error: 'M-Pesa credentials missing in server config' });
        }

        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        
        try {
            // Check if sandbox or production
            const url = process.env.MPESA_ENV === 'production' 
                ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
                : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

            const response = await axios.get(url, {
                headers: {
                    Authorization: `Basic ${auth}`
                }
            });
            req.mpesaToken = response.data.access_token;
            next();
        } catch (error) {
            console.error('M-Pesa token generation error:', error.response?.data || error.message);
            res.status(500).json({ error: 'Failed to generate M-Pesa token' });
        }
    };

    /**
     * POST /api/v1/mpesa/stkpush
     * Initiate STK Push
     */
    app.post('/api/v1/mpesa/stkpush', generateToken, async (req, res) => {
        const { phoneNumber, amount, accountReference, transactionDesc, fullDescription, payerName } = req.body;

        if (!phoneNumber || !amount) {
            return res.status(400).json({ error: 'Phone number and amount are required' });
        }

        // Format phone number to 254...
        let formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('+')) {
            formattedPhone = formattedPhone.substring(1);
        }

        const shortcode = process.env.MPESA_SHORTCODE || '4563421'; // Head Office (HO) Number
        const tillNumber = process.env.MPESA_TILL_NUMBER || shortcode; // Child Till Number (defaults to HO if not set)
        const passkey = process.env.MPESA_PASSKEY;
        
        if (!passkey) {
            return res.status(500).json({ error: 'M-Pesa Passkey missing in server config' });
        }

        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        // Password is ALWAYS generated using the Head Office Shortcode
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
        
        const isProd = process.env.MPESA_ENV === 'production';
        const url = isProd
            ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
            : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

        const payload = {
            BusinessShortCode: shortcode, // Must be Head Office (HO) number
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerBuyGoodsOnline', // Correct type for Till Numbers
            Amount: Math.ceil(amount),
            PartyA: formattedPhone,
            PartyB: tillNumber, // Must be the actual Child Till Number receiving funds
            PhoneNumber: formattedPhone,
            CallBackURL: `${process.env.API_URL || 'https://api.hawkninegroup.com'}/api/v1/mpesa/callback`,
            AccountReference: accountReference || 'HawkNine',
            TransactionDesc: transactionDesc || 'Payment for services'
        };

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${req.mpesaToken}`
                },
                timeout: 50000 // 50 seconds — Safaricom can be very slow
            });

            // Save transaction as pending
            const transaction = new Transaction({
                id: 'mpesa-' + response.data.CheckoutRequestID,
                type: 'mpesa',
                mpesaCheckoutRequestId: response.data.CheckoutRequestID,
                amount: payload.Amount,
                phoneNumber: formattedPhone,
                status: 'pending',
                accountReference: payload.AccountReference,
                description: payload.TransactionDesc,
                fullDescription: fullDescription || payload.TransactionDesc,
                payerName: payerName || ''
            });
            await transaction.save();

            res.json({
                success: true,
                checkoutRequestId: response.data.CheckoutRequestID,
                merchantRequestId: response.data.MerchantRequestID,
                message: response.data.CustomerMessage
            });
        } catch (error) {
            console.error('M-Pesa STK Push error:', error.response?.data || error.message);
            res.status(500).json({ 
                error: 'Failed to initiate STK Push',
                details: error.response?.data || error.message
            });
        }
    });

    /**
     * POST /api/v1/mpesa/callback
     * Webhook called by Safaricom when payment succeeds or fails
     */
    app.post('/api/v1/mpesa/callback', async (req, res) => {
        console.log('M-Pesa Callback received:', JSON.stringify(req.body));
        
        try {
            const callbackData = req.body.Body.stkCallback;
            const checkoutRequestId = callbackData.CheckoutRequestID;
            const resultCode = callbackData.ResultCode;

            const transaction = await Transaction.findOne({ mpesaCheckoutRequestId: checkoutRequestId });
            
            if (!transaction) {
                console.error('Transaction not found for CheckoutRequestID:', checkoutRequestId);
                
                // Safaricom timed out initially but the push went through!
                // Emit event anyway so the Desktop Agent gets the notification and cash flow is recorded.
                if (resultCode === 0) {
                    const callbackMetadata = callbackData.CallbackMetadata?.Item || [];
                    const receiptMatch = callbackMetadata.find(item => item.Name === 'MpesaReceiptNumber');
                    const amountMatch = callbackMetadata.find(item => item.Name === 'Amount');
                    const phoneMatch = callbackMetadata.find(item => item.Name === 'PhoneNumber');
                    
                    io.emit('payment-completed', {
                        checkoutRequestId: checkoutRequestId,
                        receiptNumber: receiptMatch ? receiptMatch.Value : 'N/A',
                        amount: amountMatch ? amountMatch.Value : 0,
                        reference: phoneMatch ? phoneMatch.Value : 'Unknown'
                    });
                }
                
                return res.json({ ResultCode: 0, ResultDesc: "Accepted but not found" });
            }

            if (resultCode === 0) {
                // Success!
                const callbackMetadata = callbackData.CallbackMetadata.Item;
                const receiptMatch = callbackMetadata.find(item => item.Name === 'MpesaReceiptNumber');
                
                transaction.status = 'completed';
                transaction.mpesaReceiptNumber = receiptMatch ? receiptMatch.Value : '';
                transaction.completedAt = new Date();
                await transaction.save();

                // Notify agents/dashboard that this payment is complete
                io.emit('payment-completed', {
                    checkoutRequestId: transaction.mpesaCheckoutRequestId,
                    receiptNumber: transaction.mpesaReceiptNumber,
                    amount: transaction.amount,
                    reference: transaction.accountReference,
                    phoneNumber: transaction.phoneNumber,
                    description: transaction.description,
                    fullDescription: transaction.fullDescription,
                    payerName: transaction.payerName
                });

                console.log(`Payment successful for request ${checkoutRequestId}`);
            } else {
                // Failed or Cancelled
                transaction.status = 'failed';
                transaction.failureReason = callbackData.ResultDesc;
                await transaction.save();

                io.emit('payment-failed', {
                    checkoutRequestId: transaction.mpesaCheckoutRequestId,
                    reason: callbackData.ResultDesc
                });

                console.log(`Payment failed for request ${checkoutRequestId}: ${callbackData.ResultDesc}`);
            }

            res.json({ ResultCode: 0, ResultDesc: "Accepted" });
        } catch (error) {
            console.error('Error handling M-Pesa callback:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    /**
     * GET /api/v1/mpesa/status/:checkoutRequestId
     * Polled by frontend to check payment status
     */
    app.get('/api/v1/mpesa/status/:checkoutRequestId', async (req, res) => {
        try {
            const transaction = await Transaction.findOne({ 
                mpesaCheckoutRequestId: req.params.checkoutRequestId 
            });
            
            if (!transaction) {
                return res.status(404).json({ error: 'Transaction not found' });
            }

            res.json({
                status: transaction.status,
                receiptNumber: transaction.mpesaReceiptNumber,
                failureReason: transaction.failureReason
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch transaction status' });
        }
    });

    /**
     * GET /api/v1/mpesa/transactions
     * Fetch M-Pesa transaction history for the Recent Payments list
     */
    app.get('/api/v1/mpesa/transactions', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const transactions = await Transaction.find({
                type: 'mpesa'
            })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

            // Also include transactions that have mpesaCheckoutRequestId but no type set (legacy)
            const legacyTransactions = await Transaction.find({
                mpesaCheckoutRequestId: { $exists: true, $ne: null },
                type: { $exists: false }
            })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

            const all = [...transactions, ...legacyTransactions]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, limit);

            res.json({
                success: true,
                transactions: all
            });
        } catch (error) {
            console.error('Failed to fetch M-Pesa transactions:', error.message);
            res.status(500).json({ error: 'Failed to fetch transactions' });
        }
    });
};
