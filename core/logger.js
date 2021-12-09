const bunyan = require('bunyan');
const log = bunyan.createLogger({
    name: 'server',
    streams: [
        {
            level: 'debug',
            stream: process.stdout
        },
        {
            level: 'info',
            path: `${process.env.LOG_PATH}\\info.log`,
            type: 'rotating-file',
            period: '1d',   // daily rotation
            count: parseInt(process.env.LOG_MAX_BACKUPS) // keep X days back copies
        },
        {
            level: 'error',
            path: `${process.env.LOG_PATH}\\error.log`,
            type: 'rotating-file',
            period: '1d',   // daily rotation
            count: parseInt(process.env.LOG_MAX_BACKUPS) // keep X days back copies
        }
    ]
}
);

const requestlog = bunyan.createLogger({
    name: 'request',
    streams: [
        {
            level: 'info',
            path: `${process.env.LOG_PATH}\\request.log`
        },
    ]
}
);

log_request_middleware = function (req, res, next) {
    requestlog.info(req);
    next();
};

module.exports.logger = log;
module.exports.log_request_middleware = log_request_middleware