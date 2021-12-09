const database = require('../../core/database/database')('mssql');

class BLL {

    static RESULTADOS_DETALHE = {
      MUR: 1,
      OMIP: 2,
      GAS: 3,
    }

    static TIPO_RESULTADOS = {
      GRAFICO: 1,
      PONTOS: 2,
      POSICOES: 3,
      EXPOSICAO: 4
    }

    static QUARTER_MONTHS = {
      Q1: {start: "01", end: "03"},
      Q2: {start: "04", end: "06"},
      Q3: {start: "07", end: "09"},
      Q4: {start: "10", end: "12"},
      ANUAL: {start: "01", end: "12"},
    }

    static PRAZOS = ['Q1','Q2','Q3','Q4']


    static async getSimulacoes() {
        const queryStr = `
            SELECT 
                id,descricao,versao,versao_mur,sim_mur,
                CASE WHEN oficial=1 THEN 'Sim' ELSE 'Não' END oficial,
                FORMAT(log_data,'yyyy-MM-dd HH:mm:ss') log_data
            FROM hedging.simulacoes`;
        let queryParams = [];
        return database.query(queryStr, queryParams);
    }

    
    static async getSimulacao(idSim){
      let result = {};
      result.reports = [];
      try{
        let simulacao = await BLL.getSimulacaoMainData(idSim)
        result.simulacao = simulacao;
        //
        const detalhes = Object.keys(BLL.RESULTADOS_DETALHE);
        const prazos = simulacao.tipo_prazo == 'QUARTER' ? await BLL.getPrazosSimulacao(idSim) : [];
        for (const detalhe of detalhes) {
          let simulData = {};
          simulData.label = detalhe;
          simulData.reports = [];
          if( prazos.length > 0 )
            for (const prazo of prazos) {
              let report = await BLL.getChartsDataForSimulacao(simulacao,detalhe,prazo)
              simulData.reports.push(report);
            }
          else{
            let report = await BLL.getChartsDataForSimulacao(simulacao,detalhe)
            simulData.reports.push(report);
          }
          result.reports.push(simulData);
        }
      }
      catch(e){
        console.log(e)
        return {error:e.message}
      }
      return result;
    }

    static async getSimulacaoMainData(idSim){
      //GET BASE DATA
      const mainQueryStr = `
        SELECT 
          id,versao,descricao,versao_mur,sim_mur, tipo_prazo, year(prazo) prazo,
          CASE WHEN oficial=1 THEN 'Sim' ELSE 'Não' END oficial,
          FORMAT(log_data,'yyyy-MM-dd HH:mm:ss') log_data
        FROM hedging.simulacoes sim
        INNER JOIN 
          (SELECT distinct id_simulacao, tipo_prazo, min(prazo) prazo FROM hedging.simulacoes_resultados WHERE id_simulacao=@idd and id_resultado=1 group by id_simulacao,tipo_prazo) prz ON (sim.id = prz.id_simulacao)
        WHERE id=@idd`;
      let queryParams = [{name: 'idd',value: idSim}];
      let result = await database.query(mainQueryStr, queryParams);
      if (!result.length) throw new Error('Erro: Não existe a sim. indicada');
      return result[0];
    }

    static async getPrazosSimulacao(idSim){
      //GET BASE DATA
      const mainQueryStr = `
        SELECT MONTH(min(prazo)) mi, MONTH(max(prazo)) mf 
        FROM hedging.simulacoes_resultados WHERE id_simulacao=@idd and id_resultado=@t
      `;
      let queryParams = [{name: 'idd',value: idSim},{name:"t",value:BLL.TIPO_RESULTADOS.POSICOES}];
      let result = await database.query(mainQueryStr, queryParams);
      if (!result.length) throw new Error('Erro: Não existe a sim. indicada');

      let initialMonth = result[0].mi;
      let finalMonth = result[0].mf;
      //
      if(initialMonth == 1 && finalMonth == 3) return [BLL.PRAZOS[0]]; //Q1
      if(initialMonth == 1 && finalMonth == 6) return [BLL.PRAZOS[0],BLL.PRAZOS[1]]; //Q1,Q2
      if(initialMonth == 1 && finalMonth == 9) return [BLL.PRAZOS[0],BLL.PRAZOS[1],BLL.PRAZOS[1]]; //Q1,Q2,Q3
      if(initialMonth == 1 && finalMonth == 12) return BLL.PRAZOS; //Q1,Q2,Q3,Q4
      //
      if(initialMonth == 3 && finalMonth == 6) return [BLL.PRAZOS[1]]; //Q2
      if(initialMonth == 3 && finalMonth == 9) return [BLL.PRAZOS[1],BLL.PRAZOS[2]]; //Q2,Q3
      if(initialMonth == 3 && finalMonth == 12) return [BLL.PRAZOS[1],BLL.PRAZOS[2],BLL.PRAZOS[3]]; //Q2,Q3,Q4
      //
      if(initialMonth == 6 && finalMonth == 9) return [BLL.PRAZOS[3]]; //Q3
      if(initialMonth == 6 && finalMonth == 12) return [BLL.PRAZOS[1],BLL.PRAZOS[2],BLL.PRAZOS[3]]; //Q3,Q4
      //
      if(initialMonth == 9 && finalMonth == 12) return [BLL.PRAZOS[3]]; //Q4
    }

