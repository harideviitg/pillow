import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, parseHash } from './App';
import { initialData } from './state/store';

const NOW = Date.UTC(2026, 8, 30, 9);

function renderApp() {
  window.location.hash = '#/';
  window.localStorage.clear();
  return render(<App initial={initialData(NOW)} />);
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

  it('applies a nudge block to the selected round and says so', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Email' }));
    expect(screen.getByRole('status').textContent).toContain('Round 2 nudges on Email after 24h');
    expect(screen.getByRole('button', { name: 'Nudge if no reply: After 24h, Email, change' })).toBeTruthy();
  });

  it('drops a round block onto an insert point', () => {
    renderApp();
    const block = screen.getByRole('button', { name: 'Polish' });
    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => store.set(k, v),
      getData: (k: string) => store.get(k) ?? '',
      effectAllowed: 'copy',
      dropEffect: 'copy',
    };
    fireEvent.dragStart(block, { dataTransfer });
    const insert = screen.getByRole('button', { name: 'Add a round here, as Round 3' }).parentElement!;
    fireEvent.dragOver(insert, { dataTransfer });
    fireEvent.drop(insert, { dataTransfer });
    expect(screen.getByRole('button', { name: 'Round 3: Polish, upcoming' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Round 5: Polish, upcoming' })).toBeTruthy();
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
    await userEvent.click(screen.getByRole('button', { name: 'Preview as reviewer' }));
    const dialog = screen.getByRole('dialog', { name: 'Preview as reviewer' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Color' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Comment' }), 'Deeper green please');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add comment' }));
    expect(within(dialog).getByText('Color was locked in Round 1, so this went in as a reopen request.')).toBeTruthy();
  });

  it('lists gaps on demand', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Check for gaps' }));
    expect(screen.getByRole('heading', { name: 'No gaps found' })).toBeTruthy();
  });
});

describe('routes', () => {
  it('parses the hash routes', () => {
    expect(parseHash('#/projects')).toEqual({ name: 'projects' });
    expect(parseHash('#/review/monsoon-menu/r-layout')).toEqual({ name: 'review', projectId: 'monsoon-menu', roundId: 'r-layout' });
    expect(parseHash('')).toEqual({ name: 'builder' });
  });

  it('opens the reviewer page from a shared link', () => {
    window.localStorage.clear();
    window.location.hash = '#/review/monsoon-menu/r-layout';
    render(<App initial={initialData(NOW)} />);
    expect(screen.getByText('LOCKSTEP REVIEW')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Reviewing as' })).toBeTruthy();
    act(() => {
      window.location.hash = '#/';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
});
