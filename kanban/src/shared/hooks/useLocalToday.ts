import { useEffect, useState } from 'react';
import { todayLocalIsoDate } from '@/domain/util';

/** Calendar-derived views refresh at local midnight and when a suspended tab resumes. */
export function useLocalToday(): string {
    const [today, setToday] = useState(todayLocalIsoDate);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const scheduleMidnight = () => {
            clearTimeout(timer);
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            timer = setTimeout(() => { setToday(todayLocalIsoDate()); scheduleMidnight(); }, midnight.getTime() - now.getTime() + 25);
        };
        const refresh = () => { setToday(todayLocalIsoDate()); scheduleMidnight(); };
        scheduleMidnight();
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);
    return today;
}
