const fs = require('fs');
const axios = require('axios').default;
const path = require('path');

const cookieFile = path.join(__dirname, 'cookie.txt');
const Cookie = fs.readFileSync(cookieFile, 'utf8');

const statusFile = path.join(__dirname, 'status.json');

const interestedCases = ['IOE0913005289', 'IOE0913005290', 'IOE0913005291', 'IOE0913005292'];

const getStatus = async () => {
    const requests = interestedCases.map(caseNumber => {
        return axios.get(`https://my.uscis.gov/account/case-service/api/case_status/${caseNumber}`,
            { headers: { Cookie } });
    });
    const responses = await Promise.all(requests);
    const caseStatus = responses.map(res => res.data.data);
    const newHeader = responses[0].headers['set-cookie'];
    fs.writeFileSync(cookieFile, `${newHeader}`);
    return caseStatus;
}



getStatus().then(status => {
    fs.writeFileSync(statusFile, JSON.stringify(status));
});
