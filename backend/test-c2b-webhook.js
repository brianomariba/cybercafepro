const axios = require('axios');

async function testC2B() {
    const payload = {
        "TransactionType": "Pay Bill",
        "TransID": "RKTQDP78NT",
        "TransTime": "20191122063845",
        "TransAmount": "10.00",
        "BusinessShortCode": "4563421",
        "BillRefNumber": "5693938",
        "InvoiceNumber": "",
        "OrgAccountBalance": "49197.00",
        "ThirdPartyTransID": "",
        "MSISDN": "254708374149",
        "FirstName": "John",
        "MiddleName": "J.",
        "LastName": "Doe"
    };

    try {
        console.log('Sending mock C2B confirmation...');
        const response = await axios.post('https://api.hawkninegroup.com/api/v1/c2b/confirmation', payload);
        console.log('Backend response:', response.data);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testC2B();
