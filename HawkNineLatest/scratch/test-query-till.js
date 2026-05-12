const axios = require('axios');

async function testQuery() {
    const consumerKey = '18nKG1y5NrsM5Ep78hE3CQsZPE4C1xqKHxihJsFTERPGgzbm';
    const consumerSecret = '3OBQjN07HsYHg2asOGxUGdziGAnYSHU2s0wA3HRnuRQ5ATKqXh9jtBFlVbmPZUQX';
    const passkey = '656f28d2a161089523557937a85d5a18db68e129113fb90fc380684c88dfec1f';
    const shortcode = '4563421';

    try {
        const auth = Buffer.from(consumerKey + ':' + consumerSecret).toString('base64');
        const tokenRes = await axios.get('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            headers: { Authorization: 'Basic ' + auth }
        });
        const token = tokenRes.data.access_token;

        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');

        const payload = {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: 'ws_CO_07052026014212613724384646'
        };

        const queryRes = await axios.post('https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query', payload, {
            headers: { Authorization: 'Bearer ' + token }
        });

        console.log('QUERY SUCCESS!');
        console.log(queryRes.data);
    } catch (e) {
        console.error('QUERY ERROR!');
        if (e.response) {
            console.error(e.response.data);
        } else {
            console.error(e.message);
        }
    }
}

testQuery();
