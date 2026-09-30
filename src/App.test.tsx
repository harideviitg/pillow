import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { seedData } from './domain/seed';
import { parseHash } from './nav';

function renderApp(hash = '#/') {
  window.history.replaceState(null, '', hash);
  window.localStorage.clear();
  return render(<App initial={seedData(Date.now())} />);
}

function section(name: string) {
  return screen.getByRole('heading', { name: new RegExp(`^${name}`) }).closest('section') as HTMLElement;
}

describe('routes', () => {
  it('reads every screen from the hash', () => {
    expect(parseHash('')).toEqual({ name: 'today' });
    expect(parseHash('#/projects')).toEqual({ name: 'projects' });
    expect(parseHash('#/projects/p%201')).toEqual({ name: 'project', id: 'p 1' });
    expect(parseHash('#/calendar')).toEqual({ name: 'calendar' });
    expect(parseHash('#/routines/r-start')).toEqual({ name: 'routine', id: 'r-start' });
  });
});

describe('today', () => {
  it('shows next up, waiting and the inbox from the sample data', () => {
    renderApp();
    expect(within(section('Next up')).getByDisplayValue('Write the case study copy')).toBeTruthy();
    expect(within(section('Waiting on')).getByDisplayValue('Agent refactoring the nav component')).toBeTruthy();
    expect(within(section('Inbox')).getByDisplayValue('Try building a tiny CLI for this')).toBeTruthy();
  });

  it('keeps a ticked task in place and brings in the next one', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Export screenshots at 2x" done' }));
    const next = section('Next up');
    expect(within(next).getByRole('checkbox', { name: 'Mark "Export screenshots at 2x" not done' })).toBeTruthy();
    expect(within(next).getByDisplayValue('Make an OG image')).toBeTruthy();
  });

  it('clears a waiting item and can undo it', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Landed: Agent refactoring the nav component' }));
    expect(screen.queryByDisplayValue('Agent refactoring the nav component')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByDisplayValue('Agent refactoring the nav component')).toBeTruthy();
  });
});

describe('quick capture', () => {
  it('opens on N and files into a project', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.keyboard('n');
    const input = screen.getByRole('textbox', { name: 'Capture' });
    await user.type(input, 'wait CI on main #portfolio');
    expect(screen.getByText('Waiting on', { selector: '.chip' })).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog', { name: 'Quick capture' })).toBeNull();
    expect(within(section('Waiting on')).getByDisplayValue('CI on main')).toBeTruthy();
  });

  it('sends unfiled things to the inbox', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.keyboard('n');
    await user.type(screen.getByRole('textbox', { name: 'Capture' }), 'learn rust{Enter}');
    expect(within(section('Inbox')).getByDisplayValue('learn rust')).toBeTruthy();
  });
});

describe('projects', () => {
  it('lists projects and opens one with its note, checklist and waiting list', async () => {
    const user = userEvent.setup();
    renderApp('#/projects');
    await user.click(screen.getByRole('link', { name: /Portfolio site/ }));
    expect(screen.getByLabelText('Where you left off')).toHaveProperty('value', expect.stringContaining('Hero section is done'));
    await user.type(screen.getByRole('textbox', { name: 'Add a task' }), 'Buy the domain{Enter}');
    expect(within(section('Checklist')).getByDisplayValue('Buy the domain')).toBeTruthy();
    expect(within(section('Checklist')).getByText('1/6')).toBeTruthy();
  });

  it('creates a project and lands on it', async () => {
    const user = userEvent.setup();
    renderApp('#/projects');
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(screen.getByRole('textbox', { name: 'New project name' }), 'Agent CLI{Enter}');
    expect(screen.getByDisplayValue('Agent CLI')).toBeTruthy();
    expect(screen.getByText(/Either you're done or you haven't started/)).toBeTruthy();
  });
});

describe('routines', () => {
  it('ticks a habit from the list', async () => {
    const user = userEvent.setup();
    renderApp('#/routines');
    await user.click(screen.getByRole('checkbox', { name: 'Done Walk outside today' }));
    expect(screen.getByRole('checkbox', { name: 'Undo Walk outside for today' })).toBeTruthy();
  });

  it('celebrates when every step is done', async () => {
    const user = userEvent.setup();
    renderApp('#/routines/r-start');
    for (const step of ["Check what's waiting", 'Pick the one thing that matters today', 'Close Twitter']) {
      await user.click(screen.getByRole('checkbox', { name: step }));
    }
    expect(document.querySelector('.finale')).toBeTruthy();
    expect(screen.getByText('3 days in a row')).toBeTruthy();
  });

  it('lists what shipped on the shutdown routine', async () => {
    const user = userEvent.setup();
    renderApp('#/');
    await user.click(screen.getByRole('checkbox', { name: 'Mark "Export screenshots at 2x" done' }));
    await act(async () => {
      window.location.hash = '#/routines/r-shutdown';
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(within(section('Shipped today')).getByText('Export screenshots at 2x')).toBeTruthy();
    expect(screen.getByLabelText('Where you left off on Portfolio site')).toBeTruthy();
  });
});

describe('calendar', () => {
  it('shows the week with the sample blocks', () => {
    renderApp('#/calendar');
    expect(screen.getByRole('button', { name: /Deep work: case study/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('button', { name: /Deep work: case study/ })).toBeNull();
  });
});
