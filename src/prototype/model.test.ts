import { INITIAL_EVENTS, clampStart, formatHour, formatRange, placeEvents, snap, type CalEvent } from './model';

const ev = (id: string, start: number, length: number): CalEvent => ({ id, day: 0, start, length, title: id, tone: 'blue' });

describe('time helpers', () => {
  it('formats hours like the prototype', () => {
    expect(formatHour(9)).toBe('9 AM');
    expect(formatHour(12.5)).toBe('12:30 PM');
    expect(formatHour(13.25)).toBe('1:15 PM');
    expect(formatRange(11, 1.5)).toBe('11 AM – 12:30 PM');
  });

  it('snaps to quarter hours and keeps blocks inside 8 AM to 6 PM', () => {
    expect(snap(10.13)).toBe(10.25);
    expect(clampStart(7, 1)).toBe(8);
    expect(clampStart(17.5, 1)).toBe(17);
  });
});

describe('placeEvents', () => {
  it('leaves separate events full width', () => {
    const places = placeEvents(INITIAL_EVENTS.filter((e) => e.day === 0));
    for (const p of places.values()) expect(p).toEqual({ depth: 0, lane: 0, lanes: 1 });
  });

  it('puts events that start together side by side', () => {
    const places = placeEvents([ev('a', 10, 1), ev('b', 10.25, 1)]);
    expect(places.get('a')).toEqual({ depth: 0, lane: 0, lanes: 2 });
    expect(places.get('b')).toEqual({ depth: 0, lane: 1, lanes: 2 });
  });

  it('insets a later overlapping event so the one under it shows', () => {
    const places = placeEvents([ev('a', 10, 2), ev('b', 11, 1)]);
    expect(places.get('a')?.depth).toBe(0);
    expect(places.get('b')?.depth).toBe(1);
  });
});
