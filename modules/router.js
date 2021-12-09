const { lstatSync, readdirSync, existsSync } = require('fs');
const path = require('path');
const express = require('express');
const { logger } = require('../core/logger');
const router = express.Router();

router.get('/api', function (req, res) {
    res.status(200).send(`${process.env.SERVER_NAME} is running at port ${process.env.PORT}`);
})

router.get('/api/routes', async function (req, res) {
    const routes = [];
    await router.stack.forEach(function (middleware) {
        if (middleware.route) { // routes registered directly on the app
            routes.push(middleware.route);
            //logger.debug(middleware.route);
        } else if (middleware.name === 'router') { // router middleware 
            middleware.handle.stack.forEach(function (handler) {
                const route = handler.route;
                //logger.debug(route)
                route && routes.push(route);
            });
        }
    });
    let endpointHtml = `<b>API Endpoints for ${process.env.SERVER_NAME}</b><br>`+
    routes.map(route => `[${Object.keys(route.methods).join(',').toUpperCase()}] ${route.path}`).join('<br>');
    res.status(200);
    res.set('Content-Type', 'text/html');
    res.send(endpointHtml);
    res.end();
})

const isDirectory = source => lstatSync(source).isDirectory()
const getDirectories = source =>
    readdirSync(source).map(name => path.join(source, name)).filter(isDirectory)
getDirectories(__dirname).forEach(moduleDir => {
    logger.debug(moduleDir)
    const routesFile = path.join(moduleDir, 'routes.js');
    logger.debug(routesFile)
    if (existsSync(routesFile)) router.use(`/api/${moduleDir.split(path.sep).pop()}`, require(routesFile));
});

module.exports = router