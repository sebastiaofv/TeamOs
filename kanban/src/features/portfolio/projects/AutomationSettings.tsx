import { type AutomationRule, type AutomationMode, type HierarchyAutomations } from '@/domain/hierarchyAutomations';
import { useI18n } from '@/shared/i18n';

const GROUPS: { name: 'progress' | 'exceptions' | 'sprint'; rules: AutomationRule[] }[] = [
    { name: 'progress', rules: ['parentToTodo', 'startParent', 'prepareTesting', 'completeEpic'] },
    { name: 'exceptions', rules: ['cancelParent', 'reopenParent', 'hierarchyChanges'] },
    { name: 'sprint', rules: ['sprintUnfinishedTasks'] }
];
const MODES: AutomationMode[] = ['off', 'confirm', 'automatic'];
export function AutomationSettings({ config, onChange, disabled }: { config: HierarchyAutomations; onChange: (config: HierarchyAutomations) => void; disabled: boolean }) {
    const { t } = useI18n();
    return <section className="automation-settings" aria-label={t('automations.title')}>
        <div className="automation-legend">{MODES.map((mode) => <p key={mode}><strong>{t(`automations.mode.${mode}`)}</strong> — {t(`automations.mode.${mode}.help`)}</p>)}</div>
        {GROUPS.map((group) => <section className="automation-group" key={group.name} aria-labelledby={`automation-group-${group.name}`}><h2 id={`automation-group-${group.name}`}>{t(`automations.group.${group.name}`)}</h2>
        {group.rules.map((rule) => <div className="automation-rule" key={rule}>
            <div><h3 id={`automation-${rule}`}>{t(`automations.${rule}.name`)}</h3><p id={`automation-${rule}-help`}>{t(`automations.${rule}.description`)}</p></div>
            <fieldset className="automation-toggle" disabled={disabled} aria-labelledby={`automation-${rule}`} aria-describedby={`automation-${rule}-help`}>
                {MODES.map((mode) => <label key={mode} className={config.rules[rule] === mode ? 'is-selected' : ''}>
                    <input type="radio" name={`automation-${rule}`} value={mode} checked={config.rules[rule] === mode} onChange={() => onChange({ ...config, rules: { ...config.rules, [rule]: mode } })} />
                    <span>{t(`automations.mode.${mode}`)}</span>
                </label>)}
            </fieldset>
        </div>)}
        </section>)}
    </section>;
}
