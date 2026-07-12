const axios = require('axios');
axios.post('https://api.hawkninegroup.com/api/v1/mpesa/stkpush', {
    phoneNumber: '0724384646',
    amount: 1,
    accountReference: 'HawkNine',
    transactionDesc: 'Test Payment'
}).then(res => console.log('SUCCESS:', res.data))
.catch(err => console.log('ERROR:', err.response ? err.response.data : err.message));
