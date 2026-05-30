require('dotenv').config();
const axios = require('axios');

const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
const shortCode = process.env.MPESA_SHORTCODE;

// The URLs you want to register
const confirmationUrl = 'https://api.hawkninegroup.com/api/v1/c2b/confirmation';
const validationUrl = 'https://api.hawkninegroup.com/api/v1/c2b/validation';

async function getAccessToken() {
    console.log('Getting Daraja Access Token...');
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    try {
        const response = await axios.get(
            'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            {
                headers: {
                    Authorization: `Basic ${auth}`
                }
            }
        );
        console.log('Access token retrieved successfully.');
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function registerUrls() {
    try {
        const token = await getAccessToken();
        
        console.log(`Registering C2B URLs for ShortCode: ${shortCode}`);
        console.log(`Confirmation URL: ${confirmationUrl}`);
        console.log(`Validation URL:   ${validationUrl}`);
        
        const response = await axios.post(
            'https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl',
            {
                ShortCode: shortCode,
                ResponseType: 'Completed', // Can be 'Completed' or 'Cancelled'
                ConfirmationURL: confirmationUrl,
                ValidationURL: validationUrl
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );
        
        console.log('\n--- SUCCESS ---');
        console.log(response.data);
    } catch (error) {
        console.log('\n--- ERROR ---');
        if (error.response) {
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

registerUrls();
