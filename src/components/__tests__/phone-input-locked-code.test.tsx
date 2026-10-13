// The dialling code is the member's own country's, and cannot be changed
// (owner's decision, 13 Oct 2026). The field used to open on Mauritius for
// everybody and reported "+230" as a number when nothing was typed.

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { useAuthStore } from '@/store/auth';

function signedInFrom(residenceCountry: string | undefined) {
  useAuthStore.setState({
    user: residenceCountry
      ? ({ userId: 'm-1', fullName: 'A Member', role: 'Member', phone: '', residenceCountry, accountState: 'DiasporaVerified' } as never)
      : null,
  });
}

function renderField(value = '') {
  const onChangePhone = jest.fn();
  render(<PhoneInputWithCode label="Phone" value={value} onChangePhone={onChangePhone} />);
  return onChangePhone;
}

afterEach(() => useAuthStore.setState({ user: null }));

describe('PhoneInputWithCode', () => {
  it('shows the residence country code and offers no way to change it', () => {
    signedInFrom('NG');
    renderField();

    expect(screen.getByText('+234')).toBeTruthy();
    expect(screen.queryByText('Select Country')).toBeNull();
    expect(screen.queryByText('▼')).toBeNull();
  });

  it('reports the full international number, dropping a habitual leading zero', () => {
    signedInFrom('MU');
    const onChangePhone = renderField();

    fireEvent.changeText(screen.getByLabelText('Phone'), '05 712 3456');

    expect(onChangePhone).toHaveBeenLastCalledWith('+23057123456');
  });

  it('reports nothing, not a bare code, when no digits are typed', () => {
    signedInFrom('MU');
    const onChangePhone = renderField();

    fireEvent.changeText(screen.getByLabelText('Phone'), ' ');

    expect(onChangePhone).toHaveBeenLastCalledWith('');
  });

  it('shows a stored number without repeating its code', () => {
    signedInFrom('MU');
    renderField('+23057123456');

    expect(screen.getByDisplayValue('57123456')).toBeTruthy();
  });

  it('keeps a number written out in international form as it is', () => {
    signedInFrom('MU');
    const onChangePhone = renderField();

    fireEvent.changeText(screen.getByLabelText('Phone'), '+44 7700 900000');

    expect(onChangePhone).toHaveBeenLastCalledWith('+447700900000');
  });
});
