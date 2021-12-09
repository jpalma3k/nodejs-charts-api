//https://github.com/tediousjs/node-mssql
const sql = require('mssql')

const sqlConfig = {
    user: process.env.DB_MSSQL_USER,
    password: process.env.DB_MSSQL_PASS,
    database: process.env.DB_MSSQL_SCHEMA,
    server: process.env.DB_MSSQL_HOST,
    pool: {
        max: parseInt(process.env.DB_POOL_MAX),
        min: parseInt(process.env.DB_POOL_MIN),
        idleTimeoutMillis: parseInt(process.env.DB_TIMEOUT)
    },
    options: {
        encrypt: true, // for azure
        //trustServerCertificate: false // change to true for local dev / self-signed certs
    }
}

const pool = new sql.ConnectionPool(sqlConfig)

const addRequestInputs = (request, queryParams) => {
    for (let i = 0; i < queryParams.length; i++) {
        const param = queryParams[i]
        /*
            Arguments
            name - Name of the input parameter without @ char.
            type - SQL data type of input parameter. If you omit type,
                   module automatically decide which SQL data type should be used based on JS data type.
            value - Input parameter value. undefined and NaN values are automatically converted to null values.
        */
        if (param.hasOwnProperty('type'))
            request.input(param.name, param.type, param.value)
        else
            request.input(param.name, param.value)
    }
}

const query = async (queryStr, queryParams = []) => {
    try {
        await pool.connect()
        const request = pool.request()
        addRequestInputs(request, queryParams)
        const result = await request.query(queryStr)
        return result.recordsets.flat(Infinity)
    } catch (err) {
        console.log(err)
        throw new Error(`Erro na query.${EOL}Detalhe:${EOL}${err.stack}`)
    }
}

const batchTransaction = async (batch, throwError = false) => {
    try {
        await pool.connect();
        const transaction = pool.transaction()
        try {
            await transaction.begin()
            for (let i = 0; i < batch.length; i++) {
                const { queryStr, queryParams } = batch[i]
                const request = transaction.request()
                addRequestInputs(request, queryParams)
                await request.query(queryStr)
            }
            await transaction.commit()
            return true
        }
        catch (err) {
            console.log(err)
            await transaction.rollback()
            if(throwError) throw err
            else return false
        }
    } catch (error) {
        console.log(error)
        if(throwError) throw error
        else return false
    }
}

const close = async () => {
    await pool.close()
}

module.exports.transaction = batchTransaction
module.exports.query = query
module.exports.close = close
