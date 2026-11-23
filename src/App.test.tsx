import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const KEY = 'choreboard:store';
const weekday = () => new Date().toLocaleDateString(undefined, { weekday: 'long' });

describe('Choreboard', () => {
  it('shows the demo board and ticks today’s dishes', async () => {
    window.location.hash = '/week';
    const user = userEvent.setup();
    render(<App />);
    const box = screen.getByRole('checkbox', { name: new RegExp(`^Wash up and wipe counters, ${weekday()}`) });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText('Done: Wash up and wipe counters.')).toBeInTheDocument();
  });

  it('refuses to tick a future day', async () => {
    window.location.hash = '/week';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    await user.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByText(/hasn’t happened yet/)).toBeInTheDocument();
  });

  it('validates and creates a rotating chore', async () => {
    window.location.hash = '/chore/new';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Save chore' }));
    expect(screen.getByText('Name the chore.')).toBeInTheDocument();
    expect(screen.getByText('Pick at least one day.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Chore'), 'Clean windows');
    await user.click(screen.getByLabelText('Sat'));
    await user.click(screen.getByRole('radio', { name: 'Take turns' }));
    await user.click(screen.getByLabelText('Robin'));
    expect(screen.getByText('Pick at least two people to rotate between.')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Alex'));
    expect(screen.getByText('Order: Robin → Alex')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save chore' }));
    expect(await screen.findByRole('link', { name: 'Clean windows' })).toBeInTheDocument();
  });

  it('starts empty after clearing the demo household', async () => {
    window.location.hash = '/chores';
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Clear demo household' }));
    expect(screen.getByText('No chores yet')).toBeInTheDocument();
    unmount();
    window.location.hash = '/chore/new';
    render(<App />);
    expect(screen.getByText('Add people first')).toBeInTheDocument();
  });

  it('adds a person and shows the summary chart', async () => {
    localStorage.removeItem(KEY);
    window.location.hash = '/people';
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add person' }));
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'sam');
    await user.click(screen.getByRole('button', { name: 'Add person' }));
    expect(screen.getByText('sam is already on the list.')).toBeInTheDocument();
    unmount();
    window.location.hash = '/summary';
    render(<App />);
    expect(screen.getByRole('img', { name: /Alex: \d+ of \d+ minutes done/ })).toBeInTheDocument();
  });
});
