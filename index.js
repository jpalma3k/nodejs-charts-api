const dotenv = require('dotenv');
const result = dotenv.config();
if (result.error) {
  throw result.error;
}
const loggerCore = require('./core/logger');
if (!global.logger) {
  global.logger = loggerCore.logger;
}
process.on('uncaughtException', function (er) {
  logger.error(er.stack)
  process.exit(1)
})

const path = require('path');
global.ROOT_PATH = path.resolve(__dirname);

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const app = express();
const http = require('http');
const server = http.createServer(app);
const router = require('./modules/router')
const MemoryStore = require('memorystore')(session)

app.use(bodyParser.json({ limit: process.env.SERVER_UPLOAD_LIMIT }));
app.use(bodyParser.urlencoded({  // support URL-encoded bodies
    limit: process.env.SERVER_UPLOAD_LIMIT,
    extended: true
}));
app.use(cookieParser());
app.use(session({
  store: new MemoryStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  }),
  secret: process.env.SERVER_COOKIE_SECRET,
  name: `${process.env.SERVER_NAME}-COOKIE`,
  resave: false,
  saveUninitialized: false
}));

app.use(loggerCore.log_request_middleware);
app.use(helmet())

if(process.env.NODE_ENV=='development'){
  app.use(function (req, res, next) { //allow cross origin requests
    res.setHeader("Access-Control-Allow-Methods", "POST, PUT, OPTIONS, DELETE, GET");
    res.header("Access-Control-Allow-Origin", `http://localhost:${process.env.PORT}`);
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Credentials", true);
    next();
  });
}

app.use(express.static(path.join(__dirname, process.env.STATIC_FOLDER)));

app.use(router);

//// NECESSITA DE PERMANECER NO FIM
app.get('*', function (req, res) {
  res.sendFile(path.resolve(path.join(path.join(__dirname, process.env.STATIC_FOLDER),'index.html')));
});

server.listen(process.env.PORT, () => {
 logger.info(`Server running at port ${process.env.PORT}`);
});