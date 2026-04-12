const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// CONSULTA NIF
// =========================
app.all('/consultar_nif', async (req, res) => {

    const nif = req.method === 'POST' ? req.body.nif : req.query.nif;

    if (!nif) {
        return res.json({ status: 'erro', mensagem: 'NIF não fornecido' });
    }

    let browser;

    try {

        // =========================
        // DETECTAR RENDER
        // =========================
        const isRender = process.env.RENDER === "true";

        // =========================
        // INICIAR BROWSER
        // =========================
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: isRender
                ? process.env.PUPPETEER_EXECUTABLE_PATH
                : undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        const page = await browser.newPage();

        await page.setBypassCSP(true);

        // =========================
        // ABRIR SITE AGT
        // =========================
        await page.goto(
            'https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte',
            { waitUntil: 'networkidle2', timeout: 60000 }
        );

        // =========================
        // ESPERAR INPUT
        // =========================
        await page.waitForSelector('#j_id_2x\\:txtNIFNumber', { visible: true });

        // =========================
        // PREENCHER NIF
        // =========================
        await page.type('#j_id_2x\\:txtNIFNumber', nif, { delay: 50 });

        // =========================
        // CLICAR PESQUISAR
        // =========================
        await page.evaluate(() => {
            const btn = document.querySelector('#j_id_2x\\:j_id_34');
            if (btn) btn.click();
        });

        // =========================
        // ESPERAR RESULTADO
        // =========================
        await page.waitForFunction(() => {
            return document.body.innerText.includes("Nome") ||
                   document.body.innerText.includes("Tipo");
        }, { timeout: 20000 });

        // =========================
        // PEGAR TEXTO DA PÁGINA
        // =========================
        const texto = await page.evaluate(() => document.body.innerText);

        const linhas = texto
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);

        const getValue = (campo) => {
            for (let i = 0; i < linhas.length; i++) {
                if (linhas[i].toLowerCase().includes(campo.toLowerCase())) {
                    let val = linhas[i].split(':')[1];
                    if (!val && linhas[i + 1]) val = linhas[i + 1];
                    return (val || '').trim();
                }
            }
            return "";
        };

        const nif_result = getValue("NIF");
        const nome = getValue("Nome");
        const tipo = getValue("Tipo");
        const estado = getValue("Estado");
        const inadinplente = getValue("Inadimplente");
        const regime_iva = getValue("Regime de IVA");
        const residente = getValue("Residente Fiscal");

        await browser.close();

        if (!nome) {
            return res.json({
                status: 'erro',
                mensagem: 'Não foi possível extrair dados do NIF'
            });
        }

        return res.json({
            status: 'ok',
            nif: nif_result,
            nome,
            tipo,
            estado,
            inadinplente,
            regime_iva,
            residente
        });

    } catch (e) {

        if (browser) {
            try { await browser.close(); } catch {}
        }

        return res.json({
            status: 'erro',
            mensagem: e.message
        });
    }
});

// =========================
// PORT RENDER
// =========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log("Servidor rodando na porta " + PORT);
});