const express = require('express');
const { check, validationResult } = require('express-validator');
const BLL = require('./optimizacao_bll');
const router = express.Router();


router.get('/simulacoes', async (req, res) => {
    const result = await BLL.getSimulacoes();
    res.status(200).json(result);
});

//http://localhost:8080/api/optimizacao/simulacao?id=1&detalhe=1
router.get('/simulacao', [check('id').isInt()], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(200).json({ success: false, message: JSON.stringify(errors.array()) });
    }
    const result = await BLL.getSimulacao(req.query.id);
    res.status(200).json(result);
});


module.exports = router