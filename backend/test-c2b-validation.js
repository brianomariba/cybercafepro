const axios = require('axios');

async function testValidation() {
    try {
        console.log('Sending mock C2B validation...');
        const response = await axios.post('https://api.hawkninegroup.com/api/v1/c2b/validation', {});
        console.log('Backend response:', response.data);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testValidation();
