import { chromium } from '@playwright/test';
// A documentary diagram rendered locally; it is not a historical product screenshot.
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 960, height: 400 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html lang="pt"><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;background:#f5f3f7;color:#292230;font:16px Arial,sans-serif;padding:36px}
        h1{font-size:26px;margin:12px 0 8px}p{color:#665c70;margin:0 0 30px}.label{color:#77548c;text-transform:uppercase;font-size:12px;font-weight:bold;letter-spacing:2px}
        .flow{display:flex;align-items:center;gap:12px}.card{background:white;border:1px solid #dfd7e5;border-top:4px solid #8b5ba8;border-radius:8px;padding:22px 16px;width:200px;min-height:104px}.card b{display:block;margin-bottom:10px}.card small{color:#665c70;font-size:13px}.arrow{color:#9988a5;font-size:23px}.done{border-top-color:#1b8a69}.foot{margin-top:30px;padding-top:20px;border-top:1px solid #dfd7e5;display:flex;justify-content:space-between;font-size:13px;color:#665c70}
        </style><div class="label">TeamOS · projeto de exemplo</div><h1>Da execução à aceitação funcional</h1><p>O trabalho técnico e a decisão funcional têm momentos próprios.</p>
        <div class="flow"><div class="card"><b>Epic → User Story</b><small>Objetivo, âmbito e critérios de aceitação</small></div><span class="arrow">→</span><div class="card"><b>Tasks concluídas</b><small>Implementação, correções e cobertura técnica</small></div><span class="arrow">→</span><div class="card"><b>Ready to test</b><small>Testing e possível regresso à análise</small></div><span class="arrow">→</span><div class="card done"><b>Done</b><small>Aceitação funcional explícita pelo responsável</small></div></div>
        <div class="foot"><span>Documento ilustrativo (fictício) · não é uma captura histórica</span><span>Mário · Sebastião</span></div></html>`);
    await page.screenshot({ path: new URL('./workflow-ficticio.png', import.meta.url).pathname });
} finally { await browser.close(); }