    static async getChartsDataForSimulacao(result,detalhe='MUR',quarter=null) {

        //TODO: create const variables to define RESULTADOS
        const idDetalhe = BLL.RESULTADOS_DETALHE[detalhe];

        //
        // ** CHART 'PONTOS' **
        const chart0LineQueryStr = `
            SELECT 
                valor_x, valor_y
            FROM hedging.simulacoes_resultados
            WHERE 
                id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and 
                tipo_prazo=@t and prazo=@p and valor_descr=@d
        `;
        let queryParams = [{name:'id',value:result.id},{name:'v',value:result.versao},{name:'r',value:BLL.TIPO_RESULTADOS.GRAFICO},{name:'dt',value: idDetalhe},{name:'t',value:result.tipo_prazo},{name:'p',value:`${result.prazo}-01-01`},{name: 'd',value: 'curva'}];
        let chart0Line = await database.query(chart0LineQueryStr, queryParams);
        chart0Line=chart0Line.map(v=>v=[v.valor_x,v.valor_y]) //to match FE JSON structure
        //
        const margemAndRisco = await BLL.getCoberturaMargemAndRisco(result,idDetalhe)
        //
        // ** TABLE 'cobertura' **  (TODO: review query params..)
        //
        //volumes
        const cobertura = await BLL.getVolumesPerQuarter(result,idDetalhe,BLL.TIPO_RESULTADOS.POSICOES,quarter)
        const coberturaTotal = await BLL.getVolumesTotais(result,idDetalhe,BLL.TIPO_RESULTADOS.POSICOES)
        //
        //
        // ** TABLE 'diferencial' ** 
        const margemAndRiscoDif = await BLL.getDifferentialMargemAndRisco(result,idDetalhe)
        const coberturaDif = await BLL.getDifferentialData(result,idDetalhe)
        const coberturaDifTotal = await BLL.getDifferentialPerQuarter(result,idDetalhe) //quarter == null => ANUAL
        //
        //
        // ** TABLE 'exposicao' **
        const exposicao = await BLL.getVolumesPerQuarter(result,idDetalhe,BLL.TIPO_RESULTADOS.EXPOSICAO,quarter)
        const exposicaoTotal = await BLL.getVolumesTotais(result,idDetalhe,BLL.TIPO_RESULTADOS.EXPOSICAO)
        const commoditiesExp = await BLL.getDistinctCommoditesForExposicao(result,idDetalhe)
        //
        // ** CHART 'diferencial' **
        const commoditiesCob = await BLL.getDistinctCommoditesForCobertura(result,idDetalhe)
        //
        // ** CHART 'cobertura' **
        //
        const coberturaAndExposicaoVolumes = await BLL.getCoberturaAndExposicao(result,idDetalhe)
        
        // ** FINAL JSON STRUCT **
        let report = {
          "label": quarter || 'ANUAL',
          "grafico_pontos":
          {
              "labels":[
                  "Sem Cobertura",
                  "Cobertura Atual",
                  "Cobertura Delta",
                  "Risco Mínimo",
                  "Atual Eficiente"
              ],
              "values":{
                  "curva": chart0Line,
                  "pontos": margemAndRisco.map(v=>v=[v.valor_x,v.valor_y,v.valor_descr]) //to match to FE structure
              }
          },
          "diferencial": await BLL.getDataForDifferentialChart(result,idDetalhe,commoditiesCob,quarter),
          "exposicao": {
              "header": [
                "Exposição",
                "un.",
                !quarter? "Total" : null,
                quarter == 'Q1'||!quarter? `Q1'${String(result.prazo).substr(2)}` : null,
                quarter == 'Q2'||!quarter? `Q2'${String(result.prazo).substr(2)}` : null,
                quarter == 'Q3'||!quarter? `Q3'${String(result.prazo).substr(2)}` : null,
                quarter == 'Q4'||!quarter? `Q4'${String(result.prazo).substr(2)}` : null,
              ].filter(f=>f!=null),
              "values": await BLL.getVolumesForExposicao(result,quarter,commoditiesExp,exposicao,exposicaoTotal)
          },
          "grafico_coberturas": {
              "labels": [
                "Cobertura Atual",
                "Risco Mínimo",
                "Cobertura Delta",
                "Atual Eficiente",
                "Exposição"
              ],
              "values": [
                quarter == 'Q1'||!quarter? BLL.getChartCoberturasVsExposicao(result,coberturaAndExposicaoVolumes,'Q1'):null,
                quarter == 'Q2'||!quarter? BLL.getChartCoberturasVsExposicao(result,coberturaAndExposicaoVolumes,'Q2'):null,
                quarter == 'Q3'||!quarter? BLL.getChartCoberturasVsExposicao(result,coberturaAndExposicaoVolumes,'Q3'):null,
                quarter == 'Q4'||!quarter? BLL.getChartCoberturasVsExposicao(result,coberturaAndExposicaoVolumes,'Q4'):null
              ].filter(f=>f!=null)
          },
          "tabela_cobertura":{
            "header":
            [
                "",
                "un.",
                !quarter? "Total" : null,
                quarter == 'Q1'||!quarter? `Q1'${String(result.prazo).substr(2)}`:null,
                quarter == 'Q2'||!quarter? `Q2'${String(result.prazo).substr(2)}`:null,
                quarter == 'Q3'||!quarter? `Q3'${String(result.prazo).substr(2)}`:null,
                quarter == 'Q4'||!quarter? `Q4'${String(result.prazo).substr(2)}`:null,
            ].filter(f=>f!=null),
            "values":[
                await BLL.getVolumesForCobertura(result,quarter,'cobertura_atual',margemAndRisco,cobertura,coberturaTotal,commoditiesCob),
                await BLL.getVolumesForCobertura(result,quarter,'risco_minimo',margemAndRisco,cobertura,coberturaTotal,commoditiesCob),
                await BLL.getVolumesForCobertura(result,quarter,'cobertura_delta',margemAndRisco,cobertura,coberturaTotal,commoditiesCob),
                await BLL.getVolumesForCobertura(result,quarter,'atual_eficiente',margemAndRisco,cobertura,coberturaTotal,commoditiesCob)
            ]
          },
          "tabela_cobertura_diferencial":{
            "header":
            [
                "",
                "un.",
                !quarter? "Total" : null,
                quarter == 'Q1'||!quarter? `Q1'${String(result.prazo).substr(2)}`:null,
                quarter == 'Q2'||!quarter? `Q2'${String(result.prazo).substr(2)}`:null,
                quarter == 'Q3'||!quarter? `Q3'${String(result.prazo).substr(2)}`:null,
                quarter == 'Q4'||!quarter? `Q4'${String(result.prazo).substr(2)}`:null,
            ].filter(f=>f!=null),
            "values":[
                await BLL.getVolumesForCobertura(result,quarter,'risco_minimo',margemAndRiscoDif,coberturaDif,coberturaDifTotal,commoditiesCob),
                await BLL.getVolumesForCobertura(result,quarter,'cobertura_delta',margemAndRiscoDif,coberturaDif,coberturaDifTotal,commoditiesCob),
                await BLL.getVolumesForCobertura(result,quarter,'atual_eficiente',margemAndRiscoDif,coberturaDif,coberturaDifTotal,commoditiesCob)
            ]
          }
        };
        return report
    }

