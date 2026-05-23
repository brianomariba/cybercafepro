/**
 * Test script: Verify M-Pesa Transaction Status Query credentials
 * This tests:
 * 1. OAuth token generation
 * 2. SecurityCredential encryption
 * 3. Transaction Status Query API call
 */

const axios = require('axios');
const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

// --- PRODUCTION CREDENTIALS ---
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || '18nKG1y5NrsM5Ep78hE3CQsZPE4C1xqKHxihJsFTERPGgzbm';
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || '3OBQjN07HsYHg2asOGxUGdziGAnYSHU2s0wA3HRnuRQ5ATKqXh9jtBFlVbmPZUQX';
const SHORTCODE = '4563421';
const INITIATOR_NAME = 'MUTUNDI JOSEPH';
const INITIATOR_PASSWORD = '@MargretNkorogo1964!';
const ENV = 'production';

// --- Step 1: Generate SecurityCredential ---
// Uses node-forge instead of Node.js crypto because OpenSSL 3.x (Node 17+)
// rejects Safaricom's production certificate with "wrong tag" ASN.1 errors.
function generateSecurityCredential() {
    const certFile = ENV === 'production' ? 'production.cer' : 'sandbox.cer';
    const certPath = path.join(__dirname, 'certs', certFile);
    
    console.log(`\n📜 Reading certificate: ${certPath}`);
    const certPem = fs.readFileSync(certPath, 'utf8');
    
    console.log('🔐 Encrypting initiator password with Safaricom certificate (node-forge)...');
    const cert = forge.pki.certificateFromPem(certPem);
    const publicKey = cert.publicKey;
    
    // Show certificate info
    console.log(`   Subject: ${cert.subject.getField('CN')?.value || 'N/A'}`);
    console.log(`   Issuer:  ${cert.issuer.getField('CN')?.value || 'N/A'}`);
    console.log(`   Valid:    ${cert.validity.notBefore.toISOString()} → ${cert.validity.notAfter.toISOString()}`);
    
    // Encrypt with RSA PKCS#1 v1.5 (node-forge expects binary string)
    const passwordBytes = forge.util.encodeUtf8(INITIATOR_PASSWORD);
    const encrypted = publicKey.encrypt(passwordBytes, 'RSAES-PKCS1-V1_5');
    const credential = forge.util.encode64(encrypted);
    console.log(`✅ SecurityCredential generated (${credential.length} chars)`);
    return credential;
}

// --- Step 2: Get OAuth Token ---
async function getToken() {
    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
    const url = ENV === 'production'
        ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
        : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

    console.log('\n🔑 Requesting OAuth token from Safaricom...');
    const response = await axios.get(url, {
        headers: { Authorization: `Basic ${auth}` }
    });
    console.log(`✅ Token received: ${response.data.access_token.substring(0, 20)}...`);
    return response.data.access_token;
}

// --- Step 3: Query Transaction Status (use a known receipt number, or test) ---
async function testTransactionStatusQuery(token, securityCredential) {
    const url = ENV === 'production'
        ? 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query'
        : 'https://sandbox.safaricom.co.ke/mpesa/transactionstatus/v1/query';

    // Use a test receipt number — replace with a real one from your transactions
    const testReceiptNumber = process.argv[2] || 'TEST123';

    const payload = {
        Initiator: INITIATOR_NAME,
        SecurityCredential: securityCredential,
        CommandID: 'TransactionStatusQuery',
        TransactionID: testReceiptNumber,
        PartyA: SHORTCODE,
        IdentifierType: '4',
        ResultURL: 'https://api.hawkninegroup.com/api/v1/mpesa/transaction-status-result',
        QueueTimeOutURL: 'https://api.hawkninegroup.com/api/v1/mpesa/transaction-status-timeout',
        Remarks: 'Test query',
        Occasion: 'Test'
    };

    console.log(`\n📡 Sending Transaction Status Query for receipt: ${testReceiptNumber}...`);
    console.log('   Payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
    });

    console.log('\n✅ Safaricom Response:');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
}

// --- Run ---
(async () => {
    try {
        console.log('=== M-Pesa Transaction Status Query Credential Test ===');
        console.log(`Environment: ${ENV}`);
        console.log(`Initiator: ${INITIATOR_NAME}`);
        console.log(`Shortcode: ${SHORTCODE}`);

        // Use pre-generated credential from Daraja portal (local cert is corrupted on Node 22)
        // Generated via: Dashboard > Test Credentials > Production > @MargretNkorogo1964!
        const PORTAL_CREDENTIAL = 'mNwdea6a+5bPVD+4jfUZHhefGgaesqYc1emnWGLdHtyveZq3dbvGcpIm3LnHomGVoTFAEeRspaGk4TZpfLrsUS6audu+9vXD/UeEjWwlo57Ids4jKVbgMgAUQlsg3UI5Ef7rXPVDPP6nwbzEYLuo1HXn/7RukhkJp1PgmbmX7pxn1XXSd+qRPbRryKELaGjXgyDzbnSHeYLZlwxhkpxSdHGly5PUCEYw7nkTbxnUWRp3byA6E2OklUVP5J9DYGXhjbkbpz9LjwM39rhOUUFNur+VzNKFy6oM9YENrCSg03TdkvTlqGr58iNZZbt0JdELoOjNh/vgMUt/svyjvBIBEw==';

        let securityCredential;
        try {
            securityCredential = generateSecurityCredential();
        } catch (e) {
            console.log(`\n⚠️  Local cert encryption failed: ${e.message}`);
            console.log('   Using pre-generated credential from Daraja portal...');
            securityCredential = PORTAL_CREDENTIAL;
        }

        const token = await getToken();
        const result = await testTransactionStatusQuery(token, securityCredential);

        if (result.ResponseCode === '0') {
            console.log('\n🎉 SUCCESS! Credentials are valid. Transaction Status Query accepted by Safaricom.');
            console.log('The result will be sent to your callback URL.');
        } else {
            console.log('\n⚠️  Safaricom returned an error:', result);
        }
    } catch (error) {
        console.error('\n❌ Error:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            console.error('   → OAuth token failed. Check Consumer Key/Secret.');
        } else if (error.response?.data?.errorCode === '401.002.01') {
            console.error('   → SecurityCredential is invalid. Check Initiator Name/Password.');
        }
    }
})();
