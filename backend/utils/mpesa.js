const axios = require('axios');

async function getMpesaToken() {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    
    if (!consumerKey || !consumerSecret) {
        throw new Error('MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET is not set');
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const res = await axios.get('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
        headers: { Authorization: `Basic ${auth}` }
    });
    return res.data.access_token;
}

async function queryTransactionStatus(receiptNumber) {
    if (!receiptNumber || receiptNumber === 'Failed') return null;

    try {
        console.log(`[M-Pesa] Querying Daraja Transaction Status for receipt: ${receiptNumber}`);
        const token = await getMpesaToken();
        const url = 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query';

        const apiUrl = process.env.API_URL || 'https://api.hawkninegroup.com';

        const payload = {
            Initiator: process.env.MPESA_INITIATOR_NAME,
            SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
            CommandID: 'TransactionStatusQuery',
            TransactionID: receiptNumber,
            PartyA: process.env.MPESA_SHORTCODE,
            IdentifierType: 4, // 4 = Shortcode
            ResultURL: `${apiUrl}/api/v1/mpesa/status/result`,
            QueueTimeOutURL: `${apiUrl}/api/v1/mpesa/status/timeout`,
            Remarks: 'Automated Status Query for Name',
            Occasion: 'HawkNine Payer Sync'
        };

        const res = await axios.post(url, payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log(`[M-Pesa] Transaction status query successfully dispatched to Safaricom:`, res.data);
        return res.data;
    } catch (error) {
        console.error(`[M-Pesa] Failed to query status for ${receiptNumber}:`, error.response?.data || error.message);
        // We don't throw to prevent crashing the STK callback process
        return null;
    }
}

module.exports = {
    getMpesaToken,
    queryTransactionStatus
};
