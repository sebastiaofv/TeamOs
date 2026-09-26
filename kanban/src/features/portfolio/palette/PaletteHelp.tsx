// The "Command palette" tab of the Help dialog: how to open and use the
// palette, with examples that open it pre-filled.

import type { TranslationKey } from '@/shared/i18n';
import { useI18n } from '@/shared/i18n';
import { PALETTE_SHORTCUT_LABEL, openCommandPalette } from './openCommandPalette';

type Example = { query: string; description: TranslationKey };

const FIND_EXAMPLES: Example[] = [
    { query: 'login', description: 'paletteHelp.exSearch' },
    { query: '#14', description: 'paletteHelp.exId' },
    { query: '#auth', description: 'paletteHelp.exTag' },
    { query: 'ana', description: 'paletteHelp.exPerson' },
    { query: 'planner', description: 'paletteHelp.exCommand' }
];
const CREATE_EXAMPLE = '+ Fix login crash @ana !high #auth ~S due:fri in:mobile';
const CREATE_TOKENS: [string, TranslationKey][] = [
    ['@ana', 'paletteHelp.tokPerson'],
    ['!high  !m  !l', 'paletteHelp.tokPriority'],
    ['#auth', 'paletteHelp.tokTag'],
    ['~S', 'paletteHelp.tokEffort'],
    ['due:fri', 'paletteHelp.tokDue'],
    ['in:mobile', 'paletteHelp.tokProject']
];
const PLAN_EXAMPLES: Example[] = [
    { query: 'plan login 14:00', description: 'paletteHelp.exPlanTime' },
    { query: 'plan login', description: 'paletteHelp.exPlan' }
];

function ExampleRow({ example }: { example: Example }) {
    const { t } = useI18n();
    return (
        <li className="palette-help-example">
            <code>{example.query}</code>
            <span>{t(example.description)}</span>
            <button
                className="btn-text"
                type="button"
                aria-label={t('paletteHelp.tryLabel', { query: example.query })}
                onClick={() => openCommandPalette(example.query)}
            >{t('paletteHelp.try')}</button>
        </li>
    );
}

export function PaletteHelp() {
    const { t } = useI18n();
    const keys = PALETTE_SHORTCUT_LABEL;
    return (
        <div className="help-manual palette-help">
            <div className="help-intro">
                <div className="help-intro-title">{t('paletteHelp.tabPalette')}</div>
                <div className="help-intro-text">{t('paletteHelp.intro')}</div>
            </div>

            <div className="help-grid">
                <section className="help-card" aria-labelledby="palette-help-open">
                    <h3 className="help-card-title" id="palette-help-open">{t('paletteHelp.openTitle')}</h3>
                    <ul>
                        <li>{t('paletteHelp.openShortcut', { keys })}</li>
                        <li>{t('paletteHelp.openSlash')}</li>
                        <li>{t('paletteHelp.openBox')}</li>
                        <li>{t('paletteHelp.openClose')}</li>
                    </ul>
                </section>

                <section className="help-card" aria-labelledby="palette-help-keys">
                    <h3 className="help-card-title" id="palette-help-keys">{t('paletteHelp.keysTitle')}</h3>
                    <dl className="palette-help-keys">
                        <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>{t('paletteHelp.keyMove')}</dd>
                        <dt><kbd>Enter</kbd></dt><dd>{t('paletteHelp.keyRun')}</dd>
                        <dt><kbd>Tab</kbd> / <kbd>→</kbd></dt><dd>{t('paletteHelp.keyDrill')}</dd>
                        <dt><kbd>⌫</kbd></dt><dd>{t('paletteHelp.keyBack')}</dd>
                    </dl>
                </section>
            </div>

            <section className="help-card" aria-labelledby="palette-help-find">
                <h3 className="help-card-title" id="palette-help-find">{t('paletteHelp.findTitle')}</h3>
                <ul className="palette-help-examples">
                    {FIND_EXAMPLES.map((example) => <ExampleRow example={example} key={example.query} />)}
                </ul>
            </section>

            <div className="help-grid">
                <section className="help-card" aria-labelledby="palette-help-act">
                    <h3 className="help-card-title" id="palette-help-act">{t('paletteHelp.actTitle')}</h3>
                    <ul>
                        <li>{t('paletteHelp.act1', { keys })}</li>
                        <li>{t('paletteHelp.act2')}</li>
                        <li>{t('paletteHelp.act3')}</li>
                    </ul>
                    <p className="palette-help-hint">{t('paletteHelp.actExample')}</p>
                </section>

                <section className="help-card" aria-labelledby="palette-help-filter">
                    <h3 className="help-card-title" id="palette-help-filter">{t('paletteHelp.filterTitle')}</h3>
                    <ul>
                        <li>{t('paletteHelp.filter1')}</li>
                        <li>{t('paletteHelp.filter2')}</li>
                    </ul>
                </section>
            </div>

            <section className="help-card" aria-labelledby="palette-help-create">
                <h3 className="help-card-title" id="palette-help-create">{t('paletteHelp.createTitle')}</h3>
                <p>{t('paletteHelp.create1')}</p>
                <div className="palette-help-sample">
                    <code>{CREATE_EXAMPLE}</code>
                    <button
                        className="btn-text"
                        type="button"
                        aria-label={t('paletteHelp.tryLabel', { query: CREATE_EXAMPLE })}
                        onClick={() => openCommandPalette(CREATE_EXAMPLE)}
                    >{t('paletteHelp.try')}</button>
                </div>
                <dl className="palette-help-tokens">
                    {CREATE_TOKENS.map(([token, description]) => (
                        <div key={token}>
                            <dt><code>{token}</code></dt>
                            <dd>{t(description)}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <section className="help-card" aria-labelledby="palette-help-plan">
                <h3 className="help-card-title" id="palette-help-plan">{t('paletteHelp.planTitle')}</h3>
                <ul className="palette-help-examples">
                    {PLAN_EXAMPLES.map((example) => <ExampleRow example={example} key={example.query} />)}
                </ul>
            </section>

            <div className="help-note">
                <strong>{t('paletteHelp.tipsTitle')}:</strong> {t('paletteHelp.tipRecent')} {t('paletteHelp.tipUndo')} {t('paletteHelp.tipReadOnly')}
            </div>
        </div>
    );
}
