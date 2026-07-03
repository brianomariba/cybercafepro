const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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
     * Generate SecurityCredential by encrypting initiator password with Safaricom certificate.
     * Falls back to MPESA_SECURITY_CREDENTIAL env var if local cert encryption fails
     * (Node.js 22+ / OpenSSL 3.x rejects the Safaricom production certificate).
     */
    function generateSecurityCredential() {
        const initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD;
        if (!initiatorPassword) {
            // Fall back to pre-generated credential from env
            const preGenerated = process.env.MPESA_SECURITY_CREDENTIAL;
            if (preGenerated) {
                console.log('[M-Pesa] Using pre-generated SecurityCredential from env');
                return preGenerated;
            }
            return null;
        }

        const isProd = process.env.MPESA_ENV === 'production';
        const certFile = isProd ? 'production.cer' : 'sandbox.cer';
        const certPath = path.join(__dirname, 'certs', certFile);

        try {
            const cert = fs.readFileSync(certPath, 'utf8');
            const encrypted = crypto.publicEncrypt(
                { key: cert, padding: crypto.constants.RSA_PKCS1_PADDING },
                Buffer.from(initiatorPassword)
            );
            return encrypted.toString('base64');
        } catch (e) {
            console.error('[M-Pesa] Local cert encryption failed:', e.message);
            // Fall back to pre-generated credential from Daraja portal
            const preGenerated = process.env.MPESA_SECURITY_CREDENTIAL;
            if (preGenerated) {
                console.log('[M-Pesa] Using pre-generated SecurityCredential from env');
                return preGenerated;
            }
            return null;
        }
    }

    /**
     * Query Transaction Status to get payer's name
     * Called after a successful STK Push callback
     */
    async function queryTransactionStatus(receiptNumber, token) {
        const initiatorName = process.env.MPESA_INITIATOR_NAME;
        const securityCredential = process.env.MPESA_SECURITY_CREDENTIAL || generateSecurityCredential();
        const shortcode = process.env.MPESA_SHORTCODE;
        const apiUrl = process.env.API_URL || 'https://api.hawkninegroup.com';

        if (!initiatorName || !securityCredential || !shortcode) {
            console.log('[M-Pesa] Transaction Status Query skipped — missing MPESA_INITIATOR_NAME, password, or shortcode');
            return;
        }

        const isProd = process.env.MPESA_ENV === 'production';
        const url = isProd
            ? 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query'
            : 'https://sandbox.safaricom.co.ke/mpesa/transactionstatus/v1/query';

        const payload = {
            Initiator: initiatorName,
            SecurityCredential: securityCredential,
            CommandID: 'TransactionStatusQuery',
            TransactionID: receiptNumber,
            PartyA: shortcode,
            IdentifierType: '4',
            ResultURL: `${apiUrl}/api/v1/mpesa/transaction-status-result`,
            QueueTimeOutURL: `${apiUrl}/api/v1/mpesa/transaction-status-timeout`,
            Remarks: 'Get payer name',
            Occasion: 'PayerNameQuery'
        };

        try {
            const response = await axios.post(url, payload, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 15000
            });
            console.log(`[M-Pesa] Transaction Status Query sent for ${receiptNumber}:`, response.data);
        } catch (e) {
            console.error(`[M-Pesa] Transaction Status Query failed for ${receiptNumber}:`, e.response?.data || e.message);
        }
    }

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
                payerName: payerName || '',
                businessShortCode: tillNumber
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

                // Query Transaction Status to get payer's name from Safaricom
                if (transaction.mpesaReceiptNumber) {
                    try {
                        // Generate a fresh token for the query
                        const consumerKey = process.env.MPESA_CONSUMER_KEY;
                        const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
                        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
                        const isProd = process.env.MPESA_ENV === 'production';
                        const tokenUrl = isProd
                            ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
                            : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
                        const tokenRes = await axios.get(tokenUrl, { headers: { Authorization: `Basic ${auth}` } });
                        await queryTransactionStatus(transaction.mpesaReceiptNumber, tokenRes.data.access_token);
                    } catch (e) {
                        console.error('[M-Pesa] Failed to query transaction status:', e.message);
                    }
                }
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
            const tillFilter = process.env.MPESA_TILL_NUMBER;
            const shortcodeFilter = process.env.MPESA_SHORTCODE;
            
            const query = { type: 'mpesa' };
            if (tillFilter) {
                // Return transactions belonging to the specific till, the main shortcode (for manual C2B), or legacy ones that don't have it set
                query.$or = [
                    { businessShortCode: tillFilter },
                    { businessShortCode: shortcodeFilter },
                    { businessShortCode: { $exists: false } },
                    { businessShortCode: null }
                ];
            }

            const transactions = await Transaction.find(query)
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

    /**
     * POST /api/v1/mpesa/transaction-status-result
     * Callback from Safaricom Transaction Status Query — extracts payer name
     */
    app.post('/api/v1/mpesa/transaction-status-result', async (req, res) => {
        console.log('[M-Pesa] Transaction Status Result:', JSON.stringify(req.body));

        try {
            const result = req.body.Result;
            if (result && result.ResultCode === 0 && result.ResultParameters) {
                const params = result.ResultParameters.ResultParameter || [];

                // Extract payer name from DebitPartyName: "254712345678 - JOHN KAMAU"
                const debitParty = params.find(p => p.Key === 'DebitPartyName');
                const receiptParam = params.find(p => p.Key === 'ReceiptNo');
                const receiptNumber = receiptParam ? receiptParam.Value : result.TransactionID;

                if (debitParty && receiptNumber) {
                    const debitValue = debitParty.Value || '';
                    // Format: "254712345678 - JOHN KAMAU"
                    const nameParts = debitValue.split(' - ');
                    const payerName = nameParts.length > 1 ? nameParts.slice(1).join(' - ').trim() : '';

                    if (payerName) {
                        // Use updateOne with $set to bypass Mongoose document-level schema issues
                        const updateResult = await Transaction.updateOne(
                            { mpesaReceiptNumber: receiptNumber },
                            { $set: { payerName: payerName } }
                        );
                        console.log(`[M-Pesa] Payer name update result: matched=${updateResult.matchedCount} modified=${updateResult.modifiedCount} for receipt ${receiptNumber} -> ${payerName}`);

                        if (updateResult.modifiedCount > 0) {
                            // Notify desktop agents of the updated name
                            io.emit('payment-name-updated', {
                                receiptNumber: receiptNumber,
                                payerName: payerName
                            });
                        }
                    }
                }
            }
            res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        } catch (error) {
            console.error('[M-Pesa] Transaction Status Result error:', error.message);
            res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }
    });

    /**
     * POST /api/v1/mpesa/transaction-status-timeout
     * Timeout callback for Transaction Status Query
     */
    app.post('/api/v1/mpesa/transaction-status-timeout', (req, res) => {
        console.log('[M-Pesa] Transaction Status Query timed out:', JSON.stringify(req.body));
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    });

    // ==================== C2B (Customer to Business) — Manual Payments ====================

    /**
     * POST /api/v1/c2b/validation
     * Safaricom sends a validation request before completing a manual C2B payment.
     * We auto-accept all payments by returning ResultCode 0.
     */
    app.post('/api/v1/c2b/validation', (req, res) => {
        console.log('[C2B] Validation request:', JSON.stringify(req.body));
        // Accept all payments
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    });

    /**
     * POST /api/v1/c2b/confirmation
     * Safaricom sends confirmation after a manual C2B payment is completed.
     * This fires for ALL payments to the till — not just STK push, but also
     * manual Lipa na M-Pesa payments from customers.
     *
     * Payload fields: TransactionType, TransID, TransTime, TransAmount,
     *   BusinessShortCode, BillRefNumber, InvoiceNumber, OrgAccountBalance,
     *   ThirdPartyTransID, MSISDN, FirstName, MiddleName, LastName
     */
    app.post('/api/v1/c2b/confirmation', async (req, res) => {
        console.log('[C2B] Confirmation received:', JSON.stringify(req.body));

        try {
            const {
                TransID,
                TransTime,
                TransAmount,
                BusinessShortCode,
                BillRefNumber,
                MSISDN,
                FirstName,
                MiddleName,
                LastName
            } = req.body;

            // Build payer's full name from C2B fields
            const nameParts = [FirstName, MiddleName, LastName].filter(Boolean);
            const payerName = nameParts.join(' ').trim() || '';

            // Format phone for display
            const phoneNumber = MSISDN ? String(MSISDN) : '';

            // Parse amount
            const amount = parseFloat(TransAmount) || 0;

            // Check for duplicate — avoid re-saving STK push payments that also trigger C2B
            const existing = await Transaction.findOne({ mpesaReceiptNumber: TransID });
            if (existing) {
                console.log(`[C2B] Transaction ${TransID} already exists (likely from STK push), updating payer name`);
                // Update the payer name if it wasn't set (STK push doesn't have it initially)
                if (!existing.payerName && payerName) {
                    await Transaction.updateOne(
                        { mpesaReceiptNumber: TransID },
                        { $set: { payerName: payerName } }
                    );
                    console.log(`[C2B] Payer name updated: ${payerName} for receipt ${TransID}`);
                    io.emit('payment-name-updated', {
                        receiptNumber: TransID,
                        payerName: payerName
                    });
                }
                return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
            }

            // Save as a new transaction (manual payment not initiated via STK)
            const transaction = new Transaction({
                id: `c2b-${TransID}`,
                type: 'mpesa',
                description: BillRefNumber || 'Manual M-Pesa Payment',
                fullDescription: BillRefNumber
                    ? `Manual Payment: ${BillRefNumber}`
                    : 'Manual Lipa na M-Pesa Payment',
                amount: amount,
                phoneNumber: phoneNumber,
                mpesaReceiptNumber: TransID,
                accountReference: BillRefNumber || 'Till Payment',
                payerName: payerName,
                paymentMethod: 'mpesa',
                businessShortCode: BusinessShortCode,
                status: 'completed',
                completedAt: TransTime
                    ? new Date(
                        TransTime.replace(
                            /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
                            '$1-$2-$3T$4:$5:$6'
                        )
                    )
                    : new Date()
            });

            await transaction.save();
            console.log(`[C2B] Manual payment saved: KSH ${amount} from ${phoneNumber} (${payerName}) — Receipt: ${TransID}`);

            // Notify desktop agents
            io.emit('payment-completed', {
                receiptNumber: TransID,
                amount: amount,
                phoneNumber: phoneNumber,
                payerName: payerName,
                description: transaction.description,
                fullDescription: transaction.fullDescription,
                reference: transaction.accountReference,
                isManualPayment: true
            });

            res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        } catch (error) {
            console.error('[C2B] Confirmation handling error:', error.message);
            // Always return success to Safaricom to avoid retries
            res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }
    });

    /**
     * POST /api/v1/c2b/register
     * One-time registration of C2B validation & confirmation URLs with Safaricom.
     * Call this once after deployment (or whenever the server URL changes).
     */
    app.post('/api/v1/c2b/register', generateToken, async (req, res) => {
        // Must use the head-office shortcode (not the child till) — Safaricom requires
        // the ShortCode to match the API credential owner for C2B registration
        const tillNumber = process.env.MPESA_SHORTCODE;
        const apiUrl = process.env.API_URL || 'https://api.hawkninegroup.com';

        if (!tillNumber) {
            return res.status(400).json({ error: 'MPESA_TILL_NUMBER not configured' });
        }

        const isProd = process.env.MPESA_ENV === 'production';
        const registerUrl = isProd
            ? 'https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl'
            : 'https://sandbox.safaricom.co.ke/mpesa/c2b/v2/registerurl';

        const payload = {
            ShortCode: tillNumber,
            ResponseType: 'Completed', // Auto-complete if validation URL is unreachable
            ConfirmationURL: `${apiUrl}/api/v1/c2b/confirmation`,
            ValidationURL: `${apiUrl}/api/v1/c2b/validation`
        };

        try {
            console.log('[C2B] Registering URLs:', JSON.stringify(payload));
            const response = await axios.post(registerUrl, payload, {
                headers: { Authorization: `Bearer ${req.mpesaToken}` },
                timeout: 30000
            });
            console.log('[C2B] Registration response:', JSON.stringify(response.data));
            res.json({
                success: true,
                message: 'C2B URLs registered successfully',
                safaricomResponse: response.data,
                registeredUrls: {
                    confirmation: payload.ConfirmationURL,
                    validation: payload.ValidationURL,
                    shortCode: tillNumber
                }
            });
        } catch (error) {
            console.error('[C2B] Registration failed:', error.response?.data || error.message);
            res.status(500).json({
                error: 'C2B registration failed',
                details: error.response?.data || error.message
            });
        }
    });
};
