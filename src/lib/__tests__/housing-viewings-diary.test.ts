/**
 * The viewings diary — 15 Sep 2026.
 *
 * A landlord could not answer a viewing request: nothing listed it or let them
 * agree a time. These pin what each side is offered and how a picked day and
 * time become the instant the server takes.
 */
import {
  toDateAndTime,
  toScheduledFor,
  viewingCounterparty,
  viewingMoveLabel,
  viewingMoves,
  viewingStatusLabel,
  viewingUpdateRefusal,
} from '../housing-viewings-api';

const NOW = new Date('2026-09-15T12:00:00Z');

describe('what each side may do', () => {
  it('lets the landlord agree a time or decline a request, and the member cancel it', () => {
    expect(viewingMoves({ status: 'Requested', confirmedAt: null }, 'landlord', NOW)).toEqual(['schedule', 'decline']);
    expect(viewingMoves({ status: 'Requested', confirmedAt: null }, 'member', NOW)).toEqual(['cancel']);
  });

  it('waits for the agreed time before offering "it happened" or "they did not come"', () => {
    const tomorrow = { status: 'Scheduled', confirmedAt: '2026-09-16T10:00:00Z' };
    const yesterday = { status: 'Scheduled', confirmedAt: '2026-09-14T10:00:00Z' };

    expect(viewingMoves(tomorrow, 'landlord', NOW)).toEqual(['cancel']);
    expect(viewingMoves(yesterday, 'member', NOW)).toEqual(['complete', 'no-show', 'cancel']);
  });

  it('offers nothing on a closed viewing', () => {
    for (const status of ['Completed', 'Cancelled', 'NoShow', 'Expired']) {
      expect(viewingMoves({ status, confirmedAt: null }, 'landlord', NOW)).toEqual([]);
    }
  });

  it('labels each move as the side reading it would say it', () => {
    expect(viewingMoveLabel('schedule', 'landlord')).toBe('Agree a time');
    expect(viewingMoveLabel('cancel', 'member')).toBe('Cancel request');
    expect(viewingMoveLabel('no-show', 'landlord')).toBe('They did not come');
    expect(viewingMoveLabel('no-show', 'member')).toBe('The host did not come');
  });
});

describe('a day and a time', () => {
  it('becomes an instant, and back', () => {
    const instant = toScheduledFor('2026-09-20', '14:30');
    expect(instant).not.toBeNull();
    expect(toDateAndTime(instant)).toEqual({ date: '2026-09-20', time: '14:30' });
  });

  it('is refused when it is not a real day or time', () => {
    expect(toScheduledFor('2026-02-31', '10:00')).toBeNull();
    expect(toScheduledFor('2026-09-20', '25:00')).toBeNull();
    expect(toScheduledFor('', '10:00')).toBeNull();
    expect(toScheduledFor('2026-09-20', 'ten')).toBeNull();
  });

  it('is empty for no instant', () => {
    expect(toDateAndTime(null)).toEqual({ date: '', time: '' });
  });
});

describe('what a viewing says', () => {
  it('names who asked for the landlord, and the host for the member', () => {
    const viewing = { seekerName: 'Aisha Okonkwo', landlordName: 'Mensah Property Rentals' };
    expect(viewingCounterparty(viewing, 'landlord')).toBe('Aisha Okonkwo');
    expect(viewingCounterparty(viewing, 'member')).toBe('Mensah Property Rentals');
    expect(viewingCounterparty({ seekerName: null, landlordName: '' }, 'landlord')).toBe('A member');
  });

  it('says where it stands for each side', () => {
    expect(viewingStatusLabel({ status: 'Requested', landlordFailedToAttend: null }, 'landlord')).toBe('Waiting for your answer');
    expect(viewingStatusLabel({ status: 'Requested', landlordFailedToAttend: null }, 'member')).toBe('Waiting for the host');
    expect(viewingStatusLabel({ status: 'NoShow', landlordFailedToAttend: true }, 'member')).toBe('The host did not come');
  });

  it('never says a refused move happened', () => {
    expect(viewingUpdateRefusal({ response: { data: { code: 'housing.viewing.slot.in-past' } } })).toMatch(/already passed/);
    expect(viewingUpdateRefusal({ response: { data: { code: 'housing.viewing.transition-invalid' } } })).toMatch(/moved on/);
    expect(viewingUpdateRefusal(new Error('Network Error'))).toMatch(/nothing was changed/);
  });
});