    static async getVolumesForExposicao(simulacao,quarter,commodities,exposicao,exposicaoTotal){
      let result = [];
      for(const c of commodities){
        let data = await BLL.getVolumesForCommodity(simulacao,quarter,c,exposicao,exposicaoTotal);
        if(data) result.push(data);
      }
      return result;
    }

    static async getVolumesForCobertura(simulacao,quarter,group,margemAndRisco,volumes,volumesTotais,commoditiesCob){
        let groupTitle = ''
        let groupValues = ''
        switch(group){
            case 'cobertura_atual':
                groupTitle = '1 Cobertura Atual';
                groupValues = 'Posição Atual'
                break;
            case 'risco_minimo':
                groupTitle = '2 Risco Mínimo';
                groupValues = 'Mínimo'
                break;
            case 'cobertura_delta':
                groupTitle = '3 Cobertura Delta';
                groupValues = 'Posição Delta'
                break;
            case 'atual_eficiente':
                groupTitle = '4 Atual Eficiente';
                groupValues = 'Atual Eficiente'
                break;
        }
        
        return {
            "title":groupTitle,
            "margem":{
                "title":"Margem",
                "unidade":"€M",
                "data": (margemAndRisco?.find(v=>v.valor_descr==groupValues))?.valor_x || 0 || 0
            },
            "risco":{
                "title":"Risco",
                "unidade":"€M",
                "data": (margemAndRisco?.find(v=>v.valor_descr==groupValues))?.valor_y || 0 || 0
            },
            "values": await BLL.getValuesForCoberturas(simulacao,quarter,commoditiesCob,volumes,volumesTotais,groupValues)
        }
    }

    static getVolumesForCommodity(simulacao,quarter,commodity,volumes,volumesTotais,group){
      if( !volumesTotais?.length || !volumes?.length ) return []
      //
      let jsonObj = {}
      switch(commodity){
        case 'Power ES':
          jsonObj = {
            "title": "Elect",
            "unidade": "TWhe",
          }
          break;
        case 'API#2':
          jsonObj = {
            "title": "API2",
            "unidade": "MTon",
          }
          break;
        case 'TTF':
          jsonObj = {
            "title": "TTF",
            "unidade": "TWhg",
          }
          break;
        case 'CO2 - EUA':
          jsonObj = {
            "title": "CO2",
            "unidade": "MTon",
          }
          break;
        case 'USD':
          jsonObj = {
            "title": "USD",
            "unidade": "M$",
          }
          break;
        case 'Henry Hub':
          jsonObj = {
            "title": "Henry Hub",
            "unidade": "TMBtu",
          }
          break;
        case 'Dated Brent':
          jsonObj = {
            "title": "Dated Brent",
            "unidade": "Mbbl",
          }
          break;
        case 'Brent603':
          jsonObj = {
            "title": "Brent603",
            "unidade": "Mbbl",
          }
          break;
        case 'NBP':
          jsonObj = {
            "title": "NBP",
            "unidade": "Mtherm",
          }
          break;
        case 'GBP':
          jsonObj = {
            "title": "GBP",
            "unidade": "M£",
          }
          break;
        case 'JKM':
          jsonObj = {
            "title": "JKM",
            "unidade":"TMBtu"
          }
          break;
        default:
          jsonObj = {
            "title": commodity,
            "unidade":""
          }
      }
      //
      jsonObj.data = [
        volumesTotais.find(v=>v.commodity==commodity&&(group?v.valor_descr==group:true))?.volume || 0,
        volumes.find(v=>v.commodity==commodity&&v.quarter=='Q1'&&(group?v.valor_descr==group:true))?.volume || 0,
        volumes.find(v=>v.commodity==commodity&&v.quarter=='Q2'&&(group?v.valor_descr==group:true))?.volume || 0,
        volumes.find(v=>v.commodity==commodity&&v.quarter=='Q3'&&(group?v.valor_descr==group:true))?.volume || 0,
        volumes.find(v=>v.commodity==commodity&&v.quarter=='Q4'&&(group?v.valor_descr==group:true))?.volume || 0,
      ]
      if(simulacao.tipo_prazo == 'QUARTER' && quarter) {
        let index = Number(quarter.toLowerCase().substr(1));
        jsonObj.data = [jsonObj.data[index]]
      }
      //
      return jsonObj;
    }

