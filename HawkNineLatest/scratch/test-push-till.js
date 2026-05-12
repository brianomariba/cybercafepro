const axios = require('axios');

async function testPush() {
    const consumerKey = '18nKG1y5NrsM5Ep78hE3CQsZPE4C1xqKHxihJsFTERPGgzbm';
    const consumerSecret = '3OBQjN07HsYHg2asOGxUGdziGAnYSHU2s0wA3HRnuRQ5ATKqXh9jtBFlVbmPZUQX';
    const passkey = '656f28d2a161089523557937a85d5a18db68e129113fb90fc380684c88dfec1f';
    const shortcode = '4563421'; // Head Office
    const tillNumber = '5693938'; // Child Till
    const phone = '254724384646';

    try {
        console.log('1. Getting Auth Token...');
        const auth = Buffer.from(consumerKey + ':' + consumerSecret).toString('base64');
        const tokenRes = await axios.get('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            headers: { Authorization: 'Basic ' + auth }
        });
        const token = tokenRes.data.access_token;

        console.log('2. Initiating STK Push to Child Till ' + tillNumber + '...');
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');

        const payload = {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerBuyGoodsOnline',
            Amount: 1,
            PartyA: phone,
            PartyB: tillNumber,
            PhoneNumber: phone,
            CallBackURL: 'https://api.hawkninegroup.com/api/v1/mpesa/callback',
            AccountReference: 'HawkNine Services',
            TransactionDesc: 'Payment'
        };

        const pushRes = await axios.post('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest', payload, {
            headers: { Authorization: 'Bearer ' + token }
        });

        console.log('SUCCESS! Please check the phone ' + phone);
        console.log(pushRes.data);
    } catch (e) {
        console.error('ERROR!');
        if (e.response) {
            console.error(e.response.data);
        } else {
            console.error(e.message);
        }
    }
}

testPush();
