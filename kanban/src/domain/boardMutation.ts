import type { BoardData } from './types';
import { cloneSerializable } from './serializable';
import { getBoardTimelineData } from './timeline';
import { rememberNormalizedTimeline } from './timelineSchema';

/** A mutable current-state draft, without copying immutable historical payloads. */
export function cloneBoardCurrentState(data: BoardData): BoardData {
    const extensions = { ...data.extensions };
    delete extensions.timeline;
    return cloneSerializable({ ...data, extensions });
}

/** Commands append new events; already published events remain immutable.
 * A separate array lets a cancelled draft append/remove events independently. */
export function cloneBoardForMutation(data: BoardData): BoardData {
    const draft = cloneBoardCurrentState(data);
    const timeline = getBoardTimelineData(data);
    if (timeline) draft.extensions.timeline = rememberNormalizedTimeline({ ...timeline, events: timeline.events.slice() });
    return draft;
}
