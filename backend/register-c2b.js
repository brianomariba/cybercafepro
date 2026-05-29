const axios = require('axios');

async function registerC2B() {
    try {
        console.log('Fetching M-Pesa token...');
        const consumerKey = '18nKG1y5NrsM5Ep78hE3CQsZPE4C1xqKHxihJsFTERPGgzbm';
        const consumerSecret = '3OBQjN07HsYHg2asOGxUGdziGAnYSHU2s0wA3HRnuRQ5ATKqXh9jtBFlVbmPZUQX';
        const shortCode = '4563421';

        const auth = Buffer.from(consumerKey + ':' + consumerSecret).toString('base64');
        const tokenRes = await axios.get('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            headers: { Authorization: 'Basic ' + auth }
        });
        const token = tokenRes.data.access_token;
        
        const payload = {
            ShortCode: shortCode,
            ResponseType: 'Completed',
            ConfirmationURL: 'https://api.hawkninegroup.com/api/v1/c2b/confirmation',
            ValidationURL: 'https://api.hawkninegroup.com/api/v1/c2b/validation'
        };

        console.log('Registering C2B URLs with payload:', payload);

        // For BuyGoods Child Till, C2B registration works differently sometimes, let's try
        const response = await axios.post('https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl', payload, {
            headers: { Authorization: 'Bearer ' + token }
        });

        console.log('SUCCESS! Response:', response.data);
    } catch (error) {
        console.error('ERROR!');
        if (error.response) {
            console.error('Safaricom Error:', error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

registerC2B();
