import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, parseHash } from './App';
import { initialData } from './state/store';

const NOW = Date.UTC(2026, 8, 30, 9);

function renderApp(hash = '#/') {
  window.history.replaceState(null, '', hash);
  window.localStorage.clear();
  return render(<App initial={initialData(NOW)} />);
}

/** jsdom has no layout, so point hit-testing at a chosen element for the length of a drag. */
function pointAt(el: Element) {
  const original = document.elementsFromPoint;
  document.elementsFromPoint = () => {
    const chain: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) chain.push(node);
    return chain;
  };
  return () => {
    document.elementsFromPoint = original;
  };
}

function drag(source: Element, target: Element) {
  const restore = pointAt(target);
  fireEvent.pointerDown(source, { button: 0, clientX: 10, clientY: 10, pointerType: 'mouse' });
  fireEvent.pointerMove(window, { clientX: 40, clientY: 40, pointerType: 'mouse' });
  fireEvent.pointerMove(window, { clientX: 60, clientY: 60, pointerType: 'mouse' });
  fireEvent.pointerUp(window, { clientX: 60, clientY: 60, pointerType: 'mouse' });
  restore();
}

describe('builder', () => {
  it('renders the sample flow with the live round selected', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Monsoon menu poster' })).toBeTruthy();
    expect(screen.getByText('Round 2 live')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Round 2: Layout, live' }).getAttribute('aria-pressed')).toBe('true');
    const inspector = screen.getByRole('complementary', { name: 'Round 2 settings' });
    expect(within(inspector).getByRole('button', { name: 'Copy feedback: Parked for Round 3, change' })).toBeTruthy();
    expect(within(inspector).getByRole('button', { name: 'Color feedback: Locked in Round 1, change' })).toBeTruthy();
    expect(screen.getByText('4 comments parked from Round 2')).toBeTruthy();
  });

  it('applies a nudge block to the selected round, with an undo', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Email' }));
    expect(screen.getByRole('status').textContent).toContain('Round 2 nudges on Email after 24h');
    expect(screen.getByRole('button', { name: 'Nudge if no reply: After 24h, Email, change' })).toBeTruthy();
    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Nudge if no reply: After 24h, WhatsApp, change' })).toBeTruthy();
  });

  it('drags a nudge block onto a round', async () => {
    renderApp();
    const block = screen.getByRole('button', { name: 'Email' });
    const round = document.querySelector('[data-node-key="r-copy"]')!;
    act(() => drag(block, round));
    expect(screen.getByRole('status').textContent).toContain('Round 3 nudges on Email');
  });

  it('drags a person onto a round that does not have them yet', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'More options for Meera' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from round' }));
    await userEvent.click(screen.getByRole('button', { name: 'Round 3: Copy, upcoming' }));
    const person = screen.getByRole('button', { name: /^Meera, Founder/ });
    act(() => drag(person, document.querySelector('[data-node-key="r-layout"]')!));
    expect(screen.getByRole('status').textContent).toContain('Meera now reviews Round 2');
  });

  it('parks an aspect from the inspector menu', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Copy feedback: Parked for Round 3, change' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /In focus/ }));
    expect(screen.getByText('Only layout and copy feedback counts this round.', { selector: '.node-text' })).toBeTruthy();
    expect(screen.queryByText('4 comments parked from Round 2')).toBeNull();
  });

  it('records an approval and moves the flow on', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'More options for Round 2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Record approval' }));
    const dialog = screen.getByRole('dialog', { name: /Record approval for Round 2/ });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Decision note/ }), 'Two column grid');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve round' }));
    expect(screen.getByText('Round 3 live')).toBeTruthy();
    expect(screen.getByText('Two column grid')).toBeTruthy();
  });

  it('routes a reviewer comment on a locked aspect as a reopen request', async () => {
    renderApp();
    // The compact icon button and the labelled one swap with screen width; jsdom sees both.
    await userEvent.click(screen.getAllByRole('button', { name: 'Preview as reviewer' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Preview as reviewer' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Color' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Comment' }), 'Deeper green please');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add comment' }));
    expect(within(dialog).getByText('Color was locked in Round 1, so this went in as a reopen request.')).toBeTruthy();
  });

  it('removes the selected upcoming round with Delete and brings it back with undo', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Round 4: Polish, upcoming' }));
    await userEvent.keyboard('{Delete}');
    expect(screen.queryByRole('button', { name: 'Round 4: Polish, upcoming' })).toBeNull();
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(screen.getByRole('button', { name: 'Round 4: Polish, upcoming' })).toBeTruthy();
  });

  it('lists gaps on demand', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Check for gaps' }));
    expect(screen.getByRole('heading', { name: 'No gaps found' })).toBeTruthy();
  });
});

describe('calendar', () => {
  it('creates a meeting from the toolbar and edits it in place', async () => {
    renderApp('#/calendar');
    expect(screen.getByRole('heading', { name: 'Calendar', level: 1 })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /New meeting/ }));
    const title = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement;
    expect(document.activeElement).toBe(title);
    await userEvent.clear(title);
    await userEvent.type(title, 'Proof check');
    expect(screen.getAllByText('Proof check').length).toBeGreaterThan(0);
  });

  it('switches views from the keyboard', async () => {
    renderApp('#/calendar');
    await userEvent.keyboard('m');
    expect(screen.getByRole('radio', { name: 'Month' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.keyboard('d');
    expect(screen.getByRole('radio', { name: 'Day' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opens a meeting linked from a round', () => {
    renderApp('#/calendar?m=m-layout-review');
    expect((screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Layout review call');
    expect(screen.getByRole('button', { name: 'Open Round 2 in the flow' })).toBeTruthy();
  });
});

describe('routes', () => {
  it('parses the hash routes', () => {
    expect(parseHash('#/projects')).toEqual({ name: 'projects' });
    expect(parseHash('#/calendar?m=abc')).toEqual({ name: 'calendar', meetingId: 'abc' });
    expect(parseHash('#/review/monsoon-menu/r-layout')).toEqual({ name: 'review', projectId: 'monsoon-menu', roundId: 'r-layout' });
    expect(parseHash('#/?round=r-copy')).toEqual({ name: 'builder', roundId: 'r-copy' });
    expect(parseHash('')).toEqual({ name: 'builder', roundId: null });
  });

  it('opens the reviewer page from a shared link', () => {
    renderApp('#/review/monsoon-menu/r-layout');
    expect(screen.getByText('LOCKSTEP REVIEW')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Reviewing as' })).toBeTruthy();
  });
});
