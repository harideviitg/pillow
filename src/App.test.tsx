import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { seedData } from './store/seed';

function renderAt(hash: string) {
  window.localStorage.clear();
  window.history.replaceState(null, '', hash);
  return render(<App initial={seedData(Date.now())} />);
}

describe('app', () => {
  it('opens on Plan with the tray, the week and the sidebar', () => {
    renderAt('#/plan');
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
    expect(screen.getAllByText('Reply to Sam').length).toBe(2);
    expect(screen.getByText('Due')).toBeTruthy();
    expect(screen.getAllByText('Portfolio site').length).toBeGreaterThan(0);
  });

  it('adds and ticks a task in the tray', async () => {
    const user = userEvent.setup();
    renderAt('#/plan');
    await user.type(screen.getByRole('textbox', { name: 'Add a task' }), 'Water the plants{Enter}');
    const row = screen.getByText('Water the plants').closest('li')!;
    await user.click(within(row).getByRole('checkbox'));
    expect(within(row).getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
  });

  it('shows the flow canvas with cards and a project frame', () => {
    renderAt('#/flows');
    expect(document.querySelectorAll('[data-card]').length).toBe(6);
    expect(document.querySelector('.frame-name')?.textContent).toBe('Portfolio site');
  });

  it('chats with Pip and applies what it does', async () => {
    const user = userEvent.setup();
    renderAt('#/agent');
    await user.type(screen.getByRole('textbox', { name: 'Message Pip' }), 'add buy oat milk{Enter}');
    expect(await screen.findByText('Added task', {}, { timeout: 3000 })).toBeTruthy();
    act(() => {
      window.location.hash = '#/plan';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByText('Buy oat milk')).toBeTruthy();
  });
});
