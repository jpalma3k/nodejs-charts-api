let _database = null;

const getDBDriver = (driver) => {
    switch(driver) {
        case 'mssql':
            _database = require('./mssql-data-access')
            break 
    }
    return _database;
}

module.exports = getDBDriver;