const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const axios = require('axios').default;

const io = require('socket.io-client');
const socket = io('https://signalling-server-psk.herokuapp.com');


const cookieFile = path.join(__dirname, 'cookie.txt');
const statusFile = path.join(__dirname, 'status.json');

const Cookie = fs.readFileSync(cookieFile, 'utf8');

const REQUESTS = {
    GET_STATUS: 'GET_STATUS',
    GET_STATUS_LATEST: 'GET_STATUS_LATEST',
};
const INTERESTED_CASES = ['IOE0913005289', 'IOE0913005290', 'IOE0913005291', 'IOE0913005292'];

const getStatus = async () => {
    try {
        const requests = INTERESTED_CASES.map(caseNumber => {
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


const getSummary = (status) => {
    try {
        return status.reduce((a, b) => {
            return `${a}\n${b.formType} - ${b.statusTitle}`
        }, '');
    } catch (error) {
        return 'Error generating summary';
    }
}

const getAllStatus = () => {
    getStatus().
        then(status => {
            console.log(`${getSummary(status)}\n-------------------------------------------------------`
            );
            socket.emit('response', {
                query: REQUESTS.GET_STATUS,
                data: JSON.parse(JSON.stringify(status)),
            });
            fs.writeFileSync(statusFile, JSON.stringify(status, null, '\t'));
        })
        .catch(err => console.log(err));
}

getAllStatus();

cron.schedule('0 */5 * * * *', getAllStatus);

socket.on('request', msg => {
    const query = msg.query;
    switch (query) {
        case REQUESTS.GET_STATUS: {
            const status = fs.readFileSync(statusFile, 'utf8');
            socket.emit('response', {
                query,
                data: JSON.parse(status),
            })
        }
        case REQUESTS.GET_STATUS_LATEST: {
            getAllStatus();
        }
        default:
            break;
    }
})

