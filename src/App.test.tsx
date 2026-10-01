import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

describe('prototype', () => {
  it('shows the week, the events and the task list', () => {
    render(<App />);
    expect(screen.getByText('September 2026')).toBeTruthy();
    for (const day of ['Mon 21', 'Tue 22', 'Wed 23', 'Thu 24', 'Fri 25']) expect(screen.getByText(day)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Roadmap review, 11 AM – 12:30 PM' })).toBeTruthy();
    expect(screen.getByText('Book flights to Lisbon')).toBeTruthy();
  });

  it('ticks a task and offers a reset', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    const row = screen.getByText('Reply to Sam').closest('li')!;
    await user.click(within(row).getByRole('checkbox'));
    expect(within(row).getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(within(screen.getByText('Reply to Sam').closest('li')!).getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
  });

  it('adds a task', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Add a task' }), 'Call the bank{Enter}');
    expect(screen.getByText('Call the bank')).toBeTruthy();
  });

  it('switches to one-off scheduling and the booking page', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'One-off scheduling' }));
    expect(screen.getByText('Coffee chat')).toBeTruthy();
    expect(screen.getByText(/Drag on the week to paint/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Booking page' }));
    expect(screen.getByText('Intro call')).toBeTruthy();
  });

  it('switches between week and day view', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Week/ }));
    await user.click(screen.getByRole('button', { name: /^Day/ }));
    expect(screen.queryByText('Mon 21')).toBeNull();
    expect(screen.getByText('Wed 23')).toBeTruthy();
  });
});
