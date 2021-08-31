const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const axios = require('axios').default;

const io = require('socket.io-client');
const socket = io('https://signalling-server-psk.herokuapp.com');

socket.emit('request', { hello: 'yellow' });

socket.on('request', console.log)

const cookieFile = path.join(__dirname, 'cookie.txt');
const Cookie = fs.readFileSync(cookieFile, 'utf8');

const statusFile = path.join(__dirname, 'status.json');

const interestedCases = ['IOE0913005289', 'IOE0913005290', 'IOE0913005291', 'IOE0913005292'];

const getStatus = async () => {
    try {
        const requests = interestedCases.map(caseNumber => {
            return axios.get(`https://my.uscis.gov/account/case-service/api/case_status/${caseNumber}`,
                { headers: { Cookie } });
        });
        const responses = await Promise.all(requests);
        const caseStatus = responses.map(res => {
            return {
                ...res.data.data,
                time: new Date().toString(),
            }
        });
        const newHeader = responses[0].headers['set-cookie'];
        fs.writeFileSync(cookieFile, `${newHeader}`);
        return caseStatus;
    } catch (error) {
        throw error;
    }
}


const getAllStatus = () => {
    getStatus().
        then(status => {
            console.log('status fetched');
            fs.writeFileSync(statusFile, JSON.stringify(status, null, '\t'));
        })
        .catch(err => console.err(err));
}

getAllStatus();

cron.schedule('0 */5 * * * *', getAllStatus);

