const express = require('express');
const puppeteer = require('puppeteer');

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

        // =========================
        // BROWSER (RENDER SAFE)
        // =========================
        browser = await puppeteer.launch({
            headless: true, // 🔥 obrigatório no Render
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list'
            ]
        });

        const page = await browser.newPage();

        await page.setBypassCSP(true);

        // =========================
        // ABRIR AGT
        // =========================
        await page.goto(
            'https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte',
            { waitUntil: 'networkidle2', timeout: 60000 }
        );

        // =========================
        // INPUT NIF
        // =========================
        await page.waitForSelector('#j_id_2x\\:txtNIFNumber', { visible: true });

        await page.evaluate((nif) => {
            const input = document.querySelector('#j_id_2x\\:txtNIFNumber');
            if (input) {
                input.value = '';
                input.focus();
                input.value = nif;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, nif);

        // =========================
        // CLICK PESQUISA
        // =========================
        await page.evaluate(() => {

            const btn = document.querySelector('#j_id_2x\\:j_id_34');

            if (btn) {
                btn.click();
            } else if (window.PrimeFaces && PrimeFaces.ab) {
                PrimeFaces.ab({
                    s: 'j_id_2x:j_id_34',
                    p: 'j_id_2x',
                    u: 'showpanelNIF'
                });
            }

        });

        // =========================
        // ESPERA DINÂMICA (MELHOR QUE 10s FIXO)
        // =========================
        await page.waitForFunction(() => {
            return document.body.innerText.includes("Nome") ||
                   document.body.innerText.includes("Tipo");
        }, { timeout: 15000 });

        // =========================
        // TEXTO FINAL
        // =========================
        const resultadoTexto = await page.evaluate(() => document.body.innerText);

        const linhas = resultadoTexto
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);

        const pegarValor = (campo) => {
            for (let i = 0; i < linhas.length; i++) {
                if (linhas[i].toLowerCase().includes(campo.toLowerCase())) {

                    let valor = linhas[i].split(':')[1];

                    if (!valor && linhas[i + 1]) {
                        valor = linhas[i + 1];
                    }

                    return (valor || '').trim();
                }
            }
            return "";
        };

        const nif_result = pegarValor("NIF");
        const nome = pegarValor("Nome");
        const tipo = pegarValor("Tipo");
        const estado = pegarValor("Estado");
        const inadinplente = pegarValor("Inadimplente");
        const regime_iva = pegarValor("Regime de IVA");
        const residente = pegarValor("Residente Fiscal");

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
// PORT RENDER FIX
// =========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log('Servidor rodando na porta ' + PORT);
});