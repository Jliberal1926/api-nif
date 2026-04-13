const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('/consultar_nif', async (req, res) => {

    const nif = req.method === 'POST' ? req.body.nif : req.query.nif;

    if (!nif) {
        return res.json({ status: 'erro', mensagem: 'NIF não fornecido' });
    }

    let browser;

    try {

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        await page.goto(
            'https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte',
            { waitUntil: 'networkidle2' }
        );

        await page.waitForSelector('#j_id_2x\\:txtNIFNumber');

        await page.type('#j_id_2x\\:txtNIFNumber', nif);

        await page.evaluate(() => {
            const btn = document.querySelector('#j_id_2x\\:j_id_34');
            if (btn) btn.click();
        });

        await page.waitForFunction(() =>
            document.body.innerText.includes("Nome")
        );

        const texto = await page.evaluate(() => document.body.innerText);

        const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

        const get = (campo) => {
            for (let i = 0; i < linhas.length; i++) {
                if (linhas[i].toLowerCase().includes(campo.toLowerCase())) {
                    let val = linhas[i].split(':')[1];
                    if (!val && linhas[i + 1]) val = linhas[i + 1];
                    return (val || '').trim();
                }
            }
            return "";
        };

        await browser.close();

        return res.json({
            status: 'ok',
            nif: get("NIF"),
            nome: get("Nome"),
            tipo: get("Tipo"),
            estado: get("Estado"),
            inadinplente: get("Inadimplente"),
            regime_iva: get("Regime de IVA"),
            residente: get("Residente Fiscal")
        });

    } catch (e) {

        if (browser) await browser.close();

        return res.json({
            status: 'erro',
            mensagem: e.message
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log('Servidor rodando na porta ' + PORT);
});