    static async getVolumesPerQuarter(simulacao,id_detalhe,id_resultado,quarter){
      const coberturaTableVolumesQueryStr = `
            SELECT round(SUM(volume),1) volume, valor_descr, commodity, quarter  FROM 
            (
                SELECT 
                    valor_x/1000000 volume, valor_descr, commodity, 'Q1' quarter
                FROM hedging.simulacoes_resultados
                WHERE 
                    id_simulacao=@id and id_versao_simulacao=1 and id_resultado=@r and id_detalhe=@dt and 
                    tipo_prazo=@t and prazo >= '${simulacao.prazo}-01-01' and prazo <= '${simulacao.prazo}-03-01' 
                
                UNION	   

                SELECT 
                    valor_x/1000000 volume, valor_descr, commodity, 'Q2' quarter
                FROM hedging.simulacoes_resultados
                WHERE 
                    id_simulacao=@id and id_versao_simulacao=1 and id_resultado=@r and id_detalhe=@dt and 
                    tipo_prazo=@t and prazo >= '${simulacao.prazo}-03-01' and prazo <= '${simulacao.prazo}-06-01'
                
                UNION
               
                SELECT 
                    valor_x/1000000 volume, valor_descr, commodity, 'Q3' quarter
                FROM hedging.simulacoes_resultados
                WHERE 
                    id_simulacao=@id and id_versao_simulacao=1 and id_resultado=@r and id_detalhe=@dt and 
                    tipo_prazo=@t and prazo >= '${simulacao.prazo}-07-01' and prazo <= '${simulacao.prazo}-09-01'

                UNION

                SELECT 
                    valor_x/1000000 volume, valor_descr, commodity, 'Q4' quarter
                FROM hedging.simulacoes_resultados
                WHERE 
                    id_simulacao=@id and id_versao_simulacao=1 and id_resultado=@r and id_detalhe=@dt and 
                    tipo_prazo=@t and prazo >= '${simulacao.prazo}-10-01' and prazo <= '${simulacao.prazo}-12-01'
            ) 
            data
            ${quarter ? ` WHERE quarter = '${quarter}' ` : ``}
            GROUP by data.quarter, data.valor_descr, data.commodity
            ORDER BY data.quarter, data.valor_descr, data.commodity`
        ;
        let queryParams = [{name: 'id',value:simulacao.id},{name: 'v',value:simulacao.versao},{name:'r',value:id_resultado},{name:'dt',value:id_detalhe},{name:'t',value:simulacao.tipo_prazo}];
        let volumes = await database.query(coberturaTableVolumesQueryStr, queryParams);
        return volumes;
    }

    static async getVolumesTotais(simulacao,id_detalhe,id_resultado){
        const coberturaTableVolumesTotaisQueryStr = `
            SELECT 
                round(SUM(valor_x)/1000000,1) volume, valor_descr, commodity
            FROM hedging.simulacoes_resultados
            WHERE 
                id_simulacao=@id and id_versao_simulacao=1 and id_resultado=@r and id_detalhe=@dt and 
                tipo_prazo=@t and prazo >= '${simulacao.prazo}-01-01' and prazo <= '${simulacao.prazo}-12-01' 
            GROUP BY valor_descr, commodity
            ORDER BY valor_descr, commodity
        `;
        let queryParams = [{name: 'id',value:simulacao.id},{name: 'v',value:simulacao.versao},{name:'r',value:id_resultado},{name:'dt',value:id_detalhe},{name:'t',value:simulacao.tipo_prazo}];
        let volumesTotais = await database.query(coberturaTableVolumesTotaisQueryStr, queryParams);
        return volumesTotais;
    }

    static getChartCoberturasVsExposicao(simulacao,volumes,quarter){
      if( !volumes?.length ) return [];
      //
      return {
        "title": `${quarter.toUpperCase()}'${String(simulacao.prazo).substr(2)}`,
        "data": [
          volumes.find(v=>v.valor_descr=='Posição Atual'&&v.quarter==quarter.toUpperCase())?.volume || 0,
          volumes.find(v=>v.valor_descr=='Mínimo'&&v.quarter==quarter.toUpperCase())?.volume || 0,
          volumes.find(v=>v.valor_descr=='Posição Delta'&&v.quarter==quarter.toUpperCase())?.volume || 0,
          volumes.find(v=>v.valor_descr=='Atual Eficiente'&&v.quarter==quarter.toUpperCase())?.volume || 0,
          volumes.find(v=>v.valor_descr=='Exposição'&&v.quarter==quarter.toUpperCase())?.volume || 0
        ]
      }
    }

