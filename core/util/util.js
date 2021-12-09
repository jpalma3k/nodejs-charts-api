const fs = require('fs');


module.exports = {

    readFile: async (file) => {
        return new Promise((resolve, reject) => {
            fs.readFile(file, 'utf8', function (err, data) {
                if (err) reject(err);
                resolve(data);
            });
        });
    },

    asyncForEach: async function (array, callback) {
        for (let index = 0; index < array.length; index++) {
            await callback(array[index], index, array);
        }
    }
};



