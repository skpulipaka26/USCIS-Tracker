require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const axios = require('axios').default;
const io = require('socket.io-client');
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;

const createTransporter = async () => {
    const oauth2Client = new OAuth2(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.REFRESH_TOKEN
    });

    const accessToken = await new Promise((resolve, reject) => {
        oauth2Client.getAccessToken((err, token) => {
            if (err) {
                reject('Failed to create google auth token');
            }
            resolve(token);
        });
    });

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            type: 'OAuth2',
            user: process.env.EMAIL,
            accessToken,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            refreshToken: process.env.REFRESH_TOKEN
        }
    });
    return transporter;
};

const socket = io('https://signalling-server-psk.herokuapp.com');

const cookieFile = path.join(__dirname, 'cookie.txt');
const statusFile = path.join(__dirname, 'status.json');

const REQUESTS = {
    GET_STATUS: 'GET_STATUS',
    GET_STATUS_LATEST: 'GET_STATUS_LATEST',
};
const INTERESTED_CASES = ['IOE0913005289', 'IOE0913005290', 'IOE0913005291', 'IOE0913005292'];

const getStatus = async () => {
    try {
        const Cookie = fs.readFileSync(cookieFile, 'utf8');
        const requests = INTERESTED_CASES.map(caseNumber => {
            return axios.get(`https://my.uscis.gov/account/case-service/api/case_status/${caseNumber}`,
                { headers: { Cookie } });
        });
        const responses = await Promise.all(requests);
        const caseStatus = responses.map(res => {
            return {
                ...res.data.data,
                time: new Date(),
            };
        });
        // check if the status has updated
        const status = fs.readFileSync(statusFile, 'utf8');
        const currentStatus = JSON.parse(status) || [];
        currentStatus.forEach(async s => {
            const receiptNumber = s.receiptNumber;
            const newStatusObj = caseStatus.find(p => p.receiptNumber === receiptNumber);
            if (newStatusObj.statusTitle !== s.statusTitle) {
                const summary = `${s.formType}-${receiptNumber} status changed`;
                console.log(summary);
                // send notification here
                const mailOptions = {
                    from: process.env.EMAIL,
                    to: process.env.EMAIL,
                    subject: summary,
                    html: `New Status: ${s.statusText}`,
                    text: `New Status: ${s.statusText}`,
                    priority: 'high'
                };
                const transporter = await createTransporter();
                await transporter.sendMail(mailOptions);
            }
        })
        const newHeader = responses[0].headers['set-cookie'];
        return { caseStatus, newHeader };
    } catch (error) {
        throw error;
    }
}


const getSummary = (status) => {
    try {
        return status.reduce((a, b) => {
            return `${a}\n${b.formType} - ${b.statusTitle}`
        }, '') + '\n-------------------------------------------------------';
    } catch (error) {
        return 'Error generating summary';
    }
}

const getAllStatus = () => {
    getStatus().
        then(({ caseStatus, newHeader }) => {
            console.log(getSummary(caseStatus));
            socket.emit('response', {
                query: REQUESTS.GET_STATUS,
                data: JSON.parse(JSON.stringify(caseStatus)),
            });
            fs.writeFileSync(cookieFile, `${newHeader}`);
            fs.writeFileSync(statusFile, JSON.stringify(caseStatus, null, '\t'));
        })
        .catch(err => console.log(err));
}

getAllStatus();

cron.schedule('0 */5 * * * *', getAllStatus);

socket.on('request', msg => {
    const query = msg.query;
    switch (query) {
        case REQUESTS.GET_STATUS:
            const status = fs.readFileSync(statusFile, 'utf8');
            socket.emit('response', {
                query,
                data: JSON.parse(status),
            });
            break;
        case REQUESTS.GET_STATUS_LATEST:
            getAllStatus();
            break;
        default:
            break;
    }
})