    static async getCoberturaAndExposicao(simulacao,id_detalhe,quarter){
      const chartCoberturaQueryStr = `
        SELECT round(volume,1) volume, valor_descr, quarter FROM 
        (
            SELECT 
                sum(valor_x)/1000000 volume, valor_descr, 'Q1' quarter
            FROM hedging.simulacoes_resultados
            WHERE 
                id_simulacao=@id and id_versao_simulacao=1 and id_resultado=@r and id_detalhe=@dt and 
                tipo_prazo=@t and prazo >= '${simulacao.prazo}-01-01' and prazo <= '${simulacao.prazo}-03-01' and commodity=@c
            GROUP BY valor_descr

            UNION	   

            SELECT 
                sum(valor_x)/1000000 volume, valor_descr, 'Q2' quarter
            FROM hedging.simulacoes_resultados
            WHERE 
                id_simulacao=@id and id_versao_simulacao=1 and id_resultado=@r and id_detalhe=@dt and 
                tipo_prazo=@t and prazo >= '${simulacao.prazo}-03-01' and prazo <= '${simulacao.prazo}-06-01' and commodity=@c
            GROUP BY valor_descr
            
            UNION
          
            SELECT 
                sum(valor_x)/1000000 volume, valor_descr, 'Q3' quarter
            FROM hedging.simulacoes_resultados
            WHERE 
                id_simulacao=@id and id_versao_simulacao=1 and id_resultado=@r and id_detalhe=@dt and 
                tipo_prazo=@t and prazo >= '${simulacao.prazo}-07-01' and prazo <= '${simulacao.prazo}-09-01' and commodity=@c
            GROUP BY valor_descr

            UNION

            SELECT 
                sum(valor_x)/1000000 volume, valor_descr, 'Q4' quarter
            FROM hedging.simulacoes_resultados
            WHERE 
                id_simulacao=@id and id_versao_simulacao=1 and id_resultado=@r and id_detalhe=@dt and 
                tipo_prazo=@t and prazo >= '${simulacao.prazo}-10-01' and prazo <= '${simulacao.prazo}-12-01' and commodity=@c
            GROUP BY valor_descr
        ) 
        data
        ${quarter ? ` WHERE quarter = '${quarter}' ` : ``}
        ORDER BY data.quarter, data.valor_descr
        `;
      let queryParams = [{name: 'id',value:simulacao.id},{name:'v',value:simulacao.versao},{name:'r',value:BLL.TIPO_RESULTADOS.POSICOES},{name:'dt',value:id_detalhe},{name:'t',value:simulacao.tipo_prazo},{name:'c',value:'Power ES'}];
      let coberturasVsExposicaoVolumes = await database.query(chartCoberturaQueryStr, queryParams);
      return coberturasVsExposicaoVolumes;
    }

    static async getDifferentialData(simulacao,id_detalhe,commodity){
      let difResult = [
        await BLL.getDifferentialPerQuarter(simulacao,id_detalhe,commodity,'Q1'),
        await BLL.getDifferentialPerQuarter(simulacao,id_detalhe,commodity,'Q2'),
        await BLL.getDifferentialPerQuarter(simulacao,id_detalhe,commodity,'Q3'),
        await BLL.getDifferentialPerQuarter(simulacao,id_detalhe,commodity,'Q4')
      ]
      return difResult.flat();
    }

    static async getDifferentialPerQuarter(simulacao,id_detalhe,commodity,quarter){
      if( commodity == 'Dated Brent' || commodity == 'USD' ) return;
      const quarterMonths = quarter ? BLL.QUARTER_MONTHS[`${quarter}`] : BLL.QUARTER_MONTHS.ANUAL;
      const query = `
        SELECT round((volume_c - volume_a),1) risco_minimo, round((volume_b - volume_a),1) delta, round((volume_d - volume_a),1) atual_eficiente, commodity
        FROM 
        (
          SELECT a.volume volume_a, b.volume volume_b, c.volume volume_c, d.volume volume_d, a.commodity
          FROM 
          (
          SELECT round(SUM(valor_x)/1000000,1) volume, valor_descr, commodity
          FROM hedging.simulacoes_resultados
          WHERE id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and tipo_prazo=@t and prazo >= '${simulacao.prazo}-${quarterMonths.start}-01' and prazo <= '${simulacao.prazo}-${quarterMonths.end}-01' and valor_descr = 'Posição Atual'
          GROUP BY valor_descr, commodity
          ) a inner join 
          (
          SELECT round(SUM(valor_x)/1000000,1) volume, valor_descr, commodity
          FROM hedging.simulacoes_resultados
          WHERE id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and tipo_prazo=@t and prazo >= '${simulacao.prazo}-${quarterMonths.start}-01' and prazo <= '${simulacao.prazo}-${quarterMonths.end}-01' and valor_descr = 'Posição Delta'
          GROUP BY valor_descr, commodity
          ) b ON (a.commodity = b.commodity) inner join 
          (
          SELECT round(SUM(valor_x)/1000000,1) volume, valor_descr, commodity
          FROM hedging.simulacoes_resultados
          WHERE id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and tipo_prazo=@t and prazo >= '${simulacao.prazo}-${quarterMonths.start}-01' and prazo <= '${simulacao.prazo}-${quarterMonths.end}-01' and valor_descr = 'Mínimo'
          GROUP BY valor_descr, commodity
          ) c ON (b.commodity = c.commodity) inner join 
          (
            SELECT round(SUM(valor_x)/1000000,1) volume, valor_descr, commodity 
            FROM hedging.simulacoes_resultados
            WHERE id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and tipo_prazo=@t and prazo >= '${simulacao.prazo}-${quarterMonths.start}-01' and prazo <= '${simulacao.prazo}-${quarterMonths.end}-01' and valor_descr = 'Atual Eficiente'
            GROUP BY valor_descr, commodity
          ) d ON (c.commodity = d.commodity)
        ) x
        ${commodity ? ` WHERE commodity = @c ` : ``}
      `;
      let queryParams = [{name: 'id',value:simulacao.id},{name: 'v',value:simulacao.versao},{name:'r',value:BLL.TIPO_RESULTADOS.POSICOES},{name:'dt',value:id_detalhe},{name:'t',value:simulacao.tipo_prazo},{name:'c',value:commodity}];
      const differential = await database.query(query, queryParams);
      let result = [];
      differential.map(m=>{
        result.push(
          {valor_descr:'Mínimo',volume:m.risco_minimo,commodity:m.commodity,quarter},
          {valor_descr:'Posição Delta',volume:m.delta,commodity:m.commodity,quarter},
          {valor_descr:'Atual Eficiente',volume:m.atual_eficiente,commodity:m.commodity,quarter}
        );
      });
      return result;
    }

    static async getVolumesForDifferential(group,margemAndRisco,volumes,volumesTotais,commoditiesCob){
      let groupTitle = ''
      let groupValues = ''
      switch(group){
          case 'cobertura_atual':
              groupTitle = '1 Cobertura Atual';
              groupValues = 'Posição Atual'
              break;
          case 'risco_minimo':
              groupTitle = '2 Risco Mínimo';
              groupValues = 'Mínimo'
              break;
          case 'cobertura_delta':
              groupTitle = '3 Cobertura Delta';
              groupValues = 'Posição Delta'
              break;
          case 'atual_eficiente':
              groupTitle = '4 Atual Eficiente';
              groupValues = 'Atual Eficiente'
              break;
      }
      
      return {
          "title":groupTitle,
          "margem":{
              "title":"Margem",
              "unidade":"€M",
              "data": (margemAndRisco?.find(v=>v.valor_descr==groupValues))?.valor_x || 0 || 0
          },
          "risco":{
              "title":"Risco",
              "unidade":"€M",
              "data": (margemAndRisco?.find(v=>v.valor_descr==groupValues))?.valor_y || 0 || 0
          },
          "values": await BLL.getValuesForCoberturas(result,quarter,commoditiesCob,volumes,volumesTotais,group)
      }
    }

    static async getDistinctCommoditesForExposicao(simulacao,idDetalhe){
      const queryStr = `
        SELECT 
            distinct commodity
        FROM hedging.simulacoes_resultados
        WHERE 
            id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and commodity NOT LIKE '%Brent%'
      `;
      let queryParams = [{name:'id',value:simulacao.id},{name:'v',value:simulacao.versao},{name:'r',value:BLL.TIPO_RESULTADOS.EXPOSICAO},{name:'dt',value: idDetalhe}];
      let result = await database.query(queryStr, queryParams);
      return result.map(c=>c.commodity);
    }

    static async getDistinctCommoditesForCobertura(simulacao,idDetalhe){
      const queryStr = `
        SELECT 
            distinct commodity
        FROM hedging.simulacoes_resultados
        WHERE 
            id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and commodity NOT LIKE '%Brent%'
      `;
      let queryParams = [{name:'id',value:simulacao.id},{name:'v',value:simulacao.versao},{name:'r',value:BLL.TIPO_RESULTADOS.POSICOES},{name:'dt',value: idDetalhe}];
      let result = await database.query(queryStr, queryParams);
      return result.map(c=>c.commodity);
    }

    static async getDataForDifferentialChart(simulacao,idDetalhe,commodities,quarter){
      let result = [];
      for(const c of commodities){
        let data = await BLL.getDifferentialPerQuarter(simulacao,idDetalhe,c,quarter)
        if( data?.length > 0 ) {
          let res = BLL.getValuesForDifferential(c,data)
          if( res ) result.push(res);
        }
      }
      return result;
    }

    static getValuesForDifferential(commodity,volumes){
      if( !volumes?.length ) return {}
      let jsonObj = {};
      //
      switch(commodity)
      {
        case 'Power ES':
          jsonObj.title = "Elect";
          break;
        case 'API#2':
          jsonObj.title = "API2";
          break;
        case 'CO2 - EUA':
          jsonObj.title = "CO2";
          break;
        default:
          jsonObj.title = commodity;
      }
      //
      jsonObj.data = [{
        "risco_minimo": volumes.find(v=>v.valor_descr=='Mínimo')?.volume || 0
      },{
        "cobertura_delta": volumes.find(v=>v.valor_descr=='Posição Delta')?.volume || 0
      }];
      return jsonObj;
    }

    static async getValuesForCoberturas(simulacao,quarter,commodities,volumes,volumesTotais,group){
      let result = [];
      for(const c of commodities){
        let data = await BLL.getVolumesForCommodity(simulacao,quarter,c,volumes,volumesTotais,group);
        if(data) result.push(data);
      }
      return result;
    }

    static async getCoberturaMargemAndRisco(simulacao,id_detalhe){
      const chart0DotsQueryStr = `
            SELECT 
                round(valor_x,0) valor_x, round(valor_y,0) valor_y, valor_descr
            FROM hedging.simulacoes_resultados
            WHERE 
                id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and 
                tipo_prazo=@t and prazo=@p
        `;
        let queryParams = [{name: 'id',value:simulacao.id},{name:'v',value:simulacao.versao},{name:'r',value:BLL.TIPO_RESULTADOS.PONTOS},{name:'dt',value:id_detalhe},{name:'t',value:simulacao.tipo_prazo},{name:'p',value:`${simulacao.prazo}-01-01`}];
        let margemAndRisco = await database.query(chart0DotsQueryStr, queryParams);
        return margemAndRisco;
    }

    static async getDifferentialMargemAndRisco(simulacao,id_detalhe){
      const queryStr = `
          SELECT 
          round((b.valor_x - a.valor_x),1) valor_x, 
          round((b.valor_y - a.valor_y),1) valor_y,
          b.valor_descr
          FROM
          (
            SELECT 
                round(valor_x,0) valor_x, round(valor_y,0) valor_y, valor_descr
            FROM hedging.simulacoes_resultados
            WHERE 
                id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and 
                tipo_prazo=@t and prazo=@p and valor_descr = @pa
          ) a,
          (
          SELECT 
            round(valor_x,0) valor_x, round(valor_y,0) valor_y, valor_descr
          FROM hedging.simulacoes_resultados
          WHERE 
              id_simulacao=@id and id_versao_simulacao=@v and id_resultado=@r and id_detalhe=@dt and 
              tipo_prazo=@t and prazo=@p and valor_descr <> @pa
          ) b
        `;
        let queryParams = [{name: 'id',value:simulacao.id},{name:'v',value:simulacao.versao},{name:'r',value:BLL.TIPO_RESULTADOS.PONTOS},{name:'dt',value:id_detalhe},{name:'t',value:simulacao.tipo_prazo},{name:'p',value:`${simulacao.prazo}-01-01`},{name:'pa',value:'Posição Atual'}];
        let margemAndRisco = await database.query(queryStr, queryParams);
        return margemAndRisco;
    }

    // COLS is used in ADD and EDIT
    static CHART_TYPES = {
        grafico: "grafico",
        XMLDocument: "grafico",
        dsadsa: "grafico",
        gr3dsadsaafico: "grafico",
    };
}

module.exports = BLL